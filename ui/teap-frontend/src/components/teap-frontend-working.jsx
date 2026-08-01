import React, { useState } from 'react';

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

export default function TEAP() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [scenarios, setScenarios] = useState([
    {
      id: '1',
      name: 'User Registration & Email Verification',
      status: 'completed',
      created_at: '2026-06-25',
      evidence_count: 12,
      coverage: 95,
      description: 'Test user signup and email verification flow'
    },
    {
      id: '2',
      name: 'Payment Processing (Stripe Integration)',
      status: 'completed',
      created_at: '2026-06-24',
      evidence_count: 18,
      coverage: 98,
      description: 'End-to-end payment processing flow'
    },
    {
      id: '3',
      name: 'User Logout & Session Cleanup',
      status: 'in_progress',
      created_at: '2026-06-26',
      evidence_count: 7,
      coverage: 60,
      description: 'Session management and cleanup'
    }
  ]);
  const [expandedScenario, setExpandedScenario] = useState(null);
  const [showNewScenarioForm, setShowNewScenarioForm] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState('');
  const [showReportPreview, setShowReportPreview] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const handleAddScenario = () => {
    if (!newScenarioName.trim()) return;
    
    const newScenario = {
      id: String(scenarios.length + 1),
      name: newScenarioName,
      status: 'in_progress',
      created_at: new Date().toISOString().split('T')[0],
      evidence_count: 0,
      coverage: 0,
      description: ''
    };
    
    setScenarios([...scenarios, newScenario]);
    setNewScenarioName('');
    setShowNewScenarioForm(false);
    setSuccessMessage('✓ Scenario created successfully!');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const handleDeleteScenario = (id) => {
    setScenarios(scenarios.filter(s => s.id !== id));
    setSuccessMessage('✓ Scenario deleted');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const handleGenerateReport = () => {
    setShowReportPreview(true);
    setSuccessMessage('✓ Report generated successfully!');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  // ========================================================================
  // DASHBOARD TAB RENDERER
  // ========================================================================

  const renderDashboardTab = () => {
    const completedCount = scenarios.filter(s => s.status === 'completed').length;
    const totalEvidence = scenarios.reduce((sum, s) => sum + s.evidence_count, 0);

    return (
      <div className="space-y-8">
        {/* Metrics Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '32px'
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <p style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500' }}>Test Scenarios</p>
                <p style={{ fontSize: '32px', fontWeight: 'bold', marginTop: '8px', color: '#111827' }}>
                  {scenarios.length}
                </p>
              </div>
              <span style={{ fontSize: '24px' }}>📊</span>
            </div>
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '12px' }}>
              {completedCount} completed
            </p>
          </div>

          <div style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <p style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500' }}>Evidence Collected</p>
                <p style={{ fontSize: '32px', fontWeight: 'bold', marginTop: '8px', color: '#111827' }}>
                  {totalEvidence}
                </p>
              </div>
              <span style={{ fontSize: '24px' }}>📄</span>
            </div>
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '12px' }}>Across all scenarios</p>
          </div>

          <div style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <p style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500' }}>Automation Rate</p>
                <p style={{ fontSize: '32px', fontWeight: 'bold', marginTop: '8px', color: '#111827' }}>92%</p>
              </div>
              <span style={{ fontSize: '24px' }}>⚡</span>
            </div>
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '12px' }}>Manual effort saved</p>
          </div>

          <div style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <p style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500' }}>Reports Generated</p>
                <p style={{ fontSize: '32px', fontWeight: 'bold', marginTop: '8px', color: '#111827' }}>14</p>
              </div>
              <span style={{ fontSize: '24px' }}>⬇️</span>
            </div>
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '12px' }}>This month</p>
          </div>
        </div>

        {/* Evidence Summary */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          padding: '24px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '24px' }}>Evidence Collection Summary</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '16px'
          }}>
            {[
              { icon: '📷', label: 'Screenshots', count: 34 },
              { icon: '🗄️', label: 'DB Queries', count: 28 },
              { icon: '💳', label: 'Payments', count: 12 },
              { icon: '⚡', label: 'API Calls', count: 18 }
            ].map((item) => (
              <div key={item.label} style={{
                backgroundColor: '#f3f4f6',
                padding: '16px',
                borderRadius: '8px',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{ marginBottom: '12px', fontSize: '20px' }}>{item.icon}</div>
                <p style={{ fontSize: '14px', fontWeight: '500', color: '#111827' }}>{item.label}</p>
                <p style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '8px', color: '#111827' }}>
                  {item.count}
                </p>
                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
                  collected automatically
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{
          background: 'linear-gradient(135deg, #dbeafe 0%, #e0e7ff 100%)',
          borderRadius: '8px',
          border: '1px solid #93c5fd',
          padding: '24px'
        }}>
          <h3 style={{ fontWeight: '600', color: '#111827', marginBottom: '16px' }}>Quick Actions</h3>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowNewScenarioForm(true)}
              style={{
                backgroundColor: '#2563eb',
                color: 'white',
                padding: '10px 16px',
                borderRadius: '6px',
                border: 'none',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              ➕ New Scenario
            </button>
            <button
              onClick={() => setActiveTab('reports')}
              style={{
                backgroundColor: 'white',
                color: '#2563eb',
                padding: '10px 16px',
                borderRadius: '6px',
                border: '1px solid #dbeafe',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              ⬇️ Generate Report
            </button>
            <button
              style={{
                backgroundColor: 'white',
                color: '#4b5563',
                padding: '10px 16px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              📊 View Analytics
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ========================================================================
  // SCENARIOS TAB RENDERER
  // ========================================================================

  const renderScenariosTab = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600' }}>Test Scenarios</h2>
        <button
          onClick={() => setShowNewScenarioForm(true)}
          style={{
            backgroundColor: '#2563eb',
            color: 'white',
            padding: '8px 16px',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          ➕ New Scenario
        </button>
      </div>

      {/* New Scenario Modal */}
      {showNewScenarioForm && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 20px 25px rgba(0, 0, 0, 0.15)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600' }}>Create New Scenario</h2>
              <button
                onClick={() => setShowNewScenarioForm(false)}
                style={{ fontSize: '24px', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '14px', fontWeight: '500', color: '#111827', display: 'block', marginBottom: '8px' }}>
                Scenario Name
              </label>
              <input
                type="text"
                value={newScenarioName}
                onChange={(e) => setNewScenarioName(e.target.value)}
                placeholder="e.g., Payment Processing Flow"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowNewScenarioForm(false)}
                style={{
                  backgroundColor: '#e5e7eb',
                  color: '#111827',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddScenario}
                style={{
                  backgroundColor: '#2563eb',
                  color: 'white',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scenarios List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {scenarios.map((scenario) => (
          <div key={scenario.id} style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            overflow: 'hidden',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }}>
            {/* Header */}
            <div
              onClick={() => setExpandedScenario(expandedScenario === scenario.id ? null : scenario.id)}
              style={{
                padding: '24px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'start'
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '16px' }}>
                    {expandedScenario === scenario.id ? '▼' : '▶'}
                  </span>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                    {scenario.name}
                  </h3>
                </div>
                <p style={{ fontSize: '12px', color: '#6b7280', marginLeft: '28px', marginTop: '4px' }}>
                  Created: {scenario.created_at}
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                {scenario.status === 'completed' && (
                  <div style={{ fontSize: '12px', color: '#16a34a', fontWeight: '500' }}>
                    ✓ Completed
                  </div>
                )}
                {scenario.status === 'in_progress' && (
                  <div style={{ fontSize: '12px', color: '#2563eb', fontWeight: '500' }}>
                    🕐 In Progress
                  </div>
                )}
              </div>
            </div>

            {/* Summary */}
            <div style={{ borderTop: '1px solid #e5e7eb', padding: '16px 24px', backgroundColor: '#f9fafb' }}>
              <div style={{ display: 'flex', gap: '24px', fontSize: '12px' }}>
                <span>📷 {scenario.evidence_count} evidence items</span>
                <span>⚡ {scenario.coverage}% coverage</span>
              </div>
            </div>

            {/* Expanded Content */}
            {expandedScenario === scenario.id && (
              <div style={{ borderTop: '1px solid #e5e7eb', padding: '24px', backgroundColor: '#f3f4f6' }}>
                <h4 style={{ fontWeight: '600', color: '#111827', marginBottom: '16px' }}>Scenario Details</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {[
                    { num: 1, title: 'Navigate to page', evidence: ['📷 screenshot', '⏱️ timestamp'] },
                    { num: 2, title: 'Fill form', evidence: ['📷 screenshot', '📝 form data'] },
                    { num: 3, title: 'Submit', evidence: ['📷 screenshot', '📡 network log'] },
                    { num: 4, title: 'Verify in DB', evidence: ['🗄️ db query', '📷 screenshot'] }
                  ].map((step) => (
                    <div key={step.num} style={{
                      backgroundColor: 'white',
                      padding: '16px',
                      borderRadius: '6px',
                      border: '1px solid #e5e7eb',
                      display: 'flex',
                      gap: '12px'
                    }}>
                      <div style={{
                        backgroundColor: '#dbeafe',
                        color: '#1e40af',
                        borderRadius: '50%',
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: '600',
                        flexShrink: 0
                      }}>
                        {step.num}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ color: '#111827', fontWeight: '500', marginBottom: '8px' }}>
                          {step.title}
                        </p>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {step.evidence.map((ev) => (
                            <span key={ev} style={{
                              fontSize: '12px',
                              backgroundColor: '#dbeafe',
                              color: '#1e40af',
                              padding: '4px 8px',
                              borderRadius: '4px'
                            }}>
                              {ev}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
                  <button
                    style={{
                      backgroundColor: '#2563eb',
                      color: 'white',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '500'
                    }}
                  >
                    👁️ View Evidence
                  </button>
                  <button
                    onClick={() => handleDeleteScenario(scenario.id)}
                    style={{
                      backgroundColor: '#fee2e2',
                      color: '#991b1b',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '500'
                    }}
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  // ========================================================================
  // EVIDENCE TAB RENDERER
  // ========================================================================

  const renderEvidenceTab = () => (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '24px' }}>Evidence Library</h2>
      
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '16px'
      }}>
        {[
          { icon: '📷', type: 'Screenshot', desc: 'Payment form filled', time: '2 hrs ago' },
          { icon: '🗄️', type: 'DB Query', desc: 'Transaction record', time: '2 hrs ago' },
          { icon: '⚡', type: 'API Call', desc: 'Stripe webhook', time: '2 hrs ago' },
          { icon: '📷', type: 'Screenshot', desc: 'Order confirmation', time: '1 hr ago' },
          { icon: '💳', type: 'Payment', desc: 'Transaction ID: tx_123', time: '1 hr ago' },
          { icon: '📧', type: 'Email Log', desc: 'Receipt sent to user', time: '58 min ago' }
        ].map((item, idx) => (
          <div key={idx} style={{
            backgroundColor: 'white',
            padding: '16px',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            cursor: 'pointer',
            transition: 'box-shadow 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'}
          onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
          >
            <div style={{ display: 'flex', gap: '12px' }}>
              <span style={{ fontSize: '20px' }}>{item.icon}</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: '500', color: '#111827' }}>{item.type}</p>
                <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>{item.desc}</p>
                <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '8px' }}>{item.time}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ========================================================================
  // REPORTS TAB RENDERER
  // ========================================================================

  const renderReportsTab = () => (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '24px' }}>Generate Test Report</h2>

      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        padding: '24px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
      }}>
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827', display: 'block', marginBottom: '12px' }}>
            Select Scenarios
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {scenarios.map((s) => (
              <label key={s.id} style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                cursor: 'pointer'
              }}>
                <input type="checkbox" defaultChecked style={{ marginRight: '12px', cursor: 'pointer' }} />
                <span style={{ flex: 1, fontSize: '14px', fontWeight: '500' }}>{s.name}</span>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>{s.evidence_count} items</span>
              </label>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827', display: 'block', marginBottom: '12px' }}>
            Report Format
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: '12px'
          }}>
            {[
              { format: 'PDF', icon: '📄', desc: 'Download' },
              { format: 'HTML', icon: '🌐', desc: 'Interactive' },
              { format: 'JSON', icon: '{ }', desc: 'Raw data' }
            ].map((fmt, idx) => (
              <label key={fmt.format} style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '16px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                cursor: 'pointer',
                backgroundColor: idx === 0 ? '#dbeafe' : 'white'
              }}>
                <input type="radio" name="format" defaultChecked={idx === 0} style={{ marginBottom: '8px' }} />
                <span style={{ fontSize: '16px', marginBottom: '4px' }}>{fmt.icon}</span>
                <span style={{ fontSize: '13px', fontWeight: '500', color: '#111827' }}>{fmt.format}</span>
                <span style={{ fontSize: '11px', color: '#6b7280' }}>{fmt.desc}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827', display: 'block', marginBottom: '12px' }}>
            Include in Report
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              { label: 'Screenshots', default: true },
              { label: 'Database queries & results', default: true },
              { label: 'Payment transaction details', default: true },
              { label: 'API calls & responses', default: true },
              { label: 'AI-generated summary', default: true }
            ].map((opt) => (
              <label key={opt.label} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" defaultChecked={opt.default} style={{ marginRight: '8px' }} />
                <span style={{ fontSize: '14px', color: '#374151' }}>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handleGenerateReport}
            style={{
              backgroundColor: '#2563eb',
              color: 'white',
              padding: '10px 16px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            ⬇️ Generate Report
          </button>
          <button
            onClick={() => setShowReportPreview(!showReportPreview)}
            style={{
              backgroundColor: '#f3f4f6',
              color: '#374151',
              padding: '10px 16px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            👁️ Preview
          </button>
        </div>
      </div>

      {/* Report Preview */}
      {showReportPreview && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          padding: '24px',
          marginTop: '24px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Report Preview</h3>
          <div style={{
            backgroundColor: '#f3f4f6',
            padding: '24px',
            borderRadius: '6px',
            border: '1px solid #e5e7eb',
            fontSize: '14px',
            color: '#4b5563',
            lineHeight: '1.6'
          }}>
            <p><strong>📋 Test Execution Report</strong></p>
            <p>Generated: {new Date().toLocaleDateString()} | Scenarios: {scenarios.length}</p>
            <div style={{ borderTop: '1px solid #d1d5db', paddingTop: '16px', marginTop: '16px' }}>
              <p><strong>✅ Scenarios Included</strong></p>
              <ul style={{ listStyle: 'none', padding: 0, marginTop: '8px' }}>
                {scenarios.map((s) => (
                  <li key={s.id} style={{ color: '#374151', fontSize: '13px', marginBottom: '4px' }}>
                    • {s.name} ({s.evidence_count} items)
                  </li>
                ))}
              </ul>
            </div>
            <p style={{ marginTop: '16px', fontSize: '12px', color: '#6b7280' }}>
              → Click "Generate Report" to create and download your report
            </p>
          </div>
        </div>
      )}
    </div>
  );

  // ========================================================================
  // MAIN RENDER
  // ========================================================================

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6' }}>
      {/* Header */}
      <header style={{
        backgroundColor: 'white',
        borderBottom: '1px solid #e5e7eb',
        position: 'sticky',
        top: 0,
        zIndex: 20,
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
      }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '16px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827' }}>TEAP</h1>
              <p style={{ fontSize: '12px', color: '#6b7280' }}>Test Evidence Automation Platform</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                fontWeight: 'bold',
                fontSize: '14px',
                cursor: 'pointer'
              }}>
                ST
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div style={{
        backgroundColor: 'white',
        borderBottom: '1px solid #e5e7eb',
        position: 'sticky',
        top: '80px',
        zIndex: 10
      }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'flex', gap: '32px' }}>
            {[
              { id: 'dashboard', label: '📊 Dashboard' },
              { id: 'scenarios', label: '✓ Scenarios' },
              { id: 'evidence', label: '📷 Evidence' },
              { id: 'reports', label: '📄 Reports' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '16px 12px',
                  backgroundColor: 'transparent',
                  borderTop: 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  borderBottom: activeTab === tab.id ? '2px solid #2563eb' : '2px solid transparent',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: activeTab === tab.id ? '600' : '500',
                  color: activeTab === tab.id ? '#2563eb' : '#6b7280',
                  transition: 'all 0.2s'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div style={{
          backgroundColor: '#dcfce7',
          border: '1px solid #bbf7d0',
          color: '#166534',
          padding: '12px 16px',
          borderRadius: '6px',
          margin: '16px 24px',
          fontSize: '14px'
        }}>
          {successMessage}
        </div>
      )}

      {/* Content */}
      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 24px' }}>
        {activeTab === 'dashboard' && renderDashboardTab()}
        {activeTab === 'scenarios' && renderScenariosTab()}
        {activeTab === 'evidence' && renderEvidenceTab()}
        {activeTab === 'reports' && renderReportsTab()}
      </main>

      {/* Footer */}
      <footer style={{
        backgroundColor: 'white',
        borderTop: '1px solid #e5e7eb',
        marginTop: '48px'
      }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px', textAlign: 'center', fontSize: '12px', color: '#6b7280' }}>
          <p>TEAP v1.0 — Automate test evidence collection and reporting</p>
          <p style={{ marginTop: '8px', fontSize: '11px', color: '#9ca3af' }}>© 2026 Your Company. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}