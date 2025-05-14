import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Dashboard from '../components/Dashboard';
import axios from 'axios';
import '@testing-library/jest-dom';


jest.mock('axios');

describe('Dashboard Component', () => {
  const mockSetActiveMenuItem = jest.fn();

  const mockJobs = [
    {
      jobId: 1,
      jobName: 'render',
      userName: 'admin',
      state: 'Running',
      start: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      end: null,
    },
    {
      jobId: 2,
      jobName: 'cleanup',
      userName: 'admin',
      state: 'Completed',
      start: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      end: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    },
    {
      jobId: 3,
      jobName: 'data',
      userName: 'admin',
      state: 'Failed',
      start: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      end: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString(),
    },
  ];

  const mockNodes = [
    { node_type: 'master', ip_address: '127.0.0.1' },
    { node_type: 'worker', ip_address: '127.0.0.2' },
  ];

  beforeEach(() => {
    sessionStorage.setItem('username', 'admin');
    sessionStorage.setItem('user_role', 'admin');

    axios.get.mockImplementation((url) => {
      if (url.includes('/nodes/get-nodes-list')) {
        return Promise.resolve({ data: mockNodes });
      }
      if (url.includes('127.0.0.1:5050/jobs')) {
        return Promise.resolve({ data: { jobs: mockJobs } });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders job summary stats correctly', async () => {
    render(<Dashboard setActiveMenuItem={mockSetActiveMenuItem} />);
    
    await waitFor(() => {
      expect(screen.getByText('Total Jobs')).toBeInTheDocument();
    });

    expect(screen.getByText('3')).toBeInTheDocument(); // Total jobs
    expect(screen.getByText('1')).toBeInTheDocument(); // Running
    expect(screen.getByText('1')).toBeInTheDocument(); // Completed
    expect(screen.getAllByText('1')[2]).toBeInTheDocument(); // Failed
  });

  it('displays recent jobs in table', async () => {
    render(<Dashboard setActiveMenuItem={mockSetActiveMenuItem} />);

    await waitFor(() => {
      expect(screen.getByText(/render/i)).toBeInTheDocument();
    });

    mockJobs.forEach((job) => {
      expect(screen.getByText(job.jobId)).toBeInTheDocument();
      expect(screen.getByText(job.userName)).toBeInTheDocument();
      expect(screen.getByText(job.state)).toBeInTheDocument();
    });
  });

  it('shows admin-specific action buttons', async () => {
    render(<Dashboard setActiveMenuItem={mockSetActiveMenuItem} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Manage Users/i })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Manage Jobs/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Manage Profile/i })).toBeInTheDocument();
  });

  it('hides "Manage Users" for non-admins', async () => {
    sessionStorage.setItem('user_role', 'user');
    render(<Dashboard setActiveMenuItem={mockSetActiveMenuItem} />);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Manage Users/i })).not.toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Manage Jobs/i })).toBeInTheDocument();
  });

  it('calls setActiveMenuItem on action button click', async () => {
    render(<Dashboard setActiveMenuItem={mockSetActiveMenuItem} />);
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Manage Jobs/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Manage Jobs/i }));
    expect(mockSetActiveMenuItem).toHaveBeenCalledWith('jobs');
  });

  it('handles fetch errors gracefully', async () => {
    axios.get.mockRejectedValueOnce(new Error('Network Error'));
    render(<Dashboard setActiveMenuItem={mockSetActiveMenuItem} />);

    await waitFor(() => {
      // It won't crash, just silently logs error.
      expect(screen.getByText('Total Jobs')).toBeInTheDocument();
    });
  });
});
