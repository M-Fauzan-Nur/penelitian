import { useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL || '';

function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function DatasetFilesPage({ authFetch }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(null);

  useEffect(() => {
    fetchFiles();
  }, []);

  async function fetchFiles() {
    setLoading(true);
    setError(null);
    try {
      const r = await authFetch(`${API}/api/files`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setFiles(data.files || []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload(file) {
    setDownloading(file.type);
    try {
      const r = await authFetch(`${API}/api/files/${file.type}/download`);
      if (!r.ok) throw new Error(await r.text());
      const text = await r.text();
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(`Gagal mengunduh: ${e.message}`);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>File Dataset</h1>
        <p>Daftar file yang telah diunggah ke platform.</p>
      </div>

      {error && (
        <div className="alert alert-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {loading ? (
        <div className="section-card">
          <div className="empty-state">Memuat...</div>
        </div>
      ) : files.length === 0 ? (
        <div className="section-card">
          <div className="empty-state">
            <strong>Belum ada file yang diunggah.</strong>
            <br />
            Upload file melalui halaman{' '}
            <strong>Network Data</strong> dan <strong>Dataset</strong>.
          </div>
        </div>
      ) : (
        <div className="files-grid">
          {files.map((file) => (
            <div key={file.type} className="file-card">
              <div className="file-card-header">
                <div className="file-card-icon">
                  {file.type === 'dataset' ? '📊' : '⚡'}
                </div>
                <div className="file-card-meta">
                  <div className="file-card-type">{file.label}</div>
                  <div className="file-card-filename">{file.filename}</div>
                </div>
              </div>

              <div className="file-card-details">
                <div className="file-detail-row">
                  <span className="file-detail-label">Format</span>
                  <span className="file-detail-value">CSV</span>
                </div>
                {file.rows != null && (
                  <div className="file-detail-row">
                    <span className="file-detail-label">Jumlah Baris</span>
                    <span className="file-detail-value">{Number(file.rows).toLocaleString()}</span>
                  </div>
                )}
                <div className="file-detail-row">
                  <span className="file-detail-label">Ukuran</span>
                  <span className="file-detail-value">{formatBytes(file.file_size)}</span>
                </div>
                {file.columns && file.columns.length > 0 && (
                  <div className="file-detail-row">
                    <span className="file-detail-label">Kolom</span>
                    <span className="file-detail-value">{file.columns.length}</span>
                  </div>
                )}
              </div>

              <button
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => handleDownload(file)}
                disabled={downloading === file.type}
              >
                {downloading === file.type ? 'Mengunduh...' : '↓ Unduh'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
