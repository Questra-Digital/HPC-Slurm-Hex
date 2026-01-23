const express = require("express");
const router = express.Router();
const { Client } = require("basic-ftp");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const { Node } = require("../config/db");
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const SLURM_PORT = process.env.SLURM_PORT;

// Helper function to get master node IP from database
const getMasterNodeIp = async () => {
  const masterNode = await Node.findOne({ where: { node_type: 'master' } });
  return masterNode ? masterNode.ip_address : null;
};

// FTP credentials (same as in your Python script)
const FTP_CONFIG = {
  host: process.env.FTP_CONFIG_HOST,
  user: process.env.FTP_CONFIG_USER,
  password: process.env.FTP_CONFIG_PASSWORD,
  port: process.env.FTP_CONFIG_PORT, // FTP default port
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

module.exports = router;

