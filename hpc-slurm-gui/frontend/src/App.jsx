import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import apiClient, { configureApiClientAuth } from "./api/client";
import Login from "./components/Login";
import Home from "./components/Home";
import AdminSetup from "./components/AdminSetup";
import RemoteNodes from "./components/RemoteNodes";
import JobsPage from "./components/JobsPage";
import {
    clearAuthState,
    getAuthState,
    hydrateAuthState,
    setAuthState,
    subscribeAuthState,
} from "./auth/authStore";
import { FRONTEND_SESSION_POLICY, isPolicyAlignedWithBackend } from "./sessionPolicy";

const AUTH_BROADCAST_CHANNEL = "hpc-slurm-auth-events";
const AUTH_STORAGE_EVENT_KEY = "hpc-slurm-auth-event";

const isNetworkError = (error) => !error?.response;

function BootstrapScreen() {
    return <h1>Loading...</h1>;
}

function BootstrapErrorScreen({ message, onRetry }) {
    return (
        <div className="bootstrap-error-screen">
            <div className="bootstrap-error-card">
                <h1>Connection Required</h1>
                <p>{message}</p>
                <button onClick={onRetry}>Retry</button>
            </div>
            <style>{`
                .bootstrap-error-screen {
                    min-height: 100vh;
                    width: 100vw;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
                }

                .bootstrap-error-card {
                    background: #fff;
                    padding: 2rem;
                    border-radius: 12px;
                    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.1);
                    max-width: 520px;
                    width: calc(100% - 2rem);
                    text-align: center;
                }

                .bootstrap-error-card h1 {
                    margin: 0 0 0.75rem;
                    color: #0f172a;
                    font-size: 1.5rem;
                }

                .bootstrap-error-card p {
                    margin: 0 0 1.5rem;
                    color: #334155;
                }

                .bootstrap-error-card button {
                    border: none;
                    border-radius: 8px;
                    padding: 0.75rem 1.25rem;
                    background: #0f172a;
                    color: #fff;
                    cursor: pointer;
                    font-weight: 600;
                }
            `}</style>
        </div>
    );
}

function IdleWarningModal({ visible, secondsRemaining, onStaySignedIn, reason }) {
    if (!visible) {
        return null;
    }

    return (
        <div className="idle-warning-overlay" role="dialog" aria-modal="true" aria-label="Session expiry warning">
            <div className="idle-warning-card">
                <h2>Session Expiring Soon</h2>
                <p>
                    {reason === "absolute"
                        ? "Your maximum session lifetime is about to end."
                        : "You are about to be signed out due to inactivity."}
                </p>
                <p className="countdown">{secondsRemaining}s remaining</p>
                <div className="actions">
                    <button onClick={onStaySignedIn}>Stay Signed In</button>
                </div>
            </div>
            <style>{`
                .idle-warning-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(15, 23, 42, 0.45);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 9999;
                    padding: 1rem;
                }

                .idle-warning-card {
                    width: 100%;
                    max-width: 420px;
                    border-radius: 12px;
                    background: #fff;
                    padding: 1.5rem;
                    box-shadow: 0 20px 45px rgba(15, 23, 42, 0.2);
                }

                .idle-warning-card h2 {
                    margin: 0 0 0.5rem;
                    color: #0f172a;
                }

                .idle-warning-card p {
                    margin: 0.25rem 0;
                    color: #334155;
                }

                .idle-warning-card .countdown {
                    margin-top: 0.75rem;
                    font-weight: 700;
                    color: #991b1b;
                }

                .idle-warning-card .actions {
                    margin-top: 1.25rem;
                    display: flex;
                    justify-content: flex-end;
                }

                .idle-warning-card button {
                    border: none;
                    border-radius: 8px;
                    padding: 0.65rem 1rem;
                    background: #0f172a;
                    color: #fff;
                    cursor: pointer;
                    font-weight: 600;
                }
            `}</style>
        </div>
    );
}

function AppShell() {
    const [authState, setAuthStateSnapshot] = useState(() => getAuthState());
    const [adminExists, setAdminExists] = useState(null);
    const [sessionPolicy, setSessionPolicy] = useState(null);
    const [bootstrapStatus, setBootstrapStatus] = useState("loading");
    const [bootstrapError, setBootstrapError] = useState("");
    const [logoutSyncIssue, setLogoutSyncIssue] = useState("");
    const [lastActivityAt, setLastActivityAt] = useState(Date.now());
    const [idleWarning, setIdleWarning] = useState({ visible: false, remainingMs: 0, reason: "idle" });

    const location = useLocation();
    const bootstrapPromiseRef = useRef(null);
    const broadcastChannelRef = useRef(null);
    const activityThrottleRef = useRef(0);
    const initializeStartedRef = useRef(false);

    const effectivePolicy = sessionPolicy || FRONTEND_SESSION_POLICY;
    const isAuthenticated = authState.status === "authenticated" && Boolean(authState.accessToken);
    const warningThresholdMs = useMemo(() => {
        const dynamicSeconds = Math.floor(effectivePolicy.idleTimeoutSeconds / 6);
        return Math.max(30, Math.min(120, dynamicSeconds)) * 1000;
    }, [effectivePolicy.idleTimeoutSeconds]);

    useEffect(() => {
        return subscribeAuthState((nextState) => {
            setAuthStateSnapshot(nextState);
        });
    }, []);

    const publishAuthEvent = useCallback((type) => {
        const payload = { type, timestamp: Date.now() };

        if (broadcastChannelRef.current) {
            broadcastChannelRef.current.postMessage(payload);
        }

        try {
            localStorage.setItem(AUTH_STORAGE_EVENT_KEY, JSON.stringify(payload));
            localStorage.removeItem(AUTH_STORAGE_EVENT_KEY);
        } catch (error) {
            console.warn("Auth storage event publish failed:", error);
        }
    }, []);

    const resetLocalAuth = useCallback((reason) => {
        clearAuthState(reason);
        setIdleWarning({ visible: false, remainingMs: 0, reason: "idle" });
    }, []);

    const markAuthenticatedActivity = useCallback(() => {
        if (!isAuthenticated) {
            return;
        }

        const now = Date.now();
        if (now - activityThrottleRef.current < 1500) {
            return;
        }

        activityThrottleRef.current = now;
        setLastActivityAt(now);
    }, [isAuthenticated]);

    const applyAuthenticatedProfile = useCallback(async (accessToken, profileHint = {}) => {
        const now = Date.now();
        const authHeaders = accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : {};

        const meResponse = await apiClient.get("/auth/me", {
            retrySafe: true,
            skipAuthRefresh: true,
            headers: authHeaders,
        });

        let permissions = [];
        try {
            const permissionsResponse = await apiClient.get(
                `/users/users/${meResponse.data.userId}/permissions`,
                {
                    retrySafe: true,
                    skipAuthRefresh: true,
                    headers: authHeaders,
                }
            );
            permissions = permissionsResponse.data?.permissions || [];
        } catch (error) {
            if (error?.response && [401, 403].includes(error.response.status)) {
                throw error;
            }
        }

        hydrateAuthState({
            accessToken,
            user: {
                id: meResponse.data.userId,
                username: meResponse.data.name || profileHint.name || "",
                role: meResponse.data.role || profileHint.role || "user",
                email: meResponse.data.email || profileHint.email || "",
                createdAt: meResponse.data.created_at || null,
            },
            permissions,
            session: {
                id: meResponse.data.sessionId || profileHint.sessionId || null,
                authenticatedAt: now,
                absoluteExpiresAt: now + (effectivePolicy.absoluteSessionLifetimeSeconds * 1000),
            },
        });

        setLastActivityAt(now);
        setLogoutSyncIssue("");
    }, [effectivePolicy.absoluteSessionLifetimeSeconds]);

    const refreshAccessToken = useCallback(async () => {
        const refreshResponse = await apiClient.post(
            "/auth/refresh",
            {},
            {
                authRequired: false,
                skipAuthRefresh: true,
                retrySafe: false,
            }
        );

        const refreshedAccessToken = refreshResponse.data?.accessToken;
        if (!refreshedAccessToken) {
            throw new Error("Refresh response did not include access token.");
        }

        await applyAuthenticatedProfile(refreshedAccessToken, refreshResponse.data);
        return refreshedAccessToken;
    }, [applyAuthenticatedProfile]);

    const bootstrapAuth = useCallback(async () => {
        if (bootstrapPromiseRef.current) {
            return bootstrapPromiseRef.current;
        }

        bootstrapPromiseRef.current = (async () => {
            setBootstrapStatus("loading");
            setBootstrapError("");

            try {
                const existingToken = getAuthState().accessToken;
                if (existingToken) {
                    await applyAuthenticatedProfile(existingToken);
                    setBootstrapStatus("ready");
                    return;
                }

                await refreshAccessToken();
                setBootstrapStatus("ready");
            } catch (error) {
                if (isNetworkError(error)) {
                    setBootstrapStatus("network-error");
                    setBootstrapError("Unable to reach the backend. Retry once the network is available.");
                    return;
                }

                if ([401, 403].includes(error?.response?.status)) {
                    resetLocalAuth("unauthenticated");
                    setBootstrapStatus("ready");
                    return;
                }

                resetLocalAuth("bootstrap_failed");
                setBootstrapStatus("network-error");
                setBootstrapError(error?.message || "Failed to restore session.");
            } finally {
                bootstrapPromiseRef.current = null;
            }
        })();

        return bootstrapPromiseRef.current;
    }, [applyAuthenticatedProfile, refreshAccessToken, resetLocalAuth]);

    const bestEffortLogoutSync = useCallback(async (endpoint, token) => {
        try {
            await apiClient.post(
                endpoint,
                {},
                {
                    authRequired: false,
                    skipAuthRefresh: true,
                    retrySafe: false,
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                }
            );
        } catch (error) {
            setLogoutSyncIssue("Signed out locally, but backend logout sync failed.");
        }
    }, []);

    const handleLogout = useCallback(async () => {
        const token = getAuthState().accessToken;
        resetLocalAuth("logout_local");
        setBootstrapStatus("ready");
        publishAuthEvent("LOGOUT");
        await bestEffortLogoutSync("/auth/logout", token);
    }, [bestEffortLogoutSync, publishAuthEvent, resetLocalAuth]);

    const handleLogoutAll = useCallback(async () => {
        const token = getAuthState().accessToken;
        resetLocalAuth("logout_all_local");
        setBootstrapStatus("ready");
        publishAuthEvent("LOGOUT_ALL");
        await bestEffortLogoutSync("/auth/logout-all", token);
    }, [bestEffortLogoutSync, publishAuthEvent, resetLocalAuth]);

    const handleIncomingAuthEvent = useCallback((payload) => {
        if (!payload?.type) {
            return;
        }

        if (!["LOGOUT", "LOGOUT_ALL", "FORCED_LOGOUT"].includes(payload.type)) {
            return;
        }

        resetLocalAuth(`broadcast_${payload.type.toLowerCase()}`);
        setBootstrapStatus("ready");

        if (payload.type === "LOGOUT") {
            bootstrapAuth();
        }
    }, [bootstrapAuth, resetLocalAuth]);

    useEffect(() => {
        if (typeof BroadcastChannel !== "undefined") {
            const channel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
            channel.onmessage = (event) => handleIncomingAuthEvent(event.data);
            broadcastChannelRef.current = channel;
        }

        const onStorage = (event) => {
            if (event.key !== AUTH_STORAGE_EVENT_KEY || !event.newValue) {
                return;
            }

            try {
                const payload = JSON.parse(event.newValue);
                handleIncomingAuthEvent(payload);
            } catch (error) {
                console.warn("Failed to parse auth storage event payload:", error);
            }
        };

        window.addEventListener("storage", onStorage);

        return () => {
            window.removeEventListener("storage", onStorage);
            if (broadcastChannelRef.current) {
                broadcastChannelRef.current.close();
                broadcastChannelRef.current = null;
            }
        };
    }, [handleIncomingAuthEvent]);

    useEffect(() => {
        configureApiClientAuth({
            getAccessToken: () => getAuthState().accessToken,
            refreshAccessToken,
            onRefreshFailed: () => {
                resetLocalAuth("refresh_failed");
                setBootstrapStatus("ready");
                publishAuthEvent("FORCED_LOGOUT");
            },
            onAuthActivity: markAuthenticatedActivity,
        });
    }, [markAuthenticatedActivity, publishAuthEvent, refreshAccessToken, resetLocalAuth]);

    useEffect(() => {
        if (initializeStartedRef.current) {
            return;
        }

        initializeStartedRef.current = true;

        const initialize = async () => {
            setBootstrapStatus("loading");

            try {
                const [adminResponse, policyResponse] = await Promise.all([
                    apiClient.get("/auth/check-admin", {
                        authRequired: false,
                        skipAuthRefresh: true,
                        retrySafe: true,
                    }),
                    apiClient.get("/auth/session-policy", {
                        authRequired: false,
                        skipAuthRefresh: true,
                        retrySafe: true,
                    }),
                ]);

                const resolvedPolicy = policyResponse.data?.policy || FRONTEND_SESSION_POLICY;
                setAdminExists(Boolean(adminResponse.data?.adminExists));
                setSessionPolicy(resolvedPolicy);

                if (!isPolicyAlignedWithBackend(resolvedPolicy)) {
                    console.error("Frontend and backend session policy values are not aligned.");
                }

                if (adminResponse.data?.adminExists) {
                    await bootstrapAuth();
                } else {
                    setBootstrapStatus("ready");
                }
            } catch (error) {
                console.error("Failed to initialize application:", error);
                setAdminExists(false);
                setSessionPolicy(FRONTEND_SESSION_POLICY);

                if (isNetworkError(error)) {
                    setBootstrapStatus("network-error");
                    setBootstrapError("Unable to load startup configuration while offline.");
                } else {
                    setBootstrapStatus("ready");
                }
            }
        };

        initialize();
    }, [bootstrapAuth]);

    useEffect(() => {
        if (!isAuthenticated) {
            return;
        }

        markAuthenticatedActivity();
    }, [isAuthenticated, location.pathname, markAuthenticatedActivity]);

    useEffect(() => {
        if (!isAuthenticated) {
            return;
        }

        const trackedEvents = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
        const listener = () => markAuthenticatedActivity();

        trackedEvents.forEach((eventName) => {
            window.addEventListener(eventName, listener, { passive: true });
        });

        return () => {
            trackedEvents.forEach((eventName) => {
                window.removeEventListener(eventName, listener);
            });
        };
    }, [isAuthenticated, markAuthenticatedActivity]);

    useEffect(() => {
        if (!isAuthenticated) {
            setIdleWarning({ visible: false, remainingMs: 0, reason: "idle" });
            return;
        }

        const idleTimeoutMs = effectivePolicy.idleTimeoutSeconds * 1000;
        const absoluteExpiresAt = authState.session?.absoluteExpiresAt || (Date.now() + (effectivePolicy.absoluteSessionLifetimeSeconds * 1000));

        const interval = setInterval(() => {
            const now = Date.now();
            const idleRemaining = idleTimeoutMs - (now - lastActivityAt);
            const absoluteRemaining = absoluteExpiresAt - now;

            const remainingMs = Math.min(idleRemaining, absoluteRemaining);
            const reason = absoluteRemaining <= idleRemaining ? "absolute" : "idle";

            if (remainingMs <= 0) {
                resetLocalAuth(reason === "absolute" ? "absolute_timeout" : "idle_timeout");
                setBootstrapStatus("ready");
                publishAuthEvent("FORCED_LOGOUT");
                return;
            }

            if (remainingMs <= warningThresholdMs) {
                setIdleWarning({ visible: true, remainingMs, reason });
            } else {
                setIdleWarning((previous) => (
                    previous.visible
                        ? { visible: false, remainingMs: 0, reason: "idle" }
                        : previous
                ));
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [
        authState.session?.absoluteExpiresAt,
        effectivePolicy.absoluteSessionLifetimeSeconds,
        effectivePolicy.idleTimeoutSeconds,
        isAuthenticated,
        lastActivityAt,
        publishAuthEvent,
        resetLocalAuth,
        warningThresholdMs,
    ]);

    const handleStaySignedIn = useCallback(() => {
        setLastActivityAt(Date.now());
        setIdleWarning({ visible: false, remainingMs: 0, reason: "idle" });
    }, []);

    const handleLogin = useCallback(async ({ email, password }) => {
        const loginResponse = await apiClient.post(
            "/auth/login",
            { email, password },
            {
                authRequired: false,
                skipAuthRefresh: true,
                retrySafe: false,
            }
        );

        let accessToken = loginResponse.data?.accessToken || loginResponse.data?.token || null;

        if (!accessToken) {
            try {
                accessToken = await refreshAccessToken();
            } catch (refreshError) {
                throw new Error("Missing access token after login. Please verify backend/frontend deployment versions.");
            }
        }

        await applyAuthenticatedProfile(accessToken, {
            ...loginResponse.data,
            email,
        });
        setBootstrapStatus("ready");
        return loginResponse.data;
    }, [applyAuthenticatedProfile, refreshAccessToken]);

    const handleAuthUserUpdate = useCallback((updater) => {
        setAuthState((previous) => {
            const currentUserPayload = {
                ...(previous.user || {}),
                permissions: previous.permissions || [],
                accessToken: previous.accessToken,
            };

            const nextPayload =
                typeof updater === "function"
                    ? updater(currentUserPayload)
                    : updater;

            if (!nextPayload || typeof nextPayload !== "object") {
                return previous;
            }

            return {
                ...previous,
                user: {
                    ...(previous.user || {}),
                    username: nextPayload.username ?? previous.user?.username,
                    email: nextPayload.email ?? previous.user?.email,
                },
            };
        });
    }, []);

    if (adminExists === null || !sessionPolicy) {
        return <BootstrapScreen />;
    }

    if (adminExists && bootstrapStatus === "loading") {
        return <BootstrapScreen />;
    }

    if (adminExists && bootstrapStatus === "network-error" && !isAuthenticated) {
        return (
            <BootstrapErrorScreen
                message={bootstrapError || "Could not restore your session while offline."}
                onRetry={() => bootstrapAuth()}
            />
        );
    }

    return (
        <>
            <Routes>
                {adminExists ? (
                    <>
                        <Route
                            path="/"
                            element={
                                isAuthenticated ? (
                                    <Home
                                        authUser={{
                                            ...(authState.user || {}),
                                            permissions: authState.permissions || [],
                                            accessToken: authState.accessToken,
                                        }}
                                        onLogout={handleLogout}
                                        onLogoutAll={handleLogoutAll}
                                        onAuthUserUpdate={handleAuthUserUpdate}
                                        sessionPolicy={sessionPolicy}
                                        syncIssue={logoutSyncIssue}
                                    />
                                ) : (
                                    <Navigate to="/login" replace />
                                )
                            }
                        />
                        <Route
                            path="/login"
                            element={
                                isAuthenticated
                                    ? <Navigate to="/" replace />
                                    : <Login onLogin={handleLogin} syncIssue={logoutSyncIssue} />
                            }
                        />
                        <Route
                            path="/remote-nodes"
                            element={isAuthenticated ? <RemoteNodes /> : <Navigate to="/login" replace />}
                        />
                        <Route
                            path="/job-page"
                            element={
                                isAuthenticated
                                    ? <JobsPage authUser={{ ...(authState.user || {}), permissions: authState.permissions || [] }} />
                                    : <Navigate to="/login" replace />
                            }
                        />
                        <Route path="*" element={<Navigate to={isAuthenticated ? "/" : "/login"} replace />} />
                    </>
                ) : (
                    <Route path="*" element={<AdminSetup />} />
                )}
            </Routes>

            <IdleWarningModal
                visible={idleWarning.visible && isAuthenticated}
                secondsRemaining={Math.max(0, Math.ceil(idleWarning.remainingMs / 1000))}
                onStaySignedIn={handleStaySignedIn}
                reason={idleWarning.reason}
            />
        </>
    );
}


function App() {
    return (
        <Router>
            <AppShell />
        </Router>
    );
}

export default App;
