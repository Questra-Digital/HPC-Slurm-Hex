import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import axios from 'axios';
import App from '../App';
import { clearAuthState } from '../auth/authStore';

jest.mock('axios');

jest.mock('../components/Home', () => (props) => (
  <div>
    Home Component
    <span data-testid="home-user">{props?.authUser?.username || 'unknown'}</span>
  </div>
));

jest.mock('../components/Login', () => () => <div>Login Component</div>);
jest.mock('../components/AdminSetup', () => () => <div>Admin Setup Component</div>);
jest.mock('../components/RemoteNodes', () => () => <div>Remote Nodes Component</div>);
jest.mock('../components/JobsPage', () => () => <div>Jobs Page Component</div>);

describe('Auth Lifecycle Bootstrap', () => {
  const makeResponse = (data) => Promise.resolve({ data });

  beforeEach(() => {
    jest.clearAllMocks();
    clearAuthState('test_reset');
    jest.spyOn(console, 'error').mockImplementation(() => {});

    axios.defaults = { headers: { common: {} } };
    axios.interceptors = {
      request: { use: jest.fn(() => 1), eject: jest.fn() },
      response: { use: jest.fn(() => 1), eject: jest.fn() },
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls /refresh with credentials during startup when no access token exists', async () => {
    axios.get.mockImplementation((url) => {
      if (url === '/auth/check-admin') {
        return makeResponse({ adminExists: true });
      }
      if (url === '/auth/session-policy') {
        return makeResponse({
          policy: {
            accessTokenTtlSeconds: 900,
            idleTimeoutSeconds: 1800,
            absoluteSessionLifetimeSeconds: 43200,
            multiSessionPerUser: true,
            sessionStore: 'sqlite',
          }
        });
      }
      if (url === '/auth/me') {
        return makeResponse({ userId: 7, name: 'alice', role: 'user', email: 'alice@example.com', sessionId: 's1' });
      }
      if (url === '/users/users/7/permissions') {
        return makeResponse({ permissions: ['dashboard'] });
      }
      throw new Error(`Unhandled GET URL: ${url}`);
    });

    axios.post.mockImplementation((url) => {
      if (url === '/auth/refresh') {
        return makeResponse({ accessToken: 'refreshed-token', userId: 7, name: 'alice', role: 'user' });
      }
      throw new Error(`Unhandled POST URL: ${url}`);
    });

    render(<App />);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        '/auth/refresh',
        {},
        expect.objectContaining({
          authRequired: false,
          skipAuthRefresh: true,
          retrySafe: false,
        })
      );

      expect(screen.getByText('Home Component')).toBeInTheDocument();
      expect(screen.getByTestId('home-user')).toHaveTextContent('alice');
    });
  });

  it('redirects to login when refresh fails with 401', async () => {
    axios.get.mockImplementation((url) => {
      if (url === '/auth/check-admin') {
        return makeResponse({ adminExists: true });
      }
      if (url === '/auth/session-policy') {
        return makeResponse({
          policy: {
            accessTokenTtlSeconds: 900,
            idleTimeoutSeconds: 1800,
            absoluteSessionLifetimeSeconds: 43200,
            multiSessionPerUser: true,
            sessionStore: 'sqlite',
          }
        });
      }
      throw new Error(`Unhandled GET URL: ${url}`);
    });

    axios.post.mockRejectedValueOnce({ response: { status: 401 } });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Login Component')).toBeInTheDocument();
    });
  });

  it('stays in retryable bootstrap state on network failure', async () => {
    axios.get.mockImplementation((url) => {
      if (url === '/auth/check-admin') {
        return makeResponse({ adminExists: true });
      }
      if (url === '/auth/session-policy') {
        return makeResponse({
          policy: {
            accessTokenTtlSeconds: 900,
            idleTimeoutSeconds: 1800,
            absoluteSessionLifetimeSeconds: 43200,
            multiSessionPerUser: true,
            sessionStore: 'sqlite',
          }
        });
      }
      throw new Error(`Unhandled GET URL: ${url}`);
    });

    axios.post.mockRejectedValueOnce(new Error('Network Error'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Connection Required')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });
  });
});
