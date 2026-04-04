const { Session } = require("../config/db");
const {
    verifyAccessToken,
    getNow,
    isIdleExpired,
    isAbsoluteExpired,
} = require("../services/sessionService");

const getBearerToken = (req) => {
    const authHeader = req.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return null;
    return authHeader.slice(7).trim();
};

const markSessionRevoked = async (session, now) => {
    if (!session.revoked_at) {
        session.revoked_at = now;
        await session.save();
    }
};

const requireAuth = () => async (req, res, next) => {
    try {
        const token = getBearerToken(req);
        if (!token) {
            return res.status(401).json({ message: "Missing access token" });
        }

        const decoded = verifyAccessToken(token);
        const sessionId = decoded.sessionId;

        if (!sessionId) {
            return res.status(401).json({ message: "Invalid access token session" });
        }

        const session = await Session.findByPk(sessionId);

        if (!session || session.user_id !== decoded.userId) {
            return res.status(401).json({ message: "Session not found" });
        }

        const now = getNow();

        if (session.revoked_at || session.compromised_at) {
            return res.status(401).json({ message: "Session is not active" });
        }

        if (isAbsoluteExpired(session.expires_at, now) || isIdleExpired(session.last_activity_at, now)) {
            await markSessionRevoked(session, now);
            return res.status(401).json({ message: "Session expired" });
        }

        session.last_activity_at = now;
        await session.save();

        req.auth = {
            userId: decoded.userId,
            username: decoded.username,
            email: decoded.email,
            role: decoded.role,
            sessionId,
        };

        return next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({ message: "Access token expired" });
        }

        return res.status(401).json({ message: "Invalid access token" });
    }
};

const requireRole = (...roles) => (req, res, next) => {
    if (!req.auth) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    if (!roles.includes(req.auth.role)) {
        return res.status(403).json({ message: "Forbidden" });
    }

    return next();
};

module.exports = {
    requireAuth,
    requireRole,
};
