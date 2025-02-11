import { useState, useEffect } from "react";
import axios from "axios";

export default function RemoteNodes() {
    const [masterNode, setMasterNode] = useState({ name: "", ip: "", port: "" });
    const [workerNodes, setWorkerNodes] = useState([]);
    const [statuses, setStatuses] = useState({});
    const [workerCount, setWorkerCount] = useState(0);

    useEffect(() => {
        async function fetchSavedNodes() {
            try {
                const response = await axios.get("http://localhost:5001/nodes");
                const nodes = response.data;
    
                if (nodes.length > 0) {
                    // Extract Master Node
                    const master = nodes.find(node => node.type === "master");
                    if (master) {
                        setMasterNode({ name: master.name, ip: master.ip, port: master.port });
                    }
    
                    // Extract Worker Nodes
                    const workers = nodes.filter(node => node.type === "worker");
                    setWorkerNodes(workers);
                    setWorkerCount(workers.length);
                    
                    // Update statuses
                    const newStatuses = {};
                    nodes.forEach((node, index) => {
                        newStatuses[`${node.type}-${index}`] = node.status;
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
        setWorkerNodes(Array.from({ length: count }, () => ({ name: "", ip: "", port: "" })));
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
            const res = await axios.post("http://localhost:5001/connect", { ...node, type });
            setStatuses((prev) => ({ ...prev, [`${type}-${index}`]: res.data.status }));
        } catch (error) {
            setStatuses((prev) => ({ ...prev, [`${type}-${index}`]: "Failed to Connect" }));
        }
    };

    const resetNodes = async () => {
        try {
            const res = await axios.post("http://localhost:5001/reset-nodes");
            console.log(res.data.message);
            // Fetch updated nodes after reset
            fetchSavedNodes();
        } catch (error) {
            console.error("Error resetting nodes:", error);
        }
    };

    return (
        <div>
            <h1>Remote Nodes Connection</h1>

            {/* Master Node Input */}
            <h2>Master Node</h2>
            <input type="text" name="name" placeholder="Name" value={masterNode.name} onChange={handleMasterChange} required />
            <input type="text" name="ip" placeholder="IP Address" value={masterNode.ip} onChange={handleMasterChange} required />
            <input type="number" name="port" placeholder="Port" value={masterNode.port} onChange={handleMasterChange} required />
            <button onClick={() => connectNode(masterNode, 0, "master")}>Connect</button>
            <p>Status: {statuses["master-0"] || "Not Connected"}</p>

            {/* Worker Node Count Input */}
            <h2>Worker Nodes</h2>
            <input type="number" placeholder="Number of Worker Nodes" value={workerCount} onChange={handleWorkerCount} min="0" />

            {/* Worker Node Inputs */}
            {workerNodes.map((worker, index) => (
                <div key={index}>
                    <h3>Worker Node {index + 1}</h3>
                    <input type="text" placeholder="Name" value={worker.name} onChange={(e) => handleWorkerChange(index, "name", e.target.value)} required />
                    <input type="text" placeholder="IP Address" value={worker.ip} onChange={(e) => handleWorkerChange(index, "ip", e.target.value)} required />
                    <input type="number" placeholder="Port" value={worker.port} onChange={(e) => handleWorkerChange(index, "port", e.target.value)} required />
                    <button onClick={() => connectNode(worker, index, "worker")}>Connect</button>
                    <p>Status: {statuses[`worker-${index}`] || "Not Connected"}</p>
                </div>
            ))}
            
            <button onClick={resetNodes}>Reset Node Table</button>
        </div>
    );
}
