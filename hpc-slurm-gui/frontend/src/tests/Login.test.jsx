import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import { MemoryRouter } from 'react-router-dom';
import Login from '../components/Login';
import '@testing-library/jest-dom';
import Swal from 'sweetalert2';

// Mock the dependencies
jest.mock('axios');
jest.mock('sweetalert2', () => ({
  fire: jest.fn(() => Promise.resolve({ isConfirmed: true }))
}));

// Mock the navigate function
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('Login Component', () => {
  const mockSetUser = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear sessionStorage
    window.sessionStorage.clear();
  });

  it('renders the login form correctly', () => {
    render(
      <MemoryRouter>
        <Login setUser={mockSetUser} />
      </MemoryRouter>
    );

    expect(screen.getByText('Welcome Back')).toBeInTheDocument();
    expect(screen.getByText('Sign in to access your SLURM dashboard')).toBeInTheDocument();
    expect(screen.getByLabelText('Email Address')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  });

  it('allows entering email and password', () => {
    render(
      <MemoryRouter>
        <Login setUser={mockSetUser} />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText('Email Address');
    const passwordInput = screen.getByLabelText('Password');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });

    expect(emailInput.value).toBe('test@example.com');
    expect(passwordInput.value).toBe('password123');
  });

  it('toggles password visibility', () => {
    render(
      <MemoryRouter>
        <Login setUser={mockSetUser} />
      </MemoryRouter>
    );

    const passwordInput = screen.getByLabelText('Password');
    const toggleButton = screen.getByText('Show');

    // Password should be hidden by default
    expect(passwordInput.type).toBe('password');

    // Click to show password
    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe('text');
    expect(screen.getByText('Hide')).toBeInTheDocument();

    // Click to hide password again
    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe('password');
    expect(screen.getByText('Show')).toBeInTheDocument();
  });

  it('handles successful login', async () => {
    // Mock successful API response
    axios.post.mockResolvedValueOnce({
      data: {
        userId: '123',
        role: 'user',
        name: 'Test User'
      }
    });
    
    // Mock permissions API response
    axios.get.mockResolvedValueOnce({
      data: {
        permissions: ['view_jobs', 'submit_jobs']
      }
    });

    render(
      <MemoryRouter>
        <Login setUser={mockSetUser} />
      </MemoryRouter>
    );

    // Fill out and submit form
    fireEvent.change(screen.getByLabelText('Email Address'), { 
      target: { value: 'test@example.com' } 
    });
    fireEvent.change(screen.getByLabelText('Password'), { 
      target: { value: 'password123' } 
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    // Wait for async operations
    await waitFor(() => {
      // Verify API calls
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/auth/login'),
        {
          email: 'test@example.com',
          password: 'password123'
        }
      );
      
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/users/users/123/permissions')
      );

      // Verify session storage
      expect(window.sessionStorage.getItem('id')).toBe('123');
      expect(window.sessionStorage.getItem('user_role')).toBe('user');
      expect(window.sessionStorage.getItem('username')).toBe('Test User');
      expect(window.sessionStorage.getItem('email')).toBe('test@example.com');
      expect(window.sessionStorage.getItem('permissions')).toBe(
        JSON.stringify(['view_jobs', 'submit_jobs'])
      );

      // Verify user state update
      expect(mockSetUser).toHaveBeenCalledWith('Test User');

      // Verify success notification
      expect(Swal.fire).toHaveBeenCalledWith({
        icon: 'success',
        title: 'Welcome back!',
        text: 'Successfully logged in as Test User',
        showConfirmButton: false,
        timer: 1500
      });

      // Verify navigation
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('handles login failure', async () => {
    // Mock failed API response
    axios.post.mockRejectedValueOnce({
      response: {
        data: {
          message: 'Invalid credentials'
        }
      }
    });

    render(
      <MemoryRouter>
        <Login setUser={mockSetUser} />
      </MemoryRouter>
    );

    // Fill out and submit form
    fireEvent.change(screen.getByLabelText('Email Address'), { 
      target: { value: 'test@example.com' } 
    });
    fireEvent.change(screen.getByLabelText('Password'), { 
      target: { value: 'wrongpassword' } 
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    // Wait for async operations
    await waitFor(() => {
      expect(Swal.fire).toHaveBeenCalledWith({
        icon: 'error',
        title: 'Login Failed',
        text: 'Invalid credentials',
      });
    });
  });

  it('shows loading state during form submission', async () => {
    // Mock slow API response
    axios.post.mockImplementationOnce(() => 
      new Promise(resolve => setTimeout(() => resolve({
        data: {
          userId: '123',
          role: 'user',
          name: 'Test User'
        }
      }), 1000))
    );

    render(
      <MemoryRouter>
        <Login setUser={mockSetUser} />
      </MemoryRouter>
    );

    // Fill out and submit form
    fireEvent.change(screen.getByLabelText('Email Address'), { 
      target: { value: 'test@example.com' } 
    });
    fireEvent.change(screen.getByLabelText('Password'), { 
      target: { value: 'password123' } 
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    // Verify loading state
    expect(screen.getByRole('button', { name: 'Signing In...' })).toBeDisabled();

    // Wait for submission to complete
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    });
  });

  it('handles network errors', async () => {
    // Mock network error
    axios.post.mockRejectedValueOnce(new Error('Network Error'));

    render(
      <MemoryRouter>
        <Login setUser={mockSetUser} />
      </MemoryRouter>
    );

    // Fill out and submit form
    fireEvent.change(screen.getByLabelText('Email Address'), { 
      target: { value: 'test@example.com' } 
    });
    fireEvent.change(screen.getByLabelText('Password'), { 
      target: { value: 'password123' } 
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    // Wait for async operations
    await waitFor(() => {
      expect(Swal.fire).toHaveBeenCalledWith({
        icon: 'error',
        title: 'Login Failed',
        text: 'Something went wrong. Please try again.',
      });
    });
  });
});