import {
  FRONTEND_SESSION_POLICY,
  isTtlHierarchyValid,
  isPolicyAlignedWithBackend
} from "../sessionPolicy";

describe("Frontend Session Policy (Phase 1)", () => {
  it("locks expected policy values", () => {
    expect(FRONTEND_SESSION_POLICY.accessTokenTtlSeconds).toBe(900);
    expect(FRONTEND_SESSION_POLICY.idleTimeoutSeconds).toBe(1800);
    expect(FRONTEND_SESSION_POLICY.absoluteSessionLifetimeSeconds).toBe(43200);
    expect(FRONTEND_SESSION_POLICY.multiSessionPerUser).toBe(true);
    expect(FRONTEND_SESSION_POLICY.sessionStore).toBe("sqlite");
  });

  it("enforces ttl hierarchy", () => {
    expect(isTtlHierarchyValid()).toBe(true);
  });

  it("can validate alignment with backend policy payload", () => {
    const backendPolicy = {
      accessTokenTtlSeconds: 900,
      idleTimeoutSeconds: 1800,
      absoluteSessionLifetimeSeconds: 43200,
      multiSessionPerUser: true,
      sessionStore: "sqlite"
    };

    expect(isPolicyAlignedWithBackend(backendPolicy)).toBe(true);
  });

  it("defines ambiguous security terms", () => {
    expect(FRONTEND_SESSION_POLICY.definitions.session).toBeTruthy();
    expect(FRONTEND_SESSION_POLICY.definitions.device).toBeTruthy();
    expect(FRONTEND_SESSION_POLICY.definitions.compromisedToken).toBeTruthy();
  });

  it("documents threat-model and timeout UX expectations", () => {
    expect(FRONTEND_SESSION_POLICY.threatModel.tokenTheft).toContain("compromised");
    expect(FRONTEND_SESSION_POLICY.threatModel.idleBehaviorActiveTab).toContain("extends idle window");
    expect(FRONTEND_SESSION_POLICY.threatModel.idleBehaviorInactiveTab).toContain("30 minutes");
    expect(FRONTEND_SESSION_POLICY.threatModel.sessionExpiryUx).toContain("Warn user");
  });
});
