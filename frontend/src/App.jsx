import { useCallback, useEffect, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import LandingPage from './components/LandingPage.jsx';
import OverviewPage from './components/OverviewPage.jsx';
import NetworkUpload from './components/NetworkUpload.jsx';
import DatasetPage from './components/DatasetPage.jsx';
import DatasetFilesPage from './components/DatasetFilesPage.jsx';
import LstmRun from './components/LstmRun.jsx';
import AbcRun from './components/AbcRun.jsx';
import ResultsPage from './components/ResultsPage.jsx';
import './App.css';

const API = import.meta.env.VITE_API_URL || '';

function persistedHeaders(user) {
  if (!user?.token) return {};
  return { Authorization: `Bearer ${user.token}` };
}

export default function App() {
  // Start null — validation happens async in useEffect
  const [user, setUser] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [viewMode, setViewMode] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Pipeline state
  const [pipelineStatus, setPipelineStatus] = useState({
    hasNetwork: false,
    hasDataset: false,
    lstmDone: false,
    abcDone: false,
    networkHash: null,
    datasetHash: null,
    networkMetadata: null,
    datasetMetadata: null,
    modelInfo: null,
  });
  const [lstmResults, setLstmResults] = useState(null);
  const [abcResults, setAbcResults] = useState(null);
  const [abcLoading, setAbcLoading] = useState(false);

  // Logout function — defined before useCallback deps that reference it
  const handleLogout = useCallback(() => {
    try {
      localStorage.removeItem('recloser_user');
    } catch (_) {}
    setUser(null);
    setViewMode('overview');
    setPipelineStatus({
      hasNetwork: false,
      hasDataset: false,
      lstmDone: false,
      abcDone: false,
      networkHash: null,
      datasetHash: null,
      networkMetadata: null,
      datasetMetadata: null,
      modelInfo: null,
    });
    setLstmResults(null);
    setAbcResults(null);
    setSidebarOpen(false);
  }, []);

  const authFetch = useCallback(
    async (url, options = {}) => {
      const headers = { ...(options.headers || {}), ...persistedHeaders(user) };
      const r = await fetch(url, { ...options, headers });
      if (r.status === 401) {
        handleLogout();
        throw new Error('Session expired');
      }
      return r;
    },
    [user, handleLogout]
  );

  // Fetch pipeline status on mount and after login
  const fetchPipelineStatus = useCallback(async () => {
    try {
      const r = await authFetch(`${API}/api/pipeline/status`);
      if (!r.ok) return;
      const data = await r.json();
      setPipelineStatus({
        hasNetwork: data.has_network,
        hasDataset: data.has_dataset,
        networkHash: data.network_hash,
        datasetHash: data.dataset_hash,
        networkMetadata: data.network_metadata,
        topologyMap: data.topology_map || null,
        datasetMetadata: data.dataset_metadata,
        lstmDone: data.lstm_done,
        abcDone: data.abc_done,
        modelInfo: data.model_info,
      });
    } catch (_) {
      // ignore
    }
  }, [authFetch]);

  // Validate session on mount — async, reads localStorage then calls backend
  useEffect(() => {
    async function validateSession() {
      try {
        const raw = localStorage.getItem('recloser_user');
        if (!raw) { setLoadingSession(false); return; }

        let stored;
        try { stored = JSON.parse(raw); } catch { stored = null; }
        if (!stored?.token) { setLoadingSession(false); return; }

        // Google OAuth callback — URL params take priority over localStorage
        const params = new URLSearchParams(window.location.search);
        const urlToken = params.get('token');
        const urlUsername = params.get('username');
        const urlRole = params.get('role');
        const urlFullName = params.get('full_name');
        const urlEmail = params.get('email');

        if (urlToken && urlUsername && urlRole) {
          const userFromUrl = {
            username: urlUsername,
            role: urlRole,
            token: urlToken,
            fullName: urlFullName || null,
            email: urlEmail || null,
          };
          localStorage.setItem('recloser_user', JSON.stringify(userFromUrl));
          window.history.replaceState({}, '', window.location.pathname);
          setUser(userFromUrl);
          setLoadingSession(false);
          return;
        }

        // Normal load — verify token with backend
        const r = await fetch(`${API}/api/auth/me`, {
          headers: { Authorization: `Bearer ${stored.token}` },
        });
        if (r.ok) {
          const me = await r.json();
          const validatedUser = {
            username: me.username,
            role: me.role,
            token: stored.token,
            fullName: stored.fullName || null,
            email: stored.email || null,
          };
          setUser(validatedUser);
          localStorage.setItem('recloser_user', JSON.stringify(validatedUser));
        } else {
          localStorage.removeItem('recloser_user');
        }
      } catch (_) {
        localStorage.removeItem('recloser_user');
      } finally {
        setLoadingSession(false);
      }
    }
    validateSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch pipeline status when user logs in
  useEffect(() => {
    if (user) {
      fetchPipelineStatus();
    }
  }, [user, fetchPipelineStatus]);

  // Refresh pipeline status when active tab changes
  useEffect(() => {
    if (user) {
      fetchPipelineStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, fetchPipelineStatus]);

  // When network or dataset changes, clear downstream results
  const handleNetworkUploaded = useCallback((data) => {
    setPipelineStatus(prev => ({
      ...prev,
      hasNetwork: true,
      networkHash: data.network_hash,
      networkMetadata: data.metadata,
      lstmDone: false,
      abcDone: false,
    }));
    setLstmResults(null);
    setAbcResults(null);
    fetchPipelineStatus();
  }, [fetchPipelineStatus]);

  const handleDatasetUploaded = useCallback((data) => {
    setPipelineStatus(prev => ({
      ...prev,
      hasDataset: true,
      datasetHash: data.dataset_hash,
      datasetMetadata: {
        columns: data.columns,
        total_rows: data.total_rows,
      },
      lstmDone: false,
      abcDone: false,
    }));
    setLstmResults(null);
    setAbcResults(null);
    fetchPipelineStatus();
  }, [fetchPipelineStatus]);

  const runLstm = useCallback(async () => {
    const r = await authFetch(`${API}/api/lstm/run`, { method: 'POST' });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(err);
    }
    const data = await r.json();

    const r2 = await authFetch(`${API}/api/lstm/results`);
    if (!r2.ok) throw new Error('Failed to fetch LSTM results');
    const lstmData = await r2.json();

    setLstmResults(lstmData);
    setPipelineStatus(prev => ({ ...prev, lstmDone: true }));
    fetchPipelineStatus();
    return data;
  }, [authFetch, fetchPipelineStatus]);

  const runAbc = useCallback(async (numReclosers) => {
    setAbcLoading(true);
    try {
      const r = await authFetch(
        `${API}/api/abc/run?num_reclosers=${numReclosers}`,
        { method: 'POST' }
      );
      if (!r.ok) {
        const err = await r.text();
        throw new Error(err);
      }
      const data = await r.json();
      setAbcResults(data);
      setPipelineStatus(prev => ({ ...prev, abcDone: true }));
      fetchPipelineStatus();
      return data;
    } finally {
      setAbcLoading(false);
    }
  }, [authFetch, fetchPipelineStatus]);

  const handleSelectMenu = useCallback((key) => {
    setViewMode(key);
    setSidebarOpen(false);
  }, []);

  const handleLogin = useCallback((u) => {
    localStorage.setItem('recloser_user', JSON.stringify(u));
    setUser(u);
  }, []);

  // Close mobile sidebar on Escape
  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setSidebarOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  // Lock body scroll when mobile sidebar open
  useEffect(() => {
    if (sidebarOpen) document.body.classList.add('sidebar-open');
    else document.body.classList.remove('sidebar-open');
    return () => document.body.classList.remove('sidebar-open');
  }, [sidebarOpen]);

  // Loading state while validating session
  if (loadingSession) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--color-navy-deepest)',
        color: 'white',
        fontFamily: 'var(--font-sans)',
        fontSize: 15,
        gap: 8,
      }}>
        <span>Memuat…</span>
      </div>
    );
  }

  // Not authenticated — show landing page
  if (!user) {
    return <LandingPage onLogin={handleLogin} />;
  }

  let main;
  if (viewMode === 'overview') {
    main = (
      <OverviewPage
        pipelineStatus={pipelineStatus}
        abcResults={abcResults}
        onSelectMenu={handleSelectMenu}
      />
    );
  } else if (viewMode === 'network-data') {
    main = (
      <NetworkUpload
        authFetch={authFetch}
        pipelineStatus={pipelineStatus}
        onUploaded={handleNetworkUploaded}
      />
    );
  } else if (viewMode === 'dataset') {
    main = (
      <DatasetPage
        authFetch={authFetch}
        pipelineStatus={pipelineStatus}
        onUploaded={handleDatasetUploaded}
      />
    );
  } else if (viewMode === 'lstm') {
    main = (
      <LstmRun
        authFetch={authFetch}
        pipelineStatus={pipelineStatus}
        onRun={runLstm}
        lstmResults={lstmResults}
        onResults={setLstmResults}
      />
    );
  } else if (viewMode === 'abc') {
    main = (
      <AbcRun
        authFetch={authFetch}
        pipelineStatus={pipelineStatus}
        topologyMap={pipelineStatus.topologyMap}
        onRun={runAbc}
        abcResults={abcResults}
        onResults={setAbcResults}
        abcLoading={abcLoading}
        setAbcLoading={setAbcLoading}
        user={user}
      />
    );
  } else if (viewMode === 'results') {
    main = (
      <ResultsPage
        authFetch={authFetch}
        pipelineStatus={pipelineStatus}
        topologyMap={pipelineStatus.topologyMap}
        abcResults={abcResults}
        lstmResults={lstmResults}
      />
    );
  } else if (viewMode === 'manual-faults') {
    main = <DatasetFilesPage authFetch={authFetch} />;
  } else {
    main = (
      <OverviewPage
        pipelineStatus={pipelineStatus}
        onSelectMenu={handleSelectMenu}
      />
    );
  }

  return (
    <div className="app">
      <button
        type="button"
        className="hamburger-btn"
        aria-label="Buka menu"
        onClick={() => setSidebarOpen((v) => !v)}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <rect x="3" y="5" width="14" height="2" rx="1" fill="currentColor" />
          <rect x="3" y="9" width="14" height="2" rx="1" fill="currentColor" />
          <rect x="3" y="13" width="14" height="2" rx="1" fill="currentColor" />
        </svg>
      </button>
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <Sidebar
        activeMenu={viewMode}
        onSelectMenu={handleSelectMenu}
        user={user}
        onLogout={handleLogout}
        mobileOpen={sidebarOpen}
        pipelineStatus={pipelineStatus}
      />
      <main className="main">{main}</main>
    </div>
  );
}
