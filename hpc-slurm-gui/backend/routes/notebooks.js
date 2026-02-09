const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const { NotebookSession, NotebookPermission, User, Group, UserGroup, Node } = require("../config/db");
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const router = express.Router();
const SLURM_PORT = process.env.SLURM_PORT;

// Helper: Get master node IP
const getMasterNodeIp = async () => {
    const masterNode = await Node.findOne({ where: { node_type: 'master' } });
    return masterNode ? masterNode.ip_address : null;
};

// Helper: Check if user has notebook permission
const checkNotebookPermission = async (userId) => {
    const user = await User.findByPk(userId);
    if (!user) return { allowed: false, workers: [] };

    // Admin always has access to all workers
    if (user.role === "admin") {
        const workers = await Node.findAll({ where: { node_type: 'worker', status: 'active' } });
        return { allowed: true, workers: workers.map(w => w.ip_address) };
    }

    // Check user-specific permission first
    const userPerm = await NotebookPermission.findOne({ where: { user_id: userId, group_id: null } });
    if (userPerm && userPerm.allowed) {
        return { allowed: true, workers: userPerm.allowed_workers || [] };
    }

    // Check group permissions
    const userGroups = await UserGroup.findAll({ where: { user_id: userId } });
    const groupIds = userGroups.map(ug => ug.group_id);

    for (const groupId of groupIds) {
        const groupPerm = await NotebookPermission.findOne({ where: { group_id: groupId, user_id: null } });
        if (groupPerm && groupPerm.allowed) {
            return { allowed: true, workers: groupPerm.allowed_workers || [] };
        }
    }

    return { allowed: false, workers: [] };
};

// GET /notebooks/check-permission/:userId - Check user's notebook permissions
router.get("/check-permission/:userId", async (req, res) => {
    try {
        const permission = await checkNotebookPermission(req.params.userId);
        res.json(permission);
    } catch (error) {
        console.error("Permission check error:", error);
        res.status(500).json({ error: error.message });
    }
});

// GET /notebooks/sessions/:userId - Get user's active notebook sessions
router.get("/sessions/:userId", async (req, res) => {
    try {
        const sessions = await NotebookSession.findAll({
            where: { user_id: req.params.userId, status: 'running' }
        });
        res.json(sessions);
    } catch (error) {
        console.error("Sessions fetch error:", error);
        res.status(500).json({ error: error.message });
    }
});

// GET /notebooks/all-sessions - Get all active sessions (admin only)
router.get("/all-sessions", async (req, res) => {
    try {
        const sessions = await NotebookSession.findAll({
            where: { status: 'running' }
        });
        res.json(sessions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /notebooks/start - Start a new notebook session
router.post("/start", async (req, res) => {
    try {
        const { userId, workerIp } = req.body;

        if (!userId || !workerIp) {
            return res.status(400).json({ error: "userId and workerIp are required" });
        }

        // Check permission
        const permission = await checkNotebookPermission(userId);
        if (!permission.allowed) {
            return res.status(403).json({ error: "Notebook access not permitted" });
        }
        if (!permission.workers.includes(workerIp)) {
            return res.status(403).json({ error: "Access to this worker is not permitted" });
        }

        // Check for existing session on same worker
        const existing = await NotebookSession.findOne({
            where: { user_id: userId, worker_ip: workerIp, status: 'running' }
        });
        if (existing) {
            return res.json({
                message: "Session already running",
                session: {
                    id: existing.id,
                    workerIp: existing.worker_ip,
                    port: existing.worker_port,
                    token: existing.token,
                    url: `/api/notebooks/proxy/${existing.worker_ip}/${existing.worker_port}/?token=${existing.token}`
                }
            });
        }

        // Generate secure token
        const token = crypto.randomBytes(32).toString('hex');

        // Find available port (8888-8899)
        const usedPorts = await NotebookSession.findAll({
            where: { worker_ip: workerIp, status: 'running' },
            attributes: ['worker_port']
        });
        const usedPortNumbers = usedPorts.map(s => s.worker_port);
        let port = 8888;
        while (usedPortNumbers.includes(port) && port < 8900) port++;

        if (port >= 8900) {
            return res.status(503).json({ error: "No available ports on this worker" });
        }

        // Create session record
        const session = await NotebookSession.create({
            user_id: userId,
            worker_ip: workerIp,
            worker_port: port,
            token: token,
            status: 'starting'
        });

        // Start notebook via master proxy
        const masterIp = await getMasterNodeIp();
        if (!masterIp) {
            await session.update({ status: 'error' });
            return res.status(500).json({ error: "Master node not configured" });
        }

        try {
            const response = await axios.post(
                `http://${masterIp}:${SLURM_PORT}/notebook/start`,
                { workerIp, port, token },
                { timeout: 30000 }
            );

            await session.update({
                status: 'running',
                pid: response.data.pid
            });

            console.log(`Notebook started for user ${userId} on ${workerIp}:${port}`);

            res.json({
                message: "Notebook started",
                session: {
                    id: session.id,
                    workerIp,
                    port,
                    token,
                    url: `/api/notebooks/proxy/${workerIp}/${port}/?token=${token}`
                }
            });
        } catch (err) {
            console.error("Failed to start notebook:", err.message);
            await session.update({ status: 'error' });
            res.status(500).json({ error: "Failed to start notebook", details: err.message });
        }
    } catch (error) {
        console.error("Notebook start error:", error);
        res.status(500).json({ error: error.message });
    }
});

// POST /notebooks/stop - Stop a notebook session
router.post("/stop", async (req, res) => {
    try {
        const { sessionId, userId } = req.body;

        const session = await NotebookSession.findOne({
            where: { id: sessionId, user_id: userId }
        });

        if (!session) {
            return res.status(404).json({ error: "Session not found" });
        }

        const masterIp = await getMasterNodeIp();
        if (masterIp) {
            try {
                await axios.post(
                    `http://${masterIp}:${SLURM_PORT}/notebook/stop`,
                    { workerIp: session.worker_ip, port: session.worker_port, pid: session.pid },
                    { timeout: 10000 }
                );
            } catch (err) {
                console.error("Failed to stop notebook on worker:", err.message);
                // Continue to update status even if worker call fails
            }
        }

        await session.update({ status: 'stopped', stopped_at: new Date() });
        console.log(`Notebook stopped for session ${sessionId}`);
        res.json({ message: "Notebook stopped" });
    } catch (error) {
        console.error("Notebook stop error:", error);
        res.status(500).json({ error: error.message });
    }
});

// GET /notebooks/resources/:workerIp - Get worker resource usage (for real-time graphs)
router.get("/resources/:workerIp", async (req, res) => {
    try {
        const masterIp = await getMasterNodeIp();
        if (!masterIp) {
            return res.status(500).json({ error: "Master node not configured" });
        }

        const response = await axios.get(
            `http://${masterIp}:${SLURM_PORT}/notebook/resources/${req.params.workerIp}`,
            { timeout: 5000 }
        );
        res.json(response.data);
    } catch (error) {
        console.error("Resource fetch error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// Proxy endpoint for notebook iframe - handles all Jupyter requests
router.all("/proxy/:workerIp/:port/*", async (req, res) => {
    try {
        const { workerIp, port } = req.params;
        const subPath = req.params[0] || '';
        const masterIp = await getMasterNodeIp();

        if (!masterIp) {
            return res.status(500).json({ error: "Master node not configured" });
        }

        const targetUrl = `http://${masterIp}:${SLURM_PORT}/notebook/proxy/${workerIp}/${port}/${subPath}`;

        const response = await axios({
            method: req.method,
            url: targetUrl,
            params: req.query,
            data: req.body,
            headers: {
                ...req.headers,
                host: `${workerIp}:${port}`
            },
            responseType: 'stream',
            timeout: 60000
        });

        res.status(response.status);
        Object.entries(response.headers).forEach(([key, value]) => {
            if (key.toLowerCase() !== 'transfer-encoding') {
                res.setHeader(key, value);
            }
        });
        response.data.pipe(res);
    } catch (error) {
        console.error("Proxy error:", error.message);
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});

// ==========================================
// Admin routes for managing permissions
// ==========================================

// GET /notebooks/permissions - Get all notebook permissions
router.get("/permissions", async (req, res) => {
    try {
        const permissions = await NotebookPermission.findAll();
        res.json(permissions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /notebooks/permissions/:type/:id - Get specific permission (type = 'user' or 'group')
router.get("/permissions/:type/:id", async (req, res) => {
    try {
        const { type, id } = req.params;
        const whereClause = type === 'user'
            ? { user_id: id, group_id: null }
            : { group_id: id, user_id: null };

        const permission = await NotebookPermission.findOne({ where: whereClause });
        res.json(permission || { allowed: false, allowed_workers: [] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /notebooks/permissions - Create or update permission
router.post("/permissions", async (req, res) => {
    try {
        const { user_id, group_id, allowed, allowed_workers } = req.body;

        if (!user_id && !group_id) {
            return res.status(400).json({ error: "User ID or Group ID required" });
        }

        if (user_id && group_id) {
            return res.status(400).json({ error: "Provide either user_id or group_id, not both" });
        }

        const whereClause = user_id
            ? { user_id, group_id: null }
            : { group_id, user_id: null };

        const [perm, created] = await NotebookPermission.findOrCreate({
            where: whereClause,
            defaults: { user_id: user_id || null, group_id: group_id || null, allowed, allowed_workers: allowed_workers || [] }
        });

        if (!created) {
            await perm.update({ allowed, allowed_workers: allowed_workers || [] });
        }

        console.log(`Notebook permission ${created ? 'created' : 'updated'} for ${user_id ? 'user' : 'group'} ${user_id || group_id}`);
        res.json({ message: created ? "Permission created" : "Permission updated", permission: perm });
    } catch (error) {
        console.error("Permission update error:", error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /notebooks/permissions/:id - Delete a permission
router.delete("/permissions/:id", async (req, res) => {
    try {
        const deleted = await NotebookPermission.destroy({ where: { id: req.params.id } });
        if (deleted) {
            res.json({ message: "Permission deleted" });
        } else {
            res.status(404).json({ error: "Permission not found" });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /notebooks/available-workers - Get list of active worker nodes (for admin UI)
router.get("/available-workers", async (req, res) => {
    try {
        const workers = await Node.findAll({
            where: { node_type: 'worker', status: 'active' },
            attributes: ['ip_address', 'name', 'cpu_count', 'gpu_count', 'total_memory_gb']
        });
        res.json(workers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
