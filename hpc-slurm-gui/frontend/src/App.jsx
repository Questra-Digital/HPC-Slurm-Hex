import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import axios from "axios";
import Login from "./Login";
import Home from "./Home";
import AdminSetup from "./AdminSetup";
import RemoteNodes from "./RemoteNodes";
import JobsPage from "./JobsPage";

function App() {
    // Check sessionStorage for username on initial load
    const [user, setUser] = useState(sessionStorage.getItem("username"));
    const [adminExists, setAdminExists] = useState(null);

    useEffect(() => {
        const checkAdmin = async () => {
            const res = await axios.get(`${import.meta.env.VITE_BACKEND_API_BASE_URL}/auth/check-admin`);
            setAdminExists(res.data.adminExists);
        };
        checkAdmin();

        // Update user state if sessionStorage has a username
        const storedUser = sessionStorage.getItem("username");
        if (storedUser && !user) {
            setUser(storedUser);
        }
    }, []);

    if (adminExists === null) return <h1>Loading...</h1>;

    return (
        <Router>
            <Routes>
                {adminExists ? (
                    <>
                        <Route path="/" element={user ? <Home user={user} /> : <Navigate to="/login" />} />
                        <Route path="/login" element={<Login setUser={setUser} />} />
                        <Route path="/remote-nodes" element={user ? <RemoteNodes /> : <Navigate to="/login" />} />
                        <Route path="/job-page" element={user ? <JobsPage /> : <Navigate to="/login" />} />
                    </>
                ) : (
                    <Route path="*" element={<AdminSetup />} />
                )}
            </Routes>
        </Router>
    );
}

export default App;