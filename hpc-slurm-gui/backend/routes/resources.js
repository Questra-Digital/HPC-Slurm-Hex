const express = require("express");
const axios = require("axios");
const { ResourceLimit } = require("../config/db");
const router = express.Router();

router.get("/resource-limits", async (req, res) => {
    try {
        const { user_id, group_id } = req.query;
        let whereClause = {};
        
        if (user_id) whereClause.user_id = user_id;
        if (group_id) whereClause.group_id = group_id;

        const resourceLimit = await ResourceLimit.findOne({ where: whereClause });
        res.json(resourceLimit || {
            max_cpu: 0,
            max_gpu: 0,
            max_memory: 0,
        });
    } catch (error) {
        console.error("Error fetching resource limits:", error);
        res.status(500).json({ message: "Error fetching resource limits", error: error.message });
    }
});

router.post("/resource-limits", async (req, res) => {
    try {
        const { user_id, group_id, max_cpu, max_gpu, max_memory } = req.body;

        if (!user_id && !group_id) {
            return res.status(400).json({ message: "Either user_id or group_id must be provided" });
        }

        if (user_id && group_id) {
            return res.status(400).json({ message: "Only one of user_id or group_id should be provided" });
        }

        const data = {
            max_cpu: parseInt(max_cpu) || 0,
            max_gpu: parseInt(max_gpu) || 0,
            max_memory: parseInt(max_memory) || 0,
            updated_at: new Date()
        };

        if (user_id) data.user_id = user_id;
        if (group_id) data.group_id = group_id;

        const [resourceLimit, created] = await ResourceLimit.findOrCreate({
            where: user_id ? { user_id, group_id: null } : { group_id, user_id: null },
            defaults: data
        });

        if (!created) {
            await resourceLimit.update(data);
        }

        res.status(created ? 201 : 200).json({ 
            message: created ? "Resource limit created" : "Resource limit updated",
            resourceLimit 
        });
    } catch (error) {
        console.error("Error saving resource limits:", error);
        res.status(500).json({ message: "Error saving resource limits", error: error.message });
    }
});

router.delete("/resource-limits", async (req, res) => {
    try {
        const { user_id, group_id } = req.query;

        if (!user_id && !group_id) {
            return res.status(400).json({ message: "Either user_id or group_id must be provided" });
        }

        const whereClause = user_id ? { user_id, group_id: null } : { group_id, user_id: null };
        const deleted = await ResourceLimit.destroy({ where: whereClause });

        if (deleted) {
            res.json({ message: "Resource limit deleted successfully" });
        } else {
            res.status(404).json({ message: "Resource limit not found" });
        }
    } catch (error) {
        console.error("Error deleting resource limits:", error);
        res.status(500).json({ message: "Error deleting resource limits", error: error.message });
    }
});


module.exports = router;