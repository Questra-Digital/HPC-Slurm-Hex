import { useNavigate } from "react-router-dom";
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

export default function Sidebar({ authUser, activeMenuItem, setActiveMenuItem, onLogout, onLogoutAll }) {
    const userRole = authUser?.role || "user";
    const permissions = authUser?.permissions || [];
    const userName = authUser?.username || "User";
    const navigate = useNavigate();

    const handleLogout = () => {
        if (onLogout) {
            onLogout();
        }
        navigate("/login");
    };

    const handleLogoutAll = () => {
        if (onLogoutAll) {
            onLogoutAll();
        }
        navigate("/login");
    };

    const handleMenuClick = (event, menuKey) => {
        event.preventDefault();
        setActiveMenuItem(menuKey);
    };

    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <h2>HPC-Slurm-HEX</h2>
            </div>
            
            <div className="sidebar-user">
                <div className="user-avatar">
                    {userName.charAt(0).toUpperCase()}
                </div>
                <div className="user-info">
                    <span className="user-name">{userName}</span>
                    <span className="user-role">{userRole}</span>
                </div>
            </div>
            
            <nav className="sidebar-nav">
                <ul>
                    {/* NEW: Conditionally render based on permissions */}
                    {permissions.includes("dashboard") && (
                        <li className={activeMenuItem === "dashboard" ? "active" : ""}>
                            <a href="#" onClick={(event) => handleMenuClick(event, "dashboard")}>
                                <LayoutDashboard size={18} className="icon" />
                                Dashboard
                            </a>
                        </li>
                    )}

                    {permissions.includes("jobs") && (
                        <li className={activeMenuItem === "jobs" ? "active" : ""}>
                            <a href="#" onClick={(event) => handleMenuClick(event, "jobs")}>
                                <Clock size={18} className="icon" />
                                Jobs Management
                            </a>
                        </li>
                    )}
                    
                    {permissions.includes("users") && (
                        <li className={activeMenuItem === "users" ? "active" : ""}>
                            <a href="#" onClick={(event) => handleMenuClick(event, "users")}>
                                <Users size={18} className="icon" />
                                Users/Groups
                            </a>
                        </li>
                    )}

                    {permissions.includes("resources") && (
                        <li className={activeMenuItem === "resources" ? "active" : ""}>
                            <a href="#" onClick={(event) => handleMenuClick(event, "resources")}>
                                <BarChart3 size={18} className="icon" />
                                Resource Allocation
                            </a>
                        </li>
                    )}

                    <li className="divider"></li>

                    {permissions.includes("environment") && (
                        <li className={activeMenuItem === "environment" ? "active" : ""}>
                            <a href="#" onClick={(event) => handleMenuClick(event, "environment")}>
                                <HardDrive size={18} className="icon" />
                                Environment
                            </a>
                        </li>
                    )}

                    {permissions.includes("settings") && (
                        <li className={activeMenuItem === "settings" ? "active" : ""}>
                            <a href="#" onClick={(event) => handleMenuClick(event, "settings")}>
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
                <button onClick={handleLogoutAll} className="logout-button logout-all-button" style={{ marginTop: "0.5rem" }}>
                    <LogOut size={18} className="icon" />
                    Logout All Devices
                </button>
            </div>
        </div>
    );
}