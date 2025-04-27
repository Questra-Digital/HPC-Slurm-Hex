const express = require("express");
const router = express.Router();
const { Client } = require("basic-ftp");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// FTP credentials (same as in your Python script)
const FTP_CONFIG = {
  host: "157.173.208.164",
  user: "u604307358",
  password: "PassWord$2024",
  port: 21, // FTP default port
  secure: false, // No encryption (standard FTP)
};

// Configure multer for file uploads (single ZIP file)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../uploads");
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
      await ftpClient.cd("uploads");

      // Upload the file to the FTP server
      await ftpClient.uploadFrom(localFilePath, remoteFilePath);

      // Construct the download URL (as per the new format)
      const downloadUrl = `ftp://157.173.208.164/uploads/${encodeURIComponent(remoteFilePath)}`;

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

module.exports = router;
