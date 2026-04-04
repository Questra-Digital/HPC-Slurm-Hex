const express = require("express");
const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const { User, Session } = require("../config/db");
const { generateSecurePassword } = require("../utils/passwordGenerator");
const emailService = require("../services/emailService");
const { SESSION_POLICY } = require("../config/sessionPolicy");
const {
    getNow,
    calculateAbsoluteExpiry,
    isAbsoluteExpired,
    isIdleExpired,
    signAccessToken,
    generateSessionId,
    buildRefreshToken,
    parseSessionIdFromRefreshToken,
    hashRefreshToken,
    setRefreshCookie,
    clearRefreshCookie,
    buildRefreshCookieOptions,
} = require("../services/sessionService");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;

const getDeviceIp = (req) => (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null
);

const sanitizeUserProfile = (user) => ({
    userId: user.id,
    name: user.username,
    role: user.role,
    email: user.email,
});

const auditSecurityEvent = (eventType, details = {}) => {
    const payload = {
        eventType,
        at: new Date().toISOString(),
        ...details,
    };

    console.warn("[SECURITY_EVENT]", payload);
};

const revokeSession = async (session, now = getNow(), compromised = false) => {
    session.revoked_at = session.revoked_at || now;
    if (compromised) {
        session.compromised_at = session.compromised_at || now;
    }
    await session.save();
};

const createSessionAndTokens = async (user, req, existingSession) => {
    const now = getNow();
    const session = existingSession || await Session.create({
        id: generateSessionId(),
        user_id: user.id,
        refresh_token_hash: "pending",
        created_at: now,
        last_activity_at: now,
        expires_at: calculateAbsoluteExpiry(now),
        device_ip: getDeviceIp(req),
        user_agent: req.get("user-agent") || null,
    });

    const refreshToken = buildRefreshToken(session.id);
    session.refresh_token_hash = hashRefreshToken(refreshToken);
    session.last_activity_at = now;

    if (!existingSession) {
        session.expires_at = session.expires_at || calculateAbsoluteExpiry(now);
    }

    await session.save();

    const accessToken = signAccessToken({ user, sessionId: session.id });

    return {
        session,
        accessToken,
        refreshToken,
    };
};

router.get("/check-admin", async (req, res) => {
    const admin = await User.findOne({ where: { role: "admin" } });
    res.json({ adminExists: !!admin });
});

router.get("/session-policy", (req, res) => {
    res.json({
        policy: {
            ...SESSION_POLICY,
            cookie: buildRefreshCookieOptions(),
        }
    });
});

router.post("/setup-admin", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!emailRegex.test(email)) {
            return res.status(400).json({ message: "Invalid email format." });
        }

        if (!passwordRegex.test(password)) {
            return res.status(400).json({
                message: "Password must be at least 6 characters, include 1 uppercase, 1 number, and 1 special character."
            });
        }

        const existingAdmin = await User.findOne({ where: { role: "admin" } });
        if (existingAdmin) return res.status(400).json({ message: "Admin already exists." });

        const hashedPassword = await bcrypt.hash(password, 10);

        await User.create({
            username: "admin",
            email,
            password_hash: hashedPassword,
            role: "admin"
        });

        res.json({ message: "Admin user created successfully." });
    } catch (error) {
        console.error("Error creating admin:", error);
        res.status(500).json({ message: "Error creating admin", error: error.message });
    }
});

router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({
            where: {
                [Op.or]: [{ email }, { username: email }]
            }
        });

        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const { accessToken, refreshToken } = await createSessionAndTokens(user, req);

        setRefreshCookie(res, refreshToken);

        res.json({
            accessToken,
            ...sanitizeUserProfile(user),
        });
    } catch (error) {
        res.status(500).json({ message: "Error logging in", error: error.message });
    }
});

router.post("/refresh", async (req, res) => {
    try {
        const incomingRefreshToken = req.cookies?.[SESSION_POLICY.refreshTokenCookieName];

        if (!incomingRefreshToken) {
            clearRefreshCookie(res);
            return res.status(401).json({ message: "Refresh token is required" });
        }

        const sessionId = parseSessionIdFromRefreshToken(incomingRefreshToken);
        if (!sessionId) {
            clearRefreshCookie(res);
            return res.status(401).json({ message: "Invalid refresh token" });
        }

        const session = await Session.findByPk(sessionId);
        if (!session) {
            clearRefreshCookie(res);
            return res.status(401).json({ message: "Session not found" });
        }

        const now = getNow();

        if (session.revoked_at || session.compromised_at) {
            auditSecurityEvent("REFRESH_REJECTED_INACTIVE_SESSION", {
                sessionId: session.id,
                userId: session.user_id,
            });
            clearRefreshCookie(res);
            return res.status(401).json({ message: "Session is not active" });
        }

        if (isAbsoluteExpired(session.expires_at, now) || isIdleExpired(session.last_activity_at, now)) {
            await revokeSession(session, now);
            auditSecurityEvent("REFRESH_REJECTED_EXPIRED_SESSION", {
                sessionId: session.id,
                userId: session.user_id,
            });
            clearRefreshCookie(res);
            return res.status(401).json({ message: "Session expired" });
        }

        const incomingHash = hashRefreshToken(incomingRefreshToken);

        if (incomingHash !== session.refresh_token_hash) {
            await revokeSession(session, now, true);
            auditSecurityEvent("REFRESH_TOKEN_REUSE_DETECTED", {
                sessionId: session.id,
                userId: session.user_id,
                revokeAllEnabled: SESSION_POLICY.revokeAllOnReuseDetection,
            });

            if (SESSION_POLICY.revokeAllOnReuseDetection) {
                await Session.update(
                    { revoked_at: now, compromised_at: now },
                    {
                        where: {
                            user_id: session.user_id,
                            revoked_at: null,
                        }
                    }
                );
            }

            clearRefreshCookie(res);
            return res.status(401).json({ message: "Refresh token reuse detected" });
        }

        const user = await User.findByPk(session.user_id);
        if (!user) {
            await revokeSession(session, now);
            auditSecurityEvent("REFRESH_REJECTED_USER_NOT_FOUND", {
                sessionId: session.id,
                userId: session.user_id,
            });
            clearRefreshCookie(res);
            return res.status(401).json({ message: "User not found" });
        }

        const { accessToken, refreshToken } = await createSessionAndTokens(user, req, session);
        setRefreshCookie(res, refreshToken);

        return res.json({
            accessToken,
            ...sanitizeUserProfile(user),
        });
    } catch (error) {
        clearRefreshCookie(res);
        return res.status(500).json({ message: "Error refreshing session", error: error.message });
    }
});

router.get("/me", requireAuth(), async (req, res) => {
    const user = await User.findByPk(req.auth.userId, {
        attributes: ["id", "username", "email", "role", "created_at"]
    });

    if (!user) {
        return res.status(404).json({ message: "User not found" });
    }

    return res.json({
        userId: user.id,
        name: user.username,
        email: user.email,
        role: user.role,
        created_at: user.created_at,
        sessionId: req.auth.sessionId,
    });
});

router.get("/admin-check", requireAuth(), requireRole("admin"), (req, res) => {
    res.json({ message: "Admin access granted" });
});

router.post("/logout", requireAuth(), async (req, res) => {
    const session = await Session.findByPk(req.auth.sessionId);
    if (session && !session.revoked_at) {
        await revokeSession(session);
    }

    clearRefreshCookie(res);
    return res.json({ message: "Logged out from current session" });
});

router.post("/logout-all", requireAuth(), async (req, res) => {
    const now = getNow();
    await Session.update(
        { revoked_at: now },
        {
            where: {
                user_id: req.auth.userId,
                revoked_at: null,
            }
        }
    );

    clearRefreshCookie(res);
    return res.json({ message: "Logged out from all sessions" });
});

router.post("/signup", requireAuth(), requireRole("admin"), async (req, res) => {
    try {
        const { username, email, password, role = "user" } = req.body;

        if (!username || !email) {
            return res.status(400).json({
                message: "Username and email are required"
            });
        }

        if (!emailRegex.test(email)) {
            return res.status(400).json({
                message: "Invalid email format"
            });
        }

        const existingUser = await User.findOne({
            where: {
                [Op.or]: [{ email }, { username }]
            }
        });

        if (existingUser) {
            return res.status(400).json({
                message: existingUser.email === email
                    ? "Email already exists"
                    : "Username already exists"
            });
        }

        const plainPassword = (password && password.trim() !== "") ? password : generateSecurePassword(12);

        if (!passwordRegex.test(plainPassword)) {
            return res.status(400).json({
                message: "Password must be at least 6 characters, include 1 uppercase, 1 number, and 1 special character."
            });
        }

        const hashedPassword = await bcrypt.hash(plainPassword, 10);

        const newUser = await User.create({
            username,
            email,
            password_hash: hashedPassword,
            role
        });

        const emailResult = await emailService.sendWelcomeEmail(
            email,
            username,
            plainPassword,
            role
        );

        const response = {
            message: "User created successfully",
            userId: newUser.id,
            username: newUser.username,
            email: newUser.email,
            role: newUser.role,
            emailSent: emailResult.success
        };

        if (!emailResult.success) {
            response.warning = "User created, but email notification failed. Please provide credentials manually.";
            response.emailError = emailResult.message;
        }

        res.status(201).json(response);
    } catch (error) {
        console.error("Error creating user:", error);
        res.status(500).json({
            message: "Error signing up",
            error: error.message
        });
    }
});

module.exports = router;
