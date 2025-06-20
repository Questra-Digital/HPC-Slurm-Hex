const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { User } = require("../config/db");
const { Op } = require("sequelize");
const crypto = require("crypto"); 
const router = express.Router();


// const JWT_SECRET = crypto.randomBytes(32).toString('hex');
// Uncomment while testing
const JWT_SECRET = process.env.JWT_SECRET

router.get("/check-admin", async (req, res) => {
    const admin = await User.findOne({ where: { role: "admin" } });
    res.json({ adminExists: !!admin });
});

router.post("/setup-admin", async (req, res) => {
    try {
        const { email, password } = req.body;

       
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ message: "Invalid email format." });
        }

     
        const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;
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

        const token = jwt.sign(
            { username: user.username, email: user.email, role: user.role, userId: user.id },
            JWT_SECRET,
            { expiresIn: "1h" }
        );

        
        res.json({ token, userId: user.id, name: user.username, role: user.role });
    } catch (error) {
        res.status(500).json({ message: "Error logging in", error });
    }
});

router.post("/signup", async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({ username, email, password_hash: hashedPassword, role: "user" });
        res.json({ message: "User created successfully" });
    } catch (error) {
        res.status(500).json({ message: "Error signing up", error });
    }
});

module.exports = router;