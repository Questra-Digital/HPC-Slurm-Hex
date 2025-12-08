import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "../config";

export default function ResourceAllocation() {
  const [nodes, setNodes] = useState([]);
  const [slurmNodes, setSlurmNodes] = useState([]); // Real-time Slurm node info
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [entityType, setEntityType] = useState("user");
  const [selectedNodes, setSelectedNodes] = useState({});
  const [resourceLimits, setResourceLimits] = useState({
    max_cpu: 0,
    max_gpu: 0,
    max_memory: 0,
    max_storage: 0,
    max_jobs: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState({ message: "", type: "" });

  const calculateClusterTotals = () => {
    // Use Slurm nodes if available, otherwise fall back to database nodes
    if (slurmNodes.length > 0) {
      return slurmNodes.reduce(
        (totals, node) => ({
          totalCPU: totals.totalCPU + (node.cpuTotal || 0),
          totalGPU: totals.totalGPU + (node.gres ? parseInt(node.gres.match(/gpu:(\d+)/)?.[1] || 0) : 0),
          totalMemory: totals.totalMemory + (node.realMemory ? node.realMemory / 1024 : 0), // Convert MB to GB
          nodeCount: totals.nodeCount + 1,
          allocCPU: totals.allocCPU + (node.cpuAlloc || 0),
          allocMemory: totals.allocMemory + (node.allocMem ? node.allocMem / 1024 : 0),
        }),
        { totalCPU: 0, totalGPU: 0, totalMemory: 0, nodeCount: 0, allocCPU: 0, allocMemory: 0 }
      );
    }

    const workerNodes = nodes.filter((node) => node.node_type === "worker");
    return workerNodes.reduce(
      (totals, node) => ({
        totalCPU: totals.totalCPU + (node.cpu_count || 0),
        totalGPU: totals.totalGPU + (node.gpu_count || 0),
        totalMemory: totals.totalMemory + (node.total_memory_gb || 0),
        nodeCount: totals.nodeCount + 1,
        allocCPU: 0,
        allocMemory: 0,
      }),
      { totalCPU: 0, totalGPU: 0, totalMemory: 0, nodeCount: 0, allocCPU: 0, allocMemory: 0 }
    );
  };

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [nodesRes, usersRes, groupsRes, slurmNodesRes] = await Promise.all([
          fetch(`${API_BASE_URL}/nodes/get-nodes-list`),
          fetch(`${API_BASE_URL}/users/users`),
          fetch(`${API_BASE_URL}/users/groups`),
          fetch(`${API_BASE_URL}/nodes/slurm-nodes`).catch(() => ({ ok: false })),
        ]);

        if (!nodesRes.ok || !usersRes.ok || !groupsRes.ok) {
          throw new Error("Failed to fetch data");
        }

        const [nodesData, usersData, groupsData] = await Promise.all([
          nodesRes.json(),
          usersRes.json(),
          groupsRes.json(),
        ]);

        // Fetch Slurm nodes if available
        if (slurmNodesRes.ok) {
          const slurmData = await slurmNodesRes.json();
          setSlurmNodes(slurmData.nodes || []);
        }

        setNodes(nodesData);
        setUsers(usersData);
        setGroups(groupsData);
      } catch (error) {
        console.error("Error fetching initial data:", error);
        setSaveStatus({ message: "Failed to load data", type: "error" });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleEntityChange = (event) => {
    setEntityType(event.target.value);
    setSelectedEntity(null);
    resetForm();
  };

  const handleEntitySelect = (event) => {
    const id = parseInt(event.target.value);
    if (id) {
      setSelectedEntity(id);
      fetchResourceLimits(id);
    } else {
      setSelectedEntity(null);
      resetForm();
    }
  };

  const fetchResourceLimits = async (entityId) => {
    try {
      setSelectedNodes({});
      const param = entityType === "user" ? "user_id" : "group_id";
      const response = await fetch(
        `${API_BASE_URL}/resources/resource-limits?${param}=${entityId}`
      );
      if (!response.ok) throw new Error("Failed to fetch resource limits");
      const data = await response.json();
      setResourceLimits({
        max_cpu: data.max_cpu || 0,
        max_gpu: data.max_gpu || 0,
        max_memory: data.max_memory || 0,
      });
    } catch (error) {
      console.error("Error fetching resource limits:", error);
      setSaveStatus({
        message: "Failed to load resource limits",
        type: "error",
      });
    }
  };

  const handleNodeSelection = (nodeId) => {
    setSelectedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  };

  const handleResourceChange = (resource, value) => {
    setResourceLimits((prev) => ({
      ...prev,
      [resource]: parseInt(value) || 0,
    }));
  };

  const resetForm = () => {
    setSelectedNodes({});
    setResourceLimits({
      max_cpu: 0,
      max_gpu: 0,
      max_memory: 0,
    });
  };

  const handleSave = async () => {
    if (!selectedEntity) {
      setSaveStatus({
        message: "Please select a user or group",
        type: "error",
      });
      return;
    }

    try {
      const payload = {
        ...(entityType === "user"
          ? { user_id: selectedEntity }
          : { group_id: selectedEntity }),
        ...resourceLimits,
      };

      const response = await fetch(`${API_BASE_URL}/resources/resource-limits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to save resource limits");
      }

      setSaveStatus({
        message: "Resource limits saved successfully",
        type: "success",
      });
      setTimeout(() => setSaveStatus({ message: "", type: "" }), 3000);
    } catch (error) {
      console.error("Error saving resource limits:", error);
      setSaveStatus({ message: `Error: ${error.message}`, type: "error" });
    }
  };

  const clusterTotals = calculateClusterTotals();

  return (
    <div className="resource-allocation">
      <div className="header-card">
        <div className="header">
          <h1>Resource Allocation Configuration</h1>
          <p className="subtitle">Manage and allocate cluster resources</p>
        </div>
      </div>

      <div className="cluster-overview">
        <h3>Cluster Resources Overview</h3>
        <div className="stats-container">
          <div className="stat-card">
            <h4>Worker Nodes</h4>
            <div className="stat-value">{clusterTotals.nodeCount}</div>
          </div>
          <div className="stat-card">
            <h4>Total CPU Cores</h4>
            <div className="stat-value">{clusterTotals.totalCPU}</div>
          </div>
          <div className="stat-card">
            <h4>Total GPUs</h4>
            <div className="stat-value">{clusterTotals.totalGPU}</div>
          </div>
          <div className="stat-card">
            <h4>Total Memory (GB)</h4>
            <div className="stat-value">
              {clusterTotals.totalMemory.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      <div className="node-details">
        <h3>Connected Worker Nodes</h3>
        <div className="node-list">
          {nodes
            .filter((node) => node.node_type === "worker")
            .map((node) => (
              <div key={node.id} className="node-card">
                <h4>{node.name}</h4>
                <p>IP: {node.ip_address}</p>
                <p>
                  Status:{" "}
                  <span className={`status-${node.status}`}>{node.status}</span>
                </p>
                <div className="node-resources">
                  <div className="resource-item">
                    <span className="resource-label">CPU:</span>
                    <span className="resource-value">
                      {node.cpu_count} cores
                    </span>
                  </div>
                  <div className="resource-item">
                    <span className="resource-label">GPU:</span>
                    <span className="resource-value">
                      {node.gpu_count || 0} units
                    </span>
                  </div>
                  <div className="resource-item">
                    <span className="resource-label">Memory:</span>
                    <span className="resource-value">
                      {node.total_memory_gb?.toFixed(2) || 0} GB
                    </span>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>

      <div className="allocation-form">
        <h3>Allocate Resources</h3>

        <div className="form-section">
          <div className="input-group">
            <label>Allocation Type:</label>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  name="entityType"
                  value="user"
                  checked={entityType === "user"}
                  onChange={handleEntityChange}
                />
                User
              </label>
              <label>
                <input
                  type="radio"
                  name="entityType"
                  value="group"
                  checked={entityType === "group"}
                  onChange={handleEntityChange}
                />
                Group
              </label>
            </div>
          </div>

          <div className="input-group">
            <label>Select {entityType === "user" ? "User" : "Group"}:</label>
            <select value={selectedEntity || ""} onChange={handleEntitySelect}>
              <option value="">
                -- Select {entityType === "user" ? "User" : "Group"} --
              </option>
              {entityType === "user"
                ? users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.username}
                  </option>
                ))
                : groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {selectedEntity && (
          <>
            <div className="form-section">
              <h4>Set Resource Limits</h4>
              <div className="resource-limits-grid">
                <div className="input-group">
                  <label>Max CPU Cores:</label>
                  <input
                    type="number"
                    min="0"
                    max={clusterTotals.totalCPU}
                    value={resourceLimits.max_cpu}
                    onChange={(e) =>
                      handleResourceChange("max_cpu", e.target.value)
                    }
                  />
                </div>
                <div className="input-group">
                  <label>Max GPUs:</label>
                  <input
                    type="number"
                    min="0"
                    max={clusterTotals.totalGPU}
                    value={resourceLimits.max_gpu}
                    onChange={(e) =>
                      handleResourceChange("max_gpu", e.target.value)
                    }
                  />
                </div>
                <div className="input-group">
                  <label>Max Memory (GB):</label>
                  <input
                    type="number"
                    min="0"
                    max={clusterTotals.totalMemory}
                    value={resourceLimits.max_memory}
                    onChange={(e) =>
                      handleResourceChange("max_memory", e.target.value)
                    }
                  />
                </div>
              </div>
            </div>

            <div className="form-actions">
              <button className="reset-button" onClick={resetForm}>
                Reset
              </button>
              <button className="save-button" onClick={handleSave}>
                Save Allocation
              </button>
            </div>

            {saveStatus.message && (
              <div className={`status-message ${saveStatus.type}`}>
                {saveStatus.message}
              </div>
            )}
          </>
        )}
      </div>
      <style>{`
                /* ResourceAllocation.css */
.resource-allocation {
    padding: 20px;
    color: #333;
    width:95%;
    height:90vh;
  }

  
  .resource-allocation h2 {
    color: #1e3a8a;
    border-bottom: 2px solid #1e3a8a;
    padding-bottom: 10px;
    margin-bottom: 20px;
  }
  
  .resource-allocation h3 {
    color: #1e3a8a;
    margin-top: 30px;
    margin-bottom: 15px;
    font-weight: 500;
  }
  
  .resource-allocation h4 {
    color: #1e3a8a;
    margin-bottom: 10px;
    font-weight: 500;
  }
  
  /* Cluster Overview Styles */
  .cluster-overview {
    background-color: #f8f9fa;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    margin-bottom: 20px;
  }
  
  .cluster-overview h3{
margin-top:1px;
  }
  
  .stats-container {
    display: flex;
    flex-wrap: wrap;
    gap: 15px;
    margin-top: 15px;
  }
  
  .stat-card {
    background-color: white;
    border-radius: 6px;
    padding: 15px;
    flex: 1;
    min-width: 200px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    border-left: 4px solid #1e3a8a;
  }
  
  .stat-card h4 {
    margin: 0 0 10px 0;
    font-size: 14px;
    color: #7f8c8d;
  }
  
  .stat-value {
    font-size: 24px;
    font-weight: 600;
    color: #2c3e50;
  }

  .header-card {
  background-color: white;
  border-radius: 8px;
  padding: 20px 10px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border: 1px solid #e1e8ed;
  margin-bottom:20px;
}

.header {
  margin-bottom: 0; /* Remove bottom margin since it's inside a card */
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
  font-size: 14px;
  margin-bottom:-10px;
}

  
  /* Node Details Styles */
  .node-details {
    margin-bottom: 30px;
  }
  
  .node-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 20px;
  }
  
  .node-card {
    background-color: white;
    border-radius: 8px;
    padding: 15px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    border: 1px solid #e1e8ed;
  }
  
  .node-card h4 {
    margin-top: 0;
    margin-bottom: 10px;
    color: #1e3a8a;
    font-size: 18px;
  }
  
  .node-card p {
    margin: 5px 0;
    color: #34495e;
  }
  
  .status-active {
    color: #27ae60;
    font-weight: 600;
  }
  
  .status-inactive {
    color: #7f8c8d;
    font-weight: 600;
  }
  
  .status-failed {
    color: #e74c3c;
    font-weight: 600;
  }
  
  .node-resources {
    margin-top: 10px;
    background-color: #f8f9fa;
    padding: 10px;
    border-radius: 6px;
  }
  
  .resource-item {
    display: flex;
    justify-content: space-between;
    margin-bottom: 5px;
  }
  
  .resource-label {
    color: #7f8c8d;
    font-weight: 500;
  }
  
  .resource-value {
    font-weight: 600;
    color: #2c3e50;
  }
  
  /* Allocation Form Styles */
  .allocation-form {
    background-color: white;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    border: 1px solid #e1e8ed;
    height:auto;
  }
  
  .form-section {
    border-bottom: 1px solid #ecf0f1;
  }
  
  .form-section:last-child {
    border-bottom: none;
  }
  
  .input-group {
    margin-bottom: 15px;
    margin-right: 20px;
  }
  
  .input-group label {
    display: block;
    margin-bottom: 8px;
    font-weight: 500;
    color: #34495e;
  }
  
  .input-group select,
  .input-group input[type="number"] {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #dce4ec;
    border-radius: 4px;
    font-size: 14px;
    color: #2c3e50;
    background-color: #f8f9fa;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  
  .input-group select:focus,
  .input-group input[type="number"]:focus {
    border-color: #1e3a8a;
    outline: none;
    box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.2);
  }
  
  .radio-group {
    display: flex;
    gap: 20px;
  }
  
  .radio-group label {
    display: flex;
    align-items: center;
    cursor: pointer;
    font-weight: normal;
  }
  
  .radio-group input[type="radio"] {
    margin-right: 8px;
  }
  
  .node-selection-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 10px;
    margin-top: 10px;
  }
  
  .node-selection-item {
    padding: 8px 12px;
    background-color: #f8f9fa;
    border-radius: 4px;
    border: 1px solid #e1e8ed;
  }
  
  .node-selection-item label {
    display: flex;
    align-items: center;
    cursor: pointer;
    margin: 0;
    font-weight: normal;
  }
  
  .node-selection-item input[type="checkbox"] {
    margin-right: 8px;
  }
  
  .resource-limits-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 20px;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 15px;
    margin-top: 20px;
  }
  
  .reset-button,
  .save-button {
    padding: 10px 20px;
    border-radius: 4px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s, transform 0.1s;
  }
  
  .reset-button {
    background-color: #f8d7da; /* Light red/pink background */
    color: #721c24; /* Dark red text */
    border: 1px solid #f5c6cb; /* Light red border */
}
  .save-button {
    background-color: #1e3a8a;
    color: white;
    border: none;
  }
  
  .reset-button:hover {
    background-color: #f5c6cb; /* Slightly darker pink on hover */
    border: 1px solid #721c24; /* Light red border */
}
  
  .save-button:hover {
    background-color: #1e3a8a;
  }
  
  .reset-button:active,
  .save-button:active {
    transform: translateY(1px);
  }
  
  /* Status Message */
  .status-message {
    margin-top: 15px;
    padding: 12px 15px;
    border-radius: 4px;
    font-weight: 500;
  }
  
  .status-message.success {
    background-color: #d4edda;
    color: #155724;
    border: 1px solid #c3e6cb;
  }
  
  .status-message.error {
    background-color: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
  }
  
  /* Loading Spinner */
  .loading-spinner {
    width: 40px;
    height: 40px;
    margin: 40px auto;
    border: 4px solid #f3f3f3;
    border-top: 4px solid #1e3a8a;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  /* Responsive Adjustments */
  @media (max-width: 768px) {
    .stats-container,
    .resource-limits-grid {
      grid-template-columns: 1fr;
    }
    
    .node-list {
      grid-template-columns: 1fr;
    }
    
    .node-selection-list {
      grid-template-columns: 1fr;
    }
  }
            `}</style>
    </div>
  );
}

