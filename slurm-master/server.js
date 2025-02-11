const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const axios = require('axios');
const app = express();
const port = 5000;

// Enable CORS
app.use(cors());

// Helper function to format date to a more readable string
const formatDate = (dateString) => {
  const date = new Date(dateString);
  const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };
  return date.toLocaleString('en-US', options);  // Adjust locale and format as needed
};

// Function to fetch job comment from the `scontrol show job` command
const fetchJobComment = (jobId, callback) => {
  exec(`scontrol show job ${jobId}`, (error, stdout, stderr) => {
    if (error) {
      return callback(stderr || 'Failed to get job details');
    }

    // Extract the `Comment` field from the scontrol output
    const commentLine = stdout.split('\n').find(line => line.trim().startsWith('Comment='));
    if (commentLine) {
      const parts = commentLine.split('=');
      const comment = parts.length > 1 ? parts[1].trim() : null;
      if (comment) {
        callback(null, comment);
      } else {
        callback('Comment field is empty');
      }
    } else {
      callback('No Comment field found in job details');
    }
  });
};


// Function to handle zipping job folder and checking the status
const zipJobFolder = async (jobId) => {
  try {
    const response = await axios.post('http://192.168.56.21:5003/zip-job', { Job_id: jobId });

    if (response.status === 200) {
      return `/jobs/${jobId}`;
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error zipping job folder:', error);
    return null;
  }
};

app.get('/jobs', async (req, res) => {
  exec('sacct --starttime=2024-01-01 --format=JobID,JobName,Start,End,Partition,AllocCPUS,State,ExitCode,Comment -p', async (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: stderr || 'Failed to get job list' });
    }

    // Split the output into lines
    const lines = stdout.split('\n');

    // Skip the header line and any empty lines
    const headerLine = lines[0].trim();
    if (!headerLine) {
      return res.status(500).json({ error: 'Invalid sacct output format' });
    }

    // Initialize an array to hold the parsed job data
    const jobs = [];

    // Temporary object to hold a job with its batch job
    let currentJob = null;

    // Process each line (skip the header and empty lines)
    lines.slice(1).forEach(line => {
      const fields = line.split('|').map(field => field.trim());

      if (fields.length >= 9) {
        // If this is the main job line (not the batch line)
        if (!fields[1].includes('.batch')) {
          // If we were processing a batch job, push the current job to the array
          if (currentJob) {
            jobs.push(currentJob);
          }
          // Start a new main job entry
          currentJob = {
            jobId: fields[0],
            jobName: fields[1],
            start: formatDate(fields[2]),  // Format the Start time
            end: formatDate(fields[3]),    // Format the End time
            partition: fields[4],
            allocCPUs: parseInt(fields[5], 10),
            state: fields[6],
            exitCode: fields[7],
            userName: fields[8] || null,  // Store the comment directly from sacct output
            download_link: null, // Initialize the download link to null
          };
        } else {
          // This is a batch job, append batch job info to the current job
          if (currentJob) {
            currentJob.batchJob = {
              jobId: fields[0],
              jobName: fields[1],
              start: formatDate(fields[2]),  // Format the Start time
              end: formatDate(fields[3]),    // Format the End time
              state: fields[6],
              exitCode: fields[7],
            };
          }
        }
      }
    });

    // Push the last job to the list if it exists
    if (currentJob) {
      jobs.push(currentJob);
    }

    // Fetch comments for running jobs and zip job folders
    const runningJobs = jobs.filter(job => job.state === 'RUNNING');
    
    let runningJobCommentsFetched = 0;
    let totalRunningJobs = runningJobs.length;

    // Use Promise.all to handle asynchronous zipping and fetching comments
    await Promise.all(jobs.map(async (job) => {
      // Only fetch comments for running jobs
      if (job.state === 'RUNNING') {
        await new Promise((resolve) => {
          fetchJobComment(job.jobId, (err, comment) => {
            
            if (err) {
              console.log("Mera error")
              job.userName = null;
            } else {
              console.log("comment : "+comment);
              job.userName = comment;
            }
            resolve();
          });
        });
      }

      // Set download link for job folder
      const downloadLink = await zipJobFolder(job.jobId);
      if (downloadLink) {
        job.download_link = `http://192.168.56.21:8000/${job.jobId}.zip`;
      } else {
        job.download_link = null;
      }
    }));

    res.json({ jobs });
  });
});

// Route to get the predicted next job ID
app.get('/next-job-id', (req, res) => {
  exec('sacct --starttime=2024-01-01 --format=JobID -p', (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: stderr || 'Failed to get job list' });
    }

    const lines = stdout.split('\n').slice(1).filter(line => line.trim() !== '');
    const jobIds = lines.map(line => {
      const jobId = line.split('|')[0];
      return parseInt(jobId, 10);
    }).filter(Number.isInteger);

    if (jobIds.length === 0) {
      return res.status(404).json({ error: 'No jobs found' });
    }

    const maxJobId = Math.max(...jobIds);
    const nextJobId = maxJobId + 1;

    res.json({ nextJobId });
  });
});

// Health check endpoint
app.get('/health-check', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// Start the server
app.listen(port, () => {
  console.log(`Slurm API server running at http://localhost:${port}`);
});
