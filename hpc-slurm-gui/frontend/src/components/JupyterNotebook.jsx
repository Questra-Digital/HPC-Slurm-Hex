import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config";
import Swal from "sweetalert2";

// Resource monitoring mini-chart component
const ResourceChart = ({ data, label, color, unit }) => {
    const canvasRef = useRef(null);
    const historyRef = useRef([]);

    useEffect(() => {
        if (!canvasRef.current || data === null || data === undefined) return;

        historyRef.current.push(data);
        if (historyRef.current.length > 60) historyRef.current.shift();

        const ctx = canvasRef.current.getContext('2d');
        const width = canvasRef.current.width;
        const height = canvasRef.current.height;

        ctx.clearRect(0, 0, width, height);

        // Draw background
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, width, height);

        // Draw grid lines
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            ctx.beginPath();
            ctx.moveTo(0, (height / 4) * i);
            ctx.lineTo(width, (height / 4) * i);
            ctx.stroke();
        }

        // Draw data line
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();

        const history = historyRef.current;
        history.forEach((val, idx) => {
            const x = (idx / 60) * width;
            const y = height - (val / 100) * height;
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Fill area under line
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fillStyle = color + '33'; // Add transparency
        ctx.fill();

        // Draw current value
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillText(`${data.toFixed(1)}${unit}`, 5, 14);

    }, [data, color, unit]);

    return (
        <div style={chartStyles.container}>
            <canvas ref={canvasRef} width={110} height={45} style={chartStyles.canvas} />
            <span style={chartStyles.label}>{label}</span>
        </div>
    );
};

const chartStyles = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
    },
    canvas: {
        borderRadius: '6px',
        border: '1px solid #334155'
    },
    label: {
        fontSize: '10px',
        color: '#94a3b8',
        marginTop: '3px',
        fontWeight: '500'
    }
};

const JupyterNotebook = () => {
    const [userId] = useState(sessionStorage.getItem("id"));  // Fixed: 'id' not 'userId'
    const [userRole] = useState(sessionStorage.getItem("user_role"));
    const [hasPermission, setHasPermission] = useState(false);
    const [allowedWorkers, setAllowedWorkers] = useState([]);
    const [selectedWorker, setSelectedWorker] = useState("");
    const [activeSession, setActiveSession] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isStarting, setIsStarting] = useState(false);
    const [resources, setResources] = useState({ cpu: null, memory: null, gpu: null });
    const [iframeLoaded, setIframeLoaded] = useState(false);
    const iframeRef = useRef(null);

    // Check permissions on mount
    useEffect(() => {
        const checkPermission = async () => {
            try {
                const res = await axios.get(`${API_BASE_URL}/notebooks/check-permission/${userId}`);
                setHasPermission(res.data.allowed);
                setAllowedWorkers(res.data.workers || []);
                if (res.data.workers?.length > 0) {
                    setSelectedWorker(res.data.workers[0]);
                }
            } catch (error) {
                console.error("Permission check failed:", error);
                setHasPermission(false);
            }

            // Check for existing active session
            try {
                const sessRes = await axios.get(`${API_BASE_URL}/notebooks/sessions/${userId}`);
                if (sessRes.data.length > 0) {
                    const session = sessRes.data[0];
                    setActiveSession({
                        id: session.id,
                        worker_ip: session.worker_ip,
                        worker_port: session.worker_port,
                        token: session.token,
                        url: `/notebooks/proxy/${session.worker_ip}/${session.worker_port}/?token=${session.token}`
                    });
                }
            } catch (error) {
                console.error("Session check failed:", error);
            }

            setIsLoading(false);
        };

        if (userId) {
            checkPermission();
        } else {
            setIsLoading(false);
        }
    }, [userId]);

    // Poll resource usage when session is active
    useEffect(() => {
        if (!activeSession) {
            setResources({ cpu: null, memory: null, gpu: null });
            return;
        }

        const fetchResources = async () => {
            try {
                const res = await axios.get(`${API_BASE_URL}/notebooks/resources/${activeSession.worker_ip}`);
                setResources({
                    cpu: res.data.cpu?.percent ?? null,
                    memory: res.data.memory?.percent ?? null,
                    gpu: res.data.gpu?.percent ?? null
                });
            } catch (error) {
                console.error("Resource fetch failed:", error);
            }
        };

        fetchResources();
        const interval = setInterval(fetchResources, 2000); // Poll every 2 seconds
        return () => clearInterval(interval);
    }, [activeSession]);

    const handleStartNotebook = async () => {
        if (!selectedWorker) {
            Swal.fire("Error", "Please select a worker node", "error");
            return;
        }

        setIsStarting(true);
        try {
            const res = await axios.post(`${API_BASE_URL}/notebooks/start`, {
                userId,
                workerIp: selectedWorker
            });

            setActiveSession({
                id: res.data.session.id,
                worker_ip: selectedWorker,
                worker_port: res.data.session.port,
                token: res.data.session.token,
                url: res.data.session.url
            });

            setIframeLoaded(false);
            Swal.fire({
                icon: "success",
                title: "Notebook Started!",
                text: `Running on ${selectedWorker}:${res.data.session.port}`,
                timer: 2000,
                showConfirmButton: false
            });
        } catch (error) {
            console.error("Start notebook error:", error);
            Swal.fire("Error", error.response?.data?.error || "Failed to start notebook", "error");
        }
        setIsStarting(false);
    };

    const handleStopNotebook = async () => {
        const confirm = await Swal.fire({
            title: "Stop Notebook Session?",
            text: "Any unsaved work in the notebook will be lost.",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#dc2626",
            cancelButtonColor: "#475569",
            confirmButtonText: "Yes, stop it"
        });

        if (!confirm.isConfirmed) return;

        try {
            await axios.post(`${API_BASE_URL}/notebooks/stop`, {
                sessionId: activeSession.id,
                userId
            });
            setActiveSession(null);
            setResources({ cpu: null, memory: null, gpu: null });
            setIframeLoaded(false);
            Swal.fire({
                icon: "info",
                title: "Notebook Stopped",
                text: "Session has been terminated",
                timer: 2000,
                showConfirmButton: false
            });
        } catch (error) {
            console.error("Stop notebook error:", error);
            Swal.fire("Error", error.response?.data?.error || "Failed to stop notebook", "error");
        }
    };

    if (isLoading) {
        return (
            <div style={styles.content}>
                <div style={styles.loadingContainer}>
                    <div style={styles.spinner}></div>
                    <p>Loading notebook environment...</p>
                </div>
            </div>
        );
    }

    if (!hasPermission) {
        return (
            <div style={styles.content}>
                <div style={styles.noAccess}>
                    <div style={styles.noAccessIcon}>🔒</div>
                    <h2 style={styles.noAccessTitle}>Notebook Access Not Available</h2>
                    <p style={styles.noAccessText}>
                        You don't have permission to use Jupyter Notebooks.
                        {userRole !== 'admin' && (
                            <><br />Contact your administrator to request notebook access.</>
                        )}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.content}>
            {/* Header with title and resource monitors */}
            <div style={styles.header}>
                <div style={styles.titleSection}>
                    <h1 style={styles.title}>📓 Jupyter Notebook</h1>
                    {activeSession && (
                        <span style={styles.sessionBadge}>
                            Session Active • {activeSession.worker_ip}:{activeSession.worker_port}
                        </span>
                    )}
                </div>

                {/* Resource Monitors - Top Right */}
                {activeSession && (
                    <div style={styles.resourceMonitors}>
                        {resources.cpu !== null && (
                            <ResourceChart
                                data={resources.cpu}
                                label="CPU"
                                color="#22c55e"
                                unit="%"
                            />
                        )}
                        {resources.memory !== null && (
                            <ResourceChart
                                data={resources.memory}
                                label="RAM"
                                color="#3b82f6"
                                unit="%"
                            />
                        )}
                        {resources.gpu !== null && (
                            <ResourceChart
                                data={resources.gpu}
                                label="GPU"
                                color="#f59e0b"
                                unit="%"
                            />
                        )}
                    </div>
                )}
            </div>

            {/* Main Content Area */}
            {!activeSession ? (
                <div style={styles.startPanel}>
                    <div style={styles.startPanelInner}>
                        <h2 style={styles.startTitle}>Start a New Notebook Session</h2>
                        <p style={styles.startSubtitle}>
                            Launch an interactive Jupyter Notebook on a worker node
                        </p>

                        <div style={styles.formGroup}>
                            <label style={styles.label}>Select Worker Node:</label>
                            <select
                                value={selectedWorker}
                                onChange={(e) => setSelectedWorker(e.target.value)}
                                style={styles.select}
                            >
                                {allowedWorkers.length === 0 ? (
                                    <option value="">No workers available</option>
                                ) : (
                                    allowedWorkers.map(ip => (
                                        <option key={ip} value={ip}>{ip}</option>
                                    ))
                                )}
                            </select>
                        </div>

                        <button
                            onClick={handleStartNotebook}
                            disabled={isStarting || allowedWorkers.length === 0}
                            style={{
                                ...styles.startButton,
                                ...(isStarting || allowedWorkers.length === 0 ? styles.startButtonDisabled : {})
                            }}
                        >
                            {isStarting ? (
                                <>
                                    <span style={styles.buttonSpinner}></span>
                                    Starting...
                                </>
                            ) : (
                                "🚀 Launch Notebook"
                            )}
                        </button>

                        <p style={styles.hint}>
                            Your notebook session will run on the selected worker node.
                            <br />Resources used will be displayed in real-time.
                        </p>
                    </div>
                </div>
            ) : (
                <div style={styles.notebookContainer}>
                    <div style={styles.notebookHeader}>
                        <div style={styles.notebookInfo}>
                            <span style={styles.notebookLabel}>Jupyter Notebook</span>
                            {!iframeLoaded && (
                                <span style={styles.loadingText}>Loading notebook interface...</span>
                            )}
                        </div>
                        <button onClick={handleStopNotebook} style={styles.stopButton}>
                            ⏹ Stop Session
                        </button>
                    </div>

                    <iframe
                        ref={iframeRef}
                        src={`${API_BASE_URL}${activeSession.url}`}
                        style={styles.iframe}
                        title="Jupyter Notebook"
                        onLoad={() => setIframeLoaded(true)}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                    />
                </div>
            )}
        </div>
    );
};

const styles = {
    content: {
        flex: 1,
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100%'
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '16px'
    },
    titleSection: {
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        flexWrap: 'wrap'
    },
    title: {
        margin: 0,
        fontSize: '28px',
        fontWeight: '700',
        color: '#f1f5f9'
    },
    sessionBadge: {
        padding: '6px 12px',
        backgroundColor: '#22c55e22',
        border: '1px solid #22c55e',
        borderRadius: '20px',
        fontSize: '12px',
        color: '#22c55e',
        fontWeight: '500'
    },
    resourceMonitors: {
        display: 'flex',
        gap: '12px',
        padding: '12px 16px',
        backgroundColor: '#1e293b',
        borderRadius: '12px',
        border: '1px solid #334155'
    },
    loadingContainer: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        color: '#94a3b8'
    },
    spinner: {
        width: '40px',
        height: '40px',
        border: '3px solid #334155',
        borderTopColor: '#3b82f6',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        marginBottom: '16px'
    },
    noAccess: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        padding: '40px'
    },
    noAccessIcon: {
        fontSize: '64px',
        marginBottom: '24px'
    },
    noAccessTitle: {
        fontSize: '24px',
        fontWeight: '600',
        color: '#f1f5f9',
        marginBottom: '12px'
    },
    noAccessText: {
        fontSize: '16px',
        color: '#94a3b8',
        lineHeight: '1.6',
        maxWidth: '400px'
    },
    startPanel: {
        flex: 1,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
    },
    startPanelInner: {
        maxWidth: '480px',
        width: '100%',
        padding: '40px',
        backgroundColor: '#1e293b',
        borderRadius: '16px',
        border: '1px solid #334155',
        textAlign: 'center'
    },
    startTitle: {
        fontSize: '22px',
        fontWeight: '600',
        color: '#f1f5f9',
        marginBottom: '8px'
    },
    startSubtitle: {
        fontSize: '14px',
        color: '#94a3b8',
        marginBottom: '32px'
    },
    formGroup: {
        marginBottom: '24px',
        textAlign: 'left'
    },
    label: {
        display: 'block',
        fontSize: '14px',
        fontWeight: '500',
        color: '#e2e8f0',
        marginBottom: '8px'
    },
    select: {
        width: '100%',
        padding: '14px 16px',
        backgroundColor: '#0f172a',
        border: '1px solid #475569',
        borderRadius: '8px',
        color: '#fff',
        fontSize: '16px',
        cursor: 'pointer',
        outline: 'none',
        transition: 'border-color 0.2s'
    },
    startButton: {
        width: '100%',
        padding: '16px 28px',
        fontSize: '16px',
        fontWeight: '600',
        backgroundColor: '#22c55e',
        color: '#fff',
        border: 'none',
        borderRadius: '10px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        transition: 'background-color 0.2s, transform 0.1s'
    },
    startButtonDisabled: {
        backgroundColor: '#475569',
        cursor: 'not-allowed'
    },
    buttonSpinner: {
        width: '16px',
        height: '16px',
        border: '2px solid rgba(255,255,255,0.3)',
        borderTopColor: '#fff',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
    },
    hint: {
        marginTop: '24px',
        fontSize: '12px',
        color: '#64748b',
        lineHeight: '1.5'
    },
    notebookContainer: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#1e293b',
        borderRadius: '12px',
        border: '1px solid #334155',
        overflow: 'hidden'
    },
    notebookHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        backgroundColor: '#0f172a',
        borderBottom: '1px solid #334155'
    },
    notebookInfo: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
    },
    notebookLabel: {
        fontSize: '14px',
        fontWeight: '500',
        color: '#e2e8f0'
    },
    loadingText: {
        fontSize: '12px',
        color: '#f59e0b',
        fontStyle: 'italic'
    },
    stopButton: {
        padding: '8px 16px',
        backgroundColor: '#dc2626',
        color: '#fff',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        fontWeight: '600',
        fontSize: '13px',
        transition: 'background-color 0.2s'
    },
    iframe: {
        flex: 1,
        width: '100%',
        border: 'none',
        backgroundColor: '#fff',
        minHeight: '600px'
    }
};

// Add CSS animation for spinner
const styleSheet = document.createElement("style");
styleSheet.textContent = `
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
`;
document.head.appendChild(styleSheet);

export default JupyterNotebook;
