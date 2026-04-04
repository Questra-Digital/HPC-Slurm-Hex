import axios from 'axios';
import apiClient, { configureApiClientAuth } from '../api/client';

describe('API Client Refresh Interceptor', () => {
  const interceptorStore = {
    requestOnFulfilled: null,
    responseOnFulfilled: null,
    responseOnRejected: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    axios.defaults = { headers: { common: {} } };

    axios.interceptors = {
      request: {
        use: jest.fn((onFulfilled) => {
          interceptorStore.requestOnFulfilled = onFulfilled;
          return 1;
        }),
        eject: jest.fn(),
      },
      response: {
        use: jest.fn((onFulfilled, onRejected) => {
          interceptorStore.responseOnFulfilled = onFulfilled;
          interceptorStore.responseOnRejected = onRejected;
          return 2;
        }),
        eject: jest.fn(),
      },
    };

    axios.request = jest.fn();
  });

  it('adds Authorization header from in-memory token on protected requests', async () => {
    configureApiClientAuth({
      getAccessToken: () => 'token-1',
      refreshAccessToken: async () => 'token-1',
      onRefreshFailed: jest.fn(),
      onAuthActivity: jest.fn(),
    });

    const config = interceptorStore.requestOnFulfilled({ method: 'get', url: '/users/users' });
    expect(config.headers.Authorization).toBe('Bearer token-1');
  });

  it('retries idempotent request once after a single refresh', async () => {
    const refreshMock = jest.fn(async () => 'new-token');

    configureApiClientAuth({
      getAccessToken: () => 'old-token',
      refreshAccessToken: refreshMock,
      onRefreshFailed: jest.fn(),
      onAuthActivity: jest.fn(),
    });

    const replayResult = { data: { ok: true } };
    axios.request.mockResolvedValueOnce(replayResult);

    const failedRequest = {
      method: 'get',
      url: '/users/users',
      headers: {},
    };

    const result = await interceptorStore.responseOnRejected({
      config: failedRequest,
      response: { status: 401 },
    });

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(axios.request).toHaveBeenCalledWith(expect.objectContaining({
      __isRetriedRequest: true,
      headers: expect.objectContaining({ Authorization: 'Bearer new-token' }),
    }));
    expect(result).toEqual(replayResult);
  });

  it('does not retry non-idempotent request unless explicitly retry-safe', async () => {
    const refreshMock = jest.fn(async () => 'new-token');

    configureApiClientAuth({
      getAccessToken: () => 'old-token',
      refreshAccessToken: refreshMock,
      onRefreshFailed: jest.fn(),
      onAuthActivity: jest.fn(),
    });

    await expect(
      interceptorStore.responseOnRejected({
        config: { method: 'post', url: '/jobs/submit-job', headers: {} },
        response: { status: 401 },
      })
    ).rejects.toBeDefined();

    expect(refreshMock).not.toHaveBeenCalled();
    expect(axios.request).not.toHaveBeenCalled();
  });

  it('shares one refresh for concurrent 401 requests', async () => {
    let resolveRefresh;
    const refreshPromise = new Promise((resolve) => {
      resolveRefresh = resolve;
    });

    const refreshMock = jest.fn(() => refreshPromise);

    configureApiClientAuth({
      getAccessToken: () => 'old-token',
      refreshAccessToken: refreshMock,
      onRefreshFailed: jest.fn(),
      onAuthActivity: jest.fn(),
    });

    axios.request.mockResolvedValue({ data: { ok: true } });

    const errorOne = {
      config: { method: 'get', url: '/users/users', headers: {} },
      response: { status: 401 },
    };

    const errorTwo = {
      config: { method: 'get', url: '/users/groups', headers: {} },
      response: { status: 401 },
    };

    const p1 = interceptorStore.responseOnRejected(errorOne);
    const p2 = interceptorStore.responseOnRejected(errorTwo);

    resolveRefresh('shared-token');

    await Promise.all([p1, p2]);

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(axios.request).toHaveBeenCalledTimes(2);
  });

  it('invokes refresh failure callback when refresh fails', async () => {
    const onRefreshFailed = jest.fn();

    configureApiClientAuth({
      getAccessToken: () => 'old-token',
      refreshAccessToken: async () => {
        throw new Error('refresh failed');
      },
      onRefreshFailed,
      onAuthActivity: jest.fn(),
    });

    await expect(
      interceptorStore.responseOnRejected({
        config: { method: 'get', url: '/users/users', headers: {} },
        response: { status: 401 },
      })
    ).rejects.toBeDefined();

    expect(onRefreshFailed).toHaveBeenCalledTimes(1);
  });
});
