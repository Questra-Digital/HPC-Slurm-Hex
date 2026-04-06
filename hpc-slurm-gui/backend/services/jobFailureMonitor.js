const axios = require("axios");
const { Node, User, JobFailureNotification } = require("../config/db");
const emailService = require("./emailService");

const DEFAULT_MONITOR_INTERVAL_MS = 15000;
let monitorTimer = null;
let pollInFlight = false;

const getMonitorIntervalMs = () => {
    const configured = Number(process.env.JOB_FAILURE_MONITOR_INTERVAL_MS);
    if (!Number.isFinite(configured) || configured < 3000) {
        return DEFAULT_MONITOR_INTERVAL_MS;
    }

    return configured;
};

const isFailedState = (state) => String(state || "").toLowerCase().includes("failed");

const getMasterNodeIp = async () => {
    const masterNode = await Node.findOne({ where: { node_type: "master" } });
    return masterNode ? masterNode.ip_address : null;
};

const fetchJobsFromMaster = async () => {
    const slurmPort = process.env.SLURM_PORT;
    if (!slurmPort) {
        return [];
    }

    const masterIp = await getMasterNodeIp();
    if (!masterIp) {
        return [];
    }

    const response = await axios.get(`http://${masterIp}:${slurmPort}/jobs`, {
        timeout: 10000,
    });

    return Array.isArray(response.data?.jobs) ? response.data.jobs : [];
};

const resolveRecipient = async (job, trackingRecord) => {
    if (trackingRecord?.user_email) {
        return {
            email: trackingRecord.user_email,
            username: trackingRecord.username || job.userName || "User",
            userId: trackingRecord.user_id || null,
        };
    }

    if (trackingRecord?.user_id) {
        const user = await User.findByPk(trackingRecord.user_id);
        if (user?.email) {
            return {
                email: user.email,
                username: user.username || trackingRecord.username || job.userName || "User",
                userId: user.id,
            };
        }
    }

    const username = trackingRecord?.username || job.userName || null;
    if (!username) {
        return null;
    }

    const user = await User.findOne({ where: { username } });
    if (!user?.email) {
        return null;
    }

    return {
        email: user.email,
        username: user.username || username,
        userId: user.id,
    };
};

const upsertTrackingRecord = async (job) => {
    const jobId = String(job.jobId || "").trim();
    if (!jobId) {
        return null;
    }

    const [record, created] = await JobFailureNotification.findOrCreate({
        where: { job_id: jobId },
        defaults: {
            job_id: jobId,
            job_name: job.jobName || null,
            username: job.userName || null,
            last_observed_state: job.state || null,
        },
    });

    if (!created) {
        const needsUpdate = (
            record.job_name !== (job.jobName || record.job_name) ||
            record.username !== (job.userName || record.username) ||
            record.last_observed_state !== (job.state || record.last_observed_state)
        );

        if (needsUpdate) {
            await record.update({
                job_name: job.jobName || record.job_name,
                username: job.userName || record.username,
                last_observed_state: job.state || record.last_observed_state,
            });
        }
    }

    return record;
};

const processJobFailure = async (job) => {
    const trackingRecord = await upsertTrackingRecord(job);
    if (!trackingRecord || !isFailedState(job.state)) {
        return;
    }

    if (trackingRecord.failure_notified_at) {
        return;
    }

    const recipient = await resolveRecipient(job, trackingRecord);
    if (!recipient?.email) {
        console.warn(`[JOB_FAILURE_MONITOR] No recipient email found for job ${trackingRecord.job_id}`);
        return;
    }

    const result = await emailService.sendJobFailureEmail(recipient.email, {
        username: recipient.username,
        jobId: trackingRecord.job_id,
        jobName: trackingRecord.job_name || job.jobName,
        jobState: job.state,
        failedAt: new Date().toISOString(),
    });

    if (!result.success) {
        console.warn(`[JOB_FAILURE_MONITOR] Email send failed for job ${trackingRecord.job_id}: ${result.message}`);
        return;
    }

    await trackingRecord.update({
        user_id: trackingRecord.user_id || recipient.userId || null,
        user_email: recipient.email,
        username: trackingRecord.username || recipient.username || null,
        last_observed_state: job.state || trackingRecord.last_observed_state,
        failure_notified_at: new Date(),
    });
};

const pollJobFailureOnce = async () => {
    if (pollInFlight) {
        return;
    }

    pollInFlight = true;

    try {
        const jobs = await fetchJobsFromMaster();
        for (const job of jobs) {
            await processJobFailure(job);
        }
    } catch (error) {
        console.error("[JOB_FAILURE_MONITOR] Poll failed:", error.message);
    } finally {
        pollInFlight = false;
    }
};

const startJobFailureMonitor = () => {
    const enabled = process.env.JOB_FAILURE_MONITOR_ENABLED !== "false";
    if (!enabled) {
        return;
    }

    if (monitorTimer) {
        return;
    }

    const intervalMs = getMonitorIntervalMs();
    monitorTimer = setInterval(() => {
        void pollJobFailureOnce();
    }, intervalMs);

    void pollJobFailureOnce();
    console.log(`[JOB_FAILURE_MONITOR] Started with interval ${intervalMs}ms`);
};

const stopJobFailureMonitor = () => {
    if (!monitorTimer) {
        return;
    }

    clearInterval(monitorTimer);
    monitorTimer = null;
};

module.exports = {
    isFailedState,
    pollJobFailureOnce,
    startJobFailureMonitor,
    stopJobFailureMonitor,
};
