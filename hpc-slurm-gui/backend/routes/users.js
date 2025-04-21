const express = require("express");
const bcrypt = require("bcryptjs");
const { User, Group, UserGroup, ResourceLimit } = require("../config/db");
const router = express.Router();


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

router.get("/user-groups", async (req, res) => {
    try {
        const userGroups = await UserGroup.findAll();
        res.json(userGroups);
    } catch (error) {
        console.error("Error fetching user-groups:", error);
        res.status(500).json({ message: "Error fetching user-groups", error: error.message });
    }
});

router.post("/user-groups", async (req, res) => {
    try {
        const { user_id, group_id } = req.body;
        
        if (!user_id || !group_id) {
            return res.status(400).json({ message: "User ID and Group ID are required" });
        }
        
        const user = await User.findByPk(user_id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        
        const group = await Group.findByPk(group_id);
        if (!group) {
            return res.status(404).json({ message: "Group not found" });
        }
        
        const existingRelation = await UserGroup.findOne({
            where: { user_id, group_id }
        });
        
        if (existingRelation) {
            return res.status(400).json({ message: "User is already a member of this group" });
        }
        
        await UserGroup.create({ user_id, group_id });
        res.status(201).json({ message: "User added to group successfully" });
    } catch (error) {
        console.error("Error adding user to group:", error);
        res.status(500).json({ message: "Error adding user to group", error: error.message });
    }
});

router.delete("/user-groups", async (req, res) => {
    try {
        const { user_id, group_id } = req.body;
        
        if (!user_id || !group_id) {
            return res.status(400).json({ message: "User ID and Group ID are required" });
        }
        
        const relation = await UserGroup.findOne({
            where: { user_id, group_id }
        });
        
        if (!relation) {
            return res.status(404).json({ message: "User is not a member of this group" });
        }
        
        await relation.destroy();
        res.json({ message: "User removed from group successfully" });
    } catch (error) {
        console.error("Error removing user from group:", error);
        res.status(500).json({ message: "Error removing user from group", error: error.message });
    }
});

router.get("/groups/:groupId/users", async (req, res) => {
    try {
        const { groupId } = req.params;
        
        const userGroups = await UserGroup.findAll({
            where: { group_id: groupId }
        });
        
        const userIds = userGroups.map(ug => ug.user_id);
        
        const users = await User.findAll({
            where: { id: userIds },
            attributes: ['id', 'username', 'email', 'role']
        });
        
        res.json(users);
    } catch (error) {
        console.error("Error fetching users in group:", error);
        res.status(500).json({ message: "Error fetching users in group", error: error.message });
    }
});

router.get("/users/:userId/groups", async (req, res) => {
    try {
        const { userId } = req.params;
        
        const userGroups = await UserGroup.findAll({
            where: { user_id: userId }
        });
        
        const groupIds = userGroups.map(ug => ug.group_id);
        
        const groups = await Group.findAll({
            where: { id: groupIds }
        });
        
        res.json(groups);
    } catch (error) {
        console.error("Error fetching groups for user:", error);
        res.status(500).json({ message: "Error fetching groups for user", error: error.message });
    }
});

module.exports = router;