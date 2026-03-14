const express = require("express");
const axios = require("axios");
const { ResourceLimit } = require("../config/db");
const router = express.Router();

router.get("/resource-limits", async (req, res) => {
    try {
        const { user_id, group_id } = req.query;
        let whereClause = {};
        
        if (user_id) whereClause.user_id = user_id;
        if (group_id) whereClause.group_id = group_id;

        const resourceLimit = await ResourceLimit.findOne({ where: whereClause });
        res.json(resourceLimit || {
            max_cpu: 0,
            max_gpu: 0,
            max_memory: 0,
        });
    } catch (error) {
        console.error("Error fetching resource limits:", error);
        res.status(500).json({ message: "Error fetching resource limits", error: error.message });
    }
});

router.post("/resource-limits", async (req, res) => {
    try {
        const { user_id, group_id, max_cpu, max_gpu, max_memory } = req.body;

        if (!user_id && !group_id) {
            return res.status(400).json({ message: "Either user_id or group_id must be provided" });
        }

        if (user_id && group_id) {
            return res.status(400).json({ message: "Only one of user_id or group_id should be provided" });
        }

        const data = {
            max_cpu: parseInt(max_cpu) || 0,
            max_gpu: parseInt(max_gpu) || 0,
            max_memory: parseInt(max_memory) || 0,
            updated_at: new Date()
        };

        if (user_id) data.user_id = user_id;
        if (group_id) data.group_id = group_id;

        const [resourceLimit, created] = await ResourceLimit.findOrCreate({
            where: user_id ? { user_id, group_id: null } : { group_id, user_id: null },
            defaults: data
        });

        if (!created) {
            await resourceLimit.update(data);
        }

        res.status(created ? 201 : 200).json({ 
            message: created ? "Resource limit created" : "Resource limit updated",
            resourceLimit 
        });
    } catch (error) {
        console.error("Error saving resource limits:", error);
        res.status(500).json({ message: "Error saving resource limits", error: error.message });
    }
});

router.delete("/resource-limits", async (req, res) => {
    try {
        const { user_id, group_id } = req.query;

        if (!user_id && !group_id) {
            return res.status(400).json({ message: "Either user_id or group_id must be provided" });
        }

        const whereClause = user_id ? { user_id, group_id: null } : { group_id, user_id: null };
        const deleted = await ResourceLimit.destroy({ where: whereClause });

        if (deleted) {
            res.json({ message: "Resource limit deleted successfully" });
        } else {
            res.status(404).json({ message: "Resource limit not found" });
        }
    } catch (error) {
        console.error("Error deleting resource limits:", error);
        res.status(500).json({ message: "Error deleting resource limits", error: error.message });
    }
});



// for testing purposes only

// Temporary mock for local testing - comment out real endpoint above
router.get("/metrics", async (req, res) => {
  const { type = 'cluster', range = '5m', step = '15s' } = req.query;  // Keep params for realism

  // Generate fake time-series data (20 points, 15s intervals, values 30-80%)
  const mockTimeSeries = (length = 20) => {
    const now = Math.floor(Date.now() / 1000);
    return [{
      metric: { __name__: type },
      values: Array.from({ length }, (_, i) => [
        now - (length - i) * 15,  // Timestamps
        (30 + Math.random() * 50).toFixed(2)  // Random % value
      ])
    }];
  };

  let result;
  switch (type) {
    case 'cpu':    result = mockTimeSeries(); break;
    case 'memory': result = mockTimeSeries(); break;
    case 'gpu':    result = mockTimeSeries(); break;
    default:       result = [];
  }

  res.json(result);  // Matches Prometheus format: array of {metric, values}
});

// // Real-time metrics endpoint (cluster/node/job utilization)
// router.get("/metrics", async (req, res) => {
//   try {
//     const { type = 'cluster', nodeIp, jobId, range = '5m', step = '15s' } = req.query;  // Params: type (cluster/node/job), optional nodeIp/jobId
//     let query;

//     switch (type) {
//       case 'cpu':  // Cluster CPU % over time
//         query = `rate(node_cpu_seconds_total{mode!="idle"}[${range}]) * 100`;
//         break;
//       case 'memory':  // Memory used %
//         query = `(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes * 100`;
//         break;
//       case 'gpu':  // GPU utilization (DCGM)
//         query = `DCGM_FI_DEV_GPU_UTIL`;
//         break;
//       case 'job_cpu':  // Per-job CPU (if jobId)
//         if (!jobId) throw new Error('jobId required');
//         query = `slurm_job_core_usage_total{jobid="${jobId}"}`;
//         break;
//       // Add more: disk_io (node_disk_io_time_seconds_total), network (node_network_receive_bytes_total), etc.
//       default:
//         throw new Error('Invalid metric type');
//     }

//     // If node-specific, add instance filter
//     if (nodeIp) query += `{instance="${nodeIp}:${node_exporter_port}"}`;

//     const promUrl = `${process.env.PROMETHEUS_URL}/api/v1/query_range?query=${encodeURIComponent(query)}&start=${Date.now()/1000 - 300}&end=${Date.now()/1000}&step=${step}`;
//     const response = await axios.get(promUrl, { timeout: 10000 });
//     res.json(response.data.data.result);  // Returns time-series [{ metric: {}, values: [[timestamp, value]] }]
//   } catch (error) {
//     console.error("Metrics error:", error.message);
//     res.status(500).json({ message: "Failed to fetch metrics", error: error.message });
//   }
// });


module.exports = router;