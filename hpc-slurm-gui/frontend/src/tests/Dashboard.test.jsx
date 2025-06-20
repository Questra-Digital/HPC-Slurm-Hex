import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import Dashboard from '../components/Dashboard';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import '@testing-library/jest-dom';

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  LayoutDashboard: () => <svg data-testid="icon-layout-dashboard" />,
  Clock: () => <svg data-testid="icon-clock" />,
  Users: () => <svg data-testid="icon-users" />,
  BarChart3: () => <svg data-testid="icon-barchart" />,
  Globe: () => <svg data-testid="icon-globe" />,
  Settings: () => <svg data-testid="icon-settings" />,
  LogOut: () => <svg data-testid="icon-logout" />,
  HardDrive: () => <svg data-testid="icon-harddrive" />,
  __esModule: true
}));

// Mock axios
jest.mock('axios');

// Mock sessionStorage
const mockSessionStorage = (() => {
  let store = {};
  return {
    getItem: jest.fn((key) => store[key] || null),
    setItem: jest.fn((key, value) => {
      store[key] = value.toString();
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    removeItem: jest.fn((key) => {
      delete store[key];
    }),
  };
})();

Object.defineProperty(window, 'sessionStorage', {
  value: mockSessionStorage,
});

describe('Dashboard Component', () => {
  const mockSetActiveMenuItem = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
    window.sessionStorage.clear();
  });

  it('renders without crashing', () => {
    render(<Dashboard setActiveMenuItem={mockSetActiveMenuItem} />);
    expect(screen.getByText('Total Jobs')).toBeInTheDocument();
  });

  it('displays the correct username from sessionStorage', () => {
    window.sessionStorage.getItem.mockImplementation((key) => {
      if (key === 'username') return 'testuser';
      return null;
    });
    
    render(<Dashboard setActiveMenuItem={mockSetActiveMenuItem} />);
    expect(screen.getByText('Total Jobs')).toBeInTheDocument();
  });

  it('fetches master node IP on mount', async () => {
    axios.get.mockResolvedValueOnce({ 
      data: [{ node_type: 'master', ip_address: '192.168.1.1' }] 
    });
    render(<Dashboard setActiveMenuItem={mockSetActiveMenuItem} />);
    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledWith(`${API_BASE_URL}/nodes/get-nodes-list`);
    });
  });

  it('filters jobs based on user role', async () => {
    window.sessionStorage.getItem.mockImplementation((key) => {
      if (key === 'username') return 'testuser';
      if (key === 'user_role') return 'user';
      return null;
    });
    
    axios.get.mockImplementation((url) => {
      if (url.includes('get-nodes-list')) {
        return Promise.resolve({ data: [{ node_type: 'master', ip_address: '192.168.1.1' }] });
      }
      return Promise.resolve({
        data: {
          jobs: [
            { jobId: 'job1', jobName: 'testjob', userName: 'testuser', state: 'RUNNING', start: new Date().toISOString() },
            { jobId: 'job2', jobName: 'otherjob', userName: 'otheruser', state: 'RUNNING', start: new Date().toISOString() }
          ]
        }
      });
    });
    
    render(<Dashboard setActiveMenuItem={mockSetActiveMenuItem} />);
    
    await waitFor(() => {
      expect(screen.getByText('job1')).toBeInTheDocument();
      expect(screen.queryByText('job2')).not.toBeInTheDocument();
    });
  });

  it('shows all jobs for admin users', async () => {
    window.sessionStorage.getItem.mockImplementation((key) => {
      if (key === 'username') return 'adminuser';
      if (key === 'user_role') return 'admin';
      return null;
    });
    
    axios.get.mockImplementation((url) => {
      if (url.includes('get-nodes-list')) {
        return Promise.resolve({ data: [{ node_type: 'master', ip_address: '192.168.1.1' }] });
      }
      return Promise.resolve({
        data: {
          jobs: [
            { jobId: 'job1', userName: 'testuser', state: 'RUNNING', start: new Date().toISOString() },
            { jobId: 'job2', userName: 'otheruser', state: 'RUNNING', start: new Date().toISOString() }
          ]
        }
      });
    });
    
    render(<Dashboard setActiveMenuItem={mockSetActiveMenuItem} />);
    
    await waitFor(() => {
      expect(screen.getByText('job1')).toBeInTheDocument();
      expect(screen.getByText('job2')).toBeInTheDocument();
    });
  });

  it('calculates and displays correct job statistics', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('get-nodes-list')) {
        return Promise.resolve({ data: [{ node_type: 'master', ip_address: '192.168.1.1' }] });
      }
      return Promise.resolve({
        data: {
          jobs: [
            { jobId: 'job1', state: 'RUNNING', userName: 'testuser', start: new Date().toISOString() },
            { jobId: 'job2', state: 'COMPLETED', userName: 'testuser', start: new Date().toISOString(), end: new Date().toISOString() },
            { jobId: 'job3', state: 'FAILED', userName: 'testuser', start: new Date().toISOString(), end: new Date().toISOString() },
            { jobId: 'job4', state: 'CANCELLED', userName: 'testuser', start: new Date().toISOString(), end: new Date().toISOString() },
          ]
        }
      });
    });
    
    render(<Dashboard setActiveMenuItem={mockSetActiveMenuItem} />);
    
    await waitFor(() => {
      expect(screen.getByText('Total Jobs').nextSibling).toHaveTextContent('4');
      expect(screen.getByText('Running Jobs').nextSibling).toHaveTextContent('1');
      expect(screen.getByText('Completed Jobs').nextSibling).toHaveTextContent('1');
      expect(screen.getByText('Failed Jobs').nextSibling).toHaveTextContent('1');
      expect(screen.getByText('Cancelled/Other').nextSibling).toHaveTextContent('1');
    });
  });

  it('displays correct status badges', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('get-nodes-list')) {
        return Promise.resolve({ data: [{ node_type: 'master', ip_address: '192.168.1.1' }] });
      }
      return Promise.resolve({
        data: {
          jobs: [
            { jobId: 'job1', state: 'RUNNING', userName: 'testuser', start: new Date().toISOString() },
            { jobId: 'job2', state: 'COMPLETED', userName: 'testuser', start: new Date().toISOString(), end: new Date().toISOString() },
            { jobId: 'job3', state: 'FAILED', userName: 'testuser', start: new Date().toISOString(), end: new Date().toISOString() },
          ]
        }
      });
    });
    
    render(<Dashboard setActiveMenuItem={mockSetActiveMenuItem} />);
    
    await waitFor(() => {
      expect(screen.getByText('RUNNING').closest('span')).toHaveClass('running');
      expect(screen.getByText('COMPLETED').closest('span')).toHaveClass('completed');
      expect(screen.getByText('FAILED').closest('span')).toHaveClass('error');
    });
  });

  it('handles API errors gracefully', async () => {
    axios.get.mockRejectedValueOnce(new Error('Network Error'));
    
    render(<Dashboard setActiveMenuItem={mockSetActiveMenuItem} />);
    
    await waitFor(() => {
      expect(screen.getByText('Total Jobs').nextSibling).toHaveTextContent('0');
      expect(screen.getByText('Running Jobs').nextSibling).toHaveTextContent('0');
    });
  });



  it('calls setActiveMenuItem when quick action buttons are clicked', async () => {
    render(<Dashboard setActiveMenuItem={mockSetActiveMenuItem} />);
    
    const manageJobsButton = screen.getByText('Manage Jobs');
    act(() => {
      manageJobsButton.click();
    });
    
    expect(mockSetActiveMenuItem).toHaveBeenCalledWith('jobs');
    
    const manageProfileButton = screen.getByText('Manage Profile');
    act(() => {
      manageProfileButton.click();
    });
    
    expect(mockSetActiveMenuItem).toHaveBeenCalledWith('settings');
  });

  it('formats runtime and time ago correctly', async () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600000).toISOString();
    const twoHoursAgo = new Date(now.getTime() - 7200000).toISOString();
    const endTime = new Date(now.getTime() + 3661000).toISOString(); // 1 hour, 1 minute, 1 second later
    
    axios.get.mockImplementation((url) => {
      if (url.includes('get-nodes-list')) {
        return Promise.resolve({ data: [{ node_type: 'master', ip_address: '192.168.1.1' }] });
      }
      return Promise.resolve({
        data: {
          jobs: [
            { 
              jobId: 'job1', 
              state: 'COMPLETED', 
              userName: 'testuser', 
              start: oneHourAgo,
              end: endTime
            },
            { 
              jobId: 'job2', 
              state: 'RUNNING', 
              userName: 'testuser', 
              start: twoHoursAgo,
              end: null
            }
          ]
        }
      });
    });
    
    render(<Dashboard setActiveMenuItem={mockSetActiveMenuItem} />);
    
    await waitFor(() => {
      expect(screen.getByText(/hour ago/)).toBeInTheDocument();
      expect(screen.getByText(/hours ago/)).toBeInTheDocument();
      expect(screen.getByText(/\d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
    });
  });
});