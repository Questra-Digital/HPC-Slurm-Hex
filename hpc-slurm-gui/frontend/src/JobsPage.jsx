'use client';

import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import axios from 'axios';
import {
  Tabs, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Button, Paper, TextField, Grid, Box, Typography,
} from '@mui/material';

// API base URL from environment variable
const API_BASE_URL = 'http://192.168.56.20:5000';

const WORKER_API_BASE_URL = 'http://192.168.56.21:5003';

const JobsPage = () => {
  const [jobs, setJobs] = useState([]);
  const [selectedTab, setSelectedTab] = useState(0);
  const [jobName, setJobName] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [username] = useState(sessionStorage.getItem('username') || 'default_user_name');
  const [userRole] = useState(sessionStorage.getItem('user_role') || 'simple_user');
  const [nextJobId, setNextJobId] = useState(0);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/jobs`);
        const fetchedJobs = response.data.jobs;

        setJobs(fetchedJobs);

        if (fetchedJobs.length >= 2) {
          const secondLastJobId = fetchedJobs[fetchedJobs.length - 2]?.jobId;
          let temp = Number(secondLastJobId);
          setNextJobId(temp + 1);
        } else {
          setNextJobId(1);
        }
      } catch (error) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: error.message || 'Failed to fetch jobs.',
        });
      }
    };

    fetchJobs();
  }, []);

  const filterJobs = (state) => {
    return jobs.filter((job) => {
      if (userRole === 'simple user' && job.userName !== username) {
        return false; // Filter out jobs not related to the current user
      }

      if (job.jobName === "batch") return false;

      if (state !== "OTHER") {
        return job.state.toLowerCase().includes(state.toLowerCase());
      }

      const excludedWords = ["completed", "failed", "cancelled", "running"];
      return !excludedWords.some((word) => job.state.toLowerCase().includes(word));
    });
  };

  const handleTabChange = (event, newValue) => setSelectedTab(newValue);

  const handleDownload = (downloadLink) => {
    if (downloadLink) {
      window.location.href = downloadLink;
    } else {
      Swal.fire({
        icon: 'warning',
        title: 'No download link available',
        text: 'This job does not have a download link.',
      });
    }
  };

  const handleSubmitJob = async () => {
    if (!jobName || !githubUrl) {
      Swal.fire({
        icon: 'warning',
        title: 'Incomplete Form',
        text: 'Please fill out all fields before submitting.',
        showCloseButton: true,
        confirmButtonColor: "#FF4B5B",
        confirmButtonText: "Close",
      });
      return;
    }

    const payload = {
      Job_id: nextJobId.toString(),
      Job_name: jobName,
      github_url: githubUrl,
      user_name: username,
    };

    try {
      Swal.fire({
        title: 'Please wait...',
        text: 'Cloning Repository',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      await axios.post(`${WORKER_API_BASE_URL}/submit-job`, payload);

      Swal.fire({
        icon: 'success',
        title: 'Job Submitted',
        text: `Your job "${jobName}" has been submitted successfully!`,
        showCloseButton: true,
        confirmButtonColor: "#FF4B5B",
        confirmButtonText: "Close",
      }).then(() => {
        window.location.reload();
      });

      setJobName('');
      setGithubUrl('');
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Submission Failed',
        text: error.response?.data?.message || 'Something went wrong. Please try again.',
        showCloseButton: true,
        confirmButtonColor: "#FF4B5B",
        confirmButtonText: "Close",
      });
    }
  };

  const handleCancelJob = async (jobId) => {
    try {
      const confirmation = await Swal.fire({
        title: 'Are you sure?',
        text: `Do you really want to cancel job '${jobId}'?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Yes, cancel it!',
      });

      if (!confirmation.isConfirmed) return;

      const response = await axios.post(`${WORKER_API_BASE_URL}/cancel-job`, { Job_id: jobId });

      Swal.fire({
        icon: 'success',
        title: 'Job Canceled',
        text: response.data.message,
        showCloseButton: true,
        confirmButtonColor: "#FF4B5B",
        confirmButtonText: "Close",
      }).then(() => {
        window.location.reload();
      });
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Cancellation Failed',
        text: error.response?.data?.message || 'Something went wrong. Please try again.',
        showCloseButton: true,
        confirmButtonColor: "#FF4B5B",
        confirmButtonText: "Close",
      });
    }
  };

  const JobTable = ({ jobs }) => (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Job ID</TableCell>
            <TableCell>Job Name</TableCell>
            <TableCell>Username</TableCell>
            <TableCell>Start</TableCell>
            <TableCell>{selectedTab === 1 ? 'End' : 'Allocated CPU'}</TableCell>
            <TableCell>State</TableCell>
            {selectedTab !== 0 && <TableCell>Download</TableCell>}
            {selectedTab === 0 && <TableCell>Cancel</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {jobs.map((job, index) => (
            <TableRow key={job.jobId} className={index % 2 === 0 ? 'bg-gray-100' : ''}>
              <TableCell>{job.jobId}</TableCell>
              <TableCell>{job.jobName}</TableCell>
              <TableCell>{job.userName}</TableCell>
              <TableCell>{job.start}</TableCell>
              <TableCell>{selectedTab === 1 ? job.end : job.allocCPUs}</TableCell>
              <TableCell>{job.state}</TableCell>
              {selectedTab !== 0 && (
                <TableCell>
                  <Button
                    variant="outlined"
                    color="primary"
                    onClick={() => handleDownload(job.download_link)}
                    disabled={!job.download_link}
                  >
                    {job.download_link ? 'Download' : 'No Link'}
                  </Button>
                </TableCell>
              )}
              {selectedTab === 0 && (
                <TableCell>
                  <Button
                    variant="outlined"
                    color="error"
                    onClick={() => handleCancelJob(job.jobId)}
                  >
                    Cancel
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  return (
    <Box className="flex-1 w-full max-w-[1800px] mx-auto p-8 mb-8">
      <Grid container spacing={4} className="mt-6">
        <Grid item xs={12} md={5}>
          <Paper elevation={3} sx={{ padding: 3, position: 'sticky', top: '100px' }}>
            <Typography variant="h6" color="#132577" gutterBottom>
              Submit New Job
            </Typography>
            <TextField
              label="Job Name"
              variant="outlined"
              fullWidth
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
              className="mb-4"
            />
            <TextField
              label="GitHub Link"
              variant="outlined"
              fullWidth
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              className="mb-4"
            />
            <Button
              fullWidth
              variant="contained"
              color="primary"
              onClick={handleSubmitJob}
              sx={{ marginTop: '10px' }}
            >
              Submit Job
            </Button>
          </Paper>
        </Grid>
        <Grid item xs={12} md={7}>
          <Paper elevation={3} sx={{ padding: 3 }}>
            <Tabs value={selectedTab} onChange={handleTabChange} aria-label="Job State Tabs" variant="scrollable">
              <Tab label="RUNNING" />
              <Tab label="COMPLETED" />
              <Tab label="CANCELLED" />
              <Tab label="FAILED" />
              <Tab label="OTHER" />
            </Tabs>
            <Box sx={{ marginTop: 3 }}>
              <JobTable jobs={filterJobs(['RUNNING', 'COMPLETED', 'CANCELLED', 'FAILED', 'OTHER'][selectedTab])} />
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default JobsPage;
