import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

export default function AdminSetup() {
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const navigate = useNavigate();

    const handleSetup = async (e) => {
        e.preventDefault();
        try {
            await axios.post("http://localhost:5001/setup-admin", { password });
            navigate("/login");
            window.location.href = "/login";
        } catch (error) {
            setError(error.response?.data?.message || "An error occurred.");
        }
    };

    return (
        <div>
            <h1>Set Admin Password</h1>
            {error && <p style={{ color: "red" }}>{error}</p>}
            <form onSubmit={handleSetup}>
                <input
                    type="password"
                    placeholder="Set Admin Password"
                    onChange={(e) => setPassword(e.target.value)}
                    required
                />
                <button type="submit">Create Admin</button>
            </form>
        </div>
    );
}
