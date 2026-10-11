import { useEffect, useMemo, useState } from 'react';

const API = import.meta.env.VITE_API_URL || '';

const FAULT_TYPES = ['temporary', 'permanent'];
const FAKTOR_OPTIONS = ['Cuaca', 'Peralatan', 'Hewan', 'Risiko'];

const PENYEBAB_BY_FAKTOR = {
  Cuaca:      ['Hujan lebat', 'Petir', 'Angin kencang', 'Pohon tumbang'],
  Peralatan:  ['Kerusakan isolator', 'Gangguan konduktor', 'Kerusakan peralatan'],
  Hewan:      ['Hewan menyentuh jaringan', 'Hewan masuk gardu'],
  Risiko:     ['Kondisi jaringan tua', 'Vegetasi dekat jaringan', 'Kondisi lingkungan jaringan'],
};

const EMPTY_FORM = {
  line_id: '',
  timestamp: '',
  fault_type: 'temporary',
  faktor_penyebab: 'Cuaca',
  penyebab_gangguan: '',
  description: '',
  reported_by: '',
  affected_customers: '',
  duration_hours: '',
};

export default function ManualFaults({ authFetch, user }) {
  const [faults, setFaults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await authFetch(`${API}/api/manual-faults`);
      if (!r.ok) { const txt = await r.text(); throw new Error(`HTTP ${r.status}: ${txt}`); }
      const j = await r.json();
      setFaults(j.faults || []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  // When faktor_penyebab changes, reset penyebab_gangguan to keep them in sync.
  // Prevents editing-flow issues where the old penyebab becomes invalid for the
  // new faktor (server would reject as 422).
  useEffect(() => {
    const allowed = PENYEBAB_BY_FAKTOR[form.faktor_penyebab] || [];
    if (form.penyebab_gangguan && !allowed.includes(form.penyebab_gangguan)) {
      setForm((f) => ({ ...f, penyebab_gangguan: '' }));
    }
  }, [form.faktor_penyebab]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (f) => {
    setEditingId(f.id);
    setForm({
      line_id: String(f.line_id),
      timestamp: f.timestamp,
      fault_type: f.fault_type,
      faktor_penyebab: f.faktor_penyebab,
      penyebab_gangguan: f.penyebab_gangguan,
      description: f.description,
      reported_by: f.reported_by,
      affected_customers: String(f.affected_customers),
      duration_hours: String(f.duration_hours),
    });
    setFormError(null);
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const payload = {
        line_id: Number(form.line_id),
        timestamp: form.timestamp,
        fault_type: form.fault_type,
        faktor_penyebab: form.faktor_penyebab,
        penyebab_gangguan: form.penyebab_gangguan,
        description: form.description,
        affected_customers: Number(form.affected_customers),
        duration_hours: Number(form.duration_hours),
      };
      const url = editingId
        ? `${API}/api/manual-faults/${editingId}`
        : `${API}/api/manual-faults`;
      const method = editingId ? 'PUT' : 'POST';
      await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await refresh();
      cancelForm();
    } catch (e) {
      setFormError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Hapus data gangguan ini?')) return;
    try {
      await authFetch(`${API}/api/manual-faults/${id}`, { method: 'DELETE' });
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  };

  const penyebabOptions = useMemo(
    () => PENYEBAB_BY_FAKTOR[form.faktor_penyebab] || [],
    [form.faktor_penyebab]
  );

  return (
    <>
      <h1>Input Data Gangguan Manual</h1>
      <p className="subtitle">
        Data yang dimasukkan di sini terpisah dari dataset penelitian asli (Scenario A–E) dan tidak memicu training LSTM atau optimasi ABC.
      </p>

      <div className="dashboard-grid">
        <div className="stat-card">
          <div className="stat-card-label">Total Entri</div>
          <div className="stat-card-value">{faults.length}</div>
          <div className="stat-card-sub">data manual</div>
        </div>
        <div className="stat-card" style={{ justifyContent: 'center' }}>
          <button className="run-btn" onClick={openCreate} disabled={showForm}>
            {showForm ? 'Form sedang terbuka' : '+ Tambah Data'}
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {showForm && (
        <div className="section-card">
          <div className="section-card-header">
            <h3>{editingId ? 'Edit Data' : 'Form Data Gangguan'}</h3>
            <button className="link-btn" onClick={cancelForm}>Batal</button>
          </div>
          {formError && <p className="error">{formError}</p>}

          <form className="form-grid" onSubmit={handleSubmit}>
            <label>line_id (1-68)<input type="number" min="1" max="68" required value={form.line_id} onChange={(e) => setForm({ ...form, line_id: e.target.value })} /></label>
            <label>timestamp (YYYY-MM-DD)<input type="date" required value={form.timestamp} onChange={(e) => setForm({ ...form, timestamp: e.target.value })} /></label>

            <label>fault_type
              <select value={form.fault_type} onChange={(e) => setForm({ ...form, fault_type: e.target.value })}>
                {FAULT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>

            <label>Faktor Penyebab
              <select value={form.faktor_penyebab} onChange={(e) => setForm({ ...form, faktor_penyebab: e.target.value })}>
                {FAKTOR_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>

            <label className="full-row">Penyebab Gangguan
              <select required value={form.penyebab_gangguan} onChange={(e) => setForm({ ...form, penyebab_gangguan: e.target.value })}>
                <option value="">— pilih penyebab —</option>
                {penyebabOptions.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>

            <label className="full-row">description<textarea required minLength={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>

            <label>reported_by<input required minLength={1} value={form.reported_by} onChange={(e) => setForm({ ...form, reported_by: e.target.value })} /></label>
            <label>affected_customers<input type="number" min="0" required value={form.affected_customers} onChange={(e) => setForm({ ...form, affected_customers: e.target.value })} /></label>
            <label>duration_hours (jam)<input type="number" step="0.1" min="0" required value={form.duration_hours} onChange={(e) => setForm({ ...form, duration_hours: e.target.value })} /></label>

            <div className="form-actions full-row">
              <button type="submit" className="run-btn" disabled={submitting}>
                {submitting ? 'Menyimpan…' : editingId ? 'Simpan Perubahan' : 'Tambah'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="section-card">
        <div className="section-card-header">
          <h3>Data Manual Tersimpan</h3>
          <span className="status-pill neutral">{faults.length} entri</span>
        </div>

        {loading ? <p className="loading">Memuat…</p> : faults.length === 0 ? (
          <p className="empty-state">Belum ada data. Klik <strong>+ Tambah Data</strong> untuk menambahkan.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table data-table-compact">
              <thead>
                <tr>
                  <th className="numeric">line_id</th>
                  <th>timestamp</th>
                  <th>fault_type</th>
                  <th>faktor_penyebab</th>
                  <th>penyebab_gangguan</th>
                  <th>description</th>
                  <th>reported_by</th>
                  <th className="numeric">affected_customers</th>
                  <th className="numeric">duration_hours</th>
                  <th>source</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {faults.map((f) => (
                  <tr key={f.id}>
                    <td className="numeric">{f.line_id}</td>
                    <td>{f.timestamp}</td>
                    <td>{f.fault_type}</td>
                    <td>{f.faktor_penyebab}</td>
                    <td>{f.penyebab_gangguan}</td>
                    <td className="col-list" title={f.description}>{f.description}</td>
                    <td>{f.reported_by}</td>
                    <td className="numeric">{f.affected_customers}</td>
                    <td className="numeric">{Number(f.duration_hours).toFixed(1)}</td>
                    <td><span className="manual-badge">{f.source}</span></td>
                    <td>
                      <button className="link-btn" onClick={() => openEdit(f)}>Edit</button>
                      <button className="link-btn danger" onClick={() => handleDelete(f.id)} style={{ marginLeft: 6 }}>Hapus</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}