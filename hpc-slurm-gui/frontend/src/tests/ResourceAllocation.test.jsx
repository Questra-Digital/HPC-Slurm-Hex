import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ResourceAllocation from '../components/ResourceAllocation';

describe('ResourceAllocation Component', () => {
  const mockNodes = [
    { 
      id: 1, 
      node_type: 'worker', 
      name: 'Worker Node 1', 
      cpu_count: 4, 
      gpu_count: 1, 
      total_memory_gb: 16, 
      status: 'active', 
      ip_address: '192.168.1.1' 
    },
    { 
      id: 2, 
      node_type: 'worker', 
      name: 'Worker Node 2', 
      cpu_count: 8, 
      gpu_count: 2, 
      total_memory_gb: 32, 
      status: 'active', 
      ip_address: '192.168.1.2' 
    }
  ];

  const mockUsers = [
    { id: 1, username: 'admin' },
    { id: 2, username: 'user1' }
  ];

  const mockGroups = [
    { id: 1, name: 'admins' },
    { id: 2, name: 'developers' }
  ];

  const mockResourceLimits = {
    max_cpu: 2,
    max_gpu: 1,
    max_memory: 8
  };

  beforeEach(() => {
    global.fetch = jest.fn((url) => {
      if (url.includes('get-nodes-list')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockNodes),
        });
      }
      if (url.includes('users')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockUsers),
        });
      }
      if (url.includes('groups')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockGroups),
        });
      }
      if (url.includes('resource-limits')) {
        if (url.includes('?')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockResourceLimits),
          });
        } else {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
          });
        }
      }
      return Promise.reject(new Error('Unknown URL'));
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // 1. Initial Rendering Tests
  it('renders without crashing', () => {
    render(<ResourceAllocation />);
  });

  it('displays the correct title and subtitle', () => {
    render(<ResourceAllocation />);
    expect(screen.getByText('Resource Allocation Configuration')).toBeInTheDocument();
    expect(screen.getByText('Manage and allocate cluster resources')).toBeInTheDocument();
  });

  // 2. Cluster Overview Tests
  it('displays correct cluster totals after loading', async () => {
    render(<ResourceAllocation />);
    
    await waitFor(() => {
      // Use getAllByText since there are multiple elements with "0" initially
      const workerNodes = screen.getAllByText('2');
      expect(workerNodes.length).toBeGreaterThan(0);
      
      expect(screen.getByText('12')).toBeInTheDocument(); // Total CPU
      expect(screen.getByText('3')).toBeInTheDocument();  // Total GPU
      expect(screen.getByText('48.00')).toBeInTheDocument(); // Total Memory
    });
  });

  it('handles empty node list', async () => {
    global.fetch = jest.fn((url) => 
      url.includes('get-nodes-list') 
        ? Promise.resolve({
            ok: true,
            json: () => Promise.resolve([]),
          })
        : Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockUsers),
          })
    );
    
    render(<ResourceAllocation />);
    
    await waitFor(() => {
      // Use getAllByText since there are multiple elements with "0"
      const zeros = screen.getAllByText('0');
      expect(zeros.length).toBeGreaterThan(0);
    });
  });

  // 3. Node Display Tests
  it('lists all worker nodes with correct details', async () => {
    render(<ResourceAllocation />);
    
    await waitFor(() => {
      expect(screen.getByText('Worker Node 1')).toBeInTheDocument();
      expect(screen.getByText('Worker Node 2')).toBeInTheDocument();
      
      // Check for status text differently since it's broken across elements
      const statusElements = screen.getAllByText(/active/);
      expect(statusElements.length).toBe(2);
      
      expect(screen.getByText('4 cores')).toBeInTheDocument();
      expect(screen.getByText('1 units')).toBeInTheDocument();
      expect(screen.getByText('16.00 GB')).toBeInTheDocument();
    });
  });

  // 4. Resource Allocation Form Tests
  it('defaults to user allocation type', async () => {
    render(<ResourceAllocation />);
    
    await waitFor(() => {
      const userRadio = screen.getByLabelText('User', { selector: 'input' });
      expect(userRadio).toBeChecked();
    });
  });

  it('switches between user and group allocation', async () => {
    render(<ResourceAllocation />);
    
    await waitFor(() => {
      const groupRadio = screen.getByLabelText('Group', { selector: 'input' });
      fireEvent.click(groupRadio);
      
      // Look for the label text in the select element
      expect(screen.getByText('-- Select Group --')).toBeInTheDocument();
    });
  });

  it('populates user dropdown correctly', async () => {
    render(<ResourceAllocation />);
    
    await waitFor(() => {
      expect(screen.getByText('-- Select User --')).toBeInTheDocument();
      expect(screen.getByText('admin')).toBeInTheDocument();
      expect(screen.getByText('user1')).toBeInTheDocument();
    });
  });
  });
