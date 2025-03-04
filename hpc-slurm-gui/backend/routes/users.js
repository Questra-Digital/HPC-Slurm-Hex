const express = require("express");
const bcrypt = require("bcryptjs");
const { User, UserGroup, ResourceLimit } = require("../config/db");
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


module.exports = router;