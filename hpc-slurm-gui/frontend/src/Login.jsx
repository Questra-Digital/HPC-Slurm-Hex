import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Swal from 'sweetalert2';
import {
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography,
  IconButton,
  InputAdornment,
  CircularProgress
} from '@mui/material';
import { Visibility, VisibilityOff, Login as LoginIcon } from '@mui/icons-material';

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
      const res = await axios.post('http://localhost:5001/login', { email, password });
      
      localStorage.setItem('user', res.data.name);
      sessionStorage.setItem('user_role', 'admin');
      sessionStorage.setItem('username', 'jawad');
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
        confirmButtonColor: '#1976d2'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box
      className="flex items-center justify-center min-h-screen bg-gray-100"
      sx={{ padding: 2 }}
    >
      <Card className="w-full max-w-md mx-auto shadow-xl" sx={{ borderRadius: 2 }}>
        <CardContent sx={{ padding: 4 }}>
          <Box className="text-center mb-6">
            <Typography variant="h4" component="h1" className="font-bold mb-3">
              Welcome Back
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ marginBottom: 4 }}>
              Sign in to access your SLURM dashboard
            </Typography>
          </Box>

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Email Address"
              variant="outlined"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              sx={{ marginBottom: 3 }}
            />

            <TextField
              fullWidth
              label="Password"
              variant="outlined"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              sx={{ marginBottom: 4 }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <Button
              fullWidth
              type="submit"
              variant="contained"
              size="large"
              disabled={isLoading}
              sx={{ paddingY: 1.5 }}
              startIcon={isLoading ? <CircularProgress size={20} /> : <LoginIcon />}
            >
              {isLoading ? 'Signing In...' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Login;
