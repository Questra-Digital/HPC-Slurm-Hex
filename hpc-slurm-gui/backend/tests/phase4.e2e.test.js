const request = require("supertest");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const authRoutes = require("../routes/auth");
const { User, Session } = global.testDb;
const { buildRefreshCookieOptions } = require("../services/sessionService");

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/auth", authRoutes);

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

describe("Phase 4: End-to-end hardening and regression", () => {
  const adminCredentials = {
    username: "admin",
    email: "admin@test.com",
    password: "Password123!",
    role: "admin",
  };

  const createAdmin = async () => {
    await User.create({
      username: adminCredentials.username,
      email: adminCredentials.email,
      password_hash: await bcrypt.hash(adminCredentials.password, 10),
      role: adminCredentials.role,
    });
  };

  const loginWithAgent = async (agent, email = adminCredentials.email, password = adminCredentials.password) => {
    return agent.post("/api/auth/login").send({ email, password });
  };

  it("runs full auth journey: login -> protected -> refresh -> logout -> re-login", async () => {
    await createAdmin();

    const agent = request.agent(app);

    const loginRes = await loginWithAgent(agent);
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.accessToken).toBeDefined();

    const meRes = await agent
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${loginRes.body.accessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.userId).toBeDefined();

    const refreshRes = await agent.post("/api/auth/refresh");
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeDefined();

    const logoutRes = await agent
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${refreshRes.body.accessToken}`);
    expect(logoutRes.status).toBe(200);

    const refreshAfterLogout = await agent.post("/api/auth/refresh");
    expect(refreshAfterLogout.status).toBe(401);

    const reloginRes = await loginWithAgent(agent);
    expect(reloginRes.status).toBe(200);
    expect(reloginRes.body.accessToken).toBeDefined();
  });

  it("keeps second device active when first device logs out", async () => {
    await createAdmin();

    const deviceA = request.agent(app);
    const deviceB = request.agent(app);

    const loginA = await loginWithAgent(deviceA);
    const loginB = await loginWithAgent(deviceB);

    const logoutA = await deviceA
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${loginA.body.accessToken}`);
    expect(logoutA.status).toBe(200);

    const deviceARefresh = await deviceA.post("/api/auth/refresh");
    expect(deviceARefresh.status).toBe(401);

    const deviceBRefresh = await deviceB.post("/api/auth/refresh");
    expect(deviceBRefresh.status).toBe(200);

    const deviceBMe = await deviceB
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${deviceBRefresh.body.accessToken}`);
    expect(deviceBMe.status).toBe(200);
  });

  it("revokes all active devices on logout-all", async () => {
    await createAdmin();

    const deviceA = request.agent(app);
    const deviceB = request.agent(app);

    const loginA = await loginWithAgent(deviceA);
    const loginB = await loginWithAgent(deviceB);

    const logoutAll = await deviceA
      .post("/api/auth/logout-all")
      .set("Authorization", `Bearer ${loginA.body.accessToken}`);
    expect(logoutAll.status).toBe(200);

    const refreshA = await deviceA.post("/api/auth/refresh");
    const refreshB = await deviceB.post("/api/auth/refresh");

    expect(refreshA.status).toBe(401);
    expect(refreshB.status).toBe(401);

    const oldTokenAccess = await deviceB
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${loginB.body.accessToken}`);
    expect(oldTokenAccess.status).toBe(401);
  });

  it("enforces idle and absolute expiry in realistic protected-route flow", async () => {
    await createAdmin();

    const agent = request.agent(app);
    const loginRes = await loginWithAgent(agent);
    const decoded = jwt.verify(loginRes.body.accessToken, process.env.JWT_SECRET);

    const session = await Session.findByPk(decoded.sessionId);
    session.last_activity_at = new Date(Date.now() - (31 * 60 * 1000));
    session.expires_at = new Date(Date.now() + (60 * 60 * 1000));
    await session.save();

    const idleExpiredRes = await agent
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${loginRes.body.accessToken}`);

    expect(idleExpiredRes.status).toBe(401);

    const idleSession = await Session.findByPk(decoded.sessionId);
    expect(idleSession.revoked_at).toBeTruthy();

    const reloginRes = await loginWithAgent(agent);
    const decodedRelogin = jwt.verify(reloginRes.body.accessToken, process.env.JWT_SECRET);
    const absSession = await Session.findByPk(decodedRelogin.sessionId);

    absSession.expires_at = new Date(Date.now() - 2000);
    absSession.last_activity_at = new Date();
    await absSession.save();

    const absoluteExpiredRes = await agent
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${reloginRes.body.accessToken}`);

    expect(absoluteExpiredRes.status).toBe(401);

    const absoluteSession = await Session.findByPk(decodedRelogin.sessionId);
    expect(absoluteSession.revoked_at).toBeTruthy();
  });

  it("keeps auth API contract shape backward-compatible", async () => {
    await createAdmin();

    const agent = request.agent(app);
    const loginRes = await loginWithAgent(agent);

    expect(loginRes.body).toMatchObject({
      accessToken: expect.any(String),
      userId: expect.any(Number),
      name: expect.any(String),
      role: expect.any(String),
      email: expect.any(String),
    });

    const refreshRes = await agent.post("/api/auth/refresh");
    expect(refreshRes.body).toMatchObject({
      accessToken: expect.any(String),
      userId: expect.any(Number),
      name: expect.any(String),
      role: expect.any(String),
      email: expect.any(String),
    });

    const meRes = await agent
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${refreshRes.body.accessToken}`);

    expect(meRes.body).toMatchObject({
      userId: expect.any(Number),
      name: expect.any(String),
      email: expect.any(String),
      role: expect.any(String),
      sessionId: expect.any(String),
    });
  });

  it("verifies refresh cookie security attributes and no token leakage", async () => {
    await createAdmin();

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: adminCredentials.email, password: adminCredentials.password });

    const refreshCookieHeader = getSetCookieHeader(loginRes, "refresh_token");
    const refreshCookie = getCookie(loginRes, "refresh_token");

    expect(refreshCookieHeader).toContain("HttpOnly");
    expect(refreshCookieHeader.toLowerCase()).toContain("samesite=strict");
    expect(refreshCookieHeader).toContain("Path=/api/auth");
    expect(loginRes.body.refreshToken).toBeUndefined();

    const session = await Session.findOne();
    expect(session.refresh_token_hash).toBeTruthy();
    expect(session.refresh_token_hash).not.toContain(refreshCookie || "");

    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const cookieOptions = buildRefreshCookieOptions();
    process.env.NODE_ENV = originalEnv;

    expect(cookieOptions.httpOnly).toBe(true);
    expect(cookieOptions.sameSite).toBe("strict");
    expect(cookieOptions.secure).toBe(true);
  });

  it("emits actionable telemetry for refresh token reuse detection", async () => {
    await createAdmin();

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: adminCredentials.email, password: adminCredentials.password });

    const originalRefreshCookie = getCookie(loginRes, "refresh_token");

    const rotateRes = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", originalRefreshCookie);

    expect(rotateRes.status).toBe(200);

    const reuseRes = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", originalRefreshCookie);

    expect(reuseRes.status).toBe(401);

    const telemetryCall = warnSpy.mock.calls.find((call) => {
      const [, payload] = call;
      return call[0] === "[SECURITY_EVENT]" && payload?.eventType === "REFRESH_TOKEN_REUSE_DETECTED";
    });

    expect(telemetryCall).toBeTruthy();
    expect(telemetryCall[1]).toEqual(expect.objectContaining({
      eventType: "REFRESH_TOKEN_REUSE_DETECTED",
      sessionId: expect.any(String),
      userId: expect.any(Number),
      revokeAllEnabled: expect.any(Boolean),
    }));

    warnSpy.mockRestore();
  });

  it("keeps user creation and role checks working under auth middleware", async () => {
    await createAdmin();

    const adminAgent = request.agent(app);
    const adminLogin = await loginWithAgent(adminAgent);

    const signupRes = await adminAgent
      .post("/api/auth/signup")
      .set("Authorization", `Bearer ${adminLogin.body.accessToken}`)
      .send({
        username: "phase4user",
        email: "phase4user@test.com",
        password: "Password123!",
      });

    expect(signupRes.status).toBe(201);

    const userAgent = request.agent(app);
    const userLogin = await userAgent
      .post("/api/auth/login")
      .send({ email: "phase4user@test.com", password: "Password123!" });

    expect(userLogin.status).toBe(200);

    const userDenied = await userAgent
      .get("/api/auth/admin-check")
      .set("Authorization", `Bearer ${userLogin.body.accessToken}`);

    expect(userDenied.status).toBe(403);

    const adminAllowed = await adminAgent
      .get("/api/auth/admin-check")
      .set("Authorization", `Bearer ${adminLogin.body.accessToken}`);

    expect(adminAllowed.status).toBe(200);
  });
});
