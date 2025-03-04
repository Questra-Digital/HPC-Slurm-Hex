import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

export default function Signup() {
    const [username, setUsername] = useState(""); 
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    // Password & Email Validation Regex
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const handleSignup = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        if (!emailRegex.test(email)) {
            setError("Invalid email format.");
            return;
        }

        if (!passwordRegex.test(password)) {
            setError("Password must be at least 8 characters, include 1 uppercase letter, 1 number, and 1 special character.");
            return;
        }

        setLoading(true);
        try {
            const response = await axios.post("http://localhost:5001/auth/signup", {
                username, email, password
            });

            setSuccess("Signup successful! Redirecting...");
            setTimeout(() => navigate("/login"), 2000); 
        } catch (error) {
            setError(error.response?.data?.message || "Signup failed. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSignup} style={{ maxWidth: "400px", margin: "auto" }}>
            <input 
                type="text" 
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)} 
                required 
            />
            <input 
                type="email" 
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)} 
                required 
            />
            {/* Email validation message */}
            {email && !emailRegex.test(email) && <p style={{ color: "red" }}> Invalid email format</p>}

            <input 
                type="password" 
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required 
            />
            {/* Password Strength Indicator */}
            {password && (
                <p style={{ color: passwordRegex.test(password) ? "green" : "red" }}>
                    {passwordRegex.test(password) ? "Strong password" : "Weak password"}
                </p>
            )}

            <button type="submit" disabled={loading} style={{ display: "block", width: "100%" }}>
                {loading ? "Signing up..." : "Signup"}
            </button>

            {loading && <p>Please wait...</p>}
            {error && <p style={{ color: "red" }}>{error}</p>}
            {success && <p style={{ color: "green" }}>{success}</p>}
        </form>
    );
}
