function getJobFailureEmailTemplate({ username, jobId, jobName, jobState, failedAt, jobsUrl }) {
    const safeUsername = username || "User";
    const safeJobId = jobId || "Unknown";
    const safeJobName = jobName || "Unknown Job";
    const safeJobState = jobState || "FAILED";
    const safeFailedAt = failedAt || new Date().toISOString();
    const safeJobsUrl = jobsUrl || "http://localhost:5051/"; // Fallback URL to the job management dashboard. change to deployment URL in production.

    return {
        subject: `Job Failed - ${safeJobName} (#${safeJobId})`,
        text: `Hello ${safeUsername},

A job in HPC Slurm has failed.

Job ID: ${safeJobId}
Job Name: ${safeJobName}
State: ${safeJobState}
Failed At: ${safeFailedAt}

You can review details in Job Management:
${safeJobsUrl}

If this was unexpected, verify job inputs, resource requests, and logs.
`,
        html: `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>Job Failed</title>
            </head>
            <body style="margin:0; padding:0; background:#f4f6f8; font-family:Arial, sans-serif; color:#1f2937;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8; padding:24px 0;">
                    <tr>
                        <td align="center">
                            <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#ffffff; border-radius:8px; padding:24px;">
                                <tr>
                                    <td>
                                        <h2 style="margin:0 0 12px; color:#b91c1c;">Job Failure Notification</h2>
                                        <p style="margin:0 0 16px;">Hello <strong>${safeUsername}</strong>,</p>
                                        <p style="margin:0 0 16px;">A job in HPC Slurm has failed. Details are below:</p>
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse; margin-bottom:20px;">
                                            <tr>
                                                <td style="padding:8px; border:1px solid #e5e7eb;"><strong>Job ID</strong></td>
                                                <td style="padding:8px; border:1px solid #e5e7eb;">${safeJobId}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding:8px; border:1px solid #e5e7eb;"><strong>Job Name</strong></td>
                                                <td style="padding:8px; border:1px solid #e5e7eb;">${safeJobName}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding:8px; border:1px solid #e5e7eb;"><strong>State</strong></td>
                                                <td style="padding:8px; border:1px solid #e5e7eb;">${safeJobState}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding:8px; border:1px solid #e5e7eb;"><strong>Failed At</strong></td>
                                                <td style="padding:8px; border:1px solid #e5e7eb;">${safeFailedAt}</td>
                                            </tr>
                                        </table>
                                        <p style="margin:0 0 20px;">
                                            Review this job in Job Management:
                                            <a href="${safeJobsUrl}" style="color:#1d4ed8;">Open Dashboard</a>
                                        </p>
                                        <p style="margin:0; font-size:12px; color:#6b7280;">This is an automated message from HPC Slurm System.</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `,
    };
}

module.exports = { getJobFailureEmailTemplate };
