const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const { execSync } = require('child_process');
const os = require('os');
const redis = require('redis');
const app = express();
const port = 5000;

// Redis client setup with configurable options
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const redisClient = redis.createClient({
  url: `redis://${REDIS_HOST}:${REDIS_PORT}`,
  // Optional: Add password if Redis is configured with one
  // password: process.env.REDIS_PASSWORD || undefined,
});

redisClient.on('error', (err) => console.log('Redis Client Error:', err));
redisClient.on('connect', () => console.log('Connected to Redis'));

// Connect to Redis (async operation)
let redisConnected = false;
(async () => {
  try {
    await redisClient.connect();
    redisConnected = true;
  } catch (err) {
    console.error('Failed to connect to Redis:', err);
  }
})();

// Enable CORS
app.use(cors());

// Helper function to format date to a more readable string
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

// Function to fetch jobs from sacct and cache in Redis
const fetchAndCacheJobs = async () => {
  return new Promise((resolve, reject) => {
    exec('sacct --starttime=2024-01-01 --format=JobID,JobName,Start,End,Partition,AllocCPUS,AllocGRES,ReqMem,State,ExitCode,Comment -p', async (error, stdout, stderr) => {
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
        if (fields.length >= 11) {
          if (!fields[1].includes('.batch')) {
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
              download_link: `http://192.168.56.21:5000/download/${fields[0]}.zip`,
            };
          } else if (currentJob) {
            currentJob.batchJob = {
              jobId: fields[0],
              jobName: fields[1],
              start: formatDate(fields[2]),
              end: formatDate(fields[3]),
              state: fields[8],
              exitCode: fields[9],
            };
          }
        }
      });

      if (currentJob) jobs.push(currentJob);

      const runningJobs = jobs.filter(job => job.state === 'RUNNING');
      await Promise.all(runningJobs.map(job => {
        return new Promise((resolve) => {
          fetchJobComment(job.jobId, (err, comment) => {
            if (err) console.log(`Error fetching comment for ${job.jobId}: ${err}`);
            job.userName = comment;
            resolve();
          });
        });
      }));

      // Cache the jobs in Redis with a TTL of 60 seconds
      await redisClient.setEx('jobs', 15, JSON.stringify({ jobs }));
      resolve(jobs);
    });
  });
};

// Route to get job list with CPU, GPU, and RAM (using Redis cache)
app.get('/jobs', async (req, res) => {
  try {
    // Check Redis cache first
    const cachedJobs = await redisClient.get('jobs');
    if (cachedJobs) {
      return res.json(JSON.parse(cachedJobs));
    }

    // If not in cache, fetch from sacct and cache it
    const jobs = await fetchAndCacheJobs();
    res.json({ jobs });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to get job list' });
  }
});

// New endpoint to get status of a specific job
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

// Route to get the predicted next job ID
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

// Function to run shell commands synchronously
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


// Route to check system connectivity and resources
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

// Start the server
app.listen(port, () => {
  console.log(`Slurm API server running at http://localhost:${port}`);
});