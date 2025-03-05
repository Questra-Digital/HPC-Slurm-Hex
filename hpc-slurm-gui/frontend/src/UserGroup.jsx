import { useState, useEffect } from "react";
import axios from "axios";

export default function UserGroup() {
    // State for users and groups
    const [users, setUsers] = useState([]);
    const [groups, setGroups] = useState([]);
    const [userGroups, setUserGroups] = useState([]);
    
    // State for form inputs
    const [newUser, setNewUser] = useState({ username: "", email: "", password: "" });
    const [newGroup, setNewGroup] = useState({ name: "" });
    const [selectedUser, setSelectedUser] = useState("");
    const [selectedGroup, setSelectedGroup] = useState("");
    
    // State for error and success messages
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    
    // State for active tab
    const [activeTab, setActiveTab] = useState("users");

    // State for editing
    const [editingUser, setEditingUser] = useState(null);
    const [editingGroup, setEditingGroup] = useState(null);

    // State for pagination
    const [currentPage, setCurrentPage] = useState(1);
    const usersPerPage = 9;

    // Fetch users, groups, and user-group relationships on component mount
    useEffect(() => {
        fetchUsers();
        fetchGroups();
        fetchUserGroups();
    }, []);

    // Function to fetch all users
    const fetchUsers = async () => {
        try {
            const response = await axios.get("http://localhost:5001/users/users");
            setUsers(response.data);
        } catch (err) {
            setError("Failed to fetch users");
            console.error(err);
        }
    };

    // Function to fetch all groups
    const fetchGroups = async () => {
        try {
            const response = await axios.get("http://localhost:5001/users/groups");
            setGroups(response.data);
        } catch (err) {
            setError("Failed to fetch groups");
            console.error(err);
        }
    };

    // Function to fetch user-group relationships
    const fetchUserGroups = async () => {
        try {
            const response = await axios.get("http://localhost:5001/users/user-groups");
            setUserGroups(response.data);
        } catch (err) {
            setError("Failed to fetch user-group relationships");
            console.error(err);
        }
    };

    // Function to create a new user
    const handleCreateUser = async (e) => {
        e.preventDefault();
        setError("");
        setSuccess("");
        
        try {
            await axios.post("http://localhost:5001/auth/signup", newUser);
            setSuccess("User created successfully");
            setNewUser({ username: "", email: "", password: "" });
            fetchUsers();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to create user");
            console.error(err);
        }
    };

    // Function to handle user edit
    const handleEditUser = async (user) => {
        setEditingUser(user);
        setNewUser({
            username: user.username,
            email: user.email,
            password: "" // Leave blank for no change
        });
    };

    const handleUpdateUser = async (e) => {
        e.preventDefault();
        try {
            await axios.put(`http://localhost:5001/users/users/${editingUser.id}`, newUser);
            setSuccess("User updated successfully");
            setNewUser({ username: "", email: "", password: "" });
            setEditingUser(null);
            fetchUsers();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to update user");
        }
    };

    // Function to delete user
    const handleDeleteUser = async (userId) => {
        if (window.confirm("Are you sure you want to delete this user?")) {
            try {
                await axios.delete(`http://localhost:5001/users/users/${userId}`);
                setSuccess("User deleted successfully");
                fetchUsers();
                fetchUserGroups();
                // Adjust page if necessary
                const totalPages = Math.ceil((users.length - 1) / usersPerPage);
                if (currentPage > totalPages) setCurrentPage(totalPages || 1);
            } catch (err) {
                setError(err.response?.data?.message || "Failed to delete user");
            }
        }
    };

    // Function to create a new group
    const handleCreateGroup = async (e) => {
        e.preventDefault();
        setError("");
        setSuccess("");
        
        try {
            await axios.post("http://localhost:5001/users/groups", newGroup);
            setSuccess("Group created successfully");
            setNewGroup({ name: "" });
            fetchGroups();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to create group");
            console.error(err);
        }
    };

    // Function to handle group edit
    const handleEditGroup = (group) => {
        setEditingGroup(group);
        setNewGroup({ name: group.name });
    };

    const handleUpdateGroup = async (e) => {
        e.preventDefault();
        try {
            await axios.put(`http://localhost:5001/users/groups/${editingGroup.id}`, newGroup);
            setSuccess("Group updated successfully");
            setNewGroup({ name: "" });
            setEditingGroup(null);
            fetchGroups();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to update group");
        }
    };

    // Function to delete group
    const handleDeleteGroup = async (groupId) => {
        if (window.confirm("Are you sure you want to delete this group?")) {
            try {
                await axios.delete(`http://localhost:5001/users/groups/${groupId}`);
                setSuccess("Group deleted successfully");
                fetchGroups();
                fetchUserGroups();
            } catch (err) {
                setError(err.response?.data?.message || "Failed to delete group");
            }
        }
    };

    // Function to add user to group
    const handleAddUserToGroup = async (e) => {
        e.preventDefault();
        setError("");
        setSuccess("");
        
        if (!selectedUser || !selectedGroup) {
            setError("Please select both a user and a group");
            return;
        }
        
        try {
            await axios.post("http://localhost:5001/users/user-groups", {
                user_id: selectedUser,
                group_id: selectedGroup
            });
            setSuccess("User added to group successfully");
            fetchUserGroups();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to add user to group");
            console.error(err);
        }
    };

    // Function to remove user from group
    const handleRemoveUserFromGroup = async (userId, groupId) => {
        setError("");
        setSuccess("");
        
        try {
            await axios.delete(`http://localhost:5001/users/user-groups`, {
                data: { user_id: userId, group_id: groupId }
            });
            setSuccess("User removed from group successfully");
            fetchUserGroups();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to remove user from group");
            console.error(err);
        }
    };

    // Helper function to get username by ID
    const getUsernameById = (id) => {
        const user = users.find(user => user.id === id);
        return user ? user.username : "Unknown";
    };

    // Helper function to get groupname by ID
    const getGroupNameById = (id) => {
        const group = groups.find(group => group.id === id);
        return group ? group.name : "Unknown";
    };

    // Pagination logic
    const indexOfLastUser = currentPage * usersPerPage;
    const indexOfFirstUser = indexOfLastUser - usersPerPage;
    const currentUsers = users.slice(indexOfFirstUser, indexOfLastUser);
    const totalPages = Math.ceil(users.length / usersPerPage);

    const paginate = (pageNumber) => setCurrentPage(pageNumber);

    return (
        <div className="usergroup-container">
            <div className="usergroup-card">
                <div className="header">
                    <h1>User & Group Management</h1>
                    <p className="subtitle">Manage system users and groups</p>
                </div>

                {/* Error and Success Messages */}
                {error && <div className="error-message">{error}</div>}
                {success && <div className="success-message">{success}</div>}

                {/* Tabs */}
                <div className="tabs">
                    <button 
                        className={`tab-btn ${activeTab === "users" ? "active" : ""}`}
                        onClick={() => setActiveTab("users")}
                    >
                        Users
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === "groups" ? "active" : ""}`}
                        onClick={() => setActiveTab("groups")}
                    >
                        Groups
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === "memberships" ? "active" : ""}`}
                        onClick={() => setActiveTab("memberships")}
                    >
                        Group Memberships
                    </button>
                </div>

                {/* Users Tab */}
                {activeTab === "users" && (
                    <div className="tab-content">
                        <div className="card">
                            <h2>{editingUser ? "Edit User" : "Create New User"}</h2>
                            <form onSubmit={editingUser ? handleUpdateUser : handleCreateUser} className="form">
                                <div className="input-group">
                                    <label htmlFor="username">Username</label>
                                    <input
                                        type="text"
                                        id="username"
                                        placeholder="Enter username"
                                        value={newUser.username}
                                        onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                                        required
                                    />
                                </div>
                                <div className="input-group">
                                    <label htmlFor="email">Email</label>
                                    <input
                                        type="email"
                                        id="email"
                                        placeholder="Enter email"
                                        value={newUser.email}
                                        onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                                        required
                                    />
                                </div>
                                <div className="input-group">
                                    <label htmlFor="password">Password</label>
                                    <input
                                        type="password"
                                        id="password"
                                        placeholder={editingUser ? "Enter new password (optional)" : "Enter password"}
                                        value={newUser.password}
                                        onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                                        required={!editingUser}
                                    />
                                </div>
                                <button type="submit" className="submit-btn">
                                    {editingUser ? "Update User" : "Create User"}
                                </button>
                                {editingUser && (
                                    <button 
                                        type="button" 
                                        className="cancel-btn" 
                                        onClick={() => {
                                            setEditingUser(null);
                                            setNewUser({ username: "", email: "", password: "" });
                                        }}
                                    >
                                        Cancel
                                    </button>
                                )}
                            </form>
                        </div>

                        <div className="card mt-4 user-list-container">
                            <h2>User List</h2>
                            <div className="table-container">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Username</th>
                                            <th>Email</th>
                                            <th>Role</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {currentUsers.length > 0 ? (
                                            currentUsers.map(user => (
                                                <tr key={user.id}>
                                                    <td>{user.id}</td>
                                                    <td>{user.username}</td>
                                                    <td>{user.email}</td>
                                                    <td>{user.role}</td>
                                                    <td>
                                                        <button 
                                                            className="edit-btn"
                                                            onClick={() => handleEditUser(user)}
                                                        >
                                                            Edit
                                                        </button>
                                                        <button 
                                                            className="remove-btn"
                                                            onClick={() => handleDeleteUser(user.id)}
                                                        >
                                                            Delete
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="5">No users found</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            {users.length > usersPerPage && (
                                <div className="pagination">
                                    <button
                                        onClick={() => paginate(currentPage - 1)}
                                        disabled={currentPage === 1}
                                        className="pagination-btn"
                                    >
                                        Previous
                                    </button>
                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                        <button
                                            key={page}
                                            onClick={() => paginate(page)}
                                            className={`pagination-btn ${currentPage === page ? "active" : ""}`}
                                        >
                                            {page}
                                        </button>
                                    ))}
                                    <button
                                        onClick={() => paginate(currentPage + 1)}
                                        disabled={currentPage === totalPages}
                                        className="pagination-btn"
                                    >
                                        Next
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Groups Tab */}
                {activeTab === "groups" && (
                    <div className="tab-content">
                        <div className="card">
                            <h2>{editingGroup ? "Edit Group" : "Create New Group"}</h2>
                            <form onSubmit={editingGroup ? handleUpdateGroup : handleCreateGroup} className="form">
                                <div className="input-group">
                                    <label htmlFor="groupname">Group Name</label>
                                    <input
                                        type="text"
                                        id="groupname"
                                        placeholder="Enter group name"
                                        value={newGroup.name}
                                        onChange={(e) => setNewGroup({...newGroup, name: e.target.value})}
                                        required
                                    />
                                </div>
                                <button type="submit" className="submit-btn">
                                    {editingGroup ? "Update Group" : "Create Group"}
                                </button>
                                {editingGroup && (
                                    <button 
                                        type="button" 
                                        className="cancel-btn" 
                                        onClick={() => {
                                            setEditingGroup(null);
                                            setNewGroup({ name: "" });
                                        }}
                                    >
                                        Cancel
                                    </button>
                                )}
                            </form>
                        </div>

                        <div className="card mt-4">
                            <h2>Group List</h2>
                            <div className="table-container">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Group Name</th>
                                            <th>Created At</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {groups.length > 0 ? (
                                            groups.map(group => (
                                                <tr key={group.id}>
                                                    <td>{group.id}</td>
                                                    <td>{group.name}</td>
                                                    <td>{new Date(group.created_at).toLocaleString()}</td>
                                                    <td>
                                                        <button 
                                                            className="edit-btn"
                                                            onClick={() => handleEditGroup(group)}
                                                        >
                                                            Edit
                                                        </button>
                                                        <button 
                                                            className="remove-btn"
                                                            onClick={() => handleDeleteGroup(group.id)}
                                                        >
                                                            Delete
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="4">No groups found</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* Group Memberships Tab */}
                {activeTab === "memberships" && (
                    <div className="tab-content">
                        <div className="card">
                            <h2>Add User to Group</h2>
                            <form onSubmit={handleAddUserToGroup} className="form">
                                <div className="input-group">
                                    <label htmlFor="user-select">Select User</label>
                                    <select
                                        id="user-select"
                                        value={selectedUser}
                                        onChange={(e) => setSelectedUser(e.target.value)}
                                        required
                                    >
                                        <option value="">-- Select User --</option>
                                        {users.map(user => (
                                            <option key={user.id} value={user.id}>
                                                {user.username}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="input-group">
                                    <label htmlFor="group-select">Select Group</label>
                                    <select
                                        id="group-select"
                                        value={selectedGroup}
                                        onChange={(e) => setSelectedGroup(e.target.value)}
                                        required
                                    >
                                        <option value="">-- Select Group --</option>
                                        {groups.map(group => (
                                            <option key={group.id} value={group.id}>
                                                {group.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <button type="submit" className="submit-btn">Add to Group</button>
                            </form>
                        </div>

                        <div className="card mt-4">
                            <h2>Group Membership List</h2>
                            <div className="table-container">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>User</th>
                                            <th>Group</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {userGroups.length > 0 ? (
                                            userGroups.map((relation, index) => (
                                                <tr key={index}>
                                                    <td>{getUsernameById(relation.user_id)}</td>
                                                    <td>{getGroupNameById(relation.group_id)}</td>
                                                    <td>
                                                        <button
                                                            className="remove-btn"
                                                            onClick={() => handleRemoveUserFromGroup(relation.user_id, relation.group_id)}
                                                        >
                                                            Remove
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="3">No memberships found</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Styling */}
            <style>{`
                .usergroup-container {
                    display: flex;
                    justify-content: center;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    height: 100vh;
                    padding: 20px;
                    height:95vh;
                }

                .usergroup-card {
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
                    margin-bottom: 1.5rem;
                    margin-top:-20px;
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
                }

                .submit-btn:hover {
                    background: #1e40af;
                }

                .edit-btn {
                    background: #2563eb;
                    color: white;
                    padding: 0.5rem 0.75rem;
                    border: none;
                    border-radius: 4px;
                    font-size: 0.875rem;
                    font-weight: 500;
                    cursor: pointer;
                    transition: background 0.2s;
                    margin-right: 0.5rem;
                }

                .edit-btn:hover {
                    background: #1d4ed8;
                }

                .remove-btn {
                    background: #ef4444;
                    color: white;
                    padding: 0.5rem 0.75rem;
                    border: none;
                    border-radius: 4px;
                    font-size: 0.875rem;
                    font-weight: 500;
                    cursor: pointer;
                    transition: background 0.2s;
                }

                .remove-btn:hover {
                    background: #dc2626;
                }

                .cancel-btn {
                    background: #6b7280;
                    color: white;
                    padding: 0.75rem 1rem;
                    border: none;
                    border-radius: 6px;
                    font-size: 1rem;
                    font-weight: 500;
                    cursor: pointer;
                    transition: background 0.2s;
                    margin-top: 0.5rem;
                    margin-left: 0.5rem;
                }

                .cancel-btn:hover {
                    background: #4b5563;
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

                .mt-4 {
                    margin-top: 1rem;
                }

                .user-list-container {
                    display: flex;
                    flex-direction: column;
                }

                .pagination {
                    display: flex;
                    justify-content: center;
                    gap: 0.5rem;
                    margin-top: 1rem;
                    flex-shrink: 0;
                }

                .pagination-btn {
                    background: #e2e8f0;
                    color: #1e3a8a;
                    padding: 0.5rem 1rem;
                    border: none;
                    border-radius: 4px;
                    font-size: 0.875rem;
                    font-weight: 500;
                    cursor: pointer;
                    transition: background 0.2s;
                }

                .pagination-btn:hover {
                    background: #cbd5e1;
                }

                .pagination-btn.active {
                    background: #1e3a8a;
                    color: white;
                }

                .pagination-btn:disabled {
                    background: #f1f5f9;
                    color: #94a3b8;
                    cursor: not-allowed;
                }

                .tab-content::-webkit-scrollbar {
                    width: 8px;
                }

                .tab-content::-webkit-scrollbar-track {
                    background: #f1f1f1;
                    border-radius: 4px;
                }

                .tab-content::-webkit-scrollbar-thumb {
                    background: #c1c1c1;
                    border-radius: 4px;
                }

                .tab-content::-webkit-scrollbar-thumb:hover {
                    background: #a8a8a8;
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
        </div>
    );
}