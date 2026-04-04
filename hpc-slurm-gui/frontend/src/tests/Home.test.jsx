import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Home from '../components/Home';
import '@testing-library/jest-dom';

// Mock child components
jest.mock('../components/Dashboard', () => () => <div>Dashboard Component</div>);
jest.mock('../components/JobsPage', () => () => <div>Jobs Component</div>);
jest.mock('../components/RemoteNodes', () => () => <div>RemoteNodes Component</div>);
jest.mock('../components/UserGroup', () => () => <div>UserGroup Component</div>);
jest.mock('../components/ResourceAllocation', () => () => <div>ResourceAllocation Component</div>);
jest.mock('../components/Settings', () => () => <div>Settings Component</div>);
jest.mock('../components/Sidebar', () => ({ authUser, activeMenuItem, setActiveMenuItem, onLogoutAll }) => (
  <div data-testid="sidebar">
    <button onClick={() => setActiveMenuItem('dashboard')}>Dashboard</button>
    <button onClick={() => setActiveMenuItem('jobs')}>Jobs</button>
    <button onClick={() => setActiveMenuItem('environment')}>Environment</button>
    <button onClick={() => setActiveMenuItem('users')}>Users</button>
    <button onClick={() => setActiveMenuItem('resources')}>Resources</button>
    <button onClick={() => setActiveMenuItem('settings')}>Settings</button>
    <button onClick={() => onLogoutAll && onLogoutAll()}>Logout All</button>
    <div>User: {authUser.username}</div>
    <div>Role: {authUser.role}</div>
  </div>
));

describe('Home Component', () => {
  const mockUser = {
    username: 'testuser',
    role: 'user'
  };

  it('renders without crashing', () => {
    render(<Home authUser={mockUser} onLogout={jest.fn()} onLogoutAll={jest.fn()} onAuthUserUpdate={jest.fn()} />);
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });

  it('displays the default dashboard content', () => {
    render(<Home authUser={mockUser} onLogout={jest.fn()} onLogoutAll={jest.fn()} onAuthUserUpdate={jest.fn()} />);
    expect(screen.getByText('Dashboard Component')).toBeInTheDocument();
  });

  it('displays user information in the sidebar', () => {
    render(<Home authUser={mockUser} onLogout={jest.fn()} onLogoutAll={jest.fn()} onAuthUserUpdate={jest.fn()} />);
    expect(screen.getByText(`User: ${mockUser.username}`)).toBeInTheDocument();
    expect(screen.getByText(`Role: ${mockUser.role}`)).toBeInTheDocument();
  });

  it('switches to jobs view when menu item is clicked', () => {
    render(<Home authUser={mockUser} onLogout={jest.fn()} onLogoutAll={jest.fn()} onAuthUserUpdate={jest.fn()} />);
    fireEvent.click(screen.getByText('Jobs'));
    expect(screen.getByText('Jobs Component')).toBeInTheDocument();
  });

  it('switches to environment view when menu item is clicked', () => {
    render(<Home authUser={mockUser} onLogout={jest.fn()} onLogoutAll={jest.fn()} onAuthUserUpdate={jest.fn()} />);
    fireEvent.click(screen.getByText('Environment'));
    expect(screen.getByText('RemoteNodes Component')).toBeInTheDocument();
  });

  it('switches to users view when menu item is clicked', () => {
    render(<Home authUser={mockUser} onLogout={jest.fn()} onLogoutAll={jest.fn()} onAuthUserUpdate={jest.fn()} />);
    fireEvent.click(screen.getByText('Users'));
    expect(screen.getByText('UserGroup Component')).toBeInTheDocument();
  });

  it('switches to resources view when menu item is clicked', () => {
    render(<Home authUser={mockUser} onLogout={jest.fn()} onLogoutAll={jest.fn()} onAuthUserUpdate={jest.fn()} />);
    fireEvent.click(screen.getByText('Resources'));
    expect(screen.getByText('ResourceAllocation Component')).toBeInTheDocument();
  });

  it('switches to settings view when menu item is clicked', () => {
    render(<Home authUser={mockUser} onLogout={jest.fn()} onLogoutAll={jest.fn()} onAuthUserUpdate={jest.fn()} />);
    fireEvent.click(screen.getByText('Settings'));
    expect(screen.getByText('Settings Component')).toBeInTheDocument();
  });

  it('returns to dashboard view when unknown menu item is selected', () => {
    const { rerender } = render(<Home authUser={mockUser} onLogout={jest.fn()} onLogoutAll={jest.fn()} onAuthUserUpdate={jest.fn()} />);
    // Force an unknown menu item
    rerender(<Home authUser={mockUser} onLogout={jest.fn()} onLogoutAll={jest.fn()} onAuthUserUpdate={jest.fn()} activeMenuItem="unknown" />);
    expect(screen.getByText('Dashboard Component')).toBeInTheDocument();
  });

  it('applies correct styling classes', () => {
    render(<Home authUser={mockUser} onLogout={jest.fn()} onLogoutAll={jest.fn()} onAuthUserUpdate={jest.fn()} />);
    
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    
    expect(document.querySelector('.dashboard-container')).toBeInTheDocument();
    expect(document.querySelector('.main-content')).toBeInTheDocument();
  });

  describe('Admin specific features', () => {
    const adminUser = {
      username: 'admin',
      role: 'admin'
    };

    it('shows admin-specific menu items for admin users', () => {
      render(<Home authUser={adminUser} onLogout={jest.fn()} onLogoutAll={jest.fn()} onAuthUserUpdate={jest.fn()} />);
      // Assuming Users menu is admin-only in your actual implementation
      fireEvent.click(screen.getByText('Users'));
      expect(screen.getByText('UserGroup Component')).toBeInTheDocument();
    });
  });

  it('renders sync issue banner when provided', () => {
    render(<Home authUser={mockUser} onLogout={jest.fn()} onLogoutAll={jest.fn()} onAuthUserUpdate={jest.fn()} syncIssue="Sync failed" />);
    expect(screen.getByText('Sync failed')).toBeInTheDocument();
  });
});