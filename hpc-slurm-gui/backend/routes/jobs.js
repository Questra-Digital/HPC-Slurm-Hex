// jobs.js
const express = require("express");
const redis = require("redis");
const router = express.Router();

// Redis client
const redisClient = redis.createClient({ url: "redis://localhost:6379" });
redisClient.connect().catch(console.error);

router.get("/jobs", async (req, res) => {
    try {
        // Fetch all job keys from Redis
        const jobKeys = await redisClient.keys("job:*");
        if (!jobKeys.length) {
            return res.json({ jobs: [] });
        }

        // Fetch job details for each key
        const jobs = await Promise.all(
            jobKeys.map(async (key) => {
                const job = await redisClient.hGetAll(key);
                return {
                    jobId: job.job_id,
                    jobName: job.job_name,
                    userName: job.user_name,
                    nodeId: parseInt(job.node_id),
                    state: job.state,
                    cpu_request: parseInt(job.cpu_request),
                    gpu_request: parseInt(job.gpu_request),
                    memory_request: parseFloat(job.memory_request),
                    start: job.start || "",
                    end: job.end || "",
                    download_link: job.download_link || null,
                };
            })
        );

        res.json({ jobs });
    } catch (error) {
        console.error("Error fetching jobs from Redis:", error);
        res.status(500).json({ error: "Failed to fetch jobs" });
    }
});

module.exports = router;