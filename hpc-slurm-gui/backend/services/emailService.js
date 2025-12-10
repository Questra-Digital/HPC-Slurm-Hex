const nodemailer = require("nodemailer");
const { getWelcomeEmailTemplate } = require("../templates/welcomeEmail");

// Load environment variables before initializing service
require("dotenv").config();

/**
 * Email Service for HPC Slurm System
 * Handles all email sending operations with error handling and retry logic
 */
class EmailService {
    constructor() {
        this.transporter = null;
        this.isConfigured = false;
        this.config = {
            service: process.env.EMAIL_SERVICE || "gmail",
            host: process.env.EMAIL_HOST || "smtp.gmail.com",
            port: parseInt(process.env.EMAIL_PORT) || 587,
            secure: process.env.EMAIL_SECURE === "true",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            },
            from: process.env.EMAIL_FROM || `"HPC Slurm System" <${process.env.EMAIL_USER}>`,
            enabled: process.env.ENABLE_EMAIL_NOTIFICATIONS !== "false"
        };

        this.appUrl = process.env.APP_URL || "http://localhost:5051";
        
        if (this.config.enabled) {
            this.initialize();
        } else {
            console.log("📧 Email notifications are disabled");
        }
    }

    /**
     * Initialize email transporter with configuration
     */
    initialize() {
        try {
            // Validate required configuration
            if (!this.config.auth.user || !this.config.auth.pass) {
                console.warn("⚠️  Email configuration incomplete. EMAIL_USER and EMAIL_PASSWORD required.");
                console.warn("⚠️  Email notifications will be disabled.");
                this.isConfigured = false;
                return;
            }

            // Create transporter
            this.transporter = nodemailer.createTransport({
                service: this.config.service,
                host: this.config.host,
                port: this.config.port,
                secure: this.config.secure,
                auth: {
                    user: this.config.auth.user,
                    pass: this.config.auth.pass
                },
                tls: {
                    rejectUnauthorized: false
                }
            });

            this.isConfigured = true;
            console.log(`📧 Email service initialized (${this.config.service})`);
            
            // Test connection (async, don't block startup)
            this.verifyConnection();
        } catch (error) {
            console.error("❌ Error initializing email service:", error.message);
            this.isConfigured = false;
        }
    }

    /**
     * Verify SMTP connection (async)
     */
    async verifyConnection() {
        if (!this.transporter) return;

        try {
            await this.transporter.verify();
            console.log("✅ Email service connection verified");
        } catch (error) {
            console.error("⚠️  Email service connection failed:", error.message);
            console.error("⚠️  Emails will not be sent. Please check EMAIL_USER and EMAIL_PASSWORD.");
        }
    }

    /**
     * Send welcome email to newly created user
     * 
     * @param {string} email - Recipient email address
     * @param {string} username - User's username
     * @param {string} password - Temporary password (plaintext)
     * @param {string} role - User's role
     * @returns {Promise<Object>} Result object with success status
     */
    async sendWelcomeEmail(email, username, password, role) {
        // Check if email service is enabled and configured
        if (!this.config.enabled) {
            console.log(`📧 Email notifications disabled. Would have sent welcome email to ${email}`);
            return { 
                success: false, 
                reason: "disabled",
                message: "Email notifications are disabled" 
            };
        }

        if (!this.isConfigured || !this.transporter) {
            console.warn(`⚠️  Email not configured. Cannot send welcome email to ${email}`);
            return { 
                success: false, 
                reason: "not_configured",
                message: "Email service is not properly configured" 
            };
        }

        try {
            // Validate email address
            if (!this.isValidEmail(email)) {
                console.error(`❌ Invalid email address: ${email}`);
                return {
                    success: false,
                    reason: "invalid_email",
                    message: "Invalid email address"
                };
            }

            // Generate email content from template
            const loginUrl = `${this.appUrl}/login`;
            const emailContent = getWelcomeEmailTemplate({
                username,
                email,
                password,
                role,
                loginUrl
            });

            // Send email with retry logic
            const result = await this.sendEmailWithRetry({
                from: this.config.from,
                to: email,
                subject: emailContent.subject,
                text: emailContent.text,
                html: emailContent.html
            });

            if (result.success) {
                console.log(`✅ Welcome email sent to ${email} (${username})`);
            }

            return result;
        } catch (error) {
            console.error(`❌ Error sending welcome email to ${email}:`, error.message);
            return {
                success: false,
                reason: "send_error",
                message: error.message,
                error: error
            };
        }
    }

    /**
     * Send email with retry logic for transient failures
     * 
     * @param {Object} mailOptions - Nodemailer mail options
     * @param {number} maxRetries - Maximum retry attempts
     * @returns {Promise<Object>} Result object
     */
    async sendEmailWithRetry(mailOptions, maxRetries = 2) {
        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const info = await this.transporter.sendMail(mailOptions);
                
                return {
                    success: true,
                    messageId: info.messageId,
                    response: info.response,
                    attempt: attempt
                };
            } catch (error) {
                lastError = error;
                console.warn(`⚠️  Email send attempt ${attempt}/${maxRetries} failed: ${error.message}`);

                // Don't retry on authentication errors or invalid recipient
                if (this.isPermanentError(error)) {
                    console.error(`❌ Permanent email error, not retrying: ${error.message}`);
                    break;
                }

                // Wait before retry (exponential backoff)
                if (attempt < maxRetries) {
                    const delayMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s...
                    console.log(`⏳ Retrying in ${delayMs}ms...`);
                    await this.delay(delayMs);
                }
            }
        }

        return {
            success: false,
            reason: "send_failed",
            message: lastError.message,
            error: lastError
        };
    }

    /**
     * Check if error is permanent (should not retry)
     * 
     * @param {Error} error - Error object
     * @returns {boolean} True if permanent error
     */
    isPermanentError(error) {
        const permanentCodes = [
            'EAUTH', // Authentication failed
            'EENVELOPE', // Invalid recipient
            'EMESSAGE' // Invalid message format
        ];

        return permanentCodes.some(code => 
            error.code === code || error.message.includes(code)
        );
    }

    /**
     * Validate email address format
     * 
     * @param {string} email - Email address to validate
     * @returns {boolean} True if valid
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Delay helper for retry logic
     * 
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise} Promise that resolves after delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Send test email to verify configuration
     * 
     * @param {string} recipientEmail - Email address to send test to
     * @returns {Promise<Object>} Result object
     */
    async sendTestEmail(recipientEmail) {
        if (!this.isConfigured || !this.transporter) {
            return {
                success: false,
                message: "Email service is not configured"
            };
        }

        try {
            const result = await this.sendEmailWithRetry({
                from: this.config.from,
                to: recipientEmail,
                subject: "HPC Slurm System - Test Email",
                text: "This is a test email from HPC Slurm System. If you received this, email configuration is working correctly!",
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4;">
                        <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px;">
                            <h2 style="color: #667eea;">✅ Email Configuration Test</h2>
                            <p>This is a test email from <strong>HPC Slurm System</strong>.</p>
                            <p>If you received this, your email configuration is working correctly!</p>
                            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                            <p style="color: #666; font-size: 12px;">Sent at: ${new Date().toLocaleString()}</p>
                        </div>
                    </div>
                `
            });

            if (result.success) {
                console.log(`✅ Test email sent to ${recipientEmail}`);
            }

            return result;
        } catch (error) {
            console.error(`❌ Error sending test email:`, error.message);
            return {
                success: false,
                message: error.message,
                error: error
            };
        }
    }

    /**
     * Get email service status
     * 
     * @returns {Object} Service status information
     */
    getStatus() {
        return {
            enabled: this.config.enabled,
            configured: this.isConfigured,
            service: this.config.service,
            host: this.config.host,
            port: this.config.port,
            from: this.config.from,
            user: this.config.auth.user ? this.maskEmail(this.config.auth.user) : null
        };
    }

    /**
     * Mask email address for logging (show first 3 chars and domain)
     * 
     * @param {string} email - Email to mask
     * @returns {string} Masked email
     */
    maskEmail(email) {
        if (!email) return null;
        const [username, domain] = email.split('@');
        const maskedUsername = username.substring(0, 3) + '***';
        return `${maskedUsername}@${domain}`;
    }
}

// Create singleton instance
const emailService = new EmailService();

module.exports = emailService;
