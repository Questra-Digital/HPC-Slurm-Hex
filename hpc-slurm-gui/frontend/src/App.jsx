import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import axios from "axios";
import Login from "./Login";
import Signup from "./Signup";
import Home from "./Home";
import AdminSetup from "./AdminSetup";
import RemoteNodes from "./RemoteNodes"; // Import the new component
import JobsPage from "./JobsPage";

function App() {
    const [user, setUser] = useState(localStorage.getItem("user"));
    const [adminExists, setAdminExists] = useState(null);

    useEffect(() => {
        const checkAdmin = async () => {
            const res = await axios.get("http://localhost:5001/check-admin");
            setAdminExists(res.data.adminExists);
        };
        checkAdmin();
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
                <Route path="/signup" element={<Signup />} />
            </Routes>
        </Router>
    );
}

export default App;
