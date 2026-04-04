const request = require("supertest");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const authRoutes = require("../routes/auth");
const { User, Session } = global.testDb;
const { buildRefreshToken, hashRefreshToken } = require("../services/sessionService");

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/auth", authRoutes);

describe("Session Store Model", () => {
    it("persists all required session columns", async () => {
        const user = await User.create({
            username: "u1",
            email: "u1@test.com",
            password_hash: await bcrypt.hash("Password123!", 10),
            role: "user",
        });

        const refreshToken = buildRefreshToken("sess-1");
        const session = await Session.create({
            id: "sess-1",
            user_id: user.id,
            refresh_token_hash: hashRefreshToken(refreshToken),
            created_at: new Date(),
            last_activity_at: new Date(),
            expires_at: new Date(Date.now() + 60_000),
            revoked_at: null,
            compromised_at: null,
            device_ip: "127.0.0.1",
            user_agent: "jest-agent",
        });

        const reloaded = await Session.findByPk(session.id);
        expect(reloaded.id).toBe("sess-1");
        expect(reloaded.user_id).toBe(user.id);
        expect(reloaded.refresh_token_hash).toBeTruthy();
        expect(reloaded.created_at).toBeTruthy();
        expect(reloaded.last_activity_at).toBeTruthy();
        expect(reloaded.expires_at).toBeTruthy();
        expect(reloaded.device_ip).toBe("127.0.0.1");
        expect(reloaded.user_agent).toBe("jest-agent");
    });

    it("defines indexes for session lookups", () => {
        const indexFields = Session.options.indexes.map((index) => index.fields.join(","));
        expect(indexFields).toContain("id");
        expect(indexFields).toContain("user_id");
        expect(indexFields).toContain("revoked_at");
        expect(indexFields).toContain("expires_at");
    });

    it("rejects revoked sessions on refresh", async () => {
        const user = await User.create({
            username: "u2",
            email: "u2@test.com",
            password_hash: await bcrypt.hash("Password123!", 10),
            role: "user",
        });

        const refreshToken = buildRefreshToken("sess-revoked");
        await Session.create({
            id: "sess-revoked",
            user_id: user.id,
            refresh_token_hash: hashRefreshToken(refreshToken),
            created_at: new Date(),
            last_activity_at: new Date(),
            expires_at: new Date(Date.now() + 60_000),
            revoked_at: new Date(),
            compromised_at: null,
            device_ip: "127.0.0.1",
            user_agent: "jest-agent",
        });

        const res = await request(app)
            .post("/auth/refresh")
            .set("Cookie", `refresh_token=${refreshToken}`);

        expect(res.status).toBe(401);
    });

    it("rejects compromised sessions on refresh", async () => {
        const user = await User.create({
            username: "u3",
            email: "u3@test.com",
            password_hash: await bcrypt.hash("Password123!", 10),
            role: "user",
        });

        const refreshToken = buildRefreshToken("sess-compromised");
        await Session.create({
            id: "sess-compromised",
            user_id: user.id,
            refresh_token_hash: hashRefreshToken(refreshToken),
            created_at: new Date(),
            last_activity_at: new Date(),
            expires_at: new Date(Date.now() + 60_000),
            revoked_at: null,
            compromised_at: new Date(),
            device_ip: "127.0.0.1",
            user_agent: "jest-agent",
        });

        const res = await request(app)
            .post("/auth/refresh")
            .set("Cookie", `refresh_token=${refreshToken}`);

        expect(res.status).toBe(401);
    });
});
