# Email Notification Setup Guide

## 📧 Quick Start with Gmail SMTP

### Prerequisites

- Gmail account
- 2-Factor Authentication enabled

### Step 1: Enable 2-Factor Authentication

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification** if not already enabled

### Step 2: Generate App Password

1. Go to [Google Account](https://myaccount.google.com/)
2. Navigate to **Security** → **2-Step Verification**
3. Scroll down to **App passwords**
4. Click **Create new app password**
5. Select:
   - **App**: Mail
   - **Device**: Other (custom name) → Enter "HPC Slurm System"
6. Click **Generate**
7. Copy the **16-character password** (format: `xxxx xxxx xxxx xxxx`)

### Step 3: Update .env File

Edit `backend/.env` and update the following variables:

```env
# Replace with your Gmail address
EMAIL_USER=your-email@gmail.com

# Replace with the 16-character app password (spaces optional)
EMAIL_PASSWORD=abcd efgh ijkl mnop

# Optional: Customize the sender name
EMAIL_FROM="HPC Slurm System <noreply@hpc-slurm.com>"

# Application URL (update for production)
APP_URL=http://localhost:5051

# Enable/disable email notifications
ENABLE_EMAIL_NOTIFICATIONS=true
```

### Step 4: Install Dependencies

```bash
cd backend
npm install
```

### Step 5: Test Email Configuration

#### Option A: Using Test Endpoint

Start the server and send a test request:

```bash
# Start server
npm start

# In another terminal, send test email
curl -X POST http://localhost:5052/api/email/test \
  -H "Content-Type: application/json" \
  -d '{"email":"your-test-email@gmail.com"}'
```

#### Option B: Check Email Status

```bash
curl http://localhost:5052/api/email/status
```

Expected response:

```json
{
  "enabled": true,
  "configured": true,
  "service": "gmail",
  "host": "smtp.gmail.com",
  "port": 587,
  "from": "HPC Slurm System <noreply@hpc-slurm.com>",
  "user": "you***@gmail.com"
}
```

### Step 6: Create User and Test

1. Login as admin
2. Create a new user (leave password empty for auto-generation)
3. Check the user's email inbox for welcome message

---

## 🔧 Troubleshooting

### Issue: "Email service connection failed"

**Cause**: Invalid credentials or app password not set up correctly

**Solution**:

1. Verify 2FA is enabled on Gmail
2. Regenerate app password
3. Ensure no spaces in EMAIL_PASSWORD (or keep them as generated)
4. Check EMAIL_USER is correct

### Issue: "Email notifications disabled"

**Cause**: Feature toggle is off

**Solution**:
Set `ENABLE_EMAIL_NOTIFICATIONS=true` in `.env`

### Issue: "Email not configured"

**Cause**: EMAIL_USER or EMAIL_PASSWORD missing

**Solution**:
Ensure both variables are set in `.env` file

### Issue: Email sent but not received

**Possible Causes**:

- Email in spam folder
- Invalid recipient address
- Gmail daily sending limit reached (500 emails/day)

**Solution**:

1. Check spam/junk folder
2. Verify recipient email is valid
3. Check Gmail sending limits

---

## 🚀 Production Setup (SendGrid)

For production environments, consider using SendGrid:

### Step 1: Create SendGrid Account

1. Sign up at [sendgrid.com](https://sendgrid.com)
2. Verify your email
3. Create API key (Settings → API Keys)

### Step 2: Update .env

```env
EMAIL_SERVICE=sendgrid
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=apikey
EMAIL_PASSWORD=SG.your-sendgrid-api-key-here
EMAIL_FROM="HPC Slurm System <notifications@yourdomain.com>"
```

### Step 3: Verify Domain (Recommended)

1. In SendGrid, go to Settings → Sender Authentication
2. Verify your domain for better deliverability
3. Update EMAIL_FROM with your verified domain

---

## 🧪 Testing

Run email service tests:

```bash
cd backend
npm test -- email.test.js
```

Expected output:

```
PASS tests/email.test.js
  Email Service Tests
    Password Generator
      ✓ should generate password with default length
      ✓ should generate password with custom length
      ✓ should meet password requirements
      ...
  Welcome Email Template
    ✓ should generate email template with all fields
    ✓ should include security notice in template
```

---

## 📋 API Endpoints

### Test Email

```http
POST /api/email/test
Content-Type: application/json

{
  "email": "recipient@example.com"
}
```

### Email Service Status

```http
GET /api/email/status
```

### Create User (with email notification)

```http
POST /api/auth/signup
Content-Type: application/json

{
  "username": "newuser",
  "email": "newuser@example.com",
  "role": "user"
}
```

Note: If password is not provided, system auto-generates one and sends email.

---

## 🔐 Security Best Practices

1. **Never commit .env file**

   - Already in .gitignore
   - Use different credentials for dev/prod

2. **Use App Passwords (Gmail)**

   - Never use actual Gmail password
   - Enable 2FA first

3. **Rotate Credentials Regularly**

   - Change app passwords periodically
   - Revoke unused app passwords

4. **Monitor Email Logs**

   - Check server logs for failed emails
   - Watch for authentication errors

5. **Rate Limiting (Future)**
   - Implement user creation limits
   - Prevent email spam

---

## 📊 Email Notification Flow

```
Admin creates user (no password provided)
    ↓
System generates secure password
    ↓
User record created in database
    ↓
Email service sends welcome email
    ↓
User receives:
  - Username
  - Temporary password
  - Login link
    ↓
User logs in and changes password
```

---

## ⚙️ Configuration Options

| Variable                     | Default                 | Description                          |
| ---------------------------- | ----------------------- | ------------------------------------ |
| `EMAIL_SERVICE`              | `gmail`                 | SMTP service (gmail, sendgrid, etc.) |
| `EMAIL_HOST`                 | `smtp.gmail.com`        | SMTP server hostname                 |
| `EMAIL_PORT`                 | `587`                   | SMTP port                            |
| `EMAIL_SECURE`               | `false`                 | Use SSL/TLS (true for port 465)      |
| `EMAIL_USER`                 | -                       | SMTP username / email                |
| `EMAIL_PASSWORD`             | -                       | SMTP password / app password         |
| `EMAIL_FROM`                 | -                       | Sender name and address              |
| `APP_URL`                    | `http://localhost:5051` | Application URL for links            |
| `ENABLE_EMAIL_NOTIFICATIONS` | `true`                  | Enable/disable feature               |

---

## 📝 Response Examples

### Successful User Creation with Email

```json
{
  "message": "User created successfully",
  "userId": 5,
  "username": "newuser",
  "email": "newuser@example.com",
  "role": "user",
  "emailSent": true
}
```

### User Created but Email Failed

```json
{
  "message": "User created successfully",
  "userId": 5,
  "username": "newuser",
  "email": "newuser@example.com",
  "role": "user",
  "emailSent": false,
  "warning": "User created, but email notification failed. Please provide credentials manually.",
  "emailError": "Authentication failed"
}
```

---

## 🎯 Features Implemented

✅ Auto-generate secure passwords  
✅ Professional HTML email templates  
✅ Retry logic for transient failures  
✅ Graceful error handling  
✅ Email configuration validation  
✅ Test endpoints  
✅ Comprehensive logging  
✅ Feature toggle (enable/disable)  
✅ Gmail and SendGrid support  
✅ Unit and integration tests

---

## 📞 Support

If emails are not working:

1. Check server logs for detailed error messages
2. Use `/api/email/status` to verify configuration
3. Send test email using `/api/email/test`
4. Verify Gmail app password is correct
5. Check if 2FA is enabled on Gmail account

For persistent issues, check:

- Firewall blocking SMTP port 587
- Corporate network restrictions
- Gmail security settings
