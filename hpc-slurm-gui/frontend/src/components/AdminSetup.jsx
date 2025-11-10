import React from "react";
import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../config";
export default function AdminSetup() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const navigate = useNavigate();

    const handleSetup = async (e) => {
        e.preventDefault();
        try {
            await axios.post(`${API_BASE_URL}/auth/setup-admin`, { username: "admin", email, password });
            navigate("/login");
            window.location.href = "/login";
        } catch (error) {
            setError(error.response?.data?.message || "An error occurred.");
        }
    };

    return (
        <div className="admin-setup-container">
            <div className="setup-card">
                <div className="header">
                    <h1>Welcome to HPC-Slurm-HEX</h1>
                    <p className="subtitle">Initial Administrator Setup</p>
                </div>

                {error && <div className="error-message">{error}</div>}

                <form onSubmit={handleSetup} className="setup-form">
                    {/* Username Field - Readonly */}
                    <div className="input-group">
                        <label htmlFor="username">Username</label>
                        <input
                            type="text"
                            id="username"
                            value="admin"
                            readOnly
                            className="readonly-input"
                        />
                    </div>

                    {/* Email Field */}
                    <div className="input-group">
                        <label htmlFor="email">Administrator Email</label>
                        <input
                            type="email"
                            id="email"
                            placeholder="Enter your email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    {/* Password Field with Show/Hide */}
                    <div className="input-group password-group">
                        <label htmlFor="password">Administrator Password</label>
                        <div className="password-input-container">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                id="password"
                                placeholder="Enter secure password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                            <button
                                type="button"
                                className="toggle-password"
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? 'Hide' : 'Show'}
                            </button>
                        </div>
                    </div>

                    <button type="submit" className="submit-btn">
                        Create Administrator Account
                    </button>
                </form>

                <div className="footer">
                    <p>© 2025 HPC-Slurm-HEX. All rights reserved.</p>
                </div>
            </div>

            <style>{`
                .admin-setup-container {
                    height: 100vh; 
                    width: 100vw; 
                    background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }

                .setup-card {
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    padding: 2rem;
                    width: 100%;
                    max-width: 480px;
                }

                .header {
                    text-align: center;
                    margin-bottom: 2rem;
                }

                h1 {
                    color: #1e3a8a;
                    font-size: 2rem;
                    margin-bottom: 0.5rem;
                }

                .subtitle {
                    color: #64748b;
                    font-size: 1.1rem;
                }

                .error-message {
                    background: #fee2e2;
                    color: #991b1b;
                    padding: 1rem;
                    border-radius: 8px;
                    margin-bottom: 1.5rem;
                    text-align: center;
                }

                .setup-form {
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                }

                .input-group {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }

                .password-group {
                    position: relative;
                }

                .password-input-container {
                    position: relative;
                }

                label {
                    color: #1e3a8a;
                    font-weight: 500;
                }

                input {
                    padding: 0.75rem;
                    border: 2px solid #e2e8f0;
                    border-radius: 6px;
                    font-size: 1rem;
                    transition: border-color 0.2s;
                    width: 100%;
                    box-sizing: border-box;
                }

                input:focus {
                    outline: none;
                    border-color: #1e3a8a;
                }

                .readonly-input {
                    background: #f3f4f6;
                    color: #6b7280;
                    cursor: not-allowed;
                }

                .toggle-password {
                    position: absolute;
                    right: 10px;
                    top: 50%;
                    transform: translateY(-50%);
                    background: none;
                    border: none;
                    color: #64748b;
                    cursor: pointer;
                    font-size: 0.9rem;
                    padding: 0;
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
                }

                .submit-btn:hover {
                    background: #1e40af;
                }

                .footer {
                    text-align: center;
                    margin-top: 2rem;
                    color: #64748b;
                    font-size: 0.9rem;
                }
            `}</style>
        </div>
    );
}
