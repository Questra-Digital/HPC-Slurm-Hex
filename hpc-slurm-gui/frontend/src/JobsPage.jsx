import { useState, useEffect } from "react";
import axios from "axios";

// API base URLs
const BACKEND_API_BASE_URL = import.meta.env.VITE_BACKEND_API_BASE_URL
const MASTER_NODE_API_BASE_URL = import.meta.env.VITE_MASTER_NODE_API_BASE_URL

export default function JobsPage({ user }) {
  const [jobs, setJobs] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [selectedTab, setSelectedTab] = useState(0);
  const [jobName, setJobName] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [cpuRequest, setCpuRequest] = useState("");
  const [gpuRequest, setGpuRequest] = useState("");
  const [memoryRequest, setMemoryRequest] = useState(""); // In GB
  const [username] = useState(sessionStorage.getItem("username") || "default_user_name");
  const [userRole] = useState(sessionStorage.getItem("user_role") || "user");
  const [userId] = useState(sessionStorage.getItem("id") || "default_id");
  const [nextJobId, setNextJobId] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [resourceLimits, setResourceLimits] = useState({
    max_cpu: 0,
    max_gpu: 0,
    max_memory: 0,
  });
  // New state for resource context selection
  const [resourceContext, setResourceContext] = useState("user"); // "user" or "group"
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [userGroups, setUserGroups] = useState([]);

  useEffect(() => {
    fetchInitialData();
    // Poll for job updates every 30 seconds
    const interval = setInterval(fetchJobs, 30000);
    return () => clearInterval(interval); 
  }, []);

  const fetchInitialData = async () => {
    try {
      setIsLoading(true);
      const [jobsRes, nodesRes, groupsRes] = await Promise.all([
        axios.get(`${MASTER_NODE_API_BASE_URL}/jobs`),
        axios.get(`${BACKEND_API_BASE_URL}/nodes/get-nodes-list`),
        axios.get(`${BACKEND_API_BASE_URL}/users/users/${userId}/groups`), // Fetch user's groups
      ]);

      setJobs(jobsRes.data.jobs || []);
      setNodes(nodesRes.data.filter(node => node.node_type === "worker" && node.status === "active"));
      setUserGroups(groupsRes.data || []);

      // Fetch initial resource limits (default to user)
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
        ? `${BACKEND_API_BASE_URL}/resources/resource-limits?user_id=${id}`
        : `${BACKEND_API_BASE_URL}/resources/resource-limits?group_id=${id}`;
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
    try {
      const jobsRes = await axios.get(`${MASTER_NODE_API_BASE_URL}/jobs`);
      setJobs(jobsRes.data.jobs || []);
    } catch (error) {
      console.error("Failed to fetch jobs:", error);
    }
  };

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
    if (!jobName || !githubUrl || !selectedNodeId || !cpuRequest || !memoryRequest) {
      showAlert("warning", "Incomplete Form", "Please fill out all required fields.");
      return;
    }

    if (resourceContext === "group" && !selectedGroupId) {
      showAlert("warning", "Group Selection", "Please select a group.");
      return;
    }

    // Fetch resource limits based on selected context before validation
    await fetchResourceLimits(resourceContext, resourceContext === "user" ? userId : selectedGroupId);

    if (!validateResources()) return;

    const payload = {
      Job_id: nextJobId.toString(),
      Job_name: jobName,
      github_url: githubUrl,
      user_name: username, // Always use user_id/username for submission tracking
      node_id: selectedNodeId,
      cpu_request: parseInt(cpuRequest),
      gpu_request: parseInt(gpuRequest) || 0,
      memory_request: parseFloat(memoryRequest),
    };

    try {
      setIsLoading(true);
      showLoading("Please wait...", "Submitting Job");

      const nodeResponse = await axios.get(`${BACKEND_API_BASE_URL}/nodes/get-nodes-list`);
      const selectedNode = nodeResponse.data.find(node => node.id === parseInt(selectedNodeId));

      if (!selectedNode) {
        throw new Error("Selected node not found");
      }

      const workerUrl = `http://${selectedNode.ip_address}:5000/submit-job`;
      await axios.post(workerUrl, payload);

      showAlert("success", "Job Submitted", `Job "${jobName}" submitted successfully!`, () => {
        fetchInitialData();
      });

      setJobName("");
      setGithubUrl("");
      setSelectedNodeId("");
      setCpuRequest("");
      setGpuRequest("");
      setMemoryRequest("");
      setResourceContext("user"); // Reset to default
      setSelectedGroupId("");
    } catch (error) {
      showAlert("error", "Submission Failed", error.response?.data?.message || error.message || "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelJob = async (jobId) => {
    try {
      const confirmed = await showConfirm("Are you sure?", `Do you really want to cancel job '${jobId}'?`);
      if (!confirmed) return;

      setIsLoading(true);
      const response = await axios.post(`http://192.168.56.21:5000/cancel-job`, { Job_id: jobId });
      showAlert("success", "Job Canceled", response.data.message, () => {
        fetchInitialData();
      });
    } catch (error) {
      showAlert("error", "Cancellation Failed", error.response?.data?.message || "Something went wrong.");
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
    alert(`${title}: ${text}`);
    if (callback) callback();
  };

  const showConfirm = (title, text) => {
    return window.confirm(`${title}\n${text}`);
  };

  const showLoading = (title, text) => {
    console.log(`Loading: ${title} - ${text}`);
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
          {/* Submit New Job Section */}
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
                <label htmlFor="github-url">GitHub Link</label>
                <input
                  id="github-url"
                  type="text"
                  placeholder="Enter GitHub repository URL"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                />
              </div>
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

          {/* Jobs List Section */}
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
                    {selectedTab !== 0 && <th>Download</th>}
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
                      {selectedTab !== 0 && (
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