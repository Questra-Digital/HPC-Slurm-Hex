import React from 'react';
import { useState, useEffect, useRef } from "react";
import axios from "axios";
import Swal from 'sweetalert2';

import { API_BASE_URL } from "../config";

export default function JobsPage({ user }) {
  const [jobs, setJobs] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [selectedTab, setSelectedTab] = useState(0);
  const [jobName, setJobName] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [sourceType, setSourceType] = useState("github"); // Default to GitHub
  const [source, setSource] = useState(""); // Stores GitHub URL or file path
  const [selectedFiles, setSelectedFiles] = useState([]); // Stores selected files
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [cpuRequest, setCpuRequest] = useState("");
  const [gpuRequest, setGpuRequest] = useState("");
  const [memoryRequest, setMemoryRequest] = useState(""); 
  const [username] = useState(sessionStorage.getItem("username") || "null");
  const [userRole] = useState(sessionStorage.getItem("user_role") || "user");
  const [userId] = useState(sessionStorage.getItem("id") || "null");
  const [email] = useState(sessionStorage.getItem('email') || "null");
  const [nextJobId, setNextJobId] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [resourceLimits, setResourceLimits] = useState({
    max_cpu: 0,
    max_gpu: 0,
    max_memory: 0,
  });
  const [resourceContext, setResourceContext] = useState("user");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [userGroups, setUserGroups] = useState([]);
  const [masterNodeIp, setMasterNodeIp] = useState(null);

  const fileInputRef = useRef(null);

  // Handle files selected from file picker
  const handleFilesChange = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles(files);
    setSource(files.length > 0 ? files[0].name : "");
  };

  useEffect(() => {
    fetchMasterNodeIp();
  }, []);

  useEffect(() => {
    if (!masterNodeIp) return;
  
    const interval = setInterval(() => {
      fetchJobs();
    }, 3000); // every 3 seconds
  
    fetchJobs();
  
    return () => clearInterval(interval);
  }, [masterNodeIp]);

  const fetchMasterNodeIp = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/nodes/get-nodes-list`);
      const nodes = response.data;
      const masterNode = nodes.find(node => node.node_type === "master");
      if (masterNode) {
        setMasterNodeIp(masterNode.ip_address);
      }
    } catch (error) {
      console.error("Failed to fetch master node IP:", error);
    }
  };
  
  const fetchInitialData = async () => {
    if (!masterNodeIp) return;

    try {
      setIsLoading(true);
      const [jobsRes, nodesRes, groupsRes] = await Promise.all([
        axios.get(`http://${masterNodeIp}:5050/jobs`),
        axios.get(`${BACKEND_API_BASE_URL}/nodes/get-nodes-list`),
        axios.get(`${BACKEND_API_BASE_URL}/users/users/${userId}/groups`),
      ]);

      setJobs(jobsRes.data.jobs || []);
      setNodes(nodesRes.data.filter(node => node.node_type === "worker" && node.status === "active"));
      setUserGroups(groupsRes.data || []);

      await fetchResourceLimits("user", userId);

      const fetchedJobs = jobsRes.data.jobs || [];
      if (fetchedJobs.length >= 2) {
        const secondLastJobId = fetchedJobs[fetchedJobs.length - 2]?.jobId;
        setNextJobId(Number(secondLastJobId) + 1);
      } else {
        setNextJobId(1);
      }
    } catch (error) {
      showAlert("error", "Error", error.message || "Failed to fetch initial data.");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchResourceLimits = async (context, id) => {
    try {
      const url = context === "user"
        ? `${API_BASE_URL}/resources/resource-limits?user_id=${id}`
        : `${API_BASE_URL}/resources/resource-limits?group_id=${id}`;
      const limitsRes = await axios.get(url);
      setResourceLimits({
        max_cpu: limitsRes.data.max_cpu || 0,
        max_gpu: limitsRes.data.max_gpu || 0,
        max_memory: limitsRes.data.max_memory || 0,
      });
    } catch (error) {
      showAlert("error", "Error", error.message || "Failed to fetch resource limits.");
    }
  };

  const fetchJobs = async () => {
    if (!masterNodeIp) return;
  
    try {
      const jobsRes = await axios.get(`http://${masterNodeIp}:5050/jobs`);
      const newJobs = jobsRes.data.jobs || [];
  
      if (newJobs.length !== jobs.length) {
        setJobs(newJobs);
      }
    } catch (error) {
      console.error("Failed to fetch jobs:", error);
    }
  };

  useEffect(() => {
    if (masterNodeIp) {
      fetchInitialData();
    }
  }, [masterNodeIp]);

  const filterJobs = (state) => {
    return jobs.filter((job) => {
      if (userRole === "user" && job.userName !== username) {
        return false;
      }
      if (job.jobName === "batch") return false;
      if (state !== "OTHER") {
        return job.state.toLowerCase().includes(state.toLowerCase());
      }
      const excludedWords = ["completed", "failed", "cancelled", "running"];
      return !excludedWords.some((word) => job.state.toLowerCase().includes(word));
    });
  };

  const validateResources = () => {
    const cpu = parseInt(cpuRequest) || 0;
    const gpu = parseInt(gpuRequest) || 0;
    const memory = parseFloat(memoryRequest) || 0;

    if (!selectedNodeId) {
      showAlert("warning", "Node Selection", "Please select a node.");
      return false;
    }

    if (cpu > resourceLimits.max_cpu || gpu > resourceLimits.max_gpu || memory > resourceLimits.max_memory) {
      showAlert("warning", "Resource Limit Exceeded",
        `Requested resources (CPU: ${cpu}/${resourceLimits.max_cpu}, GPU: ${gpu}/${resourceLimits.max_gpu}, Memory: ${memory}/${resourceLimits.max_memory} GB) exceed your limits.`);
      return false;
    }

    const selectedNode = nodes.find(node => node.id === parseInt(selectedNodeId));
    if (!selectedNode || cpu > selectedNode.cpu_count || gpu > (selectedNode.gpu_count || 0) || memory > (selectedNode.total_memory_gb || 0)) {
      showAlert("warning", "Node Capacity Exceeded",
        `Requested resources exceed node capacity (CPU: ${cpu}/${selectedNode.cpu_count}, GPU: ${gpu}/${selectedNode.gpu_count || 0}, Memory: ${memory}/${selectedNode.total_memory_gb || 0} GB).`);
      return false;
    }

    return true;
  };

  const handleSubmitJob = async () => {
    if (!jobName || !source || !selectedNodeId || !cpuRequest || !memoryRequest) {
      showAlert("warning", "Incomplete Form", "Please fill out all required fields.");
      return;
    }

    if (resourceContext === "group" && !selectedGroupId) {
      showAlert("warning", "Group Selection", "Please select a group.");
      return;
    }

    await fetchResourceLimits(resourceContext, resourceContext === "user" ? userId : selectedGroupId);

    if (!validateResources()) return;

    let downloadUrl;

    if (sourceType === "github") {
      downloadUrl = source; // Use the GitHub URL directly
    } else {
      // Handle file upload for folder source type
      if (selectedFiles.length === 0) {
        showAlert("warning", "No Files Selected", "Please select at least one file to upload.");
        return;
      }

      try {
        setIsLoading(true);
        showLoading("Uploading File...", "Please wait while the file is being uploaded");

        const formData = new FormData();
        selectedFiles.forEach((file, index) => {
          formData.append(`file${index}`, file);
        });

        // Call backend endpoint to upload file via SFTP
        const uploadResponse = await axios.post(`${API_BASE_URL}/jobs/upload-ftp`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        downloadUrl = uploadResponse.data.download_url;

        if (!downloadUrl) {
          throw new Error("Failed to get download URL from server.");
        }

        Swal.close();
      } catch (error) {
        Swal.close();
        showAlert("error", "File Upload Failed", error.response?.data?.message || error.message || "Failed to upload file.");
        setIsLoading(false);
        return;
      }
    }

    const payload = {
      Job_id: nextJobId.toString(),
      Job_name: jobName,
      github_url: downloadUrl, // Use download URL for both GitHub and file uploads
      user_name: username,
      node_id: selectedNodeId,
      cpu_request: parseInt(cpuRequest),
      gpu_request: parseInt(gpuRequest) || 0,
      memory_request: parseFloat(memoryRequest),
      user_email: email,
    };

    try {
      showLoading("Submitting Job...", "Please wait");

      const nodeResponse = await axios.get(`${API_BASE_URL}/nodes/get-nodes-list`);
      const selectedNode = nodeResponse.data.find(node => node.id === parseInt(selectedNodeId));

      if (!selectedNode) {
        throw new Error("Selected node not found");
      }

      const workerUrl = `http://${selectedNode.ip_address}:5050/submit-job`;
      await axios.post(workerUrl, payload);

      Swal.close();
      
      showAlert("success", "Job Submitted", `Job "${jobName}" submitted successfully!`, () => {
        fetchInitialData();
      });

      setJobName("");
      setSource("");
      setSelectedFiles([]);
      setSelectedNodeId("");
      setCpuRequest("");
      setGpuRequest("");
      setMemoryRequest("");
      setResourceContext("user");
      setSelectedGroupId("");
      if (fileInputRef.current) {
        fileInputRef.current.value = null; // Clear file input
      }
    } catch (error) {
      Swal.close();
      showAlert("error", "Submission Failed", error.response?.data?.message || error.message || "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelJob = async (jobId) => {
    if (!masterNodeIp) return;
  
    try {
      const confirmed = await showConfirm("Are you sure?", `Do you really want to cancel job '${jobId}'?`);
      if (!confirmed) return;
  
      setIsLoading(true);
  
      const jobIpRes = await axios.get(`http://${masterNodeIp}:5050/job-ip/${jobId}`);
      const nodeIp = jobIpRes.data?.nodes?.[0]?.ip;
  
      if (!nodeIp) {
        throw new Error("Unable to determine job node IP.");
      }
  
      const response = await axios.post(`http://${nodeIp}:5050/cancel-job`, { Job_id: jobId });
  
      showAlert("success", "Job Canceled", response.data.message, () => {
        fetchInitialData();
      });
    } catch (error) {
      showAlert("error", "Cancellation Failed", error.response?.data?.message || error.message || "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };
  

  const handleDownload = (downloadLink) => {
    if (downloadLink) {
      window.location.href = downloadLink;
    } else {
      showAlert("warning", "No Download Link", "This job has no download link available.");
    }
  };

  const showAlert = (icon, title, text, callback) => {
    Swal.fire({
      icon: icon,
      title: title,
      text: text,
      confirmButtonColor: '#1e3a8a',
      confirmButtonText: 'OK'
    }).then((result) => {
      if (result.isConfirmed && callback) {
        callback();
      }
    });
  };

  const showConfirm = async (title, text) => {
    const result = await Swal.fire({
      title: title,
      text: text,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#1e3a8a',
      cancelButtonColor: '#b91c1c',
      confirmButtonText: 'Yes',
      cancelButtonText: 'No'
    });
    return result.isConfirmed;
  };

  const showLoading = (title, text) => {
    Swal.fire({
      title: title,
      text: text,
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });
  };

  const getTabClass = (index) => {
    return `tab-item ${selectedTab === index ? "active-tab" : ""}`;
  };

  return (
    <div className="jobs-container">
      <div className="jobs-card">
        <div className="header">
          <h1>Jobs Management</h1>
          <p className="subtitle">Submit and monitor your computing jobs</p>
        </div>

        <div className="content-container">
          <div className="section job-form-section">
            <h2>Submit New Job</h2>
            <div className="job-form">
              <div className="input-group">
                <label htmlFor="job-name">Job Name</label>
                <input
                  id="job-name"
                  type="text"
                  placeholder="Enter job name"
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                />
              </div>
              <div className="input-group">
                <label>Source Type</label>
                <div className="flex space-x-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="source-type"
                      value="github"
                      checked={sourceType === "github"}
                      onChange={() => {
                        setSourceType("github");
                        setSource("");
                        setSelectedFiles([]);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = null;
                        }
                      }}
                    />
                    <span className="ml-2">GitHub URL</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="source-type"
                      value="folder"
                      checked={sourceType === "folder"}
                      onChange={() => {
                        setSourceType("folder");
                        setSource("");
                        setSelectedFiles([]);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = null;
                        }
                      }}
                    />
                    <span className="ml-2">Upload File</span>
                  </label>
                </div>
              </div>
              {sourceType === "github" ? (
                <div className="input-group">
                  <label htmlFor="github-url">GitHub Link</label>
                  <input
                    id="github-url"
                    type="text"
                    placeholder="Enter GitHub repository URL"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                  />
                </div>
              ) : (
                <div className="input-group">
                  <label htmlFor="file-upload">Upload Files</label>
                  <input
                    id="file-upload"
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFilesChange}
                    multiple
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  {source && (
                    <p className="mt-2 text-sm text-gray-600">Selected: {source}</p>
                  )}
                </div>
              )}
              <div className="input-group">
                <label htmlFor="node-select">Select Node</label>
                <select
                  id="node-select"
                  value={selectedNodeId}
                  onChange={(e) => setSelectedNodeId(e.target.value)}
                >
                  <option value="">-- Select a Node --</option>
                  {nodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.name} (CPU: {node.cpu_count}, GPU: {node.gpu_count || 0}, Memory: {node.total_memory_gb} GB)
                    </option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label htmlFor="resource-context">Resource Context</label>
                <select
                  id="resource-context"
                  value={resourceContext}
                  onChange={(e) => {
                    setResourceContext(e.target.value);
                    if (e.target.value === "user") {
                      fetchResourceLimits("user", userId);
                      setSelectedGroupId("");
                    }
                  }}
                >
                  <option value="user">User (Individual Limits)</option>
                  <option value="group">Group (Group Limits)</option>
                </select>
              </div>
              {resourceContext === "group" && (
                <div className="input-group">
                  <label htmlFor="group-select">Select Group</label>
                  <select
                    id="group-select"
                    value={selectedGroupId}
                    onChange={(e) => {
                      setSelectedGroupId(e.target.value);
                      if (e.target.value) {
                        fetchResourceLimits("group", e.target.value);
                      }
                    }}
                  >
                    <option value="">-- Select a Group --</option>
                    {userGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="input-group">
                <label htmlFor="cpu-request">CPU Cores (Max: {resourceLimits.max_cpu})</label>
                <input
                  id="cpu-request"
                  type="number"
                  min="1"
                  placeholder="Enter CPU cores"
                  value={cpuRequest}
                  onChange={(e) => setCpuRequest(e.target.value)}
                />
              </div>
              <div className="input-group">
                <label htmlFor="gpu-request">GPUs (Max: {resourceLimits.max_gpu})</label>
                <input
                  id="gpu-request"
                  type="number"
                  min="0"
                  placeholder="Enter GPUs (optional)"
                  value={gpuRequest}
                  onChange={(e) => setGpuRequest(e.target.value)}
                />
              </div>
              <div className="input-group">
                <label htmlFor="memory-request">Memory (GB, Max: {resourceLimits.max_memory})</label>
                <input
                  id="memory-request"
                  type="number"
                  min="1"
                  step="0.1"
                  placeholder="Enter memory in GB"
                  value={memoryRequest}
                  onChange={(e) => setMemoryRequest(e.target.value)}
                />
              </div>
              <button
                className="submit-btn"
                onClick={handleSubmitJob}
                disabled={isLoading}
              >
                {isLoading ? "Submitting..." : "Submit Job"}
              </button>
            </div>
          </div>

          <div className="section jobs-list-section">
            <h2>Jobs Status</h2>
            <div className="tabs-container">
              <div className={getTabClass(0)} onClick={() => setSelectedTab(0)}>RUNNING</div>
              <div className={getTabClass(1)} onClick={() => setSelectedTab(1)}>COMPLETED</div>
              <div className={getTabClass(2)} onClick={() => setSelectedTab(2)}>CANCELLED</div>
              <div className={getTabClass(3)} onClick={() => setSelectedTab(3)}>FAILED</div>
              <div className={getTabClass(4)} onClick={() => setSelectedTab(4)}>OTHER</div>
            </div>
            <div className="jobs-table-container">
              <table className="jobs-table">
                <thead>
                  <tr>
                    <th>Job ID</th>
                    <th>Job Name</th>
                    <th>Username</th>
                    <th>Start</th>
                    <th>Resources</th>
                    <th>State</th>
                    {selectedTab === 1 && <th>Download</th>}
                    {selectedTab === 0 && <th>Cancel</th>}
                  </tr>
                </thead>
                <tbody>
                  {filterJobs(["RUNNING", "COMPLETED", "CANCELLED", "FAILED", "OTHER"][selectedTab]).map((job, index) => (
                    <tr key={job.jobId} className={index % 2 === 0 ? "row-even" : "row-odd"}>
                      <td>{job.jobId}</td>
                      <td>{job.jobName}</td>
                      <td>{job.userName}</td>
                      <td>{job.start}</td>
                      <td>{`${job.cpu_request || 0} CPU, ${job.gpu_request || 0} GPU, ${job.memory_request || 0} GB`}</td>
                      <td>
                        <span className={`status-pill status-${job.state.toLowerCase()}`}>
                          {job.state}
                        </span>
                      </td>
                      {selectedTab === 1 && (
                        <td>
                          <button
                            className={`action-btn download-btn ${!job.download_link ? "disabled-btn" : ""}`}
                            onClick={() => handleDownload(job.download_link)}
                            disabled={!job.download_link}
                          >
                            {job.download_link ? "Download" : "No Link"}
                          </button>
                        </td>
                      )}
                      {selectedTab === 0 && (
                        <td>
                          <button
                            className="action-btn cancel-btn"
                            onClick={() => handleCancelJob(job.jobId)}
                          >
                            Cancel
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {filterJobs(["RUNNING", "COMPLETED", "CANCELLED", "FAILED", "OTHER"][selectedTab]).length === 0 && (
                    <tr>
                      <td colSpan={selectedTab === 0 ? 7 : 7} className="no-jobs">
                        No jobs in this category
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .jobs-container {
          display: flex;
          justify-content: center;
          padding: 20px;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          height: auto;
          overflow-y: auto;
        }
        
        .jobs-card {
          background-color: #ffffff;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          padding: 24px;
          width: 100%;
          display: flex;
          flex-direction: column;
        }
        
        .header {
          margin-bottom: 24px;
          border-bottom: 1px solid #eaeaea;
          padding-bottom: 16px;
          text-align: center;
        }
        
        .header h1 {
          color: #1e3a8a;
          font-size: 24px;
          margin: 0 0 8px 0;
        }
        
        .subtitle {
          color: #666;
          margin: 0;
          font-size: 14px;
        }
        
        .content-container {
          display: flex;
          flex-wrap: wrap;
          gap: 20px;
          flex: 1;
          overflow: hidden;
        }
        
        .section {
          background-color: #fafafa;
          border-radius: 6px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
          padding: 16px;
        }
        
        .section h2 {
          color: #1e3a8a;
          font-size: 18px;
          margin: 0 0 16px 0;
          font-weight: 600;
        }
        
        .job-form-section {
          flex: 1;
          min-width: 300px;
          max-width: 400px;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
        }
        
        .job-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
          flex-grow: 1;
        }
        
        .jobs-list-section {
          flex: 2;
          min-width: 600px;
          display: flex;
          flex-direction: column;
        }
        
        .input-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        
        .input-group label {
          font-size: 14px;
          color: #555;
        }
        
        .input-group input, .input-group select {
          padding: 10px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
          transition: border-color 0.3s;
        }
        
        .input-group input:focus, .input-group select:focus {
          outline: none;
          border-color: #1e40af;
          box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.1);
        }
        
        .input-group input::placeholder {
          color: #aaa;
        }
        
        .submit-btn {
          background-color: #1e3a8a;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 12px 16px;
          margin-top: 8px;
          cursor: pointer;
          font-weight: 500;
          transition: background-color 0.2s;
          width: 100%;
          flex-shrink: 0;
        }
        
        .submit-btn:hover {
          background-color: #1e40af;
        }
        
        .submit-btn:disabled {
          background-color: #94a3b8;
          cursor: not-allowed;
        }
        
        .tabs-container {
          display: flex;
          border-bottom: 1px solid #e5e7eb;
          margin-bottom: 16px;
          overflow-x: auto;
        }
        
        .tab-item {
          padding: 8px 16px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          color: #64748b;
          border-bottom: 2px solid transparent;
          transition: all 0.2s;
          white-space: nowrap;
        }
        
        .tab-item:hover {
          color: #1e3a8a;
        }
        
        .active-tab {
          color: #1e3a8a;
          border-bottom: 2px solid #1e3a8a;
        }
        
        .jobs-table-container {
          overflow-y: auto;
          flex: 1;
          min-height: 200px;
          max-height: 500px;
        }
        
        .jobs-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }
        
        .jobs-table th {
          text-align: left;
          padding: 12px;
          background-color: #f8fafc;
          color: #475569;
          font-weight: 600;
          border-bottom: 1px solid #e2e8f0;
          position: sticky;
          top: 0;
          z-index: 10;
        }
        
        .jobs-table td {
          padding: 12px;
          border-bottom: 1px solid #e2e8f0;
          color: #334155;
        }
        
        .row-even {
          background-color: #f8fafc;
        }
        
        .row-odd {
          background-color: #ffffff;
        }
        
        .status-pill {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
          text-transform: capitalize;
        }
        
        .status-running {
          background-color: #dbeafe;
          color: #1e40af;
        }
        
        .status-completed {
          background-color: #dcfce7;
          color: #166534;
        }
        
        .status-cancelled {
          background-color: #fef3c7;
          color: #92400e;
        }
        
        .status-failed {
          background-color: #fee2e2;
          color: #b91c1c;
        }

        .status-other {
          background-color: #fee2e2;
          color: #5b21b6;
        }
        
        .action-btn {
          padding: 6px 12px;
          border: none;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        
        .download-btn {
          background-color: #dbeafe;
          color: #1e40af;
        }
        
        .download-btn:hover {
          background-color: #bfdbfe;
        }
        
        .cancel-btn {
          background-color: #fee2e2;
          color: #b91c1c;
        }
        
        .cancel-btn:hover {
          background-color: #fecaca;
        }
        
        .disabled-btn {
          background-color: #f1f5f9;
          color: #94a3b8;
          cursor: not-allowed;
        }
        
        .no-jobs {
          text-align: center;
          padding: 24px;
          color: #64748b;
          font-style: italic;
        }
        
        @media (max-width: 1024px) {
          .content-container {
            flex-direction: column;
          }
          .job-form-section {
            max-width: none;
          }
        }
        
        @media (max-width: 768px) {
          .jobs-container {
            padding: 10px;
            height: auto;
          }
          .jobs-list-section {
            min-width: 100%;
          }
        }
      `}</style>
    </div>
  );
}