const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const IDLE_TIMEOUT_SECONDS = 30 * 60;
const ABSOLUTE_SESSION_LIFETIME_SECONDS = 12 * 60 * 60;

const SESSION_POLICY = Object.freeze({
    accessTokenTtlSeconds: ACCESS_TOKEN_TTL_SECONDS,
    idleTimeoutSeconds: IDLE_TIMEOUT_SECONDS,
    absoluteSessionLifetimeSeconds: ABSOLUTE_SESSION_LIFETIME_SECONDS,
    accessTokenJwtExpiresIn: "15m",
    refreshTokenCookieName: "refresh_token",
    refreshTokenBytes: 48,
    refreshTokenCookieSameSite: "strict",
    refreshTokenCookiePath: "/api/auth",
    revokeAllOnReuseDetection: process.env.REVOKE_ALL_ON_REUSE_DETECTION === "true",
    multiSessionPerUser: true,
    sessionStore: "sqlite",
    definitions: {
        session: "A single authenticated login context tied to one device/browser instance.",
        device: "A browser profile or client instance with its own refresh cookie.",
        compromisedToken: "A refresh token suspected of theft or replay (for example, reuse after rotation)."
    },
    flowDocumentation: {
        login: "Create a new independent session for every successful login.",
        refresh: "Rotate refresh token and update last activity for the current session.",
        logout: "Revoke only the current session.",
        logoutAll: "Revoke all sessions for the authenticated user."
    },
    threatModel: {
        tokenTheft: "If refresh token reuse is detected, treat token as compromised and revoke the affected session.",
        idleBehaviorActiveTab: "Any authenticated user activity updates last activity and extends idle window.",
        idleBehaviorInactiveTab: "No authenticated activity for 30 minutes expires the session by idle timeout.",
        sessionExpiryUx: "Warn user before timeout and force logout when idle or absolute expiry is reached."
    }
});

const isTtlHierarchyValid = (policy = SESSION_POLICY) => (
    policy.accessTokenTtlSeconds < policy.idleTimeoutSeconds &&
    policy.idleTimeoutSeconds < policy.absoluteSessionLifetimeSeconds
);

const validateSessionPolicy = (policy = SESSION_POLICY) => {
    if (!isTtlHierarchyValid(policy)) {
        throw new Error("Invalid session policy hierarchy: access < idle < absolute must hold.");
    }

    if (!policy.multiSessionPerUser) {
        throw new Error("Phase 1 policy requires multi-session per user.");
    }

    if (policy.sessionStore !== "sqlite") {
        throw new Error("Phase 1 policy requires SQLite session store.");
    }

    return true;
};

validateSessionPolicy();

module.exports = {
    SESSION_POLICY,
    isTtlHierarchyValid,
    validateSessionPolicy
};
