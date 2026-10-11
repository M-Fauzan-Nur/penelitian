import { useRef, useState } from 'react';

const API = import.meta.env.VITE_API_URL || '';

export default function NetworkUpload({ authFetch, pipelineStatus, onUploaded }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [networkData, setNetworkData] = useState(null);
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
      const r = await authFetch(`${API}/api/upload/network`, {
        method: 'POST',
        body: formData,
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.detail || 'Upload failed');
        return;
      }
      setNetworkData(data);
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

  const metadata = networkData?.metadata;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Network Data</h1>
        <p>Upload topologi jaringan distribusi dalam format CSV.</p>
      </div>

      {/* Upload Area */}
      {!networkData && (
        <div
          className={`upload-area ${dragOver ? 'drag-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleChange}
          />
          <div className="upload-icon">⚡</div>
          <div className="upload-title">
            {uploading ? 'Memproses...' : 'Klik atau drag file CSV ke sini'}
          </div>
        </div>
      )}

      {/* Re-upload */}
      {networkData && (
        <div style={{ marginBottom: 16 }}>
          <button
            className="btn btn-secondary"
            onClick={() => { setNetworkData(null); setError(null); }}
          >
            Upload Network Baru
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
      {networkData && (
        <>
          <div className="alert alert-success">
            Network berhasil diupload. {metadata?.num_lines} lines, {metadata?.num_buses} buses.
          </div>

          {/* Stats */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Jumlah Line</div>
              <div className="stat-value">{metadata?.num_lines ?? '—'}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Jumlah Bus</div>
              <div className="stat-value">{metadata?.num_buses ?? '—'}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Network Hash</div>
              <div className="stat-value" style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                {networkData.network_hash?.slice(0, 12)}...
              </div>
            </div>
          </div>

          {/* Preview Table */}
          {metadata?.preview?.length > 0 && (
            <div className="section-card">
              <div className="section-card-header">
                <h3>Preview Data</h3>
                <span className="badge">{metadata.preview.length} baris</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>line_id</th>
                      <th>from_bus</th>
                      <th>to_bus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metadata.preview.map((row, i) => (
                      <tr key={i}>
                        <td>{row.line_id}</td>
                        <td>{row.from_bus}</td>
                        <td>{row.to_bus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </>
      )}

      {/* Already has network */}
      {pipelineStatus.hasNetwork && pipelineStatus.networkMetadata && !networkData && (
        <div className="alert alert-info">
          Network sudah aktif: {pipelineStatus.networkMetadata.num_lines} lines,
          {pipelineStatus.networkMetadata.num_buses} buses.
          Upload network baru akan mengganti yang lama.
        </div>
      )}
    </div>
  );
}
