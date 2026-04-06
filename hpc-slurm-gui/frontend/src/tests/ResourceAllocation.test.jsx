import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import axios from 'axios';
import ResourceAllocation from '../components/ResourceAllocation';

jest.mock('axios');

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
    jest.clearAllMocks();

    axios.get.mockImplementation((url) => {
      if (url.includes('/resources/metrics')) {
        return Promise.resolve({ data: [] });
      }

      if (url.includes('/nodes/get-nodes-list')) {
        return Promise.resolve({ data: mockNodes });
      }

      if (url.includes('/users/users')) {
        return Promise.resolve({ data: mockUsers });
      }

      if (url.includes('/users/groups')) {
        return Promise.resolve({ data: mockGroups });
      }

      if (url.includes('/nodes/slurm-nodes')) {
        return Promise.resolve({ data: { nodes: [] } });
      }

      if (url.includes('/resources/resource-limits')) {
        return Promise.resolve({ data: mockResourceLimits });
      }

      return Promise.reject(new Error(`Unhandled axios.get URL: ${url}`));
    });

    axios.post.mockResolvedValue({ data: { ok: true } });
  });

  it('renders without crashing', () => {
    render(<ResourceAllocation />);
    expect(screen.getByText('Resource Allocation Configuration')).toBeInTheDocument();
  });

  it('displays correct cluster totals after loading', async () => {
    render(<ResourceAllocation />);

    await waitFor(() => {
      expect(screen.getByText('12')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('48.00')).toBeInTheDocument();
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

  it('switches between user and group allocation', async () => {
    render(<ResourceAllocation />);

    await waitFor(() => {
      const groupRadio = screen.getByLabelText('Group', { selector: 'input' });
      fireEvent.click(groupRadio);
      expect(screen.getByText('-- Select Group --')).toBeInTheDocument();
    });
  });

  it('saves allocation for selected entity', async () => {
    render(<ResourceAllocation />);

    await waitFor(() => {
      expect(screen.getByText('-- Select User --')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });

    const saveButton = screen.getByRole('button', { name: 'Save Allocation' });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        '/resources/resource-limits',
        expect.objectContaining({ user_id: 1 })
      );
    });
  });
});
