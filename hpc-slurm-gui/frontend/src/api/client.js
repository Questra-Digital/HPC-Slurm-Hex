import axios from "axios";

const resolveApiBaseUrl = () => {
  if (typeof window !== "undefined" && window.__APP_API_BASE_URL__) {
    return window.__APP_API_BASE_URL__;
  }

  if (typeof process !== "undefined" && process.env?.VITE_BACKEND_API_BASE_URL) {
    return process.env.VITE_BACKEND_API_BASE_URL;
  }

  return "/api";
};

const apiClient = axios;

if (!apiClient.defaults) {
  apiClient.defaults = { headers: { common: {} } };
}
if (!apiClient.defaults.headers) {
  apiClient.defaults.headers = { common: {} };
}
if (!apiClient.defaults.headers.common) {
  apiClient.defaults.headers.common = {};
}

apiClient.defaults.baseURL = resolveApiBaseUrl();
apiClient.defaults.withCredentials = true;

const ensureInterceptors = () => {
  if (apiClient.interceptors) {
    return;
  }

  const noopUse = () => 0;
  const noopEject = () => {};

  apiClient.interceptors = {
    request: { use: noopUse, eject: noopEject },
    response: { use: noopUse, eject: noopEject },
  };
};

ensureInterceptors();

let requestInterceptorId = null;
let responseInterceptorId = null;

let accessTokenProvider = () => null;
let refreshAccessTokenHandler = async () => {
  throw new Error("Refresh handler is not configured.");
};
let refreshFailureHandler = () => {};
let authActivityHandler = () => {};

let refreshPromise = null;

const isIdempotentMethod = (method) => {
  const normalized = (method || "get").toLowerCase();
  return normalized === "get" || normalized === "head" || normalized === "options";
};

const canRetryRequest = (config) => {
  if (!config) {
    return false;
  }

  if (config.retrySafe === true) {
    return true;
  }

  return isIdempotentMethod(config.method);
};

const shouldSkipRefresh = (config) => {
  if (!config) {
    return true;
  }

  if (config.skipAuthRefresh === true) {
    return true;
  }

  if (typeof config.url === "string" && config.url.includes("/auth/refresh")) {
    return true;
  }

  return false;
};

export const configureApiClientAuth = ({
  getAccessToken,
  refreshAccessToken,
  onRefreshFailed,
  onAuthActivity,
}) => {
  accessTokenProvider = getAccessToken || (() => null);
  refreshAccessTokenHandler = refreshAccessToken || refreshAccessTokenHandler;
  refreshFailureHandler = onRefreshFailed || (() => {});
  authActivityHandler = onAuthActivity || (() => {});

  if (requestInterceptorId !== null) {
    apiClient.interceptors.request.eject(requestInterceptorId);
  }

  if (responseInterceptorId !== null) {
    apiClient.interceptors.response.eject(responseInterceptorId);
  }

  requestInterceptorId = apiClient.interceptors.request.use((config) => {
    const nextConfig = { ...config };

    if (nextConfig.authRequired === false) {
      return nextConfig;
    }

    const token = accessTokenProvider();
    if (!token) {
      return nextConfig;
    }

    nextConfig.headers = {
      ...(nextConfig.headers || {}),
      Authorization: `Bearer ${token}`,
    };

    return nextConfig;
  });

  responseInterceptorId = apiClient.interceptors.response.use(
    (response) => {
      const authHeader = response?.config?.headers?.Authorization;
      if (authHeader) {
        authActivityHandler();
      }
      return response;
    },
    async (error) => {
      const originalRequest = error?.config;
      const status = error?.response?.status;

      if (!originalRequest || status !== 401) {
        throw error;
      }

      if (originalRequest.authRequired === false) {
        throw error;
      }

      if (originalRequest.__isRetriedRequest) {
        throw error;
      }

      if (shouldSkipRefresh(originalRequest)) {
        throw error;
      }

      if (!canRetryRequest(originalRequest)) {
        throw error;
      }

      originalRequest.__isRetriedRequest = true;

      if (!refreshPromise) {
        refreshPromise = Promise.resolve(refreshAccessTokenHandler())
          .catch((refreshError) => {
            refreshFailureHandler(refreshError);
            throw refreshError;
          })
          .finally(() => {
            refreshPromise = null;
          });
      }

      try {
        const updatedAccessToken = await refreshPromise;

        originalRequest.headers = {
          ...(originalRequest.headers || {}),
          Authorization: updatedAccessToken ? `Bearer ${updatedAccessToken}` : originalRequest.headers?.Authorization,
        };

        return apiClient.request(originalRequest);
      } catch (refreshError) {
        throw refreshError;
      }
    }
  );
};

export default apiClient;
