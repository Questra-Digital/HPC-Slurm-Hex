const { generateSecurePassword } = require('../utils/passwordGenerator');
const emailService = require('../services/emailService');

describe('Email Service Tests', () => {
    describe('Password Generator', () => {
        test('should generate password with default length', () => {
            const password = generateSecurePassword();
            expect(password).toBeDefined();
            expect(password.length).toBe(12);
        });

        test('should generate password with custom length', () => {
            const password = generateSecurePassword(16);
            expect(password).toBeDefined();
            expect(password.length).toBe(16);
        });

        test('should meet password requirements', () => {
            const password = generateSecurePassword();
            const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;
            expect(passwordRegex.test(password)).toBe(true);
        });

        test('should generate unique passwords', () => {
            const password1 = generateSecurePassword();
            const password2 = generateSecurePassword();
            expect(password1).not.toBe(password2);
        });

        test('should handle minimum length constraint', () => {
            const password = generateSecurePassword(4); // Less than minimum
            expect(password.length).toBeGreaterThanOrEqual(8);
        });
    });

    describe('Email Service Configuration', () => {
        test('should have email service instance', () => {
            expect(emailService).toBeDefined();
        });

        test('should get service status', () => {
            const status = emailService.getStatus();
            expect(status).toHaveProperty('enabled');
            expect(status).toHaveProperty('configured');
            expect(status).toHaveProperty('service');
            expect(status).toHaveProperty('host');
            expect(status).toHaveProperty('port');
        });

        test('should validate email addresses', () => {
            expect(emailService.isValidEmail('test@example.com')).toBe(true);
            expect(emailService.isValidEmail('invalid.email')).toBe(false);
            expect(emailService.isValidEmail('missing@domain')).toBe(false);
            expect(emailService.isValidEmail('@example.com')).toBe(false);
            expect(emailService.isValidEmail('test@')).toBe(false);
        });

        test('should mask email addresses', () => {
            const masked = emailService.maskEmail('testuser@example.com');
            expect(masked).toBe('tes***@example.com');
        });

        test('should handle null email in masking', () => {
            const masked = emailService.maskEmail(null);
            expect(masked).toBeNull();
        });
    });

    describe('Email Service Error Handling', () => {
        test('should identify permanent errors', () => {
            const authError = new Error('EAUTH: Authentication failed');
            authError.code = 'EAUTH';
            expect(emailService.isPermanentError(authError)).toBe(true);

            const envelopeError = new Error('EENVELOPE: Invalid recipient');
            envelopeError.code = 'EENVELOPE';
            expect(emailService.isPermanentError(envelopeError)).toBe(true);

            const messageError = new Error('EMESSAGE: Invalid message');
            messageError.code = 'EMESSAGE';
            expect(emailService.isPermanentError(messageError)).toBe(true);
        });

        test('should identify transient errors', () => {
            const timeoutError = new Error('ETIMEDOUT: Connection timeout');
            timeoutError.code = 'ETIMEDOUT';
            expect(emailService.isPermanentError(timeoutError)).toBe(false);

            const connectionError = new Error('ECONNECTION: Connection refused');
            connectionError.code = 'ECONNECTION';
            expect(emailService.isPermanentError(connectionError)).toBe(false);
        });

        test('should handle invalid email in sendWelcomeEmail', async () => {
            const result = await emailService.sendWelcomeEmail(
                'invalid-email',
                'testuser',
                'Password123!',
                'user'
            );

            expect(result.success).toBe(false);
            expect(result.reason).toBe('invalid_email');
        });
    });

    describe('Email Service Functionality', () => {
        test('should return appropriate response when email is disabled', async () => {
            // Save original config
            const originalEnabled = emailService.config.enabled;
            
            // Temporarily disable email
            emailService.config.enabled = false;

            const result = await emailService.sendWelcomeEmail(
                'test@example.com',
                'testuser',
                'Password123!',
                'user'
            );

            expect(result.success).toBe(false);
            expect(result.reason).toBe('disabled');

            // Restore config
            emailService.config.enabled = originalEnabled;
        });

        test('should return appropriate response when not configured', async () => {
            // Save original config
            const originalConfigured = emailService.isConfigured;
            
            // Temporarily mark as not configured
            emailService.isConfigured = false;

            const result = await emailService.sendWelcomeEmail(
                'test@example.com',
                'testuser',
                'Password123!',
                'user'
            );

            expect(result.success).toBe(false);
            expect(result.reason).toBe('not_configured');

            // Restore config
            emailService.isConfigured = originalConfigured;
        });
    });

    describe('Delay Helper', () => {
        test('should delay execution', async () => {
            const startTime = Date.now();
            await emailService.delay(100);
            const endTime = Date.now();
            const elapsed = endTime - startTime;
            
            // Allow some tolerance for timing
            expect(elapsed).toBeGreaterThanOrEqual(90);
            expect(elapsed).toBeLessThan(200);
        });
    });
});

describe('Welcome Email Template', () => {
    const { getWelcomeEmailTemplate } = require('../templates/welcomeEmail');

    test('should generate email template with all fields', () => {
        const data = {
            username: 'testuser',
            email: 'test@example.com',
            password: 'TempPass123!',
            role: 'user',
            loginUrl: 'http://localhost:5051/login'
        };

        const template = getWelcomeEmailTemplate(data);

        expect(template).toHaveProperty('subject');
        expect(template).toHaveProperty('text');
        expect(template).toHaveProperty('html');

        // Check subject
        expect(template.subject).toContain('Welcome');

        // Check text version contains key information
        expect(template.text).toContain(data.username);
        expect(template.text).toContain(data.email);
        expect(template.text).toContain(data.password);
        expect(template.text).toContain(data.role);
        expect(template.text).toContain(data.loginUrl);

        // Check HTML version contains key information
        expect(template.html).toContain(data.username);
        expect(template.html).toContain(data.email);
        expect(template.html).toContain(data.password);
        expect(template.html).toContain(data.role);
        expect(template.html).toContain(data.loginUrl);

        // Check HTML structure
        expect(template.html).toContain('<!DOCTYPE html>');
        expect(template.html).toContain('<table');
    });

    test('should include security notice in template', () => {
        const data = {
            username: 'testuser',
            email: 'test@example.com',
            password: 'TempPass123!',
            role: 'user',
            loginUrl: 'http://localhost:5051/login'
        };

        const template = getWelcomeEmailTemplate(data);

        expect(template.text).toContain('IMPORTANT SECURITY NOTICE');
        expect(template.text).toContain('temporary password');
        expect(template.text).toContain('change it immediately');

        expect(template.html).toContain('IMPORTANT SECURITY NOTICE');
        expect(template.html).toContain('temporary password');
    });
});
