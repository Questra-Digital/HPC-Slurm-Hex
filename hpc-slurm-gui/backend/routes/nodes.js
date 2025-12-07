const express = require("express");
const axios = require("axios");
const { Node } = require("../config/db");
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const router = express.Router();
const port=process.env.SLURM_PORT
router.post("/connect", async (req, res) => {
    const { name, ip, type } = req.body;

    if (!name || !ip || !type) {
        return res.status(400).json({ status: "Invalid Data", message: "Missing required fields" });
    }

    try {
        const response = await axios.get(`http://${ip}:${port}/connect`, { timeout: 5000 });

        if (response.status !== 200 || !response.data || response.data.status !== "active") {
            return res.status(500).json({ status: "Failed", message: "Node health check failed" });
        }

        const { cpu_count, gpu_count, total_memory_gb } = response.data;

        const [node, created] = await Node.findOrCreate({
            where: { ip_address: ip },
            defaults: {
                name,
                ip_address: ip,
                node_type: type,
                cpu_count,
                gpu_count,
                total_memory_gb,
                status: "active",
            },
        });

        if (!created) {
            await node.update({
                name,
                node_type: type,
                cpu_count,
                gpu_count,
                total_memory_gb,
                status: "active",
            });
        }

        return res.json({ status: created ? "Node created" : "Node updated", node });
    } catch (error) {
    console.error("NODE CONNECT ERROR:", error);
    return res.status(500).json({
        status: "Failed",
        message: "Could not connect to node",
        error: error.message
    });
    }
});

router.post("/reset-nodes", async (req, res) => {
    try {
        await Node.destroy({ where: {}, truncate: true });
        res.json({ message: "Node table has been reset successfully" });
    } catch (error) {
        res.status(500).json({ message: "Error resetting the Node table", error });
    }
});

router.get("/get-nodes-list", async (req, res) => {
    const nodes = await Node.findAll();
    res.json(nodes);
});

module.exports = router;
