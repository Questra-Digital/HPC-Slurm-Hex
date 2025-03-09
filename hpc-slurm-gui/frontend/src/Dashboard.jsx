import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  LayoutDashboard, 
  Clock, 
  Users, 
  BarChart3, 
  Globe, 
  Settings, 
  LogOut,
  HardDrive
} from "lucide-react";

export default function Dashboard({ setActiveMenuItem }) {
  const [jobs, setJobs] = useState([]);
  const [username] = useState(sessionStorage.getItem("username") || "default_user_name");
  const [userRole] = useState(sessionStorage.getItem("user_role") || "user");
  const [stats, setStats] = useState({
    total: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelledOther: 0
  });

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_MASTER_NODE_API_BASE_URL}/jobs`);
      const allJobs = response.data.jobs || [];
      
      const filteredJobs = filterJobs(allJobs);
      setJobs(filteredJobs);
      calculateStats(filteredJobs);
    } catch (error) {
      console.error("Failed to fetch jobs:", error);
    }
  };

  const filterJobs = (allJobs) => {
    return allJobs.filter(job => {
      if (job.jobName === "batch") return false;
      if (userRole !== "admin" && job.userName !== username) {
        return false;
      }
      return true;
    });
  };

  const calculateStats = (filteredJobs) => {
    const total = filteredJobs.length;
    const running = filteredJobs.filter(job => 
      job.state.toLowerCase() === "running").length;
    const completed = filteredJobs.filter(job => 
      job.state.toLowerCase() === "completed").length;
    const failed = filteredJobs.filter(job => 
      job.state.toLowerCase().includes("failed")).length;
    const cancelledOther = filteredJobs.filter(job => 
      !["running", "completed"].includes(job.state.toLowerCase()) && 
      !job.state.toLowerCase().includes("failed")).length;

    setStats({ total, running, completed, failed, cancelledOther });
  };

  const getRecentJobs = () => {
    return [...jobs]
      .sort((a, b) => new Date(b.start) - new Date(a.start))
      .slice(0, 4);
  };

  const getTimeAgo = (dateStr) => {
    const now = new Date();
    const jobDate = new Date(dateStr);
    const diffMs = now - jobDate;
    const diffMin = Math.floor(diffMs / 60000);
    
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHours = Math.floor(diffMin / 60);
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  };

  const getRuntime = (start, end) => {
    if (!end || start === end) return "-";
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffMs = endDate - startDate;
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const getStatusClass = (state) => {
    const stateLower = state.toLowerCase();
    if (stateLower === "running") return "running";
    if (stateLower === "completed") return "completed";
    if (stateLower.includes("failed")) return "error";
    if (stateLower.includes("cancelled")) return "error";
    return "pending";
  };

  return (
    <div className="dashboard-content">
      <div className="dashboard-card summary-cards">
        <div className="summary-card">
          <h3>Total Jobs</h3>
          <p className="metric">{stats.total}</p>
        </div>
        <div className="summary-card">
          <h3>Running Jobs</h3>
          <p className="metric">{stats.running}</p>
        </div>
        <div className="summary-card">
          <h3>Completed Jobs</h3>
          <p className="metric">{stats.completed}</p>
        </div>
        <div className="summary-card">
          <h3>Failed Jobs</h3>
          <p className="metric">{stats.failed}</p>
        </div>
        <div className="summary-card">
          <h3>Cancelled/Other</h3>
          <p className="metric">{stats.cancelledOther}</p>
        </div>
      </div>

      <div className="dashboard-row">
        <div className="dashboard-card">
          <h3>Recent Jobs</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>User</th>
                <th>Status</th>
                <th>Started</th>
                <th>Runtime</th>
              </tr>
            </thead>
            <tbody>
              {getRecentJobs().map(job => (
                <tr key={job.jobId}>
                  <td>{job.jobId}</td>
                  <td>{job.userName || 'N/A'}</td>
                  <td>
                    <span className={`badge ${getStatusClass(job.state)}`}>
                      {job.state}
                    </span>
                  </td>
                  <td>{getTimeAgo(job.start)}</td>
                  <td>{getRuntime(job.start, job.end)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="dashboard-row">
        <div className="dashboard-card quick-actions">
          <h3>Quick Actions</h3>
          <div className="action-buttons">
            <button 
              className="action-button" 
              onClick={() => setActiveMenuItem('jobs')}
            >
              <Clock size={18} className="icon" />
              Manage Jobs
            </button>
            {userRole === "admin" && ( 
              <button 
                className="action-button" 
                onClick={() => setActiveMenuItem('users')}
              >
                <Users size={18} className="icon" />
                Manage Users
              </button>
            )}
            <button 
              className="action-button" 
              onClick={() => setActiveMenuItem('settings')}
            >
              <Settings size={18} className="icon" />
              Manage Profile
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .dashboard-content {
          padding: 20px;
          color: #333;
          width: 95%;
        }

        h3 {
          color: #1a5276;
          margin-top: 0;
          margin-bottom: 15px;
          font-weight: 500;
        }

        .dashboard-card {
          background-color: white;
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          border: 1px solid #e1e8ed;
          margin-bottom: 20px;
        }

        .summary-cards {
          display: flex;
          flex-wrap: wrap;
          gap: 15px;
        }

        .summary-card {
          flex: 1;
          min-width: 200px;
          background-color: white;
          border-radius: 6px;
          padding: 15px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          border-left: 4px solid #1a5276;
        }

        .summary-card h3 {
          margin: 0 0 10px 0;
          font-size: 14px;
          color: #7f8c8d;
        }

        .metric {
          font-size: 24px;
          font-weight: 600;
          color: #2c3e50;
          margin: 0;
        }

        .dashboard-row {
          margin-bottom: 20px;
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
        }

        .data-table th {
          text-align: left;
          padding: 12px;
          background-color: #f8f9fa;
          color: #34495e;
          font-weight: 500;
          border-bottom: 1px solid #e1e8ed;
        }

        .data-table td {
          padding: 12px;
          color: #2c3e50;
          border-bottom: 1px solid #e1e8ed;
        }

        .badge {
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }

        .badge.running {
          background-color: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }

        .badge.completed {
          background-color: #cce5ff;
          color: #004085;
          border: 1px solid #b8daff;
        }

        .badge.error {
          background-color: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }

        .badge.pending {
          background-color: #fff3cd;
          color: #856404;
          border: 1px solid #ffeeba;
        }

        .quick-actions {
          padding: 20px;
        }

        .action-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 15px;
        }

        .action-button {
          padding: 10px 20px;
          border-radius: 4px;
          background-color: #1a5276;
          color: white;
          border: none;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: background-color 0.2s, transform 0.1s;
        }

        .action-button:hover {
          background-color: #3498db;
        }

        .action-button:active {
          transform: translateY(1px);
        }

        .icon {
          color: white;
        }

        @media (max-width: 768px) {
          .summary-cards {
            grid-template-columns: 1fr;
          }
          
          .action-buttons {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}