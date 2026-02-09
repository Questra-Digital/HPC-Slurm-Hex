import React from "react";
import { useState } from "react";
import Sidebar from "./Sidebar";
import Dashboard from "./Dashboard";
import Jobs from "./JobsPage";
import RemoteNodes from "./RemoteNodes";
import UserGroup from "./UserGroup";
import ResourceAllocation from "./ResourceAllocation";
import Settings from "./Settings";
import JupyterNotebook from "./JupyterNotebook";

export default function Home({ user }) {
    const [activeMenuItem, setActiveMenuItem] = useState("dashboard");

    const getContent = () => {
        switch (activeMenuItem) {
            case "dashboard":
                return <Dashboard setActiveMenuItem={setActiveMenuItem} />;
            case "jobs":
                return <Jobs />;
            case "environment":
                return <RemoteNodes />;
            case "users":
                return <UserGroup />;
            case "resources":
                return <ResourceAllocation />;
            case "settings":
                return <Settings />;
            case "notebooks":
                return <JupyterNotebook />;
            default:
                return <Dashboard setActiveMenuItem={setActiveMenuItem} />;
        }
    };

    return (
        <div className="dashboard-container">
            <Sidebar
                user={user}
                activeMenuItem={activeMenuItem}
                setActiveMenuItem={setActiveMenuItem}
            />

            <div className="main-content">
                <div className="content-body">
                    {getContent()}
                </div>
            </div>

            <style>{`
                body, html {
                    margin: 0;
                    padding: 0;
                    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    height: 100%;
                    width: 100%;
                    overflow-x: hidden;
                }
                
                .dashboard-container {
                    display: flex;
                    min-height: 100vh;
                    width: 100vw;
                    margin: 0;
                    padding: 0;
                }
                
                .sidebar {
                    width: 260px;
                    background: #1e3a8a;
                    color: white;
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                    position: sticky;
                    top: 0;
                }
                
                .sidebar-header {
                    padding: 1.5rem;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                }
                
                .sidebar-header h2 {
                    margin: 0;
                    font-size: 1.5rem;
                    font-weight: 600;
                }
                
                .sidebar-user {
                    padding: 1.5rem;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                }
                
                .user-avatar {
                    width: 40px;
                    height: 40px;
                    background: #3b82f6;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                }
                
                .user-info {
                    display: flex;
                    flex-direction: column;
                }
                
                .user-name {
                    font-weight: 500;
                }
                
                .user-role {
                    font-size: 0.8rem;
                    opacity: 0.8;
                }
                
                .sidebar-nav {
                    flex: 1;
                    padding: 1rem 0;
                    overflow-y: auto;
                }
                
                .sidebar-nav ul {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                }
                
                .sidebar-nav li {
                    margin-bottom: 0.25rem;
                }
                
                .sidebar-nav li.divider {
                    height: 1px;
                    background-color: rgba(255, 255, 255, 0.1);
                    margin: 1rem 0;
                }
                
                .sidebar-nav a {
                    display: flex;
                    align-items: center;
                    padding: 0.75rem 1.5rem;
                    color: rgba(255, 255, 255, 0.8);
                    text-decoration: none;
                    transition: all 0.2s;
                }
                
                .sidebar-nav a:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                }
                
                .sidebar-nav li.active a {
                    background: rgba(255, 255, 255, 0.2);
                    color: white;
                    font-weight: 500;
                }
                
                .icon {
                    margin-right: 0.75rem;
                    font-size: 1.1rem;
                }
                
                .sidebar-footer {
                    padding: 1rem 1.5rem;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                }
                
                .logout-button {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    padding: 0.75rem;
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: background 0.2s;
                }
                
                .logout-button:hover {
                    background: rgba(255, 255, 255, 0.2);
                }
                
                .main-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    background: #f3f4f6;
                    width: 100%;
                }
                
                .content-body {
                    flex: 1;
                    overflow-y: auto;
                    width: 100%;
                    box-sizing: border-box;
                }
                
                .dashboard-content {
                    display: flex;
                    flex-direction: column;
                    gap: 2rem;
                    width: 100%;
                }
                
                .dashboard-row {
                    display: flex;
                    gap: 2rem;
                    width: 100%;
                }
                
                .dashboard-card {
                    background: white;
                    border-radius: 10px;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
                    padding: 1.5rem;
                    width: 100%;
                    box-sizing: border-box;
                }
                
                .summary-cards {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 1.5rem;
                    width: 100%;
                }
                
                .summary-card {
                    padding: 1.25rem;
                    background: #f8fafc;
                    border-radius: 8px;
                    border-left: 4px solid #1e3a8a;
                }
                
                .summary-card h3 {
                    margin: 0 0 0.75rem 0;
                    font-size: 1rem;
                    color: #64748b;
                    font-weight: 500;
                }
                
                .metric {
                    font-size: 2rem;
                    font-weight: 600;
                    color: #1e293b;
                    margin: 0 0 0.5rem 0;
                }
                
                .trend {
                    font-size: 0.875rem;
                    margin: 0;
                }
                
                .trend.positive {
                    color: #10b981;
                }
                
                .trend.negative {
                    color: #ef4444;
                }
                
                .trend.neutral {
                    color: #6b7280;
                }
                
                .data-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                
                .data-table th {
                    text-align: left;
                    padding: 0.75rem 1rem;
                    background: #f8fafc;
                    color: #64748b;
                    font-weight: 500;
                    border-bottom: 1px solid #e2e8f0;
                }
                
                .data-table td {
                    padding: 0.75rem 1rem;
                    border-bottom: 1px solid #e2e8f0;
                    color: #1e293b;
                }
                
                .badge {
                    display: inline-block;
                    padding: 0.25rem 0.5rem;
                    border-radius: 9999px;
                    font-size: 0.75rem;
                    font-weight: 500;
                }
                
                .badge.running {
                    background: #e0f2fe;
                    color: #0369a1;
                }
                
                .badge.completed {
                    background: #dcfce7;
                    color: #15803d;
                }
                
                .badge.pending {
                    background: #fef9c3;
                    color: #854d0e;
                }
                
                .badge.error {
                    background: #fee2e2;
                    color: #b91c1c;
                }
                
                .action-buttons {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
                    gap: 1rem;
                    width: 100%;
                }
                
                .action-button {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    padding: 0.75rem 1rem;
                    color: #1e3a8a;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .action-button:hover {
                    background: #f1f5f9;
                    border-color: #cbd5e1;
                }
                
                .jobs-placeholder, .environment-placeholder, .users-placeholder, 
                .monitoring-placeholder, .reports-placeholder, .settings-placeholder {
                    background: white;
                    border-radius: 10px;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
                    padding: 2rem;
                    text-align: center;
                    width: 100%;
                }
            `}</style>
        </div>
    );
}