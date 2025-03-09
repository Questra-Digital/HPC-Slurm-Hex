import { useState, useEffect } from "react";
import axios from "axios";

export default function Settings() {
    const [profile, setProfile] = useState({
        id: "",
        username: "",
        email: "",
        role: "",
        created_at: ""
    });
    
    const [formData, setFormData] = useState({
        username: "",
        email: "",
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
    });
    
    const [userGroups, setUserGroups] = useState([]);
    const [resourceLimits, setResourceLimits] = useState({
        max_cpu: 0,
        max_gpu: 0,
        max_memory: 0
    });
    const [activeTab, setActiveTab] = useState("profile");
    const [notifications, setNotifications] = useState({
        error: "",
        success: ""
    });
    const [loading, setLoading] = useState(true);
    // New state for resource context selection
    const [resourceContext, setResourceContext] = useState("user");
    const [selectedGroupId, setSelectedGroupId] = useState("");

    useEffect(() => {
        const userId = sessionStorage.getItem('id');
        const username = sessionStorage.getItem('username');
        const role = sessionStorage.getItem('user_role');

        if (!userId) {
            setNotifications({
                ...notifications,
                error: "No user session found. Please log in."
            });
            setLoading(false);
            return;
        }

        setProfile(prev => ({
            ...prev,
            id: userId,
            username: username || "",
            role: role || ""
        }));

        setFormData(prev => ({
            ...prev,
            username: username || ""
        }));

        fetchUserData(userId);
        fetchUserGroups(userId);
        fetchResourceLimits("user", userId);
    }, []);

    const fetchUserData = async (userId) => {
        try {
            const response = await axios.get(`${import.meta.env.VITE_BACKEND_API_BASE_URL}/users/users`);
            const userData = response.data.find(user => user.id === userId) || response.data[0];
            
            setProfile(prev => ({
                ...prev,
                email: userData.email || "",
                created_at: userData.created_at || "",
                username: prev.username || userData.username,
                role: prev.role || userData.role
            }));

            setFormData(prev => ({
                ...prev,
                email: userData.email || "",
                username: prev.username || userData.username
            }));
            
            setLoading(false);
        } catch (err) {
            setNotifications({
                ...notifications,
                error: "Failed to fetch additional user profile data"
            });
            console.error(err);
            setLoading(false);
        }
    };

    const fetchUserGroups = async (userId) => {
        try {
            const response = await axios.get(`${import.meta.env.VITE_BACKEND_API_BASE_URL}/users/users/${userId}/groups`);
            setUserGroups(response.data || []);
        } catch (err) {
            console.error("Failed to fetch user groups:", err);
        }
    };

    const fetchResourceLimits = async (context, id) => {
        try {
            const url = context === "user"
                ? `${import.meta.env.VITE_BACKEND_API_BASE_URL}/resources/resource-limits?user_id=${id}`
                : `${import.meta.env.VITE_BACKEND_API_BASE_URL}/resources/resource-limits?group_id=${id}`;
            const response = await axios.get(url);
            setResourceLimits({
                max_cpu: response.data.max_cpu || 0,
                max_gpu: response.data.max_gpu || 0,
                max_memory: response.data.max_memory || 0
            });
        } catch (err) {
            console.error("Failed to fetch resource limits:", err);
            setNotifications({
                ...notifications,
                error: "Failed to fetch resource limits"
            });
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData({
            ...formData,
            [name]: value
        });
    };

    const handleProfileUpdate = async (e) => {
        e.preventDefault();
        clearNotifications();
        
        try {
            await axios.put(`${import.meta.env.VITE_BACKEND_API_BASE_URL}/users/users/${profile.id}`, {
                username: formData.username,
                email: formData.email
            });
            
            sessionStorage.setItem('username', formData.username);

            setNotifications({
                ...notifications,
                success: "Profile updated successfully"
            });
            
            setProfile({
                ...profile,
                username: formData.username,
                email: formData.email
            });
            
            setTimeout(() => {
                setNotifications({
                    ...notifications,
                    success: ""
                });
            }, 3000);
        } catch (err) {
            setNotifications({
                ...notifications,
                error: err.response?.data?.message || "Failed to update profile"
            });
            console.error(err);
        }
    };

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        clearNotifications();
        
        if (formData.newPassword !== formData.confirmPassword) {
            setNotifications({
                ...notifications,
                error: "New passwords do not match"
            });
            return;
        }
        
        if (formData.newPassword.length < 6) {
            setNotifications({
                ...notifications,
                error: "Password must be at least 6 characters"
            });
            return;
        }
        
        try {
            await axios.put(`${import.meta.env.VITE_BACKEND_API_BASE_URL}/users/users/${profile.id}`, {
                password: formData.newPassword
            });
            
            setNotifications({
                ...notifications,
                success: "Password updated successfully"
            });
            
            setFormData({
                ...formData,
                currentPassword: "",
                newPassword: "",
                confirmPassword: ""
            });
            
            setTimeout(() => {
                setNotifications({
                    ...notifications,
                    success: ""
                });
            }, 3000);
        } catch (err) {
            setNotifications({
                ...notifications,
                error: err.response?.data?.message || "Failed to update password"
            });
            console.error(err);
        }
    };

    const handleResourceContextChange = (context) => {
        setResourceContext(context);
        if (context === "user") {
            fetchResourceLimits("user", profile.id);
            setSelectedGroupId("");
        }
    };

    const handleGroupChange = (groupId) => {
        setSelectedGroupId(groupId);
        if (groupId) {
            fetchResourceLimits("group", groupId);
        }
    };

    const clearNotifications = () => {
        setNotifications({
            error: "",
            success: ""
        });
    };

    const formatDate = (dateString) => {
        if (!dateString) return "N/A";
        return new Date(dateString).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    };


    return (
        <div className="settings-container">
            <div className="settings-card">
                <div className="header">
                    <h1>User Settings</h1>
                    <p className="subtitle">Manage your account settings and preferences</p>
                </div>

                {notifications.error && <div className="error-message">{notifications.error}</div>}
                {notifications.success && <div className="success-message">{notifications.success}</div>}

                <div className="tabs">
                    <button 
                        className={`tab-btn ${activeTab === "profile" ? "active" : ""}`}
                        onClick={() => setActiveTab("profile")}
                    >
                        Profile
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === "security" ? "active" : ""}`}
                        onClick={() => setActiveTab("security")}
                    >
                        Security
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === "groups" ? "active" : ""}`}
                        onClick={() => setActiveTab("groups")}
                    >
                        Group Memberships
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === "resources" ? "active" : ""}`}
                        onClick={() => setActiveTab("resources")}
                    >
                        Resource Limits
                    </button>
                </div>

                <div className="tab-content">
                    {activeTab === "profile" && (
                        <div>
                            <div className="card profile-summary">
                                <h2>Profile Summary</h2>
                                <div className="profile-info">
                                    <div className="avatar">
                                        <div className="avatar-circle">
                                            {profile.username.substring(0, 2).toUpperCase()}
                                        </div>
                                    </div>
                                    <div className="info-details">
                                        <div className="info-row">
                                            <span className="info-label">Username:</span>
                                            <span className="info-value">{profile.username}</span>
                                        </div>
                                        <div className="info-row">
                                            <span className="info-label">Email:</span>
                                            <span className="info-value">{profile.email}</span>
                                        </div>
                                        <div className="info-row">
                                            <span className="info-label">Role:</span>
                                            <span className="info-value role-badge">{profile.role}</span>
                                        </div>
                                        <div className="info-row">
                                            <span className="info-label">Member Since:</span>
                                            <span className="info-value">{formatDate(profile.created_at)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="card">
                                <h2>Edit Profile</h2>
                                <form onSubmit={handleProfileUpdate} className="form">
                                    <div className="input-group">
                                        <label htmlFor="username">Username</label>
                                        <input
                                            type="text"
                                            id="username"
                                            name="username"
                                            value={formData.username}
                                            onChange={handleInputChange}
                                            disabled
                                            required
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label htmlFor="email">Email</label>
                                        <input
                                            type="email"
                                            id="email"
                                            name="email"
                                            value={formData.email}
                                            onChange={handleInputChange}
                                            required
                                        />
                                    </div>
                                    <button type="submit" className="submit-btn">
                                        Update Profile
                                    </button>
                                </form>
                            </div>
                        </div>
                    )}

                    {activeTab === "security" && (
                        <div className="card">
                            <h2>Change Password</h2>
                            <form onSubmit={handlePasswordChange} className="form">
                                <div className="input-group">
                                    <label htmlFor="currentPassword">Current Password</label>
                                    <input
                                        type="password"
                                        id="currentPassword"
                                        name="currentPassword"
                                        value={formData.currentPassword}
                                        onChange={handleInputChange}
                                        required
                                    />
                                </div>
                                <div className="input-group">
                                    <label htmlFor="newPassword">New Password</label>
                                    <input
                                        type="password"
                                        id="newPassword"
                                        name="newPassword"
                                        value={formData.newPassword}
                                        onChange={handleInputChange}
                                        required
                                    />
                                    <div className="password-requirements">
                                        Password must be at least 6 characters long
                                    </div>
                                </div>
                                <div className="input-group">
                                    <label htmlFor="confirmPassword">Confirm New Password</label>
                                    <input
                                        type="password"
                                        id="confirmPassword"
                                        name="confirmPassword"
                                        value={formData.confirmPassword}
                                        onChange={handleInputChange}
                                        required
                                    />
                                </div>
                                <button type="submit" className="submit-btn">
                                    Change Password
                                </button>
                            </form>
                        </div>
                    )}

                    {activeTab === "groups" && (
                        <div className="card">
                            <h2>Your Group Memberships</h2>
                            <div className="table-container">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Group Name</th>
                                            <th>Date Joined</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {userGroups.length > 0 ? (
                                            userGroups.map(group => (
                                                <tr key={group.id}>
                                                    <td>{group.name}</td>
                                                    <td>{formatDate(group.created_at)}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="2">You are not a member of any groups</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <div className="group-note">
                                <p>Note: Group memberships are managed by system administrators.</p>
                            </div>
                        </div>
                    )}

                    {activeTab === "resources" && (
                        <div className="card">
                            <h2>Resource Allocation</h2>
                            <div className="resource-context">
                                <div className="input-group">
                                    <label htmlFor="resource-context">Resource Context</label>
                                    <select
                                        id="resource-context"
                                        value={resourceContext}
                                        onChange={(e) => handleResourceContextChange(e.target.value)}
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
                                            onChange={(e) => handleGroupChange(e.target.value)}
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
                            </div>
                            <div className="resource-grid">
                                <div className="resource-card">
                                    <div className="resource-icon cpu-icon">CPU</div>
                                    <div className="resource-details">
                                        <div className="resource-title">CPU Cores</div>
                                        <div className="resource-value">{resourceLimits.max_cpu}</div>
                                    </div>
                                </div>
                                <div className="resource-card">
                                    <div className="resource-icon gpu-icon">GPU</div>
                                    <div className="resource-details">
                                        <div className="resource-title">GPU Units</div>
                                        <div className="resource-value">{resourceLimits.max_gpu}</div>
                                    </div>
                                </div>
                                <div className="resource-card">
                                    <div className="resource-icon memory-icon">RAM</div>
                                    <div className="resource-details">
                                        <div className="resource-title">Memory (GB)</div>
                                        <div className="resource-value">{resourceLimits.max_memory}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                .settings-container {
                    display: flex;
                    justify-content: center;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    padding: 20px;
                    height: 95vh;
                }

                .settings-card {
                    background-color: #ffffff;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                    padding: 24px;
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }

                .header {
                    margin-bottom: 24px;
                    border-bottom: 1px solid #eaeaea;
                    padding-bottom: 16px;
                    text-align: center;
                    flex-shrink: 0;
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

                .error-message {
                    background: #fee2e2;
                    color: #991b1b;
                    padding: 1rem;
                    border-radius: 8px;
                    margin-bottom: 1.5rem;
                    flex-shrink: 0;
                }

                .success-message {
                    background: #d1fae5;
                    color: #065f46;
                    padding: 1rem;
                    border-radius: 8px;
                    margin-bottom: 1.5rem;
                    flex-shrink: 0;
                }

                .tabs {
                    display: flex;
                    border-bottom: 2px solid #e2e8f0;
                    margin-bottom: 1rem;
                    flex-shrink: 0;
                    flex-wrap: wrap;
                }

                .tab-btn {
                    padding: 0.75rem 1.5rem;
                    background: none;
                    border: none;
                    color: #64748b;
                    font-size: 1rem;
                    font-weight: 500;
                    cursor: pointer;
                    border-bottom: 3px solid transparent;
                    margin-bottom: -2px;
                }

                .tab-btn.active {
                    color: #1e3a8a;
                    border-bottom-color: #1e3a8a;
                }

                .tab-content {
                    flex: 1;
                    overflow-y: auto;
                    padding-right: 10px;
                }

                .card {
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    padding: 1.5rem;
                    margin-bottom: 1.5rem;
                }

                .card h2 {
                    color: #1e3a8a;
                    font-size: 1.5rem;
                    margin-top: 0;
                    margin-bottom: 1.5rem;
                }

                .card h3 {
                    color: #1e3a8a;
                    font-size: 1.2rem;
                    margin-top: 1.5rem;
                    margin-bottom: 1rem;
                    border-bottom: 1px solid #e2e8f0;
                    padding-bottom: 0.5rem;
                }

                .form {
                    display: flex;
                    flex-direction: column;
                    gap: 1.25rem;
                }

                .input-group {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }

                .input-group label {
                    color: #1e3a8a;
                    font-weight: 500;
                }

                input, select {
                    padding: 0.75rem;
                    border: 2px solid #e2e8f0;
                    border-radius: 6px;
                    font-size: 1rem;
                    transition: border-color 0.2s;
                }

                input:focus, select:focus {
                    outline: none;
                    border-color: #1e3a8a;
                }

                .submit-btn {
                    background: #1e3a8a;
                    color: white;
                    padding: 0.75rem 1rem;
                    border: none;
                    border-radius: 6px;
                    font-size: 1rem;
                    font-weight: 500;
                    cursor: pointer;
                    transition: background 0.2s;
                    margin-top: 0.5rem;
                    align-self: flex-start;
                }

                .submit-btn:hover {
                    background: #1e40af;
                }

                .profile-summary {
                    margin-bottom: 1.5rem;
                }

                .profile-info {
                    display: flex;
                    align-items: center;
                    gap: 2rem;
                }

                .avatar {
                    flex-shrink: 0;
                }

                .avatar-circle {
                    width: 80px;
                    height: 80px;
                    background-color: #1e3a8a;
                    color: white;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.5rem;
                    font-weight: 600;
                }

                .info-details {
                    flex: 1;
                }

                .info-row {
                    display: flex;
                    margin-bottom: 0.5rem;
                    align-items: center;
                }

                .info-label {
                    width: 120px;
                    font-weight: 600;
                    color: #4b5563;
                }

                .info-value {
                    color: #111827;
                }

                .role-badge {
                    display: inline-block;
                    padding: 0.25rem 0.75rem;
                    background-color: #dbeafe;
                    color: #1e40af;
                    border-radius: 9999px;
                    font-size: 0.875rem;
                    font-weight: 500;
                }

                .password-requirements {
                    font-size: 0.875rem;
                    color: #4b5563;
                    margin-top: 0.25rem;
                }

                .table-container {
                    overflow-x: auto;
                }

                .data-table {
                    width: 100%;
                    border-collapse: collapse;
                }

                .data-table th, .data-table td {
                    padding: 0.75rem 1rem;
                    border-bottom: 1px solid #e2e8f0;
                    text-align: left;
                }

                .data-table th {
                    background-color: #f8fafc;
                    color: #1e3a8a;
                    font-weight: 600;
                }

                .data-table tr:hover {
                    background-color: #f8fafc;
                }

                .group-note {
                    margin-top: 1rem;
                    font-size: 0.875rem;
                    color: #64748b;
                    font-style: italic;
                }

                .security-section {
                    margin-top: 2rem;
                }

                .session-info {
                    background-color: #f8fafc;
                    border-radius: 8px;
                    overflow: hidden;
                }

                .session-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1rem;
                    border-bottom: 1px solid #e2e8f0;
                }

                .session-details {
                    display: flex;
                    flex-direction: column;
                }

                .session-device {
                    font-weight: 500;
                    color: #1f2937;
                }

                .session-time {
                    font-size: 0.875rem;
                    color: #6b7280;
                    margin-top: 0.25rem;
                }

                .session-status {
                    padding: 0.25rem 0.75rem;
                    border-radius: 9999px;
                    font-size: 0.875rem;
                    font-weight: 500;
                }

                .session-status.active {
                    background-color: #d1fae5;
                    color: #065f46;
                }

                .resource-context {
                    margin-bottom: 1.5rem;
                }

                .resource-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                    gap: 1rem;
                    margin-bottom: 1.5rem;
                }

                .resource-card {
                    background-color: #f8fafc;
                    border-radius: 8px;
                    padding: 1rem;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                }

                .resource-icon {
                    width: 50px;
                    height: 50px;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 600;
                    font-size: 1rem;
                    color: white;
                }

                .cpu-icon {
                    background-color: #3b82f6;
                }

                .gpu-icon {
                    background-color: #10b981;
                }

                .memory-icon {
                    background-color: #8b5cf6;
                }

                .resource-details {
                    flex: 1;
                }

                .resource-title {
                    font-size: 0.875rem;
                    color: #4b5563;
                }

                .resource-value {
                    font-size: 1.5rem;
                    font-weight: 600;
                    color: #1f2937;
                }

                @media (max-width: 768px) {
                    .profile-info {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 1rem;
                    }

                    .tabs {
                        overflow-x: auto;
                    }
                    
                    .tab-btn {
                        padding: 0.75rem 1rem;
                    }
                }
            `}</style>
        </div>
    );
}