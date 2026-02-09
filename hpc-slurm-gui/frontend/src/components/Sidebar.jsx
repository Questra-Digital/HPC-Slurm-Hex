import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import {
    LayoutDashboard,
    Clock,
    Users,
    BarChart3,
    Globe,
    Settings,
    LogOut,
    HardDrive,
    BookOpen
} from "lucide-react";
import { API_BASE_URL } from "../config";

export default function Sidebar({ user, activeMenuItem, setActiveMenuItem }) {
    const [userRole, setUserRole] = useState(sessionStorage.getItem("user_role") || "user");
    // NEW: State for permissions
    const [permissions, setPermissions] = useState(JSON.parse(sessionStorage.getItem("permissions") || "[]"));
    const navigate = useNavigate();

    useEffect(() => {
        const role = sessionStorage.getItem("user_role") || "user";
        const storedPermissions = JSON.parse(sessionStorage.getItem("permissions") || "[]");
        setUserRole(role);
        setPermissions(storedPermissions);
    }, []);

    const handleLogout = () => {
        sessionStorage.clear();
        navigate("/login");
    };

    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <h2>HPC-Slurm-HEX</h2>
            </div>

            <div className="sidebar-user">
                <div className="user-avatar">
                    {user.charAt(0).toUpperCase()}
                </div>
                <div className="user-info">
                    <span className="user-name">{user}</span>
                    <span className="user-role">{userRole}</span>
                </div>
            </div>

            <nav className="sidebar-nav">
                <ul>
                    {/* NEW: Conditionally render based on permissions */}
                    {permissions.includes("dashboard") && (
                        <li className={activeMenuItem === "dashboard" ? "active" : ""}>
                            <a href="#" onClick={() => setActiveMenuItem("dashboard")}>
                                <LayoutDashboard size={18} className="icon" />
                                Dashboard
                            </a>
                        </li>
                    )}

                    {permissions.includes("jobs") && (
                        <li className={activeMenuItem === "jobs" ? "active" : ""}>
                            <a href="#" onClick={() => setActiveMenuItem("jobs")}>
                                <Clock size={18} className="icon" />
                                Jobs Management
                            </a>
                        </li>
                    )}

                    {permissions.includes("users") && (
                        <li className={activeMenuItem === "users" ? "active" : ""}>
                            <a href="#" onClick={() => setActiveMenuItem("users")}>
                                <Users size={18} className="icon" />
                                Users/Groups
                            </a>
                        </li>
                    )}

                    {permissions.includes("resources") && (
                        <li className={activeMenuItem === "resources" ? "active" : ""}>
                            <a href="#" onClick={() => setActiveMenuItem("resources")}>
                                <BarChart3 size={18} className="icon" />
                                Resource Allocation
                            </a>
                        </li>
                    )}

                    {/* Notebooks - visible to all users (permission checked in component) */}
                    <li className={activeMenuItem === "notebooks" ? "active" : ""}>
                        <a href="#" onClick={() => setActiveMenuItem("notebooks")}>
                            <BookOpen size={18} className="icon" />
                            Notebooks
                        </a>
                    </li>

                    <li className="divider"></li>

                    {permissions.includes("environment") && (
                        <li className={activeMenuItem === "environment" ? "active" : ""}>
                            <a href="#" onClick={() => setActiveMenuItem("environment")}>
                                <HardDrive size={18} className="icon" />
                                Environment
                            </a>
                        </li>
                    )}

                    {permissions.includes("settings") && (
                        <li className={activeMenuItem === "settings" ? "active" : ""}>
                            <a href="#" onClick={() => setActiveMenuItem("settings")}>
                                <Settings size={18} className="icon" />
                                Settings
                            </a>
                        </li>
                    )}
                </ul>
            </nav>

            <div className="sidebar-footer">
                <button onClick={handleLogout} className="logout-button">
                    <LogOut size={18} className="icon" />
                    Logout
                </button>
            </div>
        </div>
    );
}