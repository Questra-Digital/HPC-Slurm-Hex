import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import axios from 'axios';
import App from '../App';
import { clearAuthState } from '../auth/authStore';

jest.mock('axios');

jest.mock('../components/Home', () => (props) => (
  <div>
    Home Component
    <button onClick={props.onLogout}>logout</button>
  </div>
));

jest.mock('../components/Login', () => () => <div>Login Component</div>);
jest.mock('../components/AdminSetup', () => () => <div>Admin Setup Component</div>);
jest.mock('../components/RemoteNodes', () => () => <div>Remote Nodes Component</div>);
jest.mock('../components/JobsPage', () => () => <div>Jobs Page Component</div>);

describe('Idle Timeout and Cross-tab Auth Behavior', () => {
  const makeResponse = (data) => Promise.resolve({ data });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    clearAuthState('test_reset');
    jest.spyOn(console, 'error').mockImplementation(() => {});

    axios.defaults = { headers: { common: {} } };
    axios.interceptors = {
      request: { use: jest.fn(() => 1), eject: jest.fn() },
      response: { use: jest.fn(() => 1), eject: jest.fn() },
    };

    axios.get.mockImplementation((url) => {
      if (url === '/auth/check-admin') {
        return makeResponse({ adminExists: true });
      }
      if (url === '/auth/session-policy') {
        return makeResponse({
          policy: {
            accessTokenTtlSeconds: 900,
            idleTimeoutSeconds: 35,
            absoluteSessionLifetimeSeconds: 120,
            multiSessionPerUser: true,
            sessionStore: 'sqlite',
          }
        });
      }
      if (url === '/auth/me') {
        return makeResponse({ userId: 1, name: 'alice', role: 'admin', email: 'alice@example.com', sessionId: 's1' });
      }
      if (url === '/users/users/1/permissions') {
        return makeResponse({ permissions: ['dashboard'] });
      }
      throw new Error(`Unhandled GET URL: ${url}`);
    });

    axios.post.mockImplementation((url) => {
      if (url === '/auth/refresh') {
        return makeResponse({ accessToken: 'token-1', userId: 1, name: 'alice', role: 'admin' });
      }
      if (url === '/auth/logout') {
        return makeResponse({ message: 'ok' });
      }
      if (url === '/auth/logout-all') {
        return makeResponse({ message: 'ok' });
      }
      throw new Error(`Unhandled POST URL: ${url}`);
    });
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('shows warning modal before idle timeout and supports stay signed in action', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Home Component')).toBeInTheDocument();
    });

    act(() => {
      jest.advanceTimersByTime(10000);
    });

    await waitFor(() => {
      expect(screen.getByText('Session Expiring Soon')).toBeInTheDocument();
    });

    act(() => {
      screen.getByRole('button', { name: 'Stay Signed In' }).click();
    });

    await waitFor(() => {
      expect(screen.queryByText('Session Expiring Soon')).not.toBeInTheDocument();
    });
  });

  it('forces logout locally after idle timeout', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Home Component')).toBeInTheDocument();
    });

    act(() => {
      jest.advanceTimersByTime(40000);
    });

    await waitFor(() => {
      expect(screen.getByText('Login Component')).toBeInTheDocument();
    });
  });

  it('responds to storage logout-all broadcast by moving to login', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Home Component')).toBeInTheDocument();
    });

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'hpc-slurm-auth-event',
          newValue: JSON.stringify({ type: 'LOGOUT_ALL', timestamp: Date.now() }),
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Login Component')).toBeInTheDocument();
    });
  });
});
