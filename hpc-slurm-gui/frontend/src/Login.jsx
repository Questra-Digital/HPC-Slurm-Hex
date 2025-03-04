import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Swal from 'sweetalert2';


const Login = ({ setUser }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await axios.post('http://localhost:5001/auth//login', { email, password });

      sessionStorage.setItem('id', res.data.userId);
      sessionStorage.setItem('user_role', res.data.role);
      sessionStorage.setItem('username', res.data.name);
      setUser(res.data.name);

      Swal.fire({
        icon: 'success',
        title: 'Welcome back!',
        text: `Successfully logged in as ${res.data.name}`,
        showConfirmButton: false,
        timer: 1500
      });

      navigate('/');
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Login Failed',
        text: error.response?.data?.message || 'Something went wrong. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="header">
          <h1>Welcome Back</h1>
          <p className="subtitle">Sign in to access your SLURM dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="setup-form">
          <div className="input-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>

          <div className="input-group password-group">
            <label htmlFor="password">Password</label>
            <div className="password-input-container">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
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

          <button type="submit" className="submit-btn" disabled={isLoading}>
            {isLoading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div className="footer">
          <p>© 2025 HPC-Slurm-HEX. All rights reserved.</p>
        </div>
      </div>

      <style>{`
        
        .login-container {
  height: 100vh;
  width: 100vw;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  display: flex;
  justify-content: center;
  align-items: center;
}

.login-card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  padding: 2rem; /* Consistent padding around the card */
  width: 100%;
  max-width: 480px;
  margin: 0 auto; /* Center the card horizontally */
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

.setup-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 0 1rem; /* Add padding inside the form to match the card's padding */
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
  width: 100%; /* Full width within the input-group */
  box-sizing: border-box; /* Ensure padding doesn’t exceed width */
}

input:focus {
  outline: none;
  border-color: #1e3a8a;
}

input:disabled {
  background: #f3f4f6;
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
  width: 100%; /* Full width button to match inputs */
}

.submit-btn:hover:not(:disabled) {
  background: #1e40af;
}

.submit-btn:disabled {
  background: #94a3b8;
  cursor: not-allowed;
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
};

export default Login;