const request = require("supertest");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const authRoutes = require("../routes/auth");
const { User, Session } = global.testDb;

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/auth", authRoutes);

const getCookie = (res, name) => {
    const cookies = res.headers["set-cookie"] || [];
    const target = cookies.find((cookie) => cookie.startsWith(`${name}=`));
    if (!target) return null;
    return target.split(";")[0];
};

const getSetCookieHeader = (res, name) => {
    const cookies = res.headers["set-cookie"] || [];
    return cookies.find((cookie) => cookie.startsWith(`${name}=`)) || null;
};

describe("Auth Routes (Phase 2)", () => {
    const adminCredentials = {
        username: "admin",
        email: "admin@test.com",
        password: "Password123!",
        role: "admin",
    };

    const createAdmin = async () => {
        return User.create({
            username: adminCredentials.username,
            email: adminCredentials.email,
            password_hash: await bcrypt.hash(adminCredentials.password, 10),
            role: adminCredentials.role,
        });
    };

    const loginAdmin = async () => {
        const res = await request(app)
            .post("/auth/login")
            .send({ email: adminCredentials.email, password: adminCredentials.password });

        return {
            res,
            accessToken: res.body.accessToken,
            refreshCookie: getCookie(res, "refresh_token"),
        };
    };

    it("GET /check-admin returns admin exists", async () => {
        await createAdmin();
        const res = await request(app).get("/auth/check-admin");
        expect(res.status).toBe(200);
        expect(res.body.adminExists).toBe(true);
    });

    it("POST /setup-admin creates admin if none exists", async () => {
        const res = await request(app)
            .post("/auth/setup-admin")
            .send({ email: "newadmin@test.com", password: "Password123!" });
        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Admin user created successfully.");
    });

    it("POST /login returns access token, sets refresh cookie, and creates session row", async () => {
        await createAdmin();

        const res = await request(app)
            .post("/auth/login")
            .send({ email: adminCredentials.email, password: adminCredentials.password });

        expect(res.status).toBe(200);
        expect(res.body.accessToken).toBeDefined();
        expect(res.body.userId).toBe(1);
        expect(res.body.refreshToken).toBeUndefined();

        const refreshCookie = getCookie(res, "refresh_token");
        const refreshCookieHeader = getSetCookieHeader(res, "refresh_token");
        expect(refreshCookie).toBeTruthy();
        expect(refreshCookieHeader).toContain("HttpOnly");
        expect(refreshCookieHeader.toLowerCase()).toContain("samesite=strict");

        const sessionCount = await Session.count();
        expect(sessionCount).toBe(1);

        const session = await Session.findOne();
        expect(session.user_id).toBe(1);
        expect(session.refresh_token_hash).toBeTruthy();
        expect(session.revoked_at).toBeNull();
    });

    it("POST /login issues 15-minute access token with session id claim", async () => {
        await createAdmin();
        const res = await request(app)
            .post("/auth/login")
            .send({ email: adminCredentials.email, password: adminCredentials.password });

        const decoded = jwt.verify(res.body.accessToken, process.env.JWT_SECRET);
        expect(decoded.exp - decoded.iat).toBe(900);
        expect(decoded.sessionId).toBeDefined();
    });

    it("POST /refresh rotates refresh token and updates last activity", async () => {
        await createAdmin();
        const { refreshCookie } = await loginAdmin();

        const sessionBefore = await Session.findOne();
        const previousLastActivity = new Date(sessionBefore.last_activity_at).getTime();

        const refreshRes = await request(app)
            .post("/auth/refresh")
            .set("Cookie", refreshCookie);

        expect(refreshRes.status).toBe(200);
        expect(refreshRes.body.accessToken).toBeDefined();
        expect(refreshRes.body.refreshToken).toBeUndefined();

        const rotatedCookie = getCookie(refreshRes, "refresh_token");
        expect(rotatedCookie).toBeTruthy();
        expect(rotatedCookie).not.toBe(refreshCookie);

        const sessionAfter = await Session.findByPk(sessionBefore.id);
        expect(new Date(sessionAfter.last_activity_at).getTime()).toBeGreaterThanOrEqual(previousLastActivity);
        expect(sessionAfter.refresh_token_hash).not.toBe(sessionBefore.refresh_token_hash);
    });

    it("POST /refresh rejects idle-expired sessions and revokes them", async () => {
        await createAdmin();
        const { refreshCookie } = await loginAdmin();

        const session = await Session.findOne();
        session.last_activity_at = new Date(Date.now() - (31 * 60 * 1000));
        await session.save();

        const refreshRes = await request(app)
            .post("/auth/refresh")
            .set("Cookie", refreshCookie);

        expect(refreshRes.status).toBe(401);

        const updated = await Session.findByPk(session.id);
        expect(updated.revoked_at).toBeTruthy();
    });

    it("POST /refresh rejects absolute-expired sessions and revokes them", async () => {
        await createAdmin();
        const { refreshCookie } = await loginAdmin();

        const session = await Session.findOne();
        session.expires_at = new Date(Date.now() - 5000);
        await session.save();

        const refreshRes = await request(app)
            .post("/auth/refresh")
            .set("Cookie", refreshCookie);

        expect(refreshRes.status).toBe(401);

        const updated = await Session.findByPk(session.id);
        expect(updated.revoked_at).toBeTruthy();
    });

    it("POST /refresh with old rotated token marks session compromised", async () => {
        await createAdmin();
        const { refreshCookie } = await loginAdmin();

        const rotated = await request(app)
            .post("/auth/refresh")
            .set("Cookie", refreshCookie);

        expect(rotated.status).toBe(200);

        const reuse = await request(app)
            .post("/auth/refresh")
            .set("Cookie", refreshCookie);

        expect(reuse.status).toBe(401);
        expect(reuse.body.message).toContain("reuse");

        const session = await Session.findOne();
        expect(session.compromised_at).toBeTruthy();
        expect(session.revoked_at).toBeTruthy();
    });

    it("multiple logins create independent sessions", async () => {
        await createAdmin();
        await loginAdmin();
        await loginAdmin();

        const sessions = await Session.findAll({ where: { user_id: 1 } });
        expect(sessions.length).toBe(2);
        expect(sessions[0].id).not.toBe(sessions[1].id);
    });

    it("reuse detection revokes affected session only by default", async () => {
        await createAdmin();

        const login1 = await loginAdmin();
        const login2 = await loginAdmin();

        const refresh1 = await request(app)
            .post("/auth/refresh")
            .set("Cookie", login1.refreshCookie);

        expect(refresh1.status).toBe(200);

        const reuse = await request(app)
            .post("/auth/refresh")
            .set("Cookie", login1.refreshCookie);

        expect(reuse.status).toBe(401);

        const sessions = await Session.findAll({ where: { user_id: 1 } });
        const compromised = sessions.find((s) => s.compromised_at);
        const stillActive = sessions.find((s) => !s.revoked_at && s.id !== compromised.id);

        expect(compromised).toBeTruthy();
        expect(stillActive).toBeTruthy();

        const secondSessionRefresh = await request(app)
            .post("/auth/refresh")
            .set("Cookie", login2.refreshCookie);
        expect(secondSessionRefresh.status).toBe(200);
    });

    it("GET /me rejects missing access token", async () => {
        const res = await request(app).get("/auth/me");
        expect(res.status).toBe(401);
    });

    it("GET /me rejects revoked sessions even with valid token signature", async () => {
        await createAdmin();
        const { accessToken } = await loginAdmin();

        const session = await Session.findOne();
        session.revoked_at = new Date();
        await session.save();

        const res = await request(app)
            .get("/auth/me")
            .set("Authorization", `Bearer ${accessToken}`);

        expect(res.status).toBe(401);
    });

    it("GET /admin-check enforces role checks", async () => {
        await createAdmin();

        const adminLogin = await loginAdmin();
        const adminRes = await request(app)
            .get("/auth/admin-check")
            .set("Authorization", `Bearer ${adminLogin.accessToken}`);

        expect(adminRes.status).toBe(200);

        const normalUser = await User.create({
            username: "user1",
            email: "user1@test.com",
            password_hash: await bcrypt.hash("Password123!", 10),
            role: "user",
        });

        const userLogin = await request(app)
            .post("/auth/login")
            .send({ email: normalUser.email, password: "Password123!" });

        const denied = await request(app)
            .get("/auth/admin-check")
            .set("Authorization", `Bearer ${userLogin.body.accessToken}`);

        expect(denied.status).toBe(403);
    });

    it("POST /logout revokes only current session", async () => {
        await createAdmin();

        const login1 = await loginAdmin();
        const login2 = await loginAdmin();

        const logoutRes = await request(app)
            .post("/auth/logout")
            .set("Authorization", `Bearer ${login1.accessToken}`);

        expect(logoutRes.status).toBe(200);

        const sessions = await Session.findAll({ where: { user_id: 1 } });
        const revoked = sessions.filter((s) => !!s.revoked_at);
        const active = sessions.filter((s) => !s.revoked_at);

        expect(revoked.length).toBe(1);
        expect(active.length).toBe(1);

        const stillWorks = await request(app)
            .post("/auth/refresh")
            .set("Cookie", login2.refreshCookie);
        expect(stillWorks.status).toBe(200);
    });

    it("POST /logout-all revokes every active session for the user", async () => {
        await createAdmin();

        const login1 = await loginAdmin();
        await loginAdmin();

        const logoutAllRes = await request(app)
            .post("/auth/logout-all")
            .set("Authorization", `Bearer ${login1.accessToken}`);

        expect(logoutAllRes.status).toBe(200);

        const activeCount = await Session.count({ where: { user_id: 1, revoked_at: null } });
        expect(activeCount).toBe(0);
    });

    it("POST /signup is protected and requires admin role", async () => {
        const unauthenticated = await request(app)
            .post("/auth/signup")
            .send({ username: "u2", email: "u2@test.com", password: "Password123!" });

        expect(unauthenticated.status).toBe(401);

        await createAdmin();
        const adminLogin = await loginAdmin();

        const created = await request(app)
            .post("/auth/signup")
            .set("Authorization", `Bearer ${adminLogin.accessToken}`)
            .send({ username: "u2", email: "u2@test.com", password: "Password123!" });

        expect(created.status).toBe(201);
        expect(created.body.message).toBe("User created successfully");
    });

    it("GET /session-policy returns locked Phase 2 values", async () => {
        const res = await request(app).get("/auth/session-policy");
        expect(res.status).toBe(200);
        expect(res.body.policy.accessTokenTtlSeconds).toBe(900);
        expect(res.body.policy.idleTimeoutSeconds).toBe(1800);
        expect(res.body.policy.absoluteSessionLifetimeSeconds).toBe(43200);
        expect(res.body.policy.multiSessionPerUser).toBe(true);
        expect(res.body.policy.sessionStore).toBe("sqlite");
    });
});
