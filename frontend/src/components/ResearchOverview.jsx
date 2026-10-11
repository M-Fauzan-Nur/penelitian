import { useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL || '';

const PIPELINE_STEPS = [
  { id: 'dataset',    title: 'Dataset',              desc: 'Skenario A–E, IEEE 69 Bus' },
  { id: 'lstm',       title: 'LSTM',                 desc: 'Fault Risk Prediction' },
  { id: 'predict',    title: 'Prediksi',             desc: 'Pola & kategori risiko' },
  { id: 'abc',        title: 'ABC Optimization',    desc: '1–6 recloser' },
  { id: 'placement', title: 'Optimal Placement',    desc: 'Posisi recloser terbaik' },
  { id: 'results',    title: 'Results',              desc: 'SAIDI, SAIFI, Risk, Fitness' },
];

const STATUS_ITEMS = [
  { label: 'Dataset', value: 'Ready' },
  { label: 'LSTM',    value: 'Ready' },
  { label: 'ABC',     value: 'Ready' },
  { label: 'Results', value: 'Ready' },
];

export default function ResearchOverview({ authFetch, onSelectScenario }) {
  const [system, setSystem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const fetchPromise = authFetch
      ? authFetch(`${API}/api/dashboard`)
      : fetch(`${API}/api/dashboard`);
    fetchPromise
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((j) => { if (!cancelled) { setSystem(j); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(String(e)); setLoading(false); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <section className="hero">
        <h1>Recloser Research</h1>
        <p className="hero-subtitle">
          Optimal Recloser Placement in Radial Distribution Networks
        </p>
        {error && <p className="error" style={{ marginTop: 12 }}>Backend error: {error}</p>}
      </section>

      <section className="section-card">
        <div className="section-card-header">
          <h3>Sistem</h3>
          <span className="status-pill success">Online</span>
        </div>
        <div className="dashboard-grid">
          <div className="stat-card">
            <div className="stat-card-label">System</div>
            <div className="stat-card-value" style={{ fontSize: 18 }}>IEEE 69 Bus</div>
            <div className="stat-card-sub">Radial Distribution Network</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Scenarios</div>
            <div className="stat-card-value">5</div>
            <div className="stat-card-sub">Scenario A &mdash; E</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Customers</div>
            <div className="stat-card-value">571</div>
            <div className="stat-card-sub">Agregat IEEE 69 Bus</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Study Period</div>
            <div className="stat-card-value" style={{ fontSize: 22 }}>2019–2023</div>
            <div className="stat-card-sub">5 tahun data historis</div>
          </div>
        </div>
        {system && (
          <p style={{ marginTop: 12, fontSize: 13, color: 'var(--color-text-muted)' }}>
            {system.system}
          </p>
        )}
        {loading && !system && !error && (
          <p className="loading" style={{ marginTop: 12 }}>Memuat informasi sistem…</p>
        )}
      </section>

      <section className="section-card">
        <div className="section-card-header">
          <h3>Research Pipeline</h3>
        </div>
        <div className="pipeline">
          {PIPELINE_STEPS.map((s, i) => (
            <div key={s.id} className="pipeline-step">
              <div className="pipeline-num">{i + 1}</div>
              <div className="pipeline-title">{s.title}</div>
              <div className="pipeline-desc">{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="section-card">
        <div className="section-card-header">
          <h3>Scenario Overview</h3>
          <span className="status-pill neutral">5 skenario</span>
        </div>
        <div className="scenario-mini-grid">
          {['a', 'b', 'c', 'd', 'e'].map((id) => (
            <div key={id} className="scenario-mini-card">
              <div className="scenario-mini-name">Scenario {id.toUpperCase()}</div>
              <div className="scenario-mini-sub">IEEE 69 Bus</div>
              <button
                type="button"
                className="link-btn"
                onClick={() => onSelectScenario?.(id)}
              >
                View Scenario
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="section-card">
        <div className="section-card-header">
          <h3>Research Status</h3>
        </div>
        <div className="status-row">
          {STATUS_ITEMS.map((it) => (
            <div key={it.label} className="status-item">
              <span className="status-pill success">{it.value}</span>
              <span className="status-item-label">{it.label}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}