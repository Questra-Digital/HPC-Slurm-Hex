import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import JobsPage from '../components/JobsPage';
import '@testing-library/jest-dom';
import Swal from 'sweetalert2';

// Mock axios and sweetalert2
jest.mock('axios');
jest.mock('sweetalert2');

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

describe('JobsPage Component', () => {
  const mockUser = {
    username: 'testuser',
    role: 'user'
  };

  beforeEach(() => {
    // Clear all mocks and set up sessionStorage
    jest.clearAllMocks();
    window.sessionStorage.clear();
    
    window.sessionStorage.getItem.mockImplementation((key) => {
      if (key === 'username') return 'testuser';
      if (key === 'user_role') return 'user';
      if (key === 'id') return '123';
      if (key === 'email') return 'test@example.com';
      return null;
    });

    // Mock axios responses
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

  it('displays the job submission form', async () => {
    render(<JobsPage user={mockUser} />);
    await waitFor(() => {
      expect(screen.getByLabelText('Job Name')).toBeInTheDocument();
      expect(screen.getByLabelText('GitHub URL')).toBeInTheDocument();
      expect(screen.getByLabelText('Select Node')).toBeInTheDocument();
    });
  });

  it('loads and displays jobs list', async () => {
    render(<JobsPage user={mockUser} />);
    await waitFor(() => {
      expect(screen.getByText('Test Job')).toBeInTheDocument();
      expect(screen.getByText('Completed Job')).toBeInTheDocument();
    });
  });

  it('switches between job status tabs', async () => {
    render(<JobsPage user={mockUser} />);
    await waitFor(() => {
      fireEvent.click(screen.getByText('COMPLETED'));
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

  it('submits a job with GitHub source', async () => {
    render(<JobsPage user={mockUser} />);
    
    await waitFor(() => {
      fireEvent.change(screen.getByLabelText('Job Name'), { target: { value: 'New Job' } });
      fireEvent.change(screen.getByLabelText('GitHub Link'), { target: { value: 'https://github.com/test/repo' } });
      fireEvent.change(screen.getByLabelText('Select Node'), { target: { value: '2' } });
      fireEvent.change(screen.getByLabelText('CPU Cores (Max: 16)'), { target: { value: '4' } });
      fireEvent.change(screen.getByLabelText('Memory (GB, Max: 64)'), { target: { value: '8' } });
      
      fireEvent.click(screen.getByText('Submit Job'));
    });

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalled();
    });
  });

  it('submits a job with file upload', async () => {
    // Mock file upload
    const file = new File(['content'], 'test.py', { type: 'text/plain' });
    
    render(<JobsPage user={mockUser} />);
    
    await waitFor(() => {
      // Switch to file upload
      fireEvent.click(screen.getByLabelText('Upload File'));
      
      // Set job details
      fireEvent.change(screen.getByLabelText('Job Name'), { target: { value: 'File Job' } });
      fireEvent.change(screen.getByLabelText('Select Node'), { target: { value: '2' } });
      fireEvent.change(screen.getByLabelText('CPU Cores (Max: 16)'), { target: { value: '2' } });
      fireEvent.change(screen.getByLabelText('Memory (GB, Max: 64)'), { target: { value: '4' } });
      
      // Mock file input change
      const fileInput = screen.getByLabelText('Upload Files');
      fireEvent.change(fileInput, { target: { files: [file] } });
      
      fireEvent.click(screen.getByText('Submit Job'));
    });

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalled();
    });
  });

  it('cancels a running job', async () => {
    Swal.fire.mockResolvedValue({ isConfirmed: true });
    
    render(<JobsPage user={mockUser} />);
    
    await waitFor(() => {
      fireEvent.click(screen.getAllByText('Cancel')[0]);
    });

    await waitFor(() => {
      expect(Swal.fire).toHaveBeenCalled();
      expect(axios.post).toHaveBeenCalled();
    });
  });

  it('downloads completed job results', async () => {
    delete window.location;
    window.location = { href: '' };
    
    render(<JobsPage user={mockUser} />);
    
    await waitFor(() => {
      fireEvent.click(screen.getByText('COMPLETED'));
      fireEvent.click(screen.getByText('Download'));
      expect(window.location.href).toBe('http://example.com/download');
    });
  });

  it('shows resource limits for groups when selected', async () => {
    render(<JobsPage user={mockUser} />);
    
    await waitFor(() => {
      fireEvent.change(screen.getByLabelText('Resource Context'), { target: { value: 'group' } });
      fireEvent.change(screen.getByLabelText('Select Group'), { target: { value: '1' } });
      
      expect(screen.getByLabelText('CPU Cores (Max: 16)')).toBeInTheDocument();
    });
  });

  it('handles API errors gracefully', async () => {
    axios.get.mockRejectedValueOnce(new Error('Network Error'));
    
    render(<JobsPage user={mockUser} />);
    
    await waitFor(() => {
      expect(Swal.fire).toHaveBeenCalledWith({
        icon: 'error',
        title: 'Error',
        text: 'Network Error',
        confirmButtonColor: '#1e3a8a',
        confirmButtonText: 'OK'
      });
    });
  });
});