import React, { useState, useEffect, useCallback } from 'react';

// ============================================================================
// CONFIG
// ============================================================================
// Point this at your running FastAPI backend.
const API_BASE = 'http://localhost:8000/api';

// ============================================================================
// API SERVICE LAYER
// ============================================================================

async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: options.body instanceof FormData
        ? undefined
        : { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
  } catch (networkErr) {
    throw new Error(
      `Cannot reach TEAP API at ${API_BASE}. Is the backend running? (${networkErr.message})`
    );
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      detail = body.detail || JSON.stringify(body);
    } catch (_) { /* ignore parse failure */ }
    throw new Error(detail);
  }

  if (response.status === 204) return null;
  return response.json();
}

const TEAPApi = {
  // Scenarios
  listScenarios: () => apiRequest('/scenarios/'),
  createScenario: (name, description) =>
    apiRequest('/scenarios/', {
      method: 'POST',
      body: JSON.stringify({ name, description: description || null })
    }),
  updateScenario: (id, updates) =>
    apiRequest(`/scenarios/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    }),
  deleteScenario: (id) =>
    apiRequest(`/scenarios/${id}`, { method: 'DELETE' }),

  // Evidence
  getScenarioEvidence: (scenarioId) =>
    apiRequest(`/evidence/scenario/${scenarioId}`),
  uploadScreenshot: (scenarioId, stepId, file) => {
    const formData = new FormData();
    formData.append('scenario_id', scenarioId);
    formData.append('step_id', stepId);
    formData.append('file', file);
    return apiRequest(
      `/evidence/upload-screenshot/?scenario_id=${encodeURIComponent(scenarioId)}&step_id=${stepId}`,
      { method: 'POST', body: formData }
    );
  },

  // Reports
  generateReport: (scenarioIds, format, includeOptions) =>
    apiRequest('/reports/generate', {
      method: 'POST',
      body: JSON.stringify({
        scenario_ids: scenarioIds,
        format,
        include_screenshots: includeOptions.screenshots,
        include_db_queries: includeOptions.dbQueries,
        include_payments: includeOptions.payments,
        include_api_calls: includeOptions.apiCalls,
        include_ai_summary: includeOptions.aiSummary,
        include_audit_trail: includeOptions.auditTrail
      })
    }),
  listReports: () => apiRequest('/reports/')
};

// ============================================================================
// SHARED STYLES
// ============================================================================

const styles = {
  page: { minHeight: '100vh', backgroundColor: '#f3f4f6', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header: { backgroundColor: 'white', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 20, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' },
  headerInner: { maxWidth: '1280px', margin: '0 auto', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: '24px', fontWeight: 'bold', color: '#111827', margin: 0 },
  subtitle: { fontSize: '12px', color: '#6b7280', margin: 0 },
  avatar: { width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#2563eb', color: 'white', border: 'none', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' },
  tabBar: { backgroundColor: 'white', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: '65px', zIndex: 10 },
  tabBarInner: { maxWidth: '1280px', margin: '0 auto', padding: '0 24px', display: 'flex', gap: '32px', overflowX: 'auto' },
  tabButton: (active) => ({
    padding: '16px 4px', margin: '0 8px', borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
    backgroundColor: 'transparent', border: 'none', cursor: 'pointer',
    fontSize: '14px', fontWeight: active ? '600' : '500', color: active ? '#2563eb' : '#6b7280',
    whiteSpace: 'nowrap'
  }),
  main: { maxWidth: '1280px', margin: '0 auto', padding: '32px 24px' },
  footer: { backgroundColor: 'white', borderTop: '1px solid #e5e7eb', marginTop: '48px' },
  footerInner: { maxWidth: '1280px', margin: '0 auto', padding: '24px', textAlign: 'center', fontSize: '12px', color: '#6b7280' },

  card: { backgroundColor: 'white', padding: '24px', borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' },
  grid4: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' },
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' },

  btnPrimary: { backgroundColor: '#2563eb', color: 'white', padding: '10px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '500' },
  btnSecondary: { backgroundColor: '#f3f4f6', color: '#374151', padding: '10px 16px', borderRadius: '6px', border: '1px solid #d1d5db', cursor: 'pointer', fontSize: '14px', fontWeight: '500' },
  btnDanger: { backgroundColor: '#fee2e2', color: '#991b1b', padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '500' },
  btnSmallPrimary: { backgroundColor: '#2563eb', color: 'white', padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '500' },

  input: { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' },
  label: { fontSize: '14px', fontWeight: '500', color: '#111827', display: 'block', marginBottom: '8px' },

  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  modalBox: { backgroundColor: 'white', borderRadius: '8px', padding: '24px', maxWidth: '500px', width: '90%', boxShadow: '0 20px 25px rgba(0, 0, 0, 0.15)', maxHeight: '85vh', overflowY: 'auto' },

  alertError: { backgroundColor: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b', padding: '12px 16px', borderRadius: '6px', margin: '0 0 16px 0', fontSize: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' },
  alertSuccess: { backgroundColor: '#dcfce7', border: '1px solid #bbf7d0', color: '#166534', padding: '12px 16px', borderRadius: '6px', margin: '0 0 16px 0', fontSize: '14px' },
  alertEmpty: { textAlign: 'center', padding: '48px 24px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb', color: '#6b7280' }
};

// ============================================================================
// REUSABLE COMPONENTS
// ============================================================================

function LoadingSpinner({ message = 'Loading…' }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: '#6b7280' }}>
      <div style={{ fontSize: '28px', marginBottom: '12px' }}>⏳</div>
      <p>{message}</p>
    </div>
  );
}

function ErrorBanner({ message, onDismiss, onRetry }) {
  return (
    <div style={styles.alertError}>
      <div>
        <strong>⚠️ Error:</strong> {message}
      </div>
      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        {onRetry && (
          <button onClick={onRetry} style={{ ...styles.btnSmallPrimary, backgroundColor: '#991b1b' }}>
            Retry
          </button>
        )}
        {onDismiss && (
          <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: 'bold' }}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

function SuccessBanner({ message }) {
  return <div style={styles.alertSuccess}>✓ {message}</div>;
}

// ============================================================================
// DASHBOARD TAB
// ============================================================================

function DashboardTab({ scenarios, reports, onNavigate }) {
  const completedCount = scenarios.filter((s) => s.status === 'completed').length;
  const totalEvidence = scenarios.reduce((sum, s) => sum + (s.evidence_count || 0), 0);

  return (
    <div>
      <div style={{ ...styles.grid4, marginBottom: '32px' }}>
        <div style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500', margin: 0 }}>Test Scenarios</p>
              <p style={{ fontSize: '32px', fontWeight: 'bold', marginTop: '8px', color: '#111827' }}>{scenarios.length}</p>
            </div>
            <span style={{ fontSize: '24px' }}>📊</span>
          </div>
          <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '12px' }}>{completedCount} completed</p>
        </div>

        <div style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500', margin: 0 }}>Evidence Collected</p>
              <p style={{ fontSize: '32px', fontWeight: 'bold', marginTop: '8px', color: '#111827' }}>{totalEvidence}</p>
            </div>
            <span style={{ fontSize: '24px' }}>📄</span>
          </div>
          <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '12px' }}>Across all scenarios</p>
        </div>

        <div style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500', margin: 0 }}>Avg Coverage</p>
              <p style={{ fontSize: '32px', fontWeight: 'bold', marginTop: '8px', color: '#111827' }}>
                {scenarios.length > 0 ? Math.round(scenarios.reduce((s, x) => s + (x.coverage || 0), 0) / scenarios.length) : 0}%
              </p>
            </div>
            <span style={{ fontSize: '24px' }}>⚡</span>
          </div>
          <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '12px' }}>Evidence coverage</p>
        </div>

        <div style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500', margin: 0 }}>Reports Generated</p>
              <p style={{ fontSize: '32px', fontWeight: 'bold', marginTop: '8px', color: '#111827' }}>{reports.length}</p>
            </div>
            <span style={{ fontSize: '24px' }}>⬇️</span>
          </div>
          <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '12px' }}>Total to date</p>
        </div>
      </div>

      <div style={{
        background: 'linear-gradient(135deg, #dbeafe 0%, #e0e7ff 100%)',
        borderRadius: '8px', border: '1px solid #93c5fd', padding: '24px'
      }}>
        <h3 style={{ fontWeight: '600', color: '#111827', marginBottom: '16px', marginTop: 0 }}>Quick Actions</h3>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button onClick={() => onNavigate('scenarios')} style={styles.btnPrimary}>➕ New Scenario</button>
          <button onClick={() => onNavigate('reports')} style={{ ...styles.btnSecondary, backgroundColor: 'white', color: '#2563eb', border: '1px solid #93c5fd' }}>
            ⬇️ Generate Report
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SCENARIOS TAB
// ============================================================================

function ScenariosTab({ scenarios, onCreate, onDelete, onExpand, expandedId, evidenceByScenario, evidenceLoading }) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState(null);

  const handleCreate = async () => {
    if (!name.trim()) {
      setFormError('Scenario name is required');
      return;
    }
    setCreating(true);
    setFormError(null);
    try {
      await onCreate(name.trim(), description.trim());
      setName('');
      setDescription('');
      setShowForm(false);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>Test Scenarios</h2>
        <button onClick={() => setShowForm(true)} style={styles.btnPrimary}>➕ New Scenario</button>
      </div>

      {showForm && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>Create New Scenario</h2>
              <button onClick={() => setShowForm(false)} style={{ fontSize: '20px', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>

            {formError && <ErrorBanner message={formError} onDismiss={() => setFormError(null)} />}

            <div style={{ marginBottom: '16px' }}>
              <label style={styles.label}>Scenario Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Payment Processing Flow"
                style={styles.input}
                autoFocus
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={styles.label}>Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this scenario test?"
                rows={3}
                style={{ ...styles.input, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={styles.btnSecondary} disabled={creating}>Cancel</button>
              <button onClick={handleCreate} style={styles.btnPrimary} disabled={creating}>
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {scenarios.length === 0 ? (
        <div style={styles.alertEmpty}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>📄</div>
          <p style={{ fontWeight: '500', margin: 0 }}>No scenarios yet</p>
          <p style={{ fontSize: '13px', marginTop: '4px' }}>Create your first test scenario to get started</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {scenarios.map((scenario) => (
            <div key={scenario.id} style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <div
                onClick={() => onExpand(scenario.id)}
                style={{ padding: '24px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '14px' }}>{expandedId === scenario.id ? '▼' : '▶'}</span>
                    <h3 style={{ fontSize: '17px', fontWeight: '600', color: '#111827', margin: 0 }}>{scenario.name}</h3>
                  </div>
                  {scenario.description && (
                    <p style={{ fontSize: '13px', color: '#6b7280', marginLeft: '26px', marginTop: '4px', marginBottom: 0 }}>
                      {scenario.description}
                    </p>
                  )}
                  <p style={{ fontSize: '12px', color: '#9ca3af', marginLeft: '26px', marginTop: '4px' }}>
                    Created: {scenario.created_at ? new Date(scenario.created_at).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
                  {scenario.status === 'completed' && <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: '600' }}>✓ Completed</span>}
                  {scenario.status === 'in_progress' && <span style={{ fontSize: '12px', color: '#2563eb', fontWeight: '600' }}>🕐 In Progress</span>}
                  {scenario.status === 'failed' && <span style={{ fontSize: '12px', color: '#dc2626', fontWeight: '600' }}>✕ Failed</span>}
                </div>
              </div>

              <div style={{ borderTop: '1px solid #e5e7eb', padding: '12px 24px', backgroundColor: '#f9fafb', display: 'flex', gap: '24px', fontSize: '12px', color: '#4b5563' }}>
                <span>📷 {scenario.evidence_count || 0} evidence items</span>
                <span>⚡ {scenario.coverage || 0}% coverage</span>
              </div>

              {expandedId === scenario.id && (
                <div style={{ borderTop: '1px solid #e5e7eb', padding: '24px', backgroundColor: '#f3f4f6' }}>
                  <h4 style={{ fontWeight: '600', color: '#111827', marginTop: 0, marginBottom: '16px' }}>Evidence</h4>

                  {evidenceLoading === scenario.id ? (
                    <LoadingSpinner message="Loading evidence…" />
                  ) : (
                    (() => {
                      const evidence = evidenceByScenario[scenario.id];
                      if (!evidence || Object.keys(evidence).length === 0) {
                        return <p style={{ fontSize: '13px', color: '#6b7280' }}>No evidence recorded for this scenario yet.</p>;
                      }
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {Object.entries(evidence).map(([type, items]) => (
                            <div key={type} style={{ backgroundColor: 'white', padding: '16px', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <strong style={{ fontSize: '13px', textTransform: 'capitalize' }}>{type.replace('_', ' ')}</strong>
                                <span style={{ fontSize: '12px', color: '#6b7280' }}>{items.length} item{items.length !== 1 ? 's' : ''}</span>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {items.map((item, idx) => (
                                  <div key={idx} style={{ fontSize: '12px', color: '#4b5563', display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Step {item.step_id ?? '—'}</span>
                                    <span>{item.timestamp ? new Date(item.timestamp).toLocaleString() : ''}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()
                  )}

                  <div style={{ display: 'flex', gap: '12px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(scenario.id); }}
                      style={styles.btnDanger}
                    >
                      🗑️ Delete Scenario
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// EVIDENCE TAB
// ============================================================================

function EvidenceTab({ scenarios, evidenceByScenario, onLoadEvidence, evidenceLoading }) {
  const [selectedScenarioId, setSelectedScenarioId] = useState(scenarios[0]?.id || '');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');

  useEffect(() => {
    if (!selectedScenarioId && scenarios.length > 0) {
      setSelectedScenarioId(scenarios[0].id);
    }
  }, [scenarios, selectedScenarioId]);

  useEffect(() => {
    if (selectedScenarioId && !evidenceByScenario[selectedScenarioId]) {
      onLoadEvidence(selectedScenarioId);
    }
  }, [selectedScenarioId, evidenceByScenario, onLoadEvidence]);

  const evidence = evidenceByScenario[selectedScenarioId] || {};

  const flatItems = Object.entries(evidence).flatMap(([type, items]) =>
    items.map((item) => ({ ...item, type }))
  );

  const filteredItems = flatItems.filter((item) => {
    const matchesType = filterType === 'all' || item.type === filterType;
    const matchesSearch = searchTerm === '' ||
      String(item.step_id).includes(searchTerm) ||
      item.type.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesType && matchesSearch;
  });

  const typeIcon = { screenshot: '📷', db_query: '🗄️', payment_event: '💳', api_call: '⚡', email_log: '📧', network_log: '📡' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>Evidence Library</h2>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <select value={selectedScenarioId} onChange={(e) => setSelectedScenarioId(e.target.value)} style={{ ...styles.input, width: 'auto' }}>
            {scenarios.length === 0 && <option value="">No scenarios</option>}
            {scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input
            type="text"
            placeholder="Search evidence…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ ...styles.input, width: 'auto' }}
          />
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ ...styles.input, width: 'auto' }}>
            <option value="all">All Types</option>
            <option value="screenshot">Screenshots</option>
            <option value="db_query">DB Queries</option>
            <option value="payment_event">Payments</option>
            <option value="api_call">API Calls</option>
          </select>
        </div>
      </div>

      {!selectedScenarioId ? (
        <div style={styles.alertEmpty}>Create a scenario first to see its evidence here.</div>
      ) : evidenceLoading === selectedScenarioId ? (
        <LoadingSpinner message="Loading evidence…" />
      ) : filteredItems.length === 0 ? (
        <div style={styles.alertEmpty}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>📷</div>
          <p style={{ fontWeight: '500', margin: 0 }}>No evidence found</p>
          <p style={{ fontSize: '13px', marginTop: '4px' }}>Try a different scenario, search term, or filter</p>
        </div>
      ) : (
        <div style={styles.grid3}>
          {filteredItems.map((item, idx) => (
            <div key={idx} style={{ backgroundColor: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <span style={{ fontSize: '20px' }}>{typeIcon[item.type] || '📄'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: '500', color: '#111827', margin: 0, textTransform: 'capitalize' }}>{item.type.replace('_', ' ')}</p>
                  <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Step {item.step_id ?? '—'}</p>
                  <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '8px' }}>
                    {item.timestamp ? new Date(item.timestamp).toLocaleString() : ''}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// REPORTS TAB
// ============================================================================

function ReportsTab({ scenarios, reports, onGenerate }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [format, setFormat] = useState('pdf');
  const [includeOptions, setIncludeOptions] = useState({
    screenshots: true, dbQueries: true, payments: true, apiCalls: true, aiSummary: true, auditTrail: false
  });
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const [lastReport, setLastReport] = useState(null);

  useEffect(() => {
    setSelectedIds(scenarios.map((s) => s.id));
  }, [scenarios]);

  const toggleScenario = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleOption = (key) => {
    setIncludeOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleGenerate = async () => {
    if (selectedIds.length === 0) {
      setGenError('Select at least one scenario');
      return;
    }
    setGenerating(true);
    setGenError(null);
    try {
      const report = await onGenerate(selectedIds, format, includeOptions);
      setLastReport(report);
    } catch (err) {
      setGenError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '24px' }}>Generate Test Report</h2>

      <div style={styles.card}>
        {genError && <ErrorBanner message={genError} onDismiss={() => setGenError(null)} />}

        <div style={{ marginBottom: '24px' }}>
          <label style={{ ...styles.label, fontWeight: '600', marginBottom: '12px' }}>Select Scenarios</label>
          {scenarios.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#6b7280' }}>No scenarios available — create one first.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {scenarios.map((s) => (
                <label key={s.id} style={{ display: 'flex', alignItems: 'center', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedIds.includes(s.id)} onChange={() => toggleScenario(s.id)} style={{ marginRight: '12px' }} />
                  <span style={{ flex: 1, fontSize: '14px', fontWeight: '500' }}>{s.name}</span>
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>{s.evidence_count || 0} items</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label style={{ ...styles.label, fontWeight: '600', marginBottom: '12px' }}>Report Format</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
            {[
              { value: 'pdf', icon: '📄', label: 'PDF', desc: 'Download' },
              { value: 'html', icon: '🌐', label: 'HTML', desc: 'Interactive' },
              { value: 'json', icon: '{ }', label: 'JSON', desc: 'Raw data' }
            ].map((fmt) => (
              <label key={fmt.value} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px',
                border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer',
                backgroundColor: format === fmt.value ? '#dbeafe' : 'white'
              }}>
                <input type="radio" name="format" checked={format === fmt.value} onChange={() => setFormat(fmt.value)} style={{ marginBottom: '8px' }} />
                <span style={{ fontSize: '16px', marginBottom: '4px' }}>{fmt.icon}</span>
                <span style={{ fontSize: '13px', fontWeight: '500' }}>{fmt.label}</span>
                <span style={{ fontSize: '11px', color: '#6b7280' }}>{fmt.desc}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label style={{ ...styles.label, fontWeight: '600', marginBottom: '12px' }}>Include in Report</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              { key: 'screenshots', label: 'Screenshots' },
              { key: 'dbQueries', label: 'Database queries & results' },
              { key: 'payments', label: 'Payment transaction details' },
              { key: 'apiCalls', label: 'API calls & responses' },
              { key: 'aiSummary', label: 'AI-generated summary' },
              { key: 'auditTrail', label: 'Audit trail & timestamps' }
            ].map((opt) => (
              <label key={opt.key} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={includeOptions[opt.key]} onChange={() => toggleOption(opt.key)} style={{ marginRight: '8px' }} />
                <span style={{ fontSize: '14px', color: '#374151' }}>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <button onClick={handleGenerate} style={styles.btnPrimary} disabled={generating}>
          {generating ? 'Generating…' : '⬇️ Generate Report'}
        </button>
      </div>

      {lastReport && (
        <div style={{ ...styles.card, marginTop: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: 0, marginBottom: '16px' }}>Report Generated</h3>
          <div style={{ backgroundColor: '#f3f4f6', padding: '20px', borderRadius: '6px', fontSize: '14px', color: '#374151', lineHeight: 1.6 }}>
            <p style={{ margin: 0 }}><strong>Report ID:</strong> {lastReport.id}</p>
            <p style={{ margin: '4px 0' }}><strong>Format:</strong> {String(lastReport.format).toUpperCase()}</p>
            <p style={{ margin: '4px 0' }}><strong>Evidence items:</strong> {lastReport.evidence_count}</p>
            <p style={{ margin: '4px 0' }}>
              <strong>Generated:</strong> {lastReport.generated_at ? new Date(lastReport.generated_at).toLocaleString() : ''}
            </p>
            {lastReport.summary && <p style={{ margin: '12px 0 0 0' }}><strong>Summary:</strong> {lastReport.summary}</p>}
          </div>
        </div>
      )}

      {reports.length > 0 && (
        <div style={{ ...styles.card, marginTop: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginTop: 0, marginBottom: '16px' }}>Report History</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {reports.map((r) => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '10px', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
                <span>{String(r.format).toUpperCase()} · {r.evidence_count} items</span>
                <span style={{ color: '#6b7280' }}>{r.generated_at ? new Date(r.generated_at).toLocaleString() : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const [scenarios, setScenarios] = useState([]);
  const [reports, setReports] = useState([]);
  const [evidenceByScenario, setEvidenceByScenario] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [evidenceLoading, setEvidenceLoading] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  const flashSuccess = (msg) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [scenarioList, reportList] = await Promise.all([
        TEAPApi.listScenarios(),
        TEAPApi.listReports().catch(() => [])
      ]);
      setScenarios(Array.isArray(scenarioList) ? scenarioList : []);
      setReports(Array.isArray(reportList) ? reportList : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleCreateScenario = async (name, description) => {
    const created = await TEAPApi.createScenario(name, description);
    setScenarios((prev) => [created, ...prev]);
    flashSuccess('Scenario created successfully');
    return created;
  };

  const handleDeleteScenario = async (id) => {
    try {
      await TEAPApi.deleteScenario(id);
      setScenarios((prev) => prev.filter((s) => s.id !== id));
      setEvidenceByScenario((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (expandedId === id) setExpandedId(null);
      flashSuccess('Scenario deleted');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLoadEvidence = useCallback(async (scenarioId) => {
    setEvidenceLoading(scenarioId);
    try {
      const data = await TEAPApi.getScenarioEvidence(scenarioId);
      setEvidenceByScenario((prev) => ({ ...prev, [scenarioId]: data.evidence || {} }));
    } catch (err) {
      setError(err.message);
    } finally {
      setEvidenceLoading(null);
    }
  }, []);

  const handleExpandScenario = (id) => {
    const next = expandedId === id ? null : id;
    setExpandedId(next);
    if (next && !evidenceByScenario[next]) {
      handleLoadEvidence(next);
    }
  };

  const handleGenerateReport = async (scenarioIds, format, includeOptions) => {
    const report = await TEAPApi.generateReport(scenarioIds, format, includeOptions);
    setReports((prev) => [report, ...prev]);
    flashSuccess('Report generated successfully');
    return report;
  };

  const tabs = [
    { id: 'dashboard', label: '📊 Dashboard' },
    { id: 'scenarios', label: '✓ Scenarios' },
    { id: 'evidence', label: '📷 Evidence' },
    { id: 'reports', label: '📄 Reports' }
  ];

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div>
            <h1 style={styles.title}>TEAP</h1>
            <p style={styles.subtitle}>Test Evidence Automation Platform</p>
          </div>
          <button style={styles.avatar} title={API_BASE}>ST</button>
        </div>
      </header>

      <div style={styles.tabBar}>
        <div style={styles.tabBarInner}>
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={styles.tabButton(activeTab === tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main style={styles.main}>
        {successMessage && <SuccessBanner message={successMessage} />}
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={loadAll} />}

        {loading ? (
          <LoadingSpinner message="Connecting to TEAP API…" />
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardTab scenarios={scenarios} reports={reports} onNavigate={setActiveTab} />
            )}
            {activeTab === 'scenarios' && (
              <ScenariosTab
                scenarios={scenarios}
                onCreate={handleCreateScenario}
                onDelete={handleDeleteScenario}
                onExpand={handleExpandScenario}
                expandedId={expandedId}
                evidenceByScenario={evidenceByScenario}
                evidenceLoading={evidenceLoading}
              />
            )}
            {activeTab === 'evidence' && (
              <EvidenceTab
                scenarios={scenarios}
                evidenceByScenario={evidenceByScenario}
                onLoadEvidence={handleLoadEvidence}
                evidenceLoading={evidenceLoading}
              />
            )}
            {activeTab === 'reports' && (
              <ReportsTab scenarios={scenarios} reports={reports} onGenerate={handleGenerateReport} />
            )}
          </>
        )}
      </main>

      <footer style={styles.footer}>
        <div style={styles.footerInner}>
          <p style={{ margin: 0 }}>TEAP v1.0 — Automate test evidence collection and reporting</p>
          <p style={{ marginTop: '8px', fontSize: '11px', color: '#9ca3af' }}>Connected to: {API_BASE}</p>
        </div>
      </footer>
    </div>
  );
}