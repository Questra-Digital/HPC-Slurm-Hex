const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { SESSION_POLICY } = require("../config/sessionPolicy");

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error("JWT_SECRET must be configured for session handling.");
}

const getNow = () => new Date();

const toMs = (seconds) => seconds * 1000;

const calculateAbsoluteExpiry = (createdAt = getNow()) => (
    new Date(createdAt.getTime() + toMs(SESSION_POLICY.absoluteSessionLifetimeSeconds))
);

const isIdleExpired = (lastActivityAt, now = getNow()) => {
    if (!lastActivityAt) return true;
    return now.getTime() - new Date(lastActivityAt).getTime() > toMs(SESSION_POLICY.idleTimeoutSeconds);
};

const isAbsoluteExpired = (expiresAt, now = getNow()) => {
    if (!expiresAt) return true;
    return now.getTime() > new Date(expiresAt).getTime();
};

const signAccessToken = ({ user, sessionId }) => jwt.sign(
    {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        sessionId,
    },
    JWT_SECRET,
    { expiresIn: SESSION_POLICY.accessTokenJwtExpiresIn }
);

const verifyAccessToken = (token) => jwt.verify(token, JWT_SECRET);

const generateSessionId = () => crypto.randomUUID();

const generateRefreshTokenSecret = () => crypto.randomBytes(SESSION_POLICY.refreshTokenBytes).toString("hex");

const buildRefreshToken = (sessionId, secret = generateRefreshTokenSecret()) => `${sessionId}.${secret}`;

const parseSessionIdFromRefreshToken = (token) => {
    if (!token || typeof token !== "string") return null;
    const [sessionId] = token.split(".");
    return sessionId || null;
};

const hashRefreshToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const buildRefreshCookieOptions = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: SESSION_POLICY.refreshTokenCookieSameSite,
    path: SESSION_POLICY.refreshTokenCookiePath,
    maxAge: toMs(SESSION_POLICY.absoluteSessionLifetimeSeconds),
});

const setRefreshCookie = (res, refreshToken) => {
    res.cookie(SESSION_POLICY.refreshTokenCookieName, refreshToken, buildRefreshCookieOptions());
};

const clearRefreshCookie = (res) => {
    res.clearCookie(SESSION_POLICY.refreshTokenCookieName, {
        ...buildRefreshCookieOptions(),
        maxAge: undefined,
    });
};

module.exports = {
    getNow,
    calculateAbsoluteExpiry,
    isIdleExpired,
    isAbsoluteExpired,
    signAccessToken,
    verifyAccessToken,
    generateSessionId,
    buildRefreshToken,
    parseSessionIdFromRefreshToken,
    hashRefreshToken,
    setRefreshCookie,
    clearRefreshCookie,
    buildRefreshCookieOptions,
};
