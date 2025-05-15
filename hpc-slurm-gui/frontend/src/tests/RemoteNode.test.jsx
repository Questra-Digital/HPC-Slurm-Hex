import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import RemoteNodes from '../components/RemoteNodes';
import '@testing-library/jest-dom';

// Mock axios
jest.mock('axios');

describe('RemoteNodes Component', () => {
  const mockNodes = [
    {
      node_type: 'master',
      name: 'master-node',
      ip_address: '192.168.1.1',
      status: 'Connected'
    },
    {
      node_type: 'worker',
      name: 'worker-1',
      ip_address: '192.168.1.2',
      status: 'Connected'
    }
  ];

  beforeEach(() => {
    // Clear all mocks and reset the mock implementation
    jest.clearAllMocks();
    axios.get.mockReset();
    axios.post.mockReset();
  });

  it('renders correctly', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    
    render(<RemoteNodes />);
    
    expect(screen.getByText('Nodes Management')).toBeInTheDocument();
    expect(screen.getByText('Configure and manage cluster nodes')).toBeInTheDocument();
  });

 

  

  it('updates worker count and creates empty worker inputs', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    render(<RemoteNodes />);
    
    const countInput = screen.getByLabelText('Number of Worker Nodes');
    fireEvent.change(countInput, { target: { value: '3' } });
    
    expect(countInput.value).toBe('3');
    expect(screen.getAllByText(/Worker Node \d/)).toHaveLength(3);
  });

  it('handles master node input changes', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    render(<RemoteNodes />);
    
    const nameInput = screen.getByLabelText('Node Name', { selector: '#master-name' });
    const ipInput = screen.getByLabelText('IP Address', { selector: '#master-ip' });
    
    fireEvent.change(nameInput, { target: { value: 'new-master' } });
    fireEvent.change(ipInput, { target: { value: '10.0.0.1' } });
    
    expect(nameInput.value).toBe('new-master');
    expect(ipInput.value).toBe('10.0.0.1');
  });

  it('handles worker node input changes', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    render(<RemoteNodes />);
    
    // First set worker count to 1
    const countInput = screen.getByLabelText('Number of Worker Nodes');
    fireEvent.change(countInput, { target: { value: '1' } });
    
    // Use more specific selectors for worker inputs
    const nameInput = screen.getByLabelText('Node Name', { selector: '#worker-0-name' });
    const ipInput = screen.getByLabelText('IP Address', { selector: '#worker-0-ip' });
    
    fireEvent.change(nameInput, { target: { value: 'worker-1' } });
    fireEvent.change(ipInput, { target: { value: '10.0.0.2' } });
    
    expect(nameInput.value).toBe('worker-1');
    expect(ipInput.value).toBe('10.0.0.2');
  });


  
});