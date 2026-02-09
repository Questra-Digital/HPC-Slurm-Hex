const express = require('express');
const cors = require('cors');
const axios = require('axios');  // Added for notebook proxy endpoints
const { exec, execSync, spawn } = require('child_process');
const os = require('os');
const redis = require('redis');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const app = express();
const dotenv = require('dotenv');
// Load environment variables from .env file
dotenv.config();
const port = process.env.PORT;

const REDIS_HOST = 'localhost';
const REDIS_PORT = 6379;

// FTP credentials for downloading uploaded files
const FTP_USER = process.env.FTP_USER || "f228755";
const FTP_PASSWORD = process.env.FTP_PASSWORD || "au2255";
// Webserver URL for generating download links (public URL that proxies to worker nodes)
const WEBSERVER_URL = process.env.WEBSERVER_URL || null;

// Jobs directory
const HOME_DIR = os.homedir();
const JOBS_DIR = path.join(HOME_DIR, 'jobs');

const redisClient = redis.createClient({
  url: `redis://${REDIS_HOST}:${REDIS_PORT}`,
});


redisClient.on('error', (err) => console.log('Redis Client Error:', err));
redisClient.on('connect', () => console.log(`Connected to Redis on port ${REDIS_PORT}`));

let redisConnected = false;
(async () => {
  try {
    await redisClient.connect();
    redisConnected = true;
  } catch (err) {
    console.error('Failed to connect to Redis:', err);
  }
})();

app.use(cors());
app.use(express.json());

const formatDate = (dateString) => {
  const date = new Date(dateString);
  const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };
  return date.toLocaleString('en-US', options);
};

// Helper function to parse GRES (GPU resources) from AllocGRES field
const parseGRES = (gresString) => {
  if (!gresString || gresString === 'N/A') return 0;
  const gpuMatch = gresString.match(/gpu:(\d+)/);
  return gpuMatch ? parseInt(gpuMatch[1], 10) : 0;
};

// Helper function to parse memory from ReqMem field (e.g., "4G" or "4096M")
const parseMemory = (memString) => {
  if (!memString || memString === 'N/A') return 0;
  const value = parseFloat(memString);
  if (memString.includes('G')) return value;
  if (memString.includes('M')) return value / 1024;
  return value;
};

// Function to fetch job comment from the `scontrol show job` command
const fetchJobComment = (jobId, callback) => {
  exec(`scontrol show job ${jobId}`, (error, stdout, stderr) => {
    if (error) {
      return callback(stderr || 'Failed to get job details');
    }
    const commentLine = stdout.split('\n').find(line => line.trim().startsWith('Comment='));
    const commentParts = commentLine ? commentLine.split('=') : [];
    const comment = commentParts.length > 1 ? commentParts[1].trim() : null;
    callback(null, comment);
  });
};

const getNodeIP = (nodeName) => {
  try {
    const ip = execSync(`getent hosts ${nodeName}`).toString().trim().split(' ')[0];
    return ip;
  } catch (err) {
    console.error(`Failed to resolve IP for node ${nodeName}:`, err.message);
    return '127.0.0.1'; // Fallback
  }
};

// Function to fetch jobs from sacct and cache in Redis
const fetchAndCacheJobs = async () => {
  return new Promise((resolve, reject) => {
    exec('sacct --starttime=2024-01-01 --format=JobID,JobName,Start,End,Partition,AllocCPUS,AllocTRES,ReqMem,State,ExitCode,Comment,NodeList -p', async (error, stdout, stderr) => {
      if (error) {
        return reject(stderr || 'Failed to get job list');
      }

      const lines = stdout.split('\n');
      if (!lines[0].trim()) {
        return reject('Invalid sacct output format');
      }

      const jobs = [];
      let currentJob = null;

      lines.slice(1).forEach(line => {
        const fields = line.split('|').map(field => field.trim());
        if (fields.length >= 12) {
          if (!fields[1].includes('.batch')) {

            const nodeName = fields[11] || null;
            const nodeIP = nodeName ? getNodeIP(nodeName) : '127.0.0.1';

            if (currentJob) jobs.push(currentJob);
            currentJob = {
              jobId: fields[0],
              jobName: fields[1],
              start: formatDate(fields[2]),
              end: formatDate(fields[3]),
              partition: fields[4],
              cpu_request: parseInt(fields[5], 10) || 0,
              gpu_request: parseGRES(fields[6]),
              memory_request: parseMemory(fields[7]),
              state: fields[8],
              exitCode: fields[9],
              userName: fields[10] || null,
              node: fields[11] || null,
              download_link: WEBSERVER_URL
                ? `${WEBSERVER_URL}/api/jobs/download/${nodeIP}/${fields[0]}.zip`
                : `http://${nodeIP}:${port}/download/${fields[0]}.zip`,
            };
          } else if (currentJob) {
            currentJob.batchJob = {
              jobId: fields[0],
              jobName: fields[1],
              start: formatDate(fields[2]),
              end: formatDate(fields[3]),
              state: fields[8],
              exitCode: fields[9],
              node: fields[11] || null,
            };
          }
        }
      });

      if (currentJob) jobs.push(currentJob);

      const runningJobs = jobs.filter(job => job.state === 'RUNNING');
      await Promise.all(runningJobs.map(job => {

        // Skip jobs with a dot in the job ID (like 24.batch) - these are sub-jobs
        if (job.jobId.includes('.')) return Promise.resolve();
        return new Promise((resolve) => {
          fetchJobComment(job.jobId, (err, comment) => {
            if (err) console.log(`Error fetching comment for ${job.jobId}: ${err}`);
            job.userName = comment;
            resolve();
          });
        });
      }));

      // Cache the jobs in Redis with a TTL of 3 seconds
      await redisClient.setEx('jobs', 3, JSON.stringify({ jobs }));
      resolve(jobs);
    });
  });
};


app.get('/jobs', async (req, res) => {
  try {

    const cachedJobs = await redisClient.get('jobs');
    if (cachedJobs) {
      return res.json(JSON.parse(cachedJobs));
    }

    const jobs = await fetchAndCacheJobs();
    res.json({ jobs });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to get job list' });
  }
});

app.get('/job-status/:jobId', (req, res) => {
  const jobId = req.params.jobId;
  exec(`sacct -j ${jobId} --format=State --noheader`, (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: stderr || 'Failed to get job status' });
    }
    const state = stdout.trim().split('\n')[0] || 'UNKNOWN';
    res.json({ jobId, state });
  });
});

app.get('/next-job-id', (req, res) => {
  exec('sacct --starttime=2024-01-01 --format=JobID -p', (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: stderr || 'Failed to get job list' });
    }

    const jobIds = stdout.split('\n')
      .slice(1)
      .filter(line => line.trim())
      .map(line => parseInt(line.split('|')[0], 10))
      .filter(Number.isInteger);

    if (!jobIds.length) {
      return res.status(404).json({ error: 'No jobs found' });
    }

    const nextJobId = Math.max(...jobIds) + 1;
    res.json({ nextJobId });
  });
});


function runCommand(command) {
  try {
    return execSync(command).toString().trim();
  } catch (error) {
    console.error(`Error executing command: ${command}`, error);
    return null;
  }
}

app.post('/cancel-job', (req, res) => {
  const data = req.body;
  console.log("Received body:", data);
  const jobId = data.Job_id;

  if (!jobId) {
    return res.status(400).json({ error: "Missing job_id parameter" });
  }

  const { spawn } = require('child_process');
  const scancel = spawn('scancel', [jobId]);

  let stderr = '';

  scancel.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  scancel.on('close', (code) => {
    if (code === 0) {
      return res.status(200).json({ message: `Job '${jobId}' canceled successfully!` });
    } else {
      return res.status(500).json({ error: "Failed to cancel job", details: stderr });
    }
  });

  scancel.on('error', (err) => {
    return res.status(500).json({ error: err.toString() });
  });
});

// New endpoint to get the IP address for a job's node list
app.get('/job-ip/:jobId', (req, res) => {
  const jobId = req.params.jobId;

  exec(`sacct -j ${jobId} --format=NodeList --noheader`, (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: stderr || 'Failed to get node list' });
    }

    const nodeNames = stdout
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    const uniqueNodeNames = [...new Set(nodeNames)];
    const ipAddresses = uniqueNodeNames.map(node => ({
      node,
      ip: getNodeIP(node),
    }));

    res.json({ jobId, nodes: ipAddresses });
  });
});


app.get('/connect', (req, res) => {
  try {
    const ip = runCommand('hostname -I')?.split(' ')[0] || 'Unknown';
    const cpuCount = os.cpus().length;
    const gpuCount = parseInt(runCommand('nvidia-smi --list-gpus | wc -l') || '0', 10);
    const totalMemory = (os.totalmem() / (1024 ** 3)).toFixed(2);

    res.status(200).json({
      status: 'active',
      ip_address: ip,
      cpu_count: cpuCount,
      gpu_count: gpuCount,
      total_memory_gb: parseFloat(totalMemory),
    });
  } catch (error) {
    res.status(500).json({ status: 'inactive', message: 'System check failed' });
  }
});

// Proxy endpoint to connect to worker nodes through master
app.get('/worker-connect/:ip', async (req, res) => {
  const workerIp = req.params.ip;

  if (!workerIp) {
    return res.status(400).json({ status: 'error', message: 'Worker IP required' });
  }

  try {
    // Try to connect to the worker node
    const axios = require('axios');
    const response = await axios.get(`http://${workerIp}:${port}/connect`, { timeout: 5000 });

    if (response.status === 200 && response.data && response.data.status === 'active') {
      return res.json({
        status: 'active',
        ip_address: workerIp,
        cpu_count: response.data.cpu_count,
        gpu_count: response.data.gpu_count,
        total_memory_gb: response.data.total_memory_gb
      });
    } else {
      return res.status(500).json({ status: 'inactive', message: 'Worker health check failed' });
    }
  } catch (error) {
    console.error(`Failed to connect to worker ${workerIp}:`, error.message);
    return res.status(500).json({
      status: 'inactive',
      message: `Could not connect to worker: ${error.message}`
    });
  }
});

// Get Slurm nodes info via scontrol
app.get('/nodes', (req, res) => {
  exec('scontrol show nodes', (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: stderr || 'Failed to get node list' });
    }

    try {
      const nodes = [];
      const nodeBlocks = stdout.split('\n\n').filter(block => block.trim());

      nodeBlocks.forEach(block => {
        const node = {};
        const lines = block.split('\n');

        lines.forEach(line => {
          // Parse key=value pairs
          const pairs = line.trim().split(/\s+/);
          pairs.forEach(pair => {
            const [key, value] = pair.split('=');
            if (key && value) {
              node[key] = value;
            }
          });
        });

        if (node.NodeName) {
          nodes.push({
            name: node.NodeName,
            state: node.State,
            cpuTotal: parseInt(node.CPUTot) || 0,
            cpuAlloc: parseInt(node.CPUAlloc) || 0,
            cpuLoad: parseFloat(node.CPULoad) || 0,
            realMemory: parseInt(node.RealMemory) || 0,
            allocMem: parseInt(node.AllocMem) || 0,
            freeMem: parseInt(node.FreeMem) || 0,
            gres: node.Gres || '',
            partitions: node.Partitions || '',
            ip: getNodeIP(node.NodeName)
          });
        }
      });

      res.json({ nodes });
    } catch (parseError) {
      console.error('Error parsing scontrol output:', parseError);
      res.status(500).json({ error: 'Failed to parse node information' });
    }
  });
});

// Submit job endpoint - receives job from frontend and submits via sbatch
app.post('/submit-job', async (req, res) => {
  const data = req.body;
  console.log("Received job submission:", data);

  const job_id = data.Job_id;
  const job_name = data.Job_name;
  const github_url = data.github_url;
  const user_name = data.user_name;
  const cpu_request = data.cpu_request;
  const gpu_request = data.gpu_request || 0;
  const memory_request = data.memory_request;
  const user_email = data.user_email;

  // Validate required fields
  if (!job_id || !job_name || !github_url || !user_name || !cpu_request || !memory_request || !user_email) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    // Ensure jobs directory exists
    if (!fs.existsSync(JOBS_DIR)) {
      fs.mkdirSync(JOBS_DIR, { recursive: true });
    }

    const jobFolder = path.join(JOBS_DIR, job_id);

    // Remove existing job folder if present
    // if (fs.existsSync(jobFolder)) {
    // fs.rmSync(jobFolder, { recursive: true, force: true });
    //}

    // Download and extract files with timeouts to prevent hanging
    console.log(`Downloading from: ${github_url}`);

    if (github_url.endsWith('.zip')) {
      const randomUuid = uuidv4();
      const zipPath = path.join(JOBS_DIR, `${randomUuid}.zip`);

      try {
        if (github_url.startsWith('ftp://')) {
          // Download from FTP with credentials (60 second timeout)
          console.log('Downloading from FTP...');
          execSync(`wget --timeout=60 --ftp-user="${FTP_USER}" --ftp-password="${FTP_PASSWORD}" "${github_url}" -O "${zipPath}"`, {
            stdio: 'pipe',
            timeout: 120000 // 2 minute timeout
          });
        } else {
          // Download from HTTP/HTTPS (60 second timeout)
          console.log('Downloading from HTTP...');
          execSync(`wget --timeout=60 "${github_url}" -O "${zipPath}"`, {
            stdio: 'pipe',
            timeout: 120000 // 2 minute timeout
          });
        }
      } catch (downloadError) {
        console.error('Download failed:', downloadError.message);
        return res.status(500).json({
          error: "Failed to download file",
          details: downloadError.message
        });
      }

      // Create job folder and extract
      console.log('Extracting zip file...');
      fs.mkdirSync(jobFolder, { recursive: true });
      try {
        execSync(`unzip -o -q "${zipPath}" -d "${jobFolder}"`, {
          stdio: 'pipe',
          timeout: 60000 // 1 minute timeout
        });
        // Convert DOS line endings to Unix for all shell scripts (fixes Windows uploads)
        console.log('Converting line endings for shell scripts...');
        try {
          execSync(`find "${jobFolder}" -name "*.sh" -exec sed -i 's/\\r$//' {} \\;`, {
            stdio: 'pipe',
            timeout: 30000
          });
        } catch (sedError) {
          console.warn('Line ending conversion warning:', sedError.message);
          // Non-fatal, continue anyway
        }

      } catch (unzipError) {
        console.error('Unzip failed:', unzipError.message);
        // Clean up
        if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
        return res.status(500).json({
          error: "Failed to extract zip file",
          details: unzipError.message
        });
      }

      // Clean up zip file
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    } else {
      // Clone from git repository
      console.log('Cloning from git...');
      try {
        execSync(`git clone "${github_url}" "${jobFolder}"`, {
          stdio: 'pipe',
          timeout: 120000 // 2 minute timeout
        });
        // Convert DOS line endings to Unix for all shell scripts (fixes Windows uploads)
        console.log('Converting line endings for shell scripts...');
        try {
          execSync(`find "${jobFolder}" -name "*.sh" -exec sed -i 's/\\r$//' {} \\;`, {
            stdio: 'pipe',
            timeout: 30000
          });
        } catch (sedError) {
          console.warn('Line ending conversion warning:', sedError.message);
          // Non-fatal, continue anyway
        }

      } catch (cloneError) {
        console.error('Git clone failed:', cloneError.message);
        return res.status(500).json({
          error: "Failed to clone repository",
          details: cloneError.message
        });
      }
    }

    console.log('Submitting job via sbatch...');

    // Helper function to find shell script in a directory
    const findShellScript = (dir) => {
      const priorityNames = ['run.sh', 'main.sh', 'job.sh', 'start.sh', 'submit.sh'];
      const files = fs.readdirSync(dir);

      // First, check for priority script names
      for (const name of priorityNames) {
        if (files.includes(name)) {
          return { dir, script: name };
        }
      }

      // Next, look for any .sh file
      const shFiles = files.filter(f => f.endsWith('.sh') && fs.statSync(path.join(dir, f)).isFile());
      if (shFiles.length > 0) {
        return { dir, script: shFiles[0] };
      }

      return null;
    };

    // Try to find script in job folder, or check for nested folder (common with ZIP extraction)
    let scriptInfo = findShellScript(jobFolder);

    if (!scriptInfo) {
      // Check if there's a single subfolder (ZIP often extracts with nested folder)
      const items = fs.readdirSync(jobFolder);
      const subDirs = items.filter(f => fs.statSync(path.join(jobFolder, f)).isDirectory());

      if (subDirs.length === 1) {
        const nestedFolder = path.join(jobFolder, subDirs[0]);
        scriptInfo = findShellScript(nestedFolder);
      }
    }

    if (!scriptInfo) {
      return res.status(400).json({
        error: "No shell script found",
        details: "Could not find a .sh file in the job folder. Please include run.sh, main.sh, or any .sh file."
      });
    }

    console.log(`Found script: ${scriptInfo.script} in ${scriptInfo.dir}`);


    // Build sbatch command - let Slurm handle node scheduling
    const sbatchArgs = [
      '--job-name', job_name,
      `--comment=${user_name}`,
      '--cpus-per-task', String(cpu_request),
      '--mem', `${memory_request}G`,
      '--mail-user', user_email,
      '--mail-type', 'BEGIN,END,FAIL'
    ];

    if (parseInt(gpu_request) > 0) {
      sbatchArgs.push('--gpus', String(gpu_request));
    }

    sbatchArgs.push(scriptInfo.script);

    // Submit job via sbatch - use cwd option instead of process.chdir to avoid breaking other requests
    const sbatch = spawn('sbatch', sbatchArgs, { cwd: scriptInfo.dir });

    let stdout = '';
    let stderr = '';

    sbatch.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    sbatch.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    sbatch.on('close', async (code) => {
      if (code === 0) {
        // Invalidate jobs cache so new job appears
        try {
          await redisClient.del('jobs');
        } catch (e) {
          console.log('Could not invalidate cache:', e.message);
        }

        return res.status(200).json({
          message: `Job '${job_name}' submitted successfully!`,
          job_id: job_id,
          sbatch_output: stdout.trim()
        });
      } else {
        return res.status(500).json({
          error: "Job submission failed",
          details: stderr || stdout
        });
      }
    });

    sbatch.on('error', (err) => {
      return res.status(500).json({
        error: "Failed to spawn sbatch process",
        details: err.message
      });
    });

  } catch (error) {
    console.error("Job submission error:", error);
    return res.status(500).json({
      error: "An unexpected error occurred",
      details: error.message
    });
  }
});

// =============================================
// Notebook Proxy Endpoints
// =============================================

// Start notebook on worker
app.post('/notebook/start', async (req, res) => {
  const { workerIp, port, token, username } = req.body;

  if (!workerIp || !port || !token) {
    return res.status(400).json({ error: "workerIp, port, and token are required" });
  }

  try {
    const response = await axios.post(
      `http://${workerIp}:5053/notebook/start`,
      { port, token, username },  // Forward username for per-user directories
      { timeout: 30000 }
    );
    console.log(`Notebook started on ${workerIp}:${port} for user ${username || 'unknown'}`);
    res.json(response.data);
  } catch (error) {
    console.error('Failed to start notebook:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data
    });
  }
});

// Stop notebook on worker
app.post('/notebook/stop', async (req, res) => {
  const { workerIp, port, pid } = req.body;

  if (!workerIp) {
    return res.status(400).json({ error: "workerIp is required" });
  }

  try {
    const response = await axios.post(
      `http://${workerIp}:5053/notebook/stop`,
      { port, pid },
      { timeout: 10000 }
    );
    console.log(`Notebook stopped on ${workerIp}`);
    res.json(response.data);
  } catch (error) {
    console.error('Failed to stop notebook:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data
    });
  }
});

// Get resource usage from worker (for real-time monitoring)
app.get('/notebook/resources/:workerIp', async (req, res) => {
  const { workerIp } = req.params;

  try {
    const response = await axios.get(
      `http://${workerIp}:5053/notebook/resources`,
      { timeout: 5000 }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Failed to get resources from', workerIp, ':', error.message);
    res.status(error.response?.status || 500).json({
      error: error.message
    });
  }
});

// Proxy all notebook HTTP requests to worker
app.all('/notebook/proxy/:workerIp/:port/*', async (req, res) => {
  const { workerIp, port } = req.params;
  const subPath = req.params[0] || '';

  try {
    const targetUrl = `http://${workerIp}:${port}/${subPath}`;

    const response = await axios({
      method: req.method,
      url: targetUrl,
      params: req.query,
      data: req.body,
      headers: {
        ...req.headers,
        host: `${workerIp}:${port}`
      },
      responseType: 'stream',
      timeout: 60000,
      maxRedirects: 5
    });

    res.status(response.status);

    // Copy headers but remove iframe-blocking ones
    const blockedHeaders = ['x-frame-options', 'content-security-policy', 'transfer-encoding'];
    Object.entries(response.headers).forEach(([key, value]) => {
      if (!blockedHeaders.includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    response.data.pipe(res);
  } catch (error) {
    console.error('Notebook proxy error:', error.message);
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Slurm API server running at http://0.0.0.0:${port}`);
});


