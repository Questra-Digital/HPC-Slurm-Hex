const express = require("express");
const router = express.Router();
const { Client } = require("basic-ftp");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const { Node, JobFailureNotification } = require("../config/db");
const { scanZipFile } = require("../services/securityScanner");
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const SLURM_PORT = process.env.SLURM_PORT;

// Helper function to get master node IP from database
const getMasterNodeIp = async () => {
  const masterNode = await Node.findOne({ where: { node_type: 'master' } });
  return masterNode ? masterNode.ip_address : null;
};

const trackSubmittedJob = async (req) => {
  try {
    const jobId = String(req.body?.Job_id || "").trim();
    if (!jobId || !req.auth?.userId) {
      return;
    }

    const defaults = {
      job_id: jobId,
      job_name: req.body?.Job_name || null,
      user_id: req.auth.userId,
      username: req.auth.username || req.body?.user_name || null,
      user_email: req.auth.email || req.body?.user_email || null,
      last_observed_state: "SUBMITTED",
    };

    const [record, created] = await JobFailureNotification.findOrCreate({
      where: { job_id: jobId },
      defaults,
    });

    if (!created) {
      await record.update({
        job_name: req.body?.Job_name || record.job_name,
        user_id: req.auth.userId || record.user_id,
        username: req.auth.username || req.body?.user_name || record.username,
        user_email: req.auth.email || req.body?.user_email || record.user_email,
        last_observed_state: "SUBMITTED",
      });
    }
  } catch (error) {
    console.warn("[jobs] Could not track submitted job for failure notifications:", error.message);
  }
};

// FTP credentials (same as in your Python script)
const FTP_CONFIG = {
  host: "192.168.90.10",
  user: "f228755",
  password: "au2255",
  port: 21, // FTP default port
  secure: false, // No encryption (standard FTP)
};

// Configure multer for file uploads (single ZIP file)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../jobs");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${uuidv4()}`;
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== ".zip") {
      return cb(new Error("Only ZIP files are allowed"));
    }
    cb(null, true);
  },
  limits: { fileSize: 100 * 1024 * 1024 * 2 }, // 2GB limit
}).single("file0"); // Matches the FormData key in JobsPage.jsx

// FTP upload endpoint
router.post("/upload-ftp", (req, res) => {
  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ message: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    try {
      const scanResult = scanZipFile(req.file.path);

      if (!scanResult.safe) {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }

        return res.status(400).json({
          message: `Security scan failed: ${scanResult.threats.length} threat(s) detected in uploaded files`,
          scanFailed: true,
          filesScanned: scanResult.filesScanned,
          threats: scanResult.threats,
        });
      }
    } catch (scanError) {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      return res.status(400).json({
        message: `Security scan error: ${scanError.message}`,
        scanFailed: true,
        threats: [],
      });
    }

    const localFilePath = req.file.path;
    const remoteFilePath = req.file.filename;
    const ftpClient = new Client();

    try {
      // Connect to the FTP server
      await ftpClient.access({
        host: FTP_CONFIG.host,
        user: FTP_CONFIG.user,
        password: FTP_CONFIG.password,
        port: FTP_CONFIG.port,
      });

      // Change to the target directory (uploads folder)
      await ftpClient.cd("jobs");

      // Upload the file to the FTP server
      await ftpClient.uploadFrom(localFilePath, remoteFilePath);

      // Construct the download URL (as per the new format)
      const downloadUrl = `ftp://192.168.90.10/jobs/${encodeURIComponent(remoteFilePath)}`;

      // Clean up the local file after upload
      fs.unlinkSync(localFilePath);

      // Respond with the download URL and success message
      res.json({
        message: "File uploaded successfully",
        download_url: downloadUrl,
      });
    } catch (error) {
      // Clean up local file in case of error
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
      }

      res.status(500).json({
        message: `Failed to upload file: ${error.message}`,
        error: error.message,
      });
    } finally {
      // Close FTP connection
      ftpClient.close();
    }
  });
});

// ============================================
// Proxy routes to slurm-master
// These routes forward requests from frontend through the webserver
// to the slurm-master since the browser cannot access private IPs
// ============================================

// Proxy: Get jobs list from slurm-master
router.get("/slurm-jobs", async (req, res) => {
  try {
    const masterIp = await getMasterNodeIp();

    if (!masterIp) {
      return res.status(400).json({
        error: "Master node not configured",
        jobs: []
      });
    }

    const response = await axios.get(`http://${masterIp}:${SLURM_PORT}/jobs`, { timeout: 10000 });
    res.json(response.data);
  } catch (error) {
    console.error("Failed to fetch jobs from master:", error.message);
    res.status(500).json({
      error: "Failed to fetch jobs from slurm-master",
      jobs: []
    });
  }
});

// Proxy: Submit job to slurm-master
router.post("/submit-job", async (req, res) => {
  try {
    const masterIp = await getMasterNodeIp();

    if (!masterIp) {
      return res.status(400).json({
        error: "Master node not configured"
      });
    }

    console.log("Proxying job submission to master:", masterIp);
    const response = await axios.post(`http://${masterIp}:${SLURM_PORT}/submit-job`, req.body, { timeout: 120000 });

    await trackSubmittedJob(req);

    res.json(response.data);
  } catch (error) {
    console.error("Failed to submit job to master:", error.message);
    res.status(error.response?.status || 500).json({
      error: "Failed to submit job to slurm-master",
      message: error.response?.data?.error || error.message
    });
  }
});

// Proxy: Cancel job on slurm-master
router.post("/cancel-job", async (req, res) => {
  try {
    const masterIp = await getMasterNodeIp();

    if (!masterIp) {
      return res.status(400).json({
        error: "Master node not configured"
      });
    }

    const response = await axios.post(`http://${masterIp}:${SLURM_PORT}/cancel-job`, req.body, { timeout: 30000 });
    res.json(response.data);
  } catch (error) {
    console.error("Failed to cancel job:", error.message);
    res.status(error.response?.status || 500).json({
      error: "Failed to cancel job",
      message: error.response?.data?.error || error.message
    });
  }
});

// Proxy: Get job IP from slurm-master
router.get("/job-ip/:jobId", async (req, res) => {
  try {
    const masterIp = await getMasterNodeIp();

    if (!masterIp) {
      return res.status(400).json({
        error: "Master node not configured"
      });
    }

    const response = await axios.get(`http://${masterIp}:${SLURM_PORT}/job-ip/${req.params.jobId}`, { timeout: 10000 });
    res.json(response.data);
  } catch (error) {
    console.error("Failed to get job IP:", error.message);
    res.status(error.response?.status || 500).json({
      error: "Failed to get job IP",
      message: error.response?.data?.error || error.message
    });
  }
});

// Proxy: Get next job ID from slurm-master
router.get("/next-job-id", async (req, res) => {
  try {
    const masterIp = await getMasterNodeIp();

    if (!masterIp) {
      return res.status(400).json({
        error: "Master node not configured"
      });
    }

    const response = await axios.get(`http://${masterIp}:${SLURM_PORT}/next-job-id`, { timeout: 10000 });
    res.json(response.data);
  } catch (error) {
    console.error("Failed to get next job ID:", error.message);
    res.status(error.response?.status || 500).json({
      error: "Failed to get next job ID",
      message: error.response?.data?.error || error.message
    });
  }
});

// Proxy: Download job files from worker node
// This proxies requests like /jobs/download/:nodeIp/:jobId to the worker node
router.get("/download/:nodeIp/:filename", async (req, res) => {
  try {
    const { nodeIp, filename } = req.params;

    console.log(`[download-proxy] Proxying download: ${filename} from ${nodeIp}`);

    // Stream the file from the worker node
    const downloadUrl = `http://${nodeIp}:${SLURM_PORT}/download/${filename}`;

    const response = await axios({
      method: 'GET',
      url: downloadUrl,
      responseType: 'stream',
      timeout: 300000 // 5 minute timeout for large files
    });

    // Forward headers
    res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
    if (response.headers['content-disposition']) {
      res.setHeader('Content-Disposition', response.headers['content-disposition']);
    } else {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    }
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }

    // Pipe the stream to the response
    response.data.pipe(res);

    response.data.on('error', (err) => {
      console.error('[download-proxy] Stream error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Download failed', message: err.message });
      }
    });

  } catch (error) {
    console.error("[download-proxy] Failed to download:", error.message);
    res.status(error.response?.status || 500).json({
      error: "Failed to download file",
      message: error.response?.data?.error || error.message
    });
  }
});

const jobsToCsv = (jobs) => {
  const headers = [
    "Job ID", "Job Name", "User", "Partition", "Node",
    "Start", "End", "State", "Exit Code",
    "CPUs", "GPUs", "Memory (GB)",
  ];

  const escapeField = (val) => {
    const str = val == null ? "" : String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = jobs.map((job) => [
    job.jobId,
    job.jobName,
    job.userName || "",
    job.partition || "",
    job.node || "",
    job.start || "",
    job.end || "",
    job.state || "",
    job.exitCode || "",
    job.cpu_request || 0,
    job.gpu_request || 0,
    job.memory_request || 0,
  ].map(escapeField).join(","));

  return [headers.join(","), ...rows].join("\n");
};

router.get("/export-csv", async (req, res) => {
  try {
    if (req.auth?.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const masterIp = await getMasterNodeIp();
    if (!masterIp) {
      return res.status(400).json({ error: "Master node not configured" });
    }

    const response = await axios.get(`http://${masterIp}:${SLURM_PORT}/jobs`, { timeout: 15000 });
    let jobs = response.data.jobs || [];

    const duration = String(req.query.duration || "all");
    if (duration !== "all") {
      const now = Date.now();
      const durationMap = {
        "24h": 24 * 60 * 60 * 1000,
        "7d": 7 * 24 * 60 * 60 * 1000,
        "30d": 30 * 24 * 60 * 60 * 1000,
        "90d": 90 * 24 * 60 * 60 * 1000,
      };

      const windowMs = durationMap[duration];
      if (windowMs) {
        const cutoff = now - windowMs;
        jobs = jobs.filter((job) => {
          if (!job.start) return false;
          const timestamp = new Date(job.start).getTime();
          return Number.isFinite(timestamp) && timestamp >= cutoff;
        });
      }
    }

    const csv = jobsToCsv(jobs);
    const filename = `job_history_${duration}_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (error) {
    return res.status(500).json({ error: "Failed to export job history", message: error.message });
  }
});

module.exports = router;

