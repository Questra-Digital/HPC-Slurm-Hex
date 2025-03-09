import { useState, useEffect } from "react";
import axios from "axios";

export default function RemoteNodes() {
    const [masterNode, setMasterNode] = useState({ name: "", ip_address: "" });
    const [workerNodes, setWorkerNodes] = useState([]);
    const [statuses, setStatuses] = useState({});
    const [workerCount, setWorkerCount] = useState(0);

    useEffect(() => {
        async function fetchSavedNodes() {
            try {
                const response = await axios.get(`{import.meta.env.VITE_BACKEND_API_BASE_URL}/nodes/get-nodes-list`);
                const nodes = response.data;

                if (nodes.length > 0) {
                    // Extract Master Node
                    const master = nodes.find((node) => node.node_type === "master");
                    if (master) {
                        setMasterNode({ name: master.name, ip_address: master.ip_address });
                    }

                    // Extract Worker Nodes
                    const workers = nodes.filter((node) => node.node_type === "worker");
                    setWorkerNodes(
                        workers.map((w) => ({ name: w.name, ip_address: w.ip_address }))
                    );
                    setWorkerCount(workers.length);

                    // Update statuses
                    const newStatuses = {};
                    nodes.forEach((node, index) => {
                        newStatuses[`${node.node_type}-${index}`] = node.status;
                    });
                    setStatuses(newStatuses);
                }
            } catch (error) {
                console.error("Error fetching saved nodes:", error);
            }
        }

        fetchSavedNodes();
    }, []);

    const handleWorkerCount = (e) => {
        const count = parseInt(e.target.value, 10);
        setWorkerCount(count);
        setWorkerNodes(
            Array.from({ length: count }, () => ({ name: "", ip_address: "" }))
        );
    };

    const handleMasterChange = (e) => {
        setMasterNode({ ...masterNode, [e.target.name]: e.target.value });
    };

    const handleWorkerChange = (index, field, value) => {
        const updatedWorkers = [...workerNodes];
        updatedWorkers[index][field] = value;
        setWorkerNodes(updatedWorkers);
    };

    const connectNode = async (node, index, type) => {
        try {
            const res = await axios.post(`${import.meta.env.VITE_BACKEND_API_BASE_URL}/nodes/connect`, {
                name: node.name,
                ip: node.ip_address,
                type,
            });
            setStatuses((prev) => ({
                ...prev,
                [`${type}-${index}`]: res.data.status,
            }));
        } catch (error) {
            setStatuses((prev) => ({
                ...prev,
                [`${type}-${index}`]: "Failed to Connect",
            }));
        }
    };

    const resetNodes = async () => {
        try {
            const res = await axios.post(`${import.meta.env.VITE_BACKEND_API_BASE_URL}/nodes/reset-nodes`);
            console.log(res.data.message);
            const response = await axios.get(`${import.meta.env.VITE_BACKEND_API_BASE_URL}/nodes/get-nodes-list`);
            setMasterNode({ name: "", ip_address: "" });
            setWorkerNodes([]);
            setWorkerCount(0);
            setStatuses({});
        } catch (error) {
            console.error("Error resetting nodes:", error);
        }
    };

    const getStatusClass = (status) => {
        if (!status || status === "Not Connected") return "status-not-connected";
        if (status === "Failed to Connect") return "status-failed";
        if (status === "Connected") return "status-connected";
        return "status-unknown";
    };

    return (
        <div className="nodes-container">
            <div className="nodes-card">
                <div className="header">
                    <h1>Nodes Management</h1>
                    <p className="subtitle">Configure and manage cluster nodes</p>
                </div>

                {/* Master Node Input */}
                <div className="section">
                    <h2>Master Node</h2>
                    <div className="node-inputs">
                        <div className="input-group">
                            <label htmlFor="master-name">Node Name</label>
                            <input
                                id="master-name"
                                type="text"
                                name="name"
                                placeholder="Enter node name"
                                value={masterNode.name}
                                onChange={handleMasterChange}
                                required
                            />
                        </div>
                        <div className="input-group">
                            <label htmlFor="master-ip">IP Address</label>
                            <input
                                id="master-ip"
                                type="text"
                                name="ip_address"
                                placeholder="Enter IP address"
                                value={masterNode.ip_address}
                                onChange={handleMasterChange}
                                required
                            />
                        </div>
                        <button
                            className="connect-btn"
                            onClick={() => connectNode(masterNode, 0, "master")}
                        >
                            Connect
                        </button>
                    </div>
                    <div
                        className={`status-indicator ${getStatusClass(
                            statuses["master-0"]
                        )}`}
                    >
                        Status: {statuses["master-0"] || "Not Connected"}
                    </div>
                </div>

                {/* Worker Node Count Input */}
                <div className="section">

                    <h2>Worker Nodes</h2>
                    <div className="input-group worker-count">
                        <label htmlFor="worker-count">Number of Worker Nodes</label>
                        <input
                            id="worker-count"
                            type="number"
                            placeholder="Set node count"
                            value={workerCount}
                            onChange={handleWorkerCount}
                            min="0"
                        />
                    </div>

                    {/* Worker Node Inputs */}
                    <div className="worker-nodes-list">
                        {workerNodes.map((worker, index) => (
                            <div key={index} className="worker-node-item">
                                <h3>Worker Node {index + 1}</h3>
                                <div className="node-inputs">
                                    <div className="input-group">
                                        <label htmlFor={`worker-${index}-name`}>Node Name</label>
                                        <input
                                            id={`worker-${index}-name`}
                                            type="text"
                                            placeholder="Enter node name"
                                            value={worker.name}
                                            onChange={(e) =>
                                                handleWorkerChange(index, "name", e.target.value)
                                            }
                                            required
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label htmlFor={`worker-${index}-ip`}>IP Address</label>
                                        <input
                                            id={`worker-${index}-ip`}
                                            type="text"
                                            placeholder="Enter IP address"
                                            value={worker.ip_address}
                                            onChange={(e) =>
                                                handleWorkerChange(index, "ip_address", e.target.value)
                                            }
                                            required
                                        />
                                    </div>
                                    <button
                                        className="connect-btn"
                                        onClick={() => connectNode(worker, index, "worker")}
                                    >
                                        Connect
                                    </button>
                                </div>
                                <div
                                    className={`status-indicator ${getStatusClass(
                                        statuses[`worker-${index}`]
                                    )}`}
                                >
                                    Status: {statuses[`worker-${index}`] || "Not Connected"}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <style>{`

.nodes-container {
  display: flex;
  justify-content: center;
  padding: 20px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  height: 95vh;
}

.nodes-card {
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

.section {
  margin-bottom: 16px; /* Reduced from 24px */
}

/* Master node section - fixed height */
.section:first-of-type {
  flex-shrink: 0;
}

/* Worker nodes section - flexible with overflow */
.section:last-of-type {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.section h2 {
  color: #444;
  font-size: 18px;
  margin-bottom: 12px; /* Reduced from 16px */
  font-weight: 600;
  flex-shrink: 0; /* Prevent title from shrinking */
  color: #1e3a8a;
}

.section h3 {Remote Nodes
  color: #555;
  font-size: 16px;
  margin-bottom: 12px;
  font-weight: 500;
  color: #1e3a8a;
}

.node-inputs {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.input-group {
  flex: 1;
  min-width: 200px;
  margin-right: 30px;
}

.input-group label {
  display: block;
  margin-bottom: 6px;
  color: #555;
  font-size: 14px;
}

.input-group input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  transition: border-color 0.3s;
}

.input-group input:focus {
  outline: none;
  border-color: #1e40af;
  box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.1);
}

.input-group input::placeholder {
  color: #aaa;
}

.worker-count {
  max-width: 250px;
  flex-shrink: 0; /* Prevent from shrinking */
}

.worker-nodes-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  margin-top: 10px;
  overflow-y: auto; /* Enables vertical scrollbar when content overflows */
  max-height: 450px; /* Adjust this based on your layout */
  padding-right: 10px;
}



/* Scrollbar styling */
.worker-nodes-list::-webkit-scrollbar {
  width: 8px;
}

.worker-nodes-list::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.worker-nodes-list::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
}

.worker-nodes-list::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

.worker-node-item {
  background-color: #f9f9f9;
  border-radius: 6px;
  padding: 16px;
  flex-shrink: 0; /* Prevent items from shrinking */
}

.connect-btn {
  background-color: #1e3a8a;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 10px 16px;
  cursor: pointer;
  font-weight: 500;
  align-self: flex-end;
  transition: background-color 0.2s;
}

.connect-btn:hover {
  background-color: #1e40af;
}

.reset-btn {
  background-color: #f44336;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 10px 16px;
  cursor: pointer;
  font-weight: 500;
  margin-top: 16px;
  transition: background-color 0.2s;
  flex-shrink: 0; /* Prevent button from shrinking */
}

.reset-btn:hover {
  background-color: #d32f2f;
}

.status-indicator {
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
}

.status-not-connected {
  background-color: #f5f5f5;
  color: #888;
}

.status-failed {
  background-color: #ffebee;
  color: #d32f2f;
}

.status-connected {
  background-color: #e8f5e9;
  color: #2e7d32;
}

.status-unknown {
  background-color: #fff8e1;
  color: #f57c00;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .node-inputs {
    flex-direction: column;
  }
  
  .input-group {
    width: 100%;
  }
  
  .nodes-card {
    height: 85vh; /* Slightly taller on mobile */
  }
}
            `}</style>
        </div>
    );
}
