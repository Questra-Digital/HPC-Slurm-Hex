const express = require("express");
const emailService = require("../services/emailService");
const router = express.Router();

/**
 * Send test email to verify email configuration
 * POST /api/email/test
 * Body: { email: "recipient@example.com" }
 */
router.post("/test", async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ 
                message: "Email address is required" 
            });
        }

        const result = await emailService.sendTestEmail(email);
        
        if (result.success) {
            res.json({ 
                message: "Test email sent successfully",
                messageId: result.messageId 
            });
        } else {
            res.status(500).json({ 
                message: "Failed to send test email",
                error: result.message 
            });
        }
    } catch (error) {
        res.status(500).json({ 
            message: "Error sending test email", 
            error: error.message 
        });
    }
});

/**
 * Get email service status and configuration
 * GET /api/email/status
 */
router.get("/status", (req, res) => {
    const status = emailService.getStatus();
    res.json(status);
});

module.exports = router;
