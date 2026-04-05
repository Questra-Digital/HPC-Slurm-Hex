import React, { useState, useEffect, useRef } from "react";
import apiClient from "../api/client";               // ← HIS
import { API_BASE_URL } from "../config";            // ← YOURS
import axios from "axios";                           // ← YOURS

import { Line } from 'react-chartjs-2';              // ← YOURS
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

export default function ResourceAllocation() {

  // ================= STATE =================
  const [nodes, setNodes] = useState([]);
  const [slurmNodes, setSlurmNodes] = useState([]);
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

  // ===== YOUR ADDITIONS =====
  const [selectedNodeIp, setSelectedNodeIp] = useState("");

  const [timeRange, setTimeRange] = useState(() => {
    return localStorage.getItem('timeRange') || '5m';
  });

  const [refreshRate, setRefreshRate] = useState(() => {
    return Number(localStorage.getItem('refreshRate')) || 10;
  });

  const cpuChartRef = useRef(null);
  const memoryChartRef = useRef(null);
  const gpuChartRef = useRef(null);

  const [metricsData, setMetricsData] = useState({
    cpu: [],
    memory: [],
    gpu: []
  });

  // ================= CLUSTER TOTALS =================
  const calculateClusterTotals = () => {
    if (slurmNodes.length > 0) {
      return slurmNodes.reduce(
        (totals, node) => ({
          totalCPU: totals.totalCPU + (node.cpuTotal || 0),
          totalGPU: totals.totalGPU + (node.gres ? parseInt(node.gres.match(/gpu:(\d+)/)?.[1] || 0) : 0),
          totalMemory: totals.totalMemory + (node.realMemory ? node.realMemory / 1024 : 0),
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

  // ================= METRICS FETCH (YOURS - REAL-TIME) =================
  useEffect(() => {
    let interval;

    const fetchMetrics = async () => {
      try {
        const [cpuRes, memRes, gpuRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/resources/metrics?type=cpu&range=${timeRange}&step=${refreshRate}s${selectedNodeIp ? `&nodeIp=${selectedNodeIp}` : ''}`),
          axios.get(`${API_BASE_URL}/resources/metrics?type=memory&range=${timeRange}&step=${refreshRate}s${selectedNodeIp ? `&nodeIp=${selectedNodeIp}` : ''}`),
          axios.get(`${API_BASE_URL}/resources/metrics?type=gpu&range=${timeRange}&step=${refreshRate}s${selectedNodeIp ? `&nodeIp=${selectedNodeIp}` : ''}`)
        ]);

        setMetricsData({
          cpu: processMetrics(cpuRes.data),
          memory: processMetrics(memRes.data),
          gpu: processMetrics(gpuRes.data)
        });

        console.log("FETCHED at:", new Date().toLocaleTimeString());
      } catch (error) {
        console.error("Metrics fetch error:", error);
      }
    };

    fetchMetrics();
    interval = setInterval(fetchMetrics, refreshRate * 1000);

    return () => clearInterval(interval);
  }, [timeRange, selectedNodeIp, refreshRate]);

  // ================= PERSIST SETTINGS =================
  useEffect(() => {
    localStorage.setItem('timeRange', timeRange);
  }, [timeRange]);

  useEffect(() => {
    localStorage.setItem('refreshRate', refreshRate);
  }, [refreshRate]);

  // ================= DATA FETCH (MERGED) =================
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // 🔥 TRY HIS apiClient FIRST
        const [nodesRes, usersRes, groupsRes, slurmNodesRes] = await Promise.all([
          apiClient.get('/nodes/get-nodes-list', { retrySafe: true }),
          apiClient.get('/users/users', { retrySafe: true }),
          apiClient.get('/users/groups', { retrySafe: true }),
          apiClient.get('/nodes/slurm-nodes', { retrySafe: true }).catch(() => null),
        ]);

        const nodesData = nodesRes.data || [];
        const usersData = usersRes.data || [];
        const groupsData = groupsRes.data || [];

        if (slurmNodesRes?.data) {
          setSlurmNodes(slurmNodesRes.data.nodes || []);
        }

        setNodes(nodesData);
        setUsers(usersData);
        setGroups(groupsData);

      } catch (error) {
        console.warn("apiClient failed, falling back to fetch:", error);

        // 🔥 FALLBACK TO YOUR FETCH
        try {
          const [nodesRes, usersRes, groupsRes] = await Promise.all([
            fetch(`${API_BASE_URL}/nodes/get-nodes-list`),
            fetch(`${API_BASE_URL}/users/users`),
            fetch(`${API_BASE_URL}/users/groups`),
          ]);

          const [nodesData, usersData, groupsData] = await Promise.all([
            nodesRes.json(),
            usersRes.json(),
            groupsRes.json(),
          ]);

          const slurmNodesRes = await fetch(`${API_BASE_URL}/nodes/slurm-nodes`);
          if (slurmNodesRes.ok) {
            const slurmData = await slurmNodesRes.json();
            setSlurmNodes(slurmData.nodes || []);
          }

          setNodes(nodesData);
          setUsers(usersData);
          setGroups(groupsData);

        } catch (fallbackError) {
          console.error("Fallback fetch also failed:", fallbackError);
          setSaveStatus({ message: "Failed to load data", type: "error" });
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // ================= PROCESS METRICS =================
  const processMetrics = (data) => {
    if (!data || data.length === 0 || !data[0]?.values?.length) {
      return { labels: [], datasets: [{ data: [] }], current: 0, avg: 0, max: 0 };
    }

    const rawValues = data[0].values.map(([, val]) => parseFloat(val));
    const labels = data[0].values.map(([ts]) =>
      new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );

    const current = rawValues[rawValues.length - 1] || 0;
    const avg = rawValues.length
      ? (rawValues.reduce((a, b) => a + b, 0) / rawValues.length).toFixed(1)
      : 0;
    const max = rawValues.length ? Math.max(...rawValues) : 0;

    return {
      labels: [...labels],
      datasets: [{
        label: 'Utilization %',
        data: [...rawValues],
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.3,
        borderWidth: 3,
        pointRadius: 0,
        pointHoverRadius: 4,
      }],
      current: parseFloat(current.toFixed(1)),
      avg: parseFloat(avg),
      max: parseFloat(max.toFixed(1)),
    };
  };

  // ================= FORM HANDLERS =================
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

      // TRY apiClient
      let data;
      try {
        const response = await apiClient.get(`/resources/resource-limits?${param}=${entityId}`);
        data = response.data;
      } catch {
        const response = await fetch(`${API_BASE_URL}/resources/resource-limits?${param}=${entityId}`);
        data = await response.json();
      }

      setResourceLimits({
        max_cpu: data.max_cpu || 0,
        max_gpu: data.max_gpu || 0,
        max_memory: data.max_memory || 0,
      });
    } catch (error) {
      console.error("Error fetching resource limits:", error);
    }
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
      setSaveStatus({ message: "Please select a user or group", type: "error" });
      return;
    }

    const payload = {
      ...(entityType === "user"
        ? { user_id: selectedEntity }
        : { group_id: selectedEntity }),
      ...resourceLimits,
    };

    try {
      await apiClient.post('/resources/resource-limits', payload);
    } catch {
      await fetch(`${API_BASE_URL}/resources/resource-limits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    setSaveStatus({ message: "Saved successfully", type: "success" });
  };

  const clusterTotals = calculateClusterTotals();

    return (
    <div className="resource-allocation">

      {/* HEADER */}
      <div className="header-card">
        <div className="header">
          <h1>Resource Allocation Configuration</h1>
          <p className="subtitle">Manage and allocate cluster resources</p>
        </div>
      </div>

      {/* CLUSTER OVERVIEW */}
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

      {/* NODE DETAILS */}
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
                  <span className={`status-${node.status}`}>
                    {node.status}
                  </span>
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

      {/* ALLOCATION FORM */}
      <div className="allocation-form">
        <h3>Allocate Resources</h3>

        <div className="form-section">
          <div className="input-group">
            <label>Allocation Type:</label>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  value="user"
                  checked={entityType === "user"}
                  onChange={handleEntityChange}
                />
                User
              </label>
              <label>
                <input
                  type="radio"
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

        {/* ==================== METRICS SECTION (YOURS FULLY PRESERVED) ==================== */}
        <div className="metrics-section">

          <div className="metrics-header">
            <h3>Real-Time Resource Utilization</h3>

            <div className="controls-row">

              {/* TIME RANGE (COMMENTED PRESERVED) */}
              {/* 
              <div className="time-range">
                {['10s','30s','1m','5m','15m','1h','6h','24h'].map(range => (
                  <button key={range} onClick={() => setTimeRange(range)}>
                    {range}
                  </button>
                ))}
              </div> 
              */}

              {/* REFRESH RATE (COMMENTED PRESERVED) */}
              {/* 
              <div className="refresh-selector">
                <select value={refreshRate} onChange={(e) => setRefreshRate(Number(e.target.value))}>
                  <option value={5}>5s</option>
                  <option value={10}>10s</option>
                  <option value={15}>15s</option>
                </select>
              </div> 
              */}

              {/* NODE SELECTOR (COMMENTED PRESERVED) */}
              {/* 
              <div className="node-selector">
                <select value={selectedNodeIp} onChange={(e) => setSelectedNodeIp(e.target.value)}>
                  <option value="">All Nodes</option>
                  {nodes.map(n => (
                    <option key={n.ip_address} value={n.ip_address}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </div> 
              */}

            </div>
          </div>

          <div className="graphs-grid">

            {/* CPU */}
            <div className="graph-card">
              <div className="graph-header">
                <div className="graph-title">
                  CPU
                  <span className="current-value">
                    {metricsData.cpu?.current || 0}%
                  </span>
                </div>
                <div className="graph-stats">
                  <span>Avg: {metricsData.cpu?.avg || 0}%</span>
                  <span>Max: {metricsData.cpu?.max || 0}%</span>
                </div>
              </div>

              <div className="chart-wrapper">
                {metricsData.cpu?.labels?.length > 0 ? (
                  <Line ref={cpuChartRef} data={metricsData.cpu} options={{ responsive: true }} redraw />
                ) : (
                  <div className="empty-chart">Waiting for CPU data...</div>
                )}
              </div>
            </div>

            {/* MEMORY */}
            <div className="graph-card">
              <div className="graph-header">
                <div className="graph-title">
                  Memory
                  <span className="current-value">
                    {metricsData.memory?.current || 0}%
                  </span>
                </div>
                <div className="graph-stats">
                  <span>Avg: {metricsData.memory?.avg || 0}%</span>
                  <span>Max: {metricsData.memory?.max || 0}%</span>
                </div>
              </div>

              <div className="chart-wrapper">
                {metricsData.memory?.labels?.length > 0 ? (
                  <Line ref={memoryChartRef} data={metricsData.memory} options={{ responsive: true }} redraw />
                ) : (
                  <div className="empty-chart">Waiting for Memory data...</div>
                )}
              </div>
            </div>

            {/* GPU */}
            <div className="graph-card">
              <div className="graph-header">
                <div className="graph-title">
                  GPU
                  <span className="current-value">
                    {metricsData.gpu?.current || 0}%
                  </span>
                </div>
                <div className="graph-stats">
                  <span>Avg: {metricsData.gpu?.avg || 0}%</span>
                  <span>Max: {metricsData.gpu?.max || 0}%</span>
                </div>
              </div>

              <div className="chart-wrapper">
                {metricsData.gpu?.labels?.length > 0 ? (
                  <Line ref={gpuChartRef} data={metricsData.gpu} options={{ responsive: true }} redraw />
                ) : (
                  <div className="empty-chart">No GPU detected</div>
                )}
              </div>
            </div>

          </div>
        </div>

      </div>

      <style>{`
.resource-allocation {
  padding: 20px;
  color: #333;
  width: 95%;
  height: 90vh;
}

/* ================= HEADER ================= */
.header-card {
  background-color: white;
  border-radius: 8px;
  padding: 20px 10px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  border: 1px solid #e1e8ed;
  margin-bottom: 20px;
}

.header {
  text-align: center;
}

.header h1 {
  color: #1e3a8a;
  font-size: 24px;
}

.subtitle {
  color: #666;
  font-size: 14px;
}

/* ================= CLUSTER OVERVIEW ================= */
.cluster-overview {
  background-color: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}

.stats-container {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
}

.stat-card {
  background: white;
  padding: 15px;
  border-radius: 6px;
  flex: 1;
  min-width: 200px;
  border-left: 4px solid #1e3a8a;
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
}

/* ================= NODE CARDS ================= */
.node-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.node-card {
  background: white;
  padding: 15px;
  border-radius: 8px;
}

.status-active { color: green; }
.status-inactive { color: gray; }
.status-failed { color: red; }

/* ================= FORM ================= */
.allocation-form {
  background: white;
  padding: 20px;
  border-radius: 8px;
}

.input-group {
  margin-bottom: 15px;
}

input, select {
  width: 100%;
  padding: 8px;
}

/* ================= BUTTONS ================= */
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.reset-button {
  background: #f8d7da;
}

.save-button {
  background: #1e3a8a;
  color: white;
}

/* ================= STATUS ================= */
.status-message.success {
  background: #d4edda;
}

.status-message.error {
  background: #f8d7da;
}

/* ===================== METRICS SECTION ===================== */

.metrics-section {
  margin-top: 30px;
  padding: 24px;
  background: linear-gradient(145deg, #0f172a, #1e2937);
  border-radius: 16px;
  color: white;
}

.metrics-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.graphs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
  gap: 24px;
}

.graph-card {
  background: rgba(255,255,255,0.95);
  border-radius: 12px;
  padding: 20px;
  color: #0f172a;
}

.graph-header {
  display: flex;
  justify-content: space-between;
}

.current-value {
  font-size: 2rem;
  color: #10b981;
}

.chart-wrapper {
  height: 280px;
}

.empty-chart {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 280px;
}

/* ================= RESPONSIVE ================= */
@media (max-width: 768px) {
  .node-list,
  .graphs-grid {
    grid-template-columns: 1fr;
  }
}
`}</style>
</div>
              );
            }