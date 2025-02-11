const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const { Sequelize, DataTypes } = require("sequelize");
const axios = require("axios");

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || "secret";

// Initialize SQLite Database
const sequelize = new Sequelize({
    dialect: "sqlite",
    storage: "./database.sqlite"
});

// Define User Model
const User = sequelize.define("User", {
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING, defaultValue: "user" }
});

// Define Node Model (Stores Master & Worker Nodes)
const Node = sequelize.define("Node", {
    name: { type: DataTypes.STRING, allowNull: false },
    ip: { type: DataTypes.STRING, allowNull: false },
    port: { type: DataTypes.INTEGER, allowNull: false },
    type: { type: DataTypes.STRING, allowNull: false }, // "master" or "worker"
    status: { type: DataTypes.STRING, allowNull: true }, // New field for status
});

// Sync Database
sequelize.sync().then(() => console.log("Database & tables created!"));

// Check if Admin Exists
app.get("/check-admin", async (req, res) => {
    const admin = await User.findOne({ where: { role: "admin" } });
    res.json({ adminExists: !!admin });
});

// Set up Admin User
app.post("/setup-admin", async (req, res) => {
    try {
        const { password } = req.body;

        const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(password)) {
            return res.status(400).json({
                message: "Password must be at least 8 characters, include 1 uppercase, 1 number, and 1 special character."
            });
        }

        const admin = await User.findOne({ where: { role: "admin" } });
        if (admin) return res.status(400).json({ message: "Admin already exists." });

        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({ name: "Admin", email: "admin@example.com", password: hashedPassword, role: "admin" });

        res.json({ message: "Admin user created successfully." });
    } catch (error) {
        res.status(500).json({ message: "Error creating admin", error });
    }
});

// Login Route
app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ where: { email } });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const token = jwt.sign({ name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "1h" });
        res.json({ token, name: user.name, role: user.role });
    } catch (error) {
        res.status(500).json({ message: "Error logging in", error });
    }
});

// Connect to Remote Node and Save in Database
app.post("/connect", async (req, res) => {
    const { name, ip, port, type } = req.body;

    if (!name || !ip || !port || !type) {
        return res.status(400).json({ status: "Invalid Data" });
    }

    try {
        // Send a request to the remote node
        const response = await axios.get(`http://${ip}:${port}/health-check`, { timeout: 5000 });

        let status = "Failed to Connect";

        if (response.status === 200) {
            status = "Connected and Saved";
        }

        // Check if node with same ip and port already exists
        const existingNode = await Node.findOne({ where: { ip, port } });

        if (existingNode) {
            // If node exists, update its details
            existingNode.name = name;
            existingNode.type = type;
            existingNode.status = status;
            await existingNode.save();
            return res.json({ status: "Node updated" });
        } else {
            // If no node exists, create a new one
            await Node.create({ name, ip, port, type, status });
            return res.json({ status: "Node created" });
        }
    } catch (error) {
        return res.status(500).json({ status: "Failed to Connect" });
    }
});

// Reset Node Table
app.post("/reset-nodes", async (req, res) => {
    try {
        // Delete all records in the Node table
        await Node.destroy({ where: {}, truncate: true });

        res.json({ message: "Node table has been reset successfully" });
    } catch (error) {
        res.status(500).json({ message: "Error resetting the Node table", error });
    }
});

// Get All Connected Nodes
app.get("/nodes", async (req, res) => {
    const nodes = await Node.findAll();
    res.json(nodes); // Nodes will now include status field
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
