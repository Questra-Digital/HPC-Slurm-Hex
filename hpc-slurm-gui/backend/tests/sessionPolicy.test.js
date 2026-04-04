const { SESSION_POLICY, isTtlHierarchyValid, validateSessionPolicy } = require("../config/sessionPolicy");

describe("Session Policy (Phase 1)", () => {
    it("locks policy values to agreed Phase 1 decisions", () => {
        expect(SESSION_POLICY.accessTokenTtlSeconds).toBe(900);
        expect(SESSION_POLICY.idleTimeoutSeconds).toBe(1800);
        expect(SESSION_POLICY.absoluteSessionLifetimeSeconds).toBe(43200);
        expect(SESSION_POLICY.multiSessionPerUser).toBe(true);
        expect(SESSION_POLICY.sessionStore).toBe("sqlite");
    });

    it("enforces valid ttl hierarchy", () => {
        expect(isTtlHierarchyValid()).toBe(true);
        expect(validateSessionPolicy()).toBe(true);
    });

    it("contains clear definitions for ambiguous terms", () => {
        expect(SESSION_POLICY.definitions.session).toBeTruthy();
        expect(SESSION_POLICY.definitions.device).toBeTruthy();
        expect(SESSION_POLICY.definitions.compromisedToken).toBeTruthy();
    });

    it("documents multi-device behavior across key flows", () => {
        expect(SESSION_POLICY.flowDocumentation.login).toContain("new independent session");
        expect(SESSION_POLICY.flowDocumentation.refresh).toContain("Rotate refresh token");
        expect(SESSION_POLICY.flowDocumentation.logout).toContain("current session");
        expect(SESSION_POLICY.flowDocumentation.logoutAll).toContain("all sessions");
    });

    it("documents token theft, idle behavior, and session expiry UX", () => {
        expect(SESSION_POLICY.threatModel.tokenTheft).toContain("compromised");
        expect(SESSION_POLICY.threatModel.idleBehaviorActiveTab).toContain("extends idle window");
        expect(SESSION_POLICY.threatModel.idleBehaviorInactiveTab).toContain("30 minutes");
        expect(SESSION_POLICY.threatModel.sessionExpiryUx).toContain("Warn user");
    });
});
