const express = require("express");
const bcrypt = require("bcryptjs");
const { User, Group, UserGroup, ResourceLimit } = require("../config/db");
const router = express.Router();

// User routes
router.get("/users", async (req, res) => {
    try {
        const users = await User.findAll({
            attributes: ['id', 'username', 'email', 'role', 'created_at']
        });
        res.json(users);
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ message: "Error fetching users", error: error.message });
    }
});

router.put("/users/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { username, email, password, role } = req.body;
        
        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const updates = {};
        if (username) updates.username = username;
        if (email) updates.email = email;
        if (password) updates.password_hash = await bcrypt.hash(password, 10);
        if (role) updates.role = role;

        await user.update(updates);
        res.json({ message: "User updated successfully" });
    } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).json({ message: "Error updating user", error: error.message });
    }
});

router.delete("/users/:id", async (req, res) => {
    try {
        const { id } = req.params;
        
        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        await UserGroup.destroy({ where: { user_id: id } });
        await ResourceLimit.destroy({ where: { user_id: id } });
        await user.destroy();
        
        res.json({ message: "User deleted successfully" });
    } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).json({ message: "Error deleting user", error: error.message });
    }
});

// Group routes
router.get("/groups", async (req, res) => {
    try {
        const groups = await Group.findAll();
        res.json(groups);
    } catch (error) {
        console.error("Error fetching groups:", error);
        res.status(500).json({ message: "Error fetching groups", error: error.message });
    }
});

router.post("/groups", async (req, res) => {
    try {
        const { name } = req.body;
        
        if (!name || name.trim() === "") {
            return res.status(400).json({ message: "Group name is required" });
        }
        
        const existingGroup = await Group.findOne({ where: { name } });
        if (existingGroup) {
            return res.status(400).json({ message: "A group with this name already exists" });
        }
        
        const newGroup = await Group.create({ name });
        res.status(201).json(newGroup);
    } catch (error) {
        console.error("Error creating group:", error);
        res.status(500).json({ message: "Error creating group", error: error.message });
    }
});

router.put("/groups/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        
        const group = await Group.findByPk(id);
        if (!group) {
            return res.status(404).json({ message: "Group not found" });
        }

        if (name) await group.update({ name });
        res.json({ message: "Group updated successfully" });
    } catch (error) {
        console.error("Error updating group:", error);
        res.status(500).json({ message: "Error updating group", error: error.message });
    }
});

router.delete("/groups/:id", async (req, res) => {
    try {
        const { id } = req.params;
        
        const group = await Group.findByPk(id);
        if (!group) {
            return res.status(404).json({ message: "Group not found" });
        }

        await UserGroup.destroy({ where: { group_id: id } });
        await ResourceLimit.destroy({ where: { group_id: id } });
        await group.destroy();
        
        res.json({ message: "Group deleted successfully" });
    } catch (error) {
        console.error("Error deleting group:", error);
        res.status(500).json({ message: "Error deleting group", error: error.message });
    }
});
module.exports = router;