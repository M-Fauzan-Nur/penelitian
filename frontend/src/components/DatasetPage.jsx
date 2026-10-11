import { useRef, useState } from 'react';

const API = import.meta.env.VITE_API_URL || '';

export default function DatasetPage({ authFetch, pipelineStatus, onUploaded }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [datasetData, setDatasetData] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.name.endsWith('.csv')) {
      setError('Hanya file CSV yang diizinkan.');
      return;
    }
    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const r = await authFetch(`${API}/api/upload/dataset`, {
        method: 'POST',
        body: formData,
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.detail || 'Upload failed');
        return;
      }
      setDatasetData(data);
      onUploaded(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleChange = (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Dataset</h1>
        <p>Upload dataset gangguan time-series bulanan untuk diproses oleh LSTM.</p>
      </div>

      {!pipelineStatus.hasNetwork && (
        <div className="alert alert-warning">
          <strong>Perhatian:</strong> Upload network terlebih dahulu di halaman
          Network Data sebelum mengupload dataset.
        </div>
      )}

      {/* Upload Area */}
      {!datasetData && (
        <div
          className={`upload-area ${dragOver ? 'drag-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !pipelineStatus.hasNetwork ? null : fileRef.current?.click()}
          style={{ cursor: pipelineStatus.hasNetwork ? 'pointer' : 'not-allowed', opacity: pipelineStatus.hasNetwork ? 1 : 0.6 }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleChange}
          />
          <div className="upload-icon">📊</div>
          <div className="upload-title">
            {uploading ? 'Memvalidasi...' : 'Klik atau drag file CSV ke sini'}
          </div>
        </div>
      )}

      {/* Re-upload */}
      {datasetData && (
        <div style={{ marginBottom: 16 }}>
          <button
            className="btn btn-secondary"
            onClick={() => { setDatasetData(null); setError(null); }}
          >
            Upload Dataset Baru
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="alert alert-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Success */}
      {datasetData && (
        <>
          <div style={{
            marginTop: 'var(--space-5)',
            padding: 'var(--space-4) var(--space-5)',
            background: 'var(--color-blue-pale)',
            border: '1px solid var(--color-blue-accent)',
            borderRadius: 'var(--radius-lg)',
            fontSize: 14,
            color: 'var(--color-navy)',
          }}>
            Dataset berhasil diupload. <strong>{datasetData.total_rows?.toLocaleString()}</strong> baris,{' '}
            <strong>{datasetData.columns?.length}</strong> kolom.
          </div>

          {/* Stats */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Jumlah Baris</div>
              <div className="stat-value">
                {datasetData.total_rows?.toLocaleString() ?? '—'}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Jumlah Kolom</div>
              <div className="stat-value">{datasetData.columns?.length ?? '—'}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Dataset Hash</div>
              <div className="stat-value" style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                {datasetData.dataset_hash?.slice(0, 12)}...
              </div>
            </div>
          </div>

          {/* Preview */}
          {datasetData.preview_rows?.length > 0 && (
            <div className="section-card">
              <div className="section-card-header">
                <h3>Preview</h3>
                <span className="badge">{datasetData.preview_rows.length} baris</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      {datasetData.columns?.map(col => (
                        <th key={col}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {datasetData.preview_rows.map((row, i) => (
                      <tr key={i}>
                        {datasetData.columns?.map((_, j) => (
                          <td key={j}>{row[j] ?? '—'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Already has dataset */}
      {pipelineStatus.hasDataset && pipelineStatus.datasetMetadata && !datasetData && (
        <div style={{
          marginTop: 'var(--space-5)',
          padding: 'var(--space-4) var(--space-5)',
          background: 'var(--color-blue-pale)',
          border: '1px solid var(--color-blue-accent)',
          borderRadius: 'var(--radius-lg)',
          fontSize: 14,
          color: 'var(--color-navy)',
        }}>
          Dataset sudah aktif: <strong>{pipelineStatus.datasetMetadata.total_rows?.toLocaleString()}</strong> baris.
          Upload dataset baru akan mengganti yang lama.
        </div>
      )}
    </div>
  );
}
