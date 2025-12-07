/**
 * Generate welcome email template for new users
 * 
 * @param {Object} data - Email data
 * @param {string} data.username - User's username
 * @param {string} data.email - User's email address
 * @param {string} data.password - Temporary password
 * @param {string} data.role - User's role (admin/user)
 * @param {string} data.loginUrl - URL to login page
 * @returns {Object} Email subject and body (text and HTML)
 */
function getWelcomeEmailTemplate(data) {
    const { username, email, password, role, loginUrl } = data;

    const subject = "Welcome to HPC Slurm System - Your Account Details";

    // Plain text version
    const textBody = `
Welcome to HPC Slurm System!

Your account has been successfully created. Below are your login credentials:

Username: ${username}
Email: ${email}
Temporary Password: ${password}
Role: ${role}

Login URL: ${loginUrl}

IMPORTANT SECURITY NOTICE:
- This is a temporary password. Please change it immediately after your first login.
- Do not share your password with anyone.
- Keep this email in a secure location or delete it after changing your password.

If you did not request this account or have any questions, please contact your system administrator.

Best regards,
HPC Slurm System Team
    `.trim();

    // HTML version
    const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to HPC Slurm System</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); text-align: center;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">
                                Welcome to HPC Slurm System
                            </h1>
                        </td>
                    </tr>
                    
                    <!-- Body -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                                Hello <strong>${username}</strong>,
                            </p>
                            
                            <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                                Your account has been successfully created! Below are your login credentials:
                            </p>
                            
                            <!-- Credentials Box -->
                            <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 30px 0; background-color: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px;">
                                <tr>
                                    <td style="padding: 20px;">
                                        <table role="presentation" style="width: 100%; border-collapse: collapse;">
                                            <tr>
                                                <td style="padding: 8px 0; color: #6c757d; font-size: 14px; font-weight: bold;">
                                                    Username:
                                                </td>
                                                <td style="padding: 8px 0; color: #333333; font-size: 14px;">
                                                    ${username}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0; color: #6c757d; font-size: 14px; font-weight: bold;">
                                                    Email:
                                                </td>
                                                <td style="padding: 8px 0; color: #333333; font-size: 14px;">
                                                    ${email}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0; color: #6c757d; font-size: 14px; font-weight: bold;">
                                                    Temporary Password:
                                                </td>
                                                <td style="padding: 8px 0; color: #333333; font-size: 14px; font-family: 'Courier New', monospace; background-color: #ffffff; padding: 8px; border-radius: 4px;">
                                                    <strong>${password}</strong>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0; color: #6c757d; font-size: 14px; font-weight: bold;">
                                                    Role:
                                                </td>
                                                <td style="padding: 8px 0; color: #333333; font-size: 14px;">
                                                    ${role}
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                            
                            <!-- Login Button -->
                            <table role="presentation" style="margin: 30px 0;">
                                <tr>
                                    <td align="center">
                                        <a href="${loginUrl}" style="display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                                            Login to Your Account
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            
                            <!-- Security Notice -->
                            <div style="margin: 30px 0; padding: 20px; background-color: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
                                <p style="margin: 0 0 10px; color: #856404; font-size: 14px; font-weight: bold;">
                                    ⚠️ IMPORTANT SECURITY NOTICE
                                </p>
                                <ul style="margin: 10px 0; padding-left: 20px; color: #856404; font-size: 13px; line-height: 1.6;">
                                    <li>This is a temporary password. Please change it immediately after your first login.</li>
                                    <li>Do not share your password with anyone.</li>
                                    <li>Keep this email in a secure location or delete it after changing your password.</li>
                                </ul>
                            </div>
                            
                            <p style="margin: 20px 0 0; color: #666666; font-size: 14px; line-height: 1.6;">
                                If you did not request this account or have any questions, please contact your system administrator.
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px; background-color: #f8f9fa; text-align: center; border-top: 1px solid #e9ecef;">
                            <p style="margin: 0; color: #6c757d; font-size: 12px;">
                                © 2025 HPC Slurm System. All rights reserved.
                            </p>
                            <p style="margin: 10px 0 0; color: #6c757d; font-size: 12px;">
                                This is an automated message. Please do not reply to this email.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `.trim();

    return {
        subject,
        text: textBody,
        html: htmlBody
    };
}

module.exports = { getWelcomeEmailTemplate };
