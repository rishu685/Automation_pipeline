import React, { useState, useEffect, useRef } from "react";
import { 
  Play, 
  Terminal, 
  CheckCircle, 
  AlertCircle, 
  Database, 
  Cpu, 
  BookOpen, 
  Key, 
  History, 
  Mail, 
  MessageSquare,
  Lock,
  ChevronDown,
  ChevronUp
} from "lucide-react";

export default function App() {
  // Config status from system .env
  const [systemConfig, setSystemConfig] = useState({
    gemini: false,
    notionToken: false,
    notionDb: false,
    slack: false,
    resend: false
  });

  // Custom key override state
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [notionToken, setNotionToken] = useState("");
  const [notionDatabaseId, setNotionDatabaseId] = useState("");
  const [slackWebhookUrl, setSlackWebhookUrl] = useState("");
  const [resendApiKey, setResendApiKey] = useState("");
  const [senderEmail, setSenderEmail] = useState("");

  // App operational state
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMockLoading, setIsMockLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState("dash");
  const [expandedLogId, setExpandedLogId] = useState(null);

  const logsEndRef = useRef(null);

  // Fetch initial config status and Mongo logs history
  useEffect(() => {
    fetchConfig();
    fetchHistory();
  }, []);

  // Auto-scroll logs terminal
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/config");
      if (res.ok) {
        const data = await res.json();
        setSystemConfig(data);
      }
    } catch (e) {
      console.error("Failed to load backend config health status:", e);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/logs");
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (e) {
      console.error("Failed to load sync history:", e);
    }
  };

  // Derive active status of credentials (override vs default)
  const credentials = {
    gemini: {
      name: "Gemini 2.5 Flash",
      active: !!geminiApiKey || systemConfig.gemini,
      isOverridden: !!geminiApiKey
    },
    notionToken: {
      name: "Notion Token",
      active: !!notionToken || systemConfig.notionToken,
      isOverridden: !!notionToken
    },
    notionDb: {
      name: "Notion database",
      active: !!notionDatabaseId || systemConfig.notionDb,
      isOverridden: !!notionDatabaseId
    },
    slack: {
      name: "Slack Webhook",
      active: !!slackWebhookUrl || systemConfig.slack,
      isOverridden: !!slackWebhookUrl
    },
    resend: {
      name: "Resend API Key",
      active: !!resendApiKey || systemConfig.resend,
      isOverridden: !!resendApiKey
    }
  };

  const allConfigured = Object.values(credentials).every(c => c.active);

  const runOnboarding = async () => {
    if (isLoading || isMockLoading) return;
    setIsLoading(true);
    setLogs(["🔍 Initializing onboarding scan..."]);
    
    try {
      const response = await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geminiApiKey,
          notionToken,
          notionDatabaseId,
          slackWebhookUrl,
          resendApiKey,
          senderEmail
        })
      });

      const data = await response.json();
      if (data.logs) {
        setLogs(data.logs);
      } else {
        setLogs(prev => [...prev, data.error ? `❌ Error: ${data.error}` : "❌ Connection failure."]);
      }
      
      fetchHistory(); // Refresh Mongo logs
    } catch (e) {
      setLogs(prev => [...prev, `❌ Network request failed: ${e.message}`]);
    } finally {
      setIsLoading(false);
    }
  };

  const runMockSimulation = async () => {
    if (isLoading || isMockLoading) return;
    setIsMockLoading(true);
    setLogs(["🏃 Starting mock sandbox simulation..."]);

    try {
      const response = await fetch("/api/mock-onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slackWebhookUrl }) // Deliver mock alert if custom hook is provided
      });

      const data = await response.json();
      if (data.logs) {
        setLogs(data.logs);
      }
      
      fetchHistory(); // Refresh Mongo logs
    } catch (e) {
      setLogs(prev => [...prev, `❌ Simulation failed: ${e.message}`]);
    } finally {
      setIsMockLoading(false);
    }
  };

  const toggleLogExpand = (id) => {
    setExpandedLogId(expandedLogId === id ? null : id);
  };

  return (
    <div className="app-container">
      {/* Sidebar - Credentials Overrides */}
      <aside className="sidebar">
        <div className="brand">
          <Database className="brand-icon" />
          <h2>Onboarding Bot</h2>
        </div>

        <div className="config-section">
          <h3>🔑 Custom Overrides</h3>
          <p className="config-tip">
            Testing on a public deployment? Paste your keys below. They are saved temporarily in your current session.
          </p>

          <div className="inputs-group">
            <div className="input-field">
              <label>Gemini API Key</label>
              <input 
                type="password" 
                placeholder={systemConfig.gemini ? "• • • • • • (System Active)" : "Paste Gemini API Key"}
                value={geminiApiKey} 
                onChange={(e) => setGeminiApiKey(e.target.value)}
              />
            </div>

            <div className="input-field">
              <label>Notion Token</label>
              <input 
                type="password" 
                placeholder={systemConfig.notionToken ? "• • • • • • (System Active)" : "Paste Notion Token (ntn_)"}
                value={notionToken} 
                onChange={(e) => setNotionToken(e.target.value)}
              />
            </div>

            <div className="input-field">
              <label>Notion Database ID</label>
              <input 
                type="text" 
                placeholder={systemConfig.notionDb ? "Active (System Default)" : "Paste Database or Page ID"}
                value={notionDatabaseId} 
                onChange={(e) => setNotionDatabaseId(e.target.value)}
              />
            </div>

            <div className="input-field">
              <label>Slack Webhook URL</label>
              <input 
                type="text" 
                placeholder={systemConfig.slack ? "Active (System Default)" : "Paste Webhook URL"}
                value={slackWebhookUrl} 
                onChange={(e) => setSlackWebhookUrl(e.target.value)}
              />
            </div>

            <div className="input-field">
              <label>Resend API Key</label>
              <input 
                type="password" 
                placeholder={systemConfig.resend ? "• • • • • • (System Active)" : "Paste Resend API Key (re_)"}
                value={resendApiKey} 
                onChange={(e) => setResendApiKey(e.target.value)}
              />
            </div>

            <div className="input-field">
              <label>Sender Email (Optional)</label>
              <input 
                type="text" 
                placeholder="onboarding@resend.dev"
                value={senderEmail} 
                onChange={(e) => setSenderEmail(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="health-check">
          <h3>🏥 Integration Health Check</h3>
          <div className="health-list">
            {Object.entries(credentials).map(([key, details]) => (
              <div key={key} className="health-item">
                {details.active ? (
                  <span className="badge success">🟢 {details.name} active</span>
                ) : (
                  <span className="badge error">🔴 {details.name} missing</span>
                )}
                {details.isOverridden && <span className="override-indicator">Override</span>}
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Layout Area */}
      <main className="main-content">
        <header className="main-header">
          <div className="title-area">
            <h1>🚀 AI Client Onboarding Dashboard</h1>
            <p className="subtitle">MERN Stack Automation Pipeline (MongoDB, Express, React, Node.js)</p>
          </div>
          
          <nav className="tabs">
            <button 
              className={activeTab === "dash" ? "tab active" : "tab"} 
              onClick={() => setActiveTab("dash")}
            >
              <Cpu size={16} /> Console & logs
            </button>
            <button 
              className={activeTab === "guide" ? "tab active" : "tab"} 
              onClick={() => setActiveTab("guide")}
            >
              <BookOpen size={16} /> Setup Instructions
            </button>
          </nav>
        </header>

        {activeTab === "dash" ? (
          <div className="dashboard-view">
            {/* Control & Log Terminal */}
            <div className="operations-grid">
              {/* Controls */}
              <div className="control-panel card">
                <h2>Control Center</h2>
                <p className="card-description">Scan database for pending rows or execute a dry run.</p>

                <div className="action-buttons">
                  <button 
                    className="btn primary" 
                    onClick={runOnboarding}
                    disabled={!allConfigured || isLoading || isMockLoading}
                  >
                    <Play size={16} /> 
                    {isLoading ? "Scanning..." : "Scan & Onboard Clients"}
                  </button>

                  {!allConfigured && (
                    <div className="warning-box">
                      <AlertCircle size={16} />
                      <span>Complete the credentials configuration to enable live scans.</span>
                    </div>
                  )}

                  <hr className="divider" />

                  <div className="sandbox-card">
                    <h3>🧪 Sandbox Dry Run</h3>
                    <p className="sandbox-description">
                      Test the pipeline visualizer, logs, and database history without connecting your own Notion or Resend keys.
                    </p>
                    <button 
                      className="btn secondary" 
                      onClick={runMockSimulation}
                      disabled={isLoading || isMockLoading}
                    >
                      {isMockLoading ? "Simulating..." : "Run Mock Simulation"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Logs Monitor Terminal */}
              <div className="terminal-monitor card">
                <div className="terminal-header">
                  <Terminal size={16} />
                  <span>Execution Logs Monitor</span>
                </div>
                <div className="terminal-body">
                  {logs.length === 0 ? (
                    <div className="terminal-placeholder">
                      👉 Choose an action from the control panel to begin.
                    </div>
                  ) : (
                    logs.map((log, index) => {
                      let typeClass = "";
                      if (log.startsWith("❌")) typeClass = "error-log";
                      else if (log.startsWith("✅")) typeClass = "success-log";
                      else if (log.startsWith("📌") || log.startsWith("🧠")) typeClass = "info-log";
                      
                      return (
                        <div key={index} className={`log-line ${typeClass}`}>
                          {log}
                        </div>
                      );
                    })
                  )}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </div>

            {/* Sync Logs Table (MongoDB persistence) */}
            <div className="history-section card">
              <div className="history-header">
                <History size={18} />
                <h2>MongoDB Sync History</h2>
              </div>
              <p className="section-description">
                Persistent database records of previous client synchronization operations. Click rows to inspect logs.
              </p>

              {history.length === 0 ? (
                <div className="empty-history">
                  No sync logs found in your MongoDB collection. Run a mock or live scan to record your first log!
                </div>
              ) : (
                <div className="history-list">
                  {history.map((log) => (
                    <div key={log._id} className="history-item-container">
                      <div 
                        className={`history-row ${expandedLogId === log._id ? "active-row" : ""}`}
                        onClick={() => toggleLogExpand(log._id)}
                      >
                        <div className="row-cell client-info-cell">
                          <span className="client-name">{log.clientName}</span>
                          <span className="client-company">{log.clientCompany}</span>
                        </div>
                        <div className="row-cell email-cell">
                          <span>{log.clientEmail}</span>
                        </div>
                        <div className="row-cell badge-cell">
                          <span className={`status-badge ${log.status}`}>
                            {log.status}
                          </span>
                        </div>
                        <div className="row-cell channels-cell">
                          <div className="channel-icon-group">
                            <MessageSquare size={14} className={log.slackSent ? "active-channel" : "inactive-channel"} />
                            <span className={log.slackSent ? "active-channel" : "inactive-channel"}>Slack</span>
                          </div>
                          <div className="channel-icon-group">
                            <Mail size={14} className={log.emailSent ? "active-channel" : "inactive-channel"} />
                            <span className={log.emailSent ? "active-channel" : "inactive-channel"}>Email</span>
                          </div>
                        </div>
                        <div className="row-cell date-cell">
                          <span>{new Date(log.onboardedAt).toLocaleTimeString()}</span>
                        </div>
                        <div className="row-cell expand-toggle-cell">
                          {expandedLogId === log._id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </div>
                      
                      {expandedLogId === log._id && (
                        <div className="row-expanded-logs">
                          <h4>📜 Captured Execution Logs:</h4>
                          <div className="expanded-logs-terminal">
                            {log.logs.map((logText, i) => (
                              <div key={i} className="expanded-log-line">{logText}</div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="instructions-view card">
            <h2>Step-by-Step Setup Guide</h2>
            <p className="card-description">Follow these steps to wire up the automation in your own workspace:</p>
            <hr className="divider" />
            
            <div className="setup-steps">
              <div className="step-card">
                <h3>1. Notion Setup</h3>
                <ol>
                  <li>Create a Notion database table with these exact properties:
                    <ul>
                      <li><strong>Name</strong> (Title type)</li>
                      <li><strong>Email</strong> (Email type)</li>
                      <li><strong>Company</strong> (Text type)</li>
                      <li><strong>Notes</strong> (Text type)</li>
                      <li><strong>Status</strong> (Status or Select type). Add option <code>Not started</code> and <code>Done</code>.</li>
                    </ul>
                  </li>
                  <li>Go to <a href="https://app.notion.com/developers/tokens" target="_blank" rel="noreferrer">notion.com/developers</a>, click <strong>Create personal access token (PAT)</strong>, and copy it.</li>
                  <li>Your Database ID is the 32-character ID in the browser URL of your database page.</li>
                </ol>
              </div>

              <div className="step-card">
                <h3>2. Gemini API Key</h3>
                <ol>
                  <li>Go to <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer">Google AI Studio</a>.</li>
                  <li>Sign in with your Google Account and click <strong>Get API Key</strong>.</li>
                  <li>Copy the key and save it under <code>GEMINI_API_KEY</code>.</li>
                </ol>
              </div>

              <div className="step-card">
                <h3>3. Slack Webhook</h3>
                <ol>
                  <li>Go to <a href="https://api.slack.com/apps" target="_blank" rel="noreferrer">Slack API Apps</a>.</li>
                  <li>Create a new App from scratch, choose your workspace.</li>
                  <li>Click <strong>Incoming Webhooks</strong>, activate them, click <strong>Add Webhook</strong>, select your target channel, and copy the URL.</li>
                </ol>
              </div>

              <div className="step-card">
                <h3>4. Resend API Key</h3>
                <ol>
                  <li>Register for a free account at <a href="https://resend.com/" target="_blank" rel="noreferrer">resend.com</a>.</li>
                  <li>Go to **API Keys** and generate a new key.</li>
                  <li><em>Note:</em> Free sandbox accounts are restricted to emailing the account owner's email address.</li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
