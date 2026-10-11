import { useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL || '';

export default function ScenarioView({ scenarioId, scenarioName, fileKind = 'prediction', onAbcResult, runAbc: runAbcProp, authFetch, user }) {
  const isAdmin = user?.role === 'admin';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [lstm, setLstm] = useState(null);
  const [lstmLoading, setLstmLoading] = useState(true);
  const [lstmError, setLstmError] = useState(null);

  const [abc, setAbc] = useState(null);
  const [abcLoading, setAbcLoading] = useState(false);
  const [abcError, setAbcError] = useState(null);
  const [numReclosers, setNumReclosers] = useState(4);

  useEffect(() => {
    setLoading(true);
    setError(null);
    authFetch(`${API}/api/scenarios/${scenarioId}/${fileKind}`)
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioId, fileKind]);

  useEffect(() => {
    setLstm(null);
    setLstmLoading(true);
    setLstmError(null);
    authFetch(`${API}/api/scenarios/${scenarioId}/lstm/predict`, { method: 'POST' })
      .then(setLstm)
      .catch((e) => setLstmError(String(e)))
      .finally(() => setLstmLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioId]);

  useEffect(() => {
    setAbc(null);
    setAbcError(null);
    setNumReclosers(4);
  }, [scenarioId]);

  const runAbc = async () => {
    setAbc(null);
    setAbcError(null);
    setAbcLoading(true);
    const startedAt = performance.now();
    try {
      const url = `${API}/api/scenarios/${scenarioId}/abc/optimize?num_reclosers=${numReclosers}`;
      const j = await authFetch(url, { method: 'POST' });
      setAbc({ ...j, _client_ms: Math.round(performance.now() - startedAt) });
      if (onAbcResult) onAbcResult(scenarioId, numReclosers, j);
    } catch (e) {
      setAbcError(String(e));
    } finally {
      setAbcLoading(false);
    }
  };

  if (loading) return <p className="loading">Memuat skenario…</p>;
  if (error) return <p className="error">Backend error: {error}</p>;
  if (!data) return null;

  return (
    <>
      <h1>{scenarioName}</h1>
      <p className="subtitle">File: <code>{data.file_name}</code></p>

      <section className="lstm-block">
        <div className="section-card-header">
          <h3>LSTM Fault Risk Prediction &mdash; {scenarioName}</h3>
          {lstm && (
            <span className={`status-pill ${lstm.source === 'live' ? 'success' : 'warning'}`}>
              {lstm.source === 'live' ? 'Live' : 'Cached'}
            </span>
          )}
        </div>

        {lstmLoading && <p className="loading">Memuat LSTM…</p>}
        {lstmError && <p className="error">LSTM backend error: {lstmError}</p>}

        {lstm && (
          <>
            <h3 className="section-title">Prediction Summary</h3>
            <div className="metric-row">
              <span className="metric-pill">scenario_id: <strong>{lstm.scenario_id}</strong></span>
              <span className="metric-pill">status: <strong>{lstm.status}</strong></span>
              <span className="metric-pill">data rows used: <strong>{lstm.data_rows_used}</strong></span>
            </div>

            <h3 className="section-title">Risk Category</h3>
            <div className="metric-row">
              {Object.entries(lstm.kategori_distribution || {}).map(([k, v]) => (
                <span key={k} className="metric-pill">
                  <span className={`kategori-badge kat-${k.toLowerCase()}`}>{k}</span>
                  <strong>{v}</strong> line
                </span>
              ))}
            </div>

            {lstm.message && <p className="lstm-message">{lstm.message}</p>}

            <h3 className="section-title">Prediction Table</h3>
            <div className="table-wrap">
              <table className="data-table data-table-compact">
                <thead>
                  <tr>{lstm.columns.map((c) => <th key={c}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {lstm.preview_rows.map((row, i) => (
                    <tr key={i}>
                      {lstm.columns.map((c) => (
                        <td key={c} style={{ fontFamily: 'var(--font-mono)' }}>{row[c]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="abc-block">
        <div className="section-card-header">
          <h3>ABC Recloser Optimization &mdash; {scenarioName}</h3>
          {abc && <span className="status-pill success">{abc.status}</span>}
        </div>

        {!isAdmin ? (
          <div className="empty-state">
            <p>
              <strong>Hanya Admin yang dapat menjalankan ABC Optimization.</strong>
            </p>
            <p>Anda login sebagai User. Hasil ABC yang sudah di-cache sebelumnya dapat dilihat di halaman Results.</p>
          </div>
        ) : (
          <>
            <div className="abc-controls">
              <label className="inline-control">
                Jumlah Recloser:&nbsp;
                <select
                  value={numReclosers}
                  onChange={(e) => setNumReclosers(Number(e.target.value))}
                  disabled={abcLoading}
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
              <button className="run-btn" onClick={runAbc} disabled={abcLoading}>
                {abcLoading ? 'Running…' : 'Run Optimization'}
              </button>
            </div>

            {abcLoading && <p className="loading">Optimizing (synchronous, research parameters)…</p>}
            {abcError && <p className="error">ABC backend error: {abcError}</p>}

            {abc && (
              <>
                <h3 className="section-title">Run Information</h3>
                <div className="metric-row">
                  <span className="metric-pill">scenario_id: <strong>{abc.scenario_id}</strong></span>
                  <span className="metric-pill">source: <strong>{abc.source_file}</strong></span>
                  <span className="metric-pill">runtime: <strong>{abc.runtime_seconds}s</strong></span>
                  <span className="metric-pill">client: <strong>{abc._client_ms}ms</strong></span>
                </div>

                <h3 className="section-title">Parameters</h3>
                <div className="metric-row">
                  <span className="metric-pill">jumlah recloser: <strong>{abc.parameters.num_reclosers}</strong></span>
                  <span className="metric-pill">colony size: <strong>{abc.parameters.colony_size}</strong></span>
                  <span className="metric-pill">jumlah iterasi: <strong>{abc.totals.jumlah_iterasi}</strong></span>
                  <span className="metric-pill">seed: <strong>{abc.parameters.penalties.RANDOM_SEED}</strong></span>
                  <span className="metric-pill">W_SAIDI: <strong>{abc.parameters.weights.W_SAIDI}</strong></span>
                  <span className="metric-pill">W_SAIFI: <strong>{abc.parameters.weights.W_SAIFI}</strong></span>
                  <span className="metric-pill">W_RISK: <strong>{abc.parameters.weights.W_RISK}</strong></span>
                </div>

                <h3 className="section-title">Result</h3>
                <div className="abc-result-grid">
                  <div className="abc-metric-block">
                    <div className="abc-metric-block-label">Fitness</div>
                    <div className="abc-metric-block-value">{abc.optimal.fitness.toFixed(6)}</div>
                  </div>
                  <div className="abc-metric-block">
                    <div className="abc-metric-block-label">Baseline SAIDI</div>
                    <div className="abc-metric-block-value">{abc.baseline.saidi.toFixed(4)}</div>
                  </div>
                  <div className="abc-metric-block">
                    <div className="abc-metric-block-label">Optimal SAIDI</div>
                    <div className="abc-metric-block-value">{abc.optimal.saidi.toFixed(4)}</div>
                  </div>
                  <div className="abc-metric-block">
                    <div className="abc-metric-block-label">SAIDI Improvement</div>
                    <div
                      className={
                        'abc-metric-block-value ' +
                        (abc.improvement.saidi_pct >= 0 ? 'delta-up' : 'delta-down')
                      }
                    >
                      {abc.improvement.saidi_pct >= 0 ? '▼' : '▲'} {Math.abs(abc.improvement.saidi_pct).toFixed(1)}%
                    </div>
                  </div>
                  <div className="abc-metric-block">
                    <div className="abc-metric-block-label">Baseline SAIFI</div>
                    <div className="abc-metric-block-value">{abc.baseline.saifi.toFixed(4)}</div>
                  </div>
                  <div className="abc-metric-block">
                    <div className="abc-metric-block-label">Optimal SAIFI</div>
                    <div className="abc-metric-block-value">{abc.optimal.saifi.toFixed(4)}</div>
                  </div>
                  <div className="abc-metric-block">
                    <div className="abc-metric-block-label">SAIFI Improvement</div>
                    <div
                      className={
                        'abc-metric-block-value ' +
                        (abc.improvement.saifi_pct >= 0 ? 'delta-up' : 'delta-down')
                      }
                    >
                      {abc.improvement.saifi_pct >= 0 ? '▼' : '▲'} {Math.abs(abc.improvement.saifi_pct).toFixed(1)}%
                    </div>
                  </div>
                  <div className="abc-metric-block">
                    <div className="abc-metric-block-label">Total Risk</div>
                    <div className="abc-metric-block-value">{abc.totals.total_system_risk.toFixed(4)}</div>
                  </div>
                  <div className="abc-metric-block">
                    <div className="abc-metric-block-label">Remaining Risk</div>
                    <div className="abc-metric-block-value">{abc.improvement.risk_remaining_pct.toFixed(1)}%</div>
                  </div>
                </div>

                <h3 className="section-title">Optimal Recloser Positions</h3>
                <ul className="recloser-list">
                  {abc.optimal.positions.map((p) => <li key={p}>{p}</li>)}
                </ul>

                <h3 className="section-title">Detail Zona Proteksi</h3>
                <div className="table-wrap">
                  <table className="data-table data-table-compact">
                    <thead>
                      <tr>
                        <th>Recloser</th>
                        <th className="numeric">num_lines_in_zone</th>
                        <th className="numeric">customers</th>
                        <th className="numeric">risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {abc.zones.map((z) => (
                        <tr key={z.recloser}>
                          <td><strong>{z.recloser}</strong></td>
                          <td className="numeric">{z.num_lines_in_zone}</td>
                          <td className="numeric">{z.customers.toFixed(0)}</td>
                          <td className="numeric">{z.risk.toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </>
  );
}