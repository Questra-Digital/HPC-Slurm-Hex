import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import JobsPage from '../components/JobsPage';
import '@testing-library/jest-dom';
import Swal from 'sweetalert2';

// Mock axios
jest.mock('axios');
jest.mock('sweetalert2', () => ({
  fire: jest.fn(() => ({
    then: (callback) => callback({ isConfirmed: true })
  }))
}));

describe('JobsPage Component', () => {
  const mockUser = {
    username: 'testuser',
    role: 'user'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mocks
    axios.get.mockImplementation((url) => {
      if (url.includes('get-nodes-list')) {
        return Promise.resolve({
          data: [
            { id: 1, node_type: 'master', ip_address: '192.168.1.1' },
            { id: 2, node_type: 'worker', status: 'active' }
          ]
        });
      }
      if (url.includes('get-master-node-ip')) {
        return Promise.resolve({ 
          data: { ip_address: '192.168.1.1' }
        });
      }
      if (url.includes('jobs')) {
        return Promise.resolve({
          data: {
            jobs: [
              { jobId: '1', jobName: 'Test Job', state: 'RUNNING' },
              { jobId: '2', jobName: 'Completed Job', state: 'COMPLETED', download_link: 'http://example.com/download' }
            ]
          }
        });
      }
      if (url.includes('resource-limits')) {
        return Promise.resolve({
          data: {
            max_cpu: 16,
            max_gpu: 4,
            max_memory: 64
          }
        });
      }
      return Promise.reject(new Error('Not mocked URL'));
    });

    axios.post.mockResolvedValue({ data: {} });
  });
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

// Mock window.location
const mockWindowLocation = {
  href: '',
  assign: jest.fn(),
};

beforeAll(() => {
  Object.defineProperty(window, 'sessionStorage', {
    value: mockSessionStorage,
  });
  
  Object.defineProperty(window, 'location', {
    value: mockWindowLocation,
    writable: true,
  });
});

describe('JobsPage Component', () => {
  const mockUser = {
    username: 'testuser',
    role: 'user'
  };

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    window.sessionStorage.clear();
    window.location.href = '';
    
    // Set up sessionStorage mocks
    window.sessionStorage.getItem.mockImplementation((key) => {
      if (key === 'username') return 'testuser';
      if (key === 'user_role') return 'user';
      if (key === 'id') return '123';
      if (key === 'email') return 'test@example.com';
      return null;
    });

    // Default axios mocks
    axios.get.mockImplementation((url) => {
      if (url.includes('get-nodes-list')) {
        return Promise.resolve({
          data: [
            { id: 1, node_type: 'master', ip_address: '192.168.1.1' },
            { id: 2, node_type: 'worker', status: 'active', name: 'Worker 1', cpu_count: 8, gpu_count: 2, total_memory_gb: 32 }
          ]
        });
      }
      if (url.includes('jobs')) {
        return Promise.resolve({
          data: {
            jobs: [
              { jobId: '1', jobName: 'Test Job', userName: 'testuser', state: 'RUNNING', start: '2023-01-01', cpu_request: 2, gpu_request: 0, memory_request: 4 },
              { jobId: '2', jobName: 'Completed Job', userName: 'testuser', state: 'COMPLETED', start: '2023-01-01', end: '2023-01-02', download_link: 'http://example.com/download', cpu_request: 4, gpu_request: 1, memory_request: 8 }
            ]
          }
        });
      }
      if (url.includes('resource-limits')) {
        return Promise.resolve({
          data: {
            max_cpu: 16,
            max_gpu: 4,
            max_memory: 64
          }
        });
      }
      if (url.includes('users/groups')) {
        return Promise.resolve({
          data: [
            { id: 1, name: 'Group 1' },
            { id: 2, name: 'Group 2' }
          ]
        });
      }
      return Promise.reject(new Error('Not mocked URL'));
    });

    axios.post.mockImplementation((url) => {
      if (url.includes('submit-job')) {
        return Promise.resolve({ data: { success: true } });
      }
      if (url.includes('cancel-job')) {
        return Promise.resolve({ data: { message: 'Job cancelled' } });
      }
      if (url.includes('upload-ftp')) {
        return Promise.resolve({ data: { download_url: 'http://example.com/download' } });
      }
      return Promise.reject(new Error('Not mocked URL'));
    });
  });

  it('renders without crashing', async () => {
    render(<JobsPage user={mockUser} />);
    await waitFor(() => {
      expect(screen.getByText('Jobs Management')).toBeInTheDocument();
    });
  });
 
  it('switches between job status tabs', async () => {
    render(<JobsPage user={mockUser} />);
    await waitFor(() => {
      // Use getAllByText and select the tab (first element)
      const completedTabs = screen.getAllByText('COMPLETED');
      fireEvent.click(completedTabs[0]);
      expect(screen.getByText('Completed Job')).toBeInTheDocument();
    });
  });

  it('validates form before submission', async () => {
    render(<JobsPage user={mockUser} />);
    await waitFor(() => {
      fireEvent.click(screen.getByText('Submit Job'));
      expect(Swal.fire).toHaveBeenCalledWith({
        icon: 'warning',
        title: 'Incomplete Form',
        text: 'Please fill out all required fields.',
        confirmButtonColor: '#1e3a8a',
        confirmButtonText: 'OK'
      });
    });
  });

  
});
});