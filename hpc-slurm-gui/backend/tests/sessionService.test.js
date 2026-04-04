describe("Session Service", () => {
    afterEach(() => {
        jest.resetModules();
        process.env.NODE_ENV = "test";
        process.env.JWT_SECRET = "5e18f55dc731e04ae901a488b87c33444f014d927bcfc751724687f8209cae86";
    });

    it("builds strict HttpOnly refresh cookie options", () => {
        const { buildRefreshCookieOptions } = require("../services/sessionService");
        const options = buildRefreshCookieOptions();

        expect(options.httpOnly).toBe(true);
        expect(options.sameSite).toBe("strict");
        expect(options.path).toBe("/api/auth");
    });

    it("enables secure cookies in production", () => {
        process.env.NODE_ENV = "production";
        const { buildRefreshCookieOptions } = require("../services/sessionService");
        const options = buildRefreshCookieOptions();

        expect(options.secure).toBe(true);
    });

    it("uses session id prefix for refresh token and stable hash", () => {
        const {
            buildRefreshToken,
            parseSessionIdFromRefreshToken,
            hashRefreshToken,
        } = require("../services/sessionService");

        const refreshToken = buildRefreshToken("session-123");
        expect(parseSessionIdFromRefreshToken(refreshToken)).toBe("session-123");
        expect(hashRefreshToken(refreshToken)).toBe(hashRefreshToken(refreshToken));
    });
});
