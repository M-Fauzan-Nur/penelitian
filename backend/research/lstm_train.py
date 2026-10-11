import os
import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler, MinMaxScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.callbacks import EarlyStopping
import matplotlib.pyplot as plt
import warnings
import os
warnings.filterwarnings('ignore')

# ================================
# FUNGSI BANTU - PLOT & METRIK
# ================================

def plot_training_history(history, title="Training Curve", filename="training_plot1.png"):
    """Plot training dan validation loss dan simpan ke file"""
    loss = history.history['loss']
    val_loss = history.history['val_loss']

    plt.figure(figsize=(10,5))
    plt.plot(loss, label='Training Loss')
    plt.plot(val_loss, label='Validation Loss')
    plt.title(title)
    plt.xlabel('Epoch')
    plt.ylabel('Loss MSE')
    plt.legend()
    plt.grid(True)
    
    # Simpan plot ke file
    plt.savefig(filename, dpi=300, bbox_inches='tight')
    plt.close()  # Tutup plot untuk tidak menampilkan di layar
    
    print(f"   💾 Plot disimpan: {filename}")

def compute_metrics(y_true, y_pred):
    """Menghitung metrik evaluasi standar"""
    mse = mean_squared_error(y_true, y_pred)
    rmse = np.sqrt(mse)
    mae = mean_absolute_error(y_true, y_pred)
    r2 = r2_score(y_true, y_pred)

    return {
        'MSE': mse,
        'RMSE': rmse,
        'MAE': mae,
        'R2_Score': r2
    }

# ================================
# 1. DATA LOADING & PREPROCESSING
# ================================

class DataProcessor:
    def __init__(self):
        # MinMax agar semua fitur berada pada rentang 0-1
        self.scaler = MinMaxScaler(feature_range=(0, 1))

        self.base_features = [
            'base_failure_rate', 'risk_factor', 'equipment_age_factor', 
            'animal_factor', 'weather_factor', 'synthetic_lambda_monthly',
            'synthetic_failure_probability', 'synthetic_outage_duration', 
            'synthetic_repair_duration'
        ]
        self.feature_columns = self.base_features.copy()
        self.n_features = len(self.feature_columns)

    def load_and_preprocess(self, file_path):
        """Load data dengan normalisasi fitur 0-1 (kecuali target)"""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File {file_path} tidak ditemukan")

        df = pd.read_csv(file_path)

        required_columns = ['timestamp', 'year', 'month', 'line_id'] + self.feature_columns
        missing_columns = [col for col in required_columns if col not in df.columns]

        if missing_columns:
            raise ValueError(f"Kolom tidak ditemukan: {missing_columns}")

        df['timestamp'] = pd.to_datetime(df['timestamp'])

        # Normalisasi seluruh fitur input termasuk synthetic_failure_probability
        # Namun synthetic_failure_probability tidak di-inverse, hanya diperlakukan sebagai angka 0-1
        df[self.feature_columns] = self.scaler.fit_transform(df[self.feature_columns])

        print(f"Data loaded: {len(df)} baris")
        print(f"Fitur dinormalisasi ke rentang 0-1 untuk seluruh input LSTM")
        print(f"Jumlah fitur: {self.n_features}")

        return df

    def create_sequences(self, data, sequence_length=12):
        """Membuat sequence LSTM dari data ter-normalisasi"""
        sequences = []
        targets = []
        line_ids = []
        timestamps = []

        for line in data['line_id'].unique():
            line_data = data[data['line_id'] == line].sort_values('timestamp')

            if len(line_data) < sequence_length + 1:
                continue

            # Membuat sequence
            for i in range(len(line_data) - sequence_length):
                seq = line_data[self.feature_columns].iloc[i:i+sequence_length].values

                # synthetic_failure_probability tetap digunakan sebagai target setelah sequence
                target = line_data['synthetic_failure_probability'].iloc[i+sequence_length]

                sequences.append(seq)
                targets.append(target)
                line_ids.append(line)
                timestamps.append(line_data['timestamp'].iloc[i+sequence_length])

        return np.array(sequences), np.array(targets), np.array(line_ids), np.array(timestamps)

    def prepare_final_prediction(self, data, sequence_length=12):
        """Mempersiapkan sequence normalized untuk prediksi 68 line"""
        sequences = []
        line_list = []
        latest_data = []

        for line in range(1, 69):
            line_data = data[data['line_id'] == line].sort_values('timestamp')

            if len(line_data) >= sequence_length:
                seq = line_data[self.feature_columns].iloc[-sequence_length:].values
                latest_record = line_data.iloc[-1]

                sequences.append(seq)
                line_list.append(line)
                latest_data.append(latest_record)

        return np.array(sequences), np.array(line_list), latest_data


# ================================
# 2. DIRECT APPROACH
# ================================

class DirectLSTM:
    def __init__(self, sequence_length=12, n_features=9):
        self.sequence_length = sequence_length
        self.n_features = n_features
        self.model = None
        
    def create_model(self):
        """Membuat model LSTM untuk data 5 tahun"""
        model = Sequential([
            LSTM(64, return_sequences=True, input_shape=(self.sequence_length, self.n_features)),
            Dropout(0.4),
            LSTM(32, return_sequences=False),
            Dropout(0.2),
            Dense(16, activation='relu'),
            Dense(1, activation='sigmoid')
        ])
        
        model.compile(
            optimizer=Adam(learning_rate=0.00049),
            loss='mse',
            metrics=['mae']
        )
        
        return model
    
    def train(self, data):
        """Train dengan semua data 5 tahun sekaligus"""
        print("\n🔄 Training model dengan semua data...")
        
        # Create sequences dari semua data
        processor = DataProcessor()
        X, y, lines, timestamps = processor.create_sequences(data, self.sequence_length)
        
        if len(X) == 0:
            raise ValueError("❌ Tidak cukup data untuk training")
        
        print(f"   📐 Input shape: {X.shape}")
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, shuffle=False
        )
        
        print(f"   📊 Total sequences: {len(X)}")
        print(f"   📈 Training samples: {len(X_train)}, Test samples: {len(X_test)}")
        
        # Create and train model
        self.model = self.create_model()
        
        early_stop = EarlyStopping(monitor='val_loss', patience=50, restore_best_weights=True)
        
        print("   🎯 Memulai training...")
        history = self.model.fit(
            X_train, y_train,
            validation_data=(X_test, y_test),
            epochs=150,
            batch_size=32,
            callbacks=[early_stop],
            verbose=0
        )
        
        # Plot training dan simpan ke file
        plot_filename = os.path.join(
    	    "/tmp" if os.environ.get("VERCEL") == "1" else ".",
            "direct_training_results_scenario_a.png"
        )
        plot_training_history(history, title="Training Curve - Direct LSTM", filename=plot_filename)

        # Evaluate
        test_pred = self.model.predict(X_test, verbose=0)
        metrics = compute_metrics(y_test, test_pred.flatten())
        
        print("✅ Training Selesai - Evaluasi:")
        print(f"   📊 MSE: {metrics['MSE']:.4f}")
        print(f"   📊 RMSE: {metrics['RMSE']:.4f}")
        print(f"   📊 MAE: {metrics['MAE']:.4f}")
        print(f"   📈 R² Score: {metrics['R2_Score']:.4f}")
        
        return history, metrics

    def predict(self, X):
        """Melakukan prediksi dengan model yang sudah ditraining"""
        if self.model is None:
            raise ValueError("❌ Model belum ditraining")
        
        return self.model.predict(X, verbose=0).flatten()


# ================================
# 3. MAIN TRAINING & PREDICTION
# ================================

class LSTMGangguanPredictor:
    def __init__(self):
        self.processor = DataProcessor()
        self.model = DirectLSTM(n_features=self.processor.n_features)
        self.training_metrics = None
    
    def run_training(self, file_path):
        """Menjalankan training model"""
        print("=" * 60)
        print("🚀 LSTM GANGGUAN PREDICTION - DIRECT APPROACH")
        print("=" * 60)
        
        # Load data
        data = self.processor.load_and_preprocess(file_path)
        years = sorted(data['year'].unique())
        print(f"📅 Tahun yang tersedia: {years}")
        
        if len(years) < 2:
            raise ValueError("❌ Data harus mencakup minimal 2 tahun untuk training")
        
        # TRAINING
        print("\n" + "=" * 60)
        print("🔄 MODEL TRAINING")
        print("=" * 60)
        
        history, self.training_metrics = self.model.train(data)
        
        print(f"\n🎯 HASIL TRAINING FINAL:")
        print(f"   📊 MSE: {self.training_metrics['MSE']:.4f}")
        print(f"   📊 RMSE: {self.training_metrics['RMSE']:.4f}")
        print(f"   📊 MAE: {self.training_metrics['MAE']:.4f}")
        print(f"   📈 R² Score: {self.training_metrics['R2_Score']:.4f}")
        
        return data
    
    def predict_and_save(self, data, output_file='hasil_prediksi_gangguan_scenario_a.csv'):
        """Melakukan prediksi dan menyimpan hasil"""
        print("\n" + "=" * 60)
        print("🎯 MEMBUAT PREDIKSI FINAL")
        print("=" * 60)
        
        # Prepare data untuk prediksi
        X_final, lines, latest_data = self.processor.prepare_final_prediction(data, 12)
        
        if len(X_final) == 0:
            raise ValueError("❌ Tidak cukup data untuk prediksi final")
        
        print(f"📐 Final prediction data shape: {X_final.shape}")
        
        # Buat prediksi
        print("🎯 Membuat prediksi...")
        predictions = self.model.predict(X_final)
        
        # Buat hasil akhir dengan kolom yang diminta
        results = []
        
        for i, line_id in enumerate(lines):
            latest = latest_data[i]
            
            result = {
                'line_id': line_id,
                'from_bus': latest['from_bus'],
                'to_bus': latest['to_bus'],
                'load_demand': latest['load_demand'],
                'num_customers': latest['num_customers'],
                'downstream_buses': latest['downstream_buses'],
                'level_topology': latest['level_topology'],
                'total_downstream_load': latest['total_downstream_load'],
                'total_downstream_customers': latest['total_downstream_customers'],
                'pola_gangguan': predictions[i],
                'kategori_risiko': self._kategori_risiko(predictions[i])
            }
            results.append(result)
        
        # Buat DataFrame
        results_df = pd.DataFrame(results)
        
        # Pastikan semua 68 line ada
        if len(results_df) < 68:
            print(f"⚠️  Hanya {len(results_df)} line yang berhasil diprediksi")
            # Tambahkan line yang missing dengan nilai default
            all_lines = pd.DataFrame({'line_id': range(1, 69)})
            results_df = pd.merge(all_lines, results_df, on='line_id', how='left')
            
            # Isi nilai missing dengan rata-rata
            for col in results_df.columns:
                if col != 'line_id' and results_df[col].isna().any():
                    if col == 'pola_gangguan':
                        avg_value = results_df[col].mean()
                        results_df[col].fillna(avg_value, inplace=True)
                        print(f"   🔧 Mengisi {col} dengan nilai rata-rata: {avg_value:.4f}")
                    else:
                        # Untuk kolom structural, cari nilai dari line terdekat
                        for idx in results_df[results_df[col].isna()].index:
                            similar_line = results_df[results_df[col].notna()].iloc[0]
                            results_df.loc[idx, col] = similar_line[col]
        
        # Urutkan berdasarkan line_id
        results_df = results_df.sort_values('line_id').reset_index(drop=True)
        
        # Simpan hasil
        results_df.to_csv(output_file, index=False)
        
        print(f"✅ Prediksi selesai untuk {len(results_df)} line")
        print(f"💾 Hasil disimpan ke: {output_file}")
        
        # Tampilkan summary
        self._print_summary(results_df)
        
        return results_df
    
    def _kategori_risiko(self, probability):
        """Menentukan kategori risiko berdasarkan probability"""
        if probability < 0.2:
            return "RENDAH"
        elif probability < 0.5:
            return "SEDANG"
        elif probability < 0.8:
            return "TINGGI"
        else:
            return "KRITIS"
    
    def _print_summary(self, results_df):
        """Print summary hasil prediksi"""
        print("\n" + "=" * 60)
        print("📊 SUMMARY HASIL PREDIKSI")
        print("=" * 60)
        
        print(f"🔌 Total line: {len(results_df)}")
        print(f"📈 Rata-rata Pola Gangguan: {results_df['pola_gangguan'].mean():.4f}")
        
        kategori_counts = results_df['kategori_risiko'].value_counts()
        print(f"🎯 Distribusi Risiko:")
        for kategori, count in kategori_counts.items():
            print(f"   {kategori}: {count} line ({count/len(results_df)*100:.1f}%)")
        
        print(f"\n📋 Sample hasil (5 line pertama):")
        print(results_df[['line_id', 'pola_gangguan', 'kategori_risiko']].head().to_string(index=False))

# ================================
# 4. MAIN EXECUTION
# ================================

def main():
    # Config
    file_path = "system_dataset_scenario_a.csv"  # Ganti dengan path file Anda
    output_file = "hasil_prediksi_gangguan_scenario_a.csv"
    
    try:
        # Initialize predictor
        predictor = LSTMGangguanPredictor()
        
        # Run training
        data = predictor.run_training(file_path)
        
        # Run prediction
        results = predictor.predict_and_save(data, output_file)
        
        print(f"\n🎉 PROGRAM SELESAI!")
        print(f"📁 File hasil: '{output_file}'")
        print(f"📊 Plot training: 'direct_training_results_scenario.png'")
        print("=" * 60)
        
    except FileNotFoundError as e:
        print(f"❌ {e}")
        print("💡 Pastikan file 'system_dataset_scenario_a.csv' ada di folder yang sama")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()