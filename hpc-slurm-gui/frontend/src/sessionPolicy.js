export const FRONTEND_SESSION_POLICY = Object.freeze({
  accessTokenTtlSeconds: 15 * 60,
  idleTimeoutSeconds: 30 * 60,
  absoluteSessionLifetimeSeconds: 12 * 60 * 60,
  multiSessionPerUser: true,
  sessionStore: "sqlite",
  definitions: {
    session: "A single authenticated login context tied to one device/browser instance.",
    device: "A browser profile or client instance with its own refresh cookie.",
    compromisedToken: "A refresh token suspected of theft or replay (for example, reuse after rotation)."
  },
  threatModel: {
    tokenTheft: "If refresh token reuse is detected, treat token as compromised and revoke the affected session.",
    idleBehaviorActiveTab: "Any authenticated user activity updates last activity and extends idle window.",
    idleBehaviorInactiveTab: "No authenticated activity for 30 minutes expires the session by idle timeout.",
    sessionExpiryUx: "Warn user before timeout and force logout when idle or absolute expiry is reached."
  }
});

export const isTtlHierarchyValid = (policy = FRONTEND_SESSION_POLICY) => (
  policy.accessTokenTtlSeconds < policy.idleTimeoutSeconds &&
  policy.idleTimeoutSeconds < policy.absoluteSessionLifetimeSeconds
);

export const isPolicyAlignedWithBackend = (backendPolicy) => {
  if (!backendPolicy) return false;

  return (
    backendPolicy.accessTokenTtlSeconds === FRONTEND_SESSION_POLICY.accessTokenTtlSeconds &&
    backendPolicy.idleTimeoutSeconds === FRONTEND_SESSION_POLICY.idleTimeoutSeconds &&
    backendPolicy.absoluteSessionLifetimeSeconds === FRONTEND_SESSION_POLICY.absoluteSessionLifetimeSeconds &&
    backendPolicy.multiSessionPerUser === FRONTEND_SESSION_POLICY.multiSessionPerUser &&
    backendPolicy.sessionStore === FRONTEND_SESSION_POLICY.sessionStore
  );
};
