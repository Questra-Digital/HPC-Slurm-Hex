const BASE_AUTH_STATE = Object.freeze({
  status: "anonymous",
  reason: "",
  accessToken: null,
  user: null,
  permissions: [],
  session: null,
});

let authState = { ...BASE_AUTH_STATE };
const listeners = new Set();

const notify = () => {
  listeners.forEach((listener) => {
    try {
      listener(authState);
    } catch (error) {
      console.error("Auth store listener failed:", error);
    }
  });
};

export const getAuthState = () => authState;

export const subscribeAuthState = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const setAuthState = (nextStateOrUpdater) => {
  const nextState =
    typeof nextStateOrUpdater === "function"
      ? nextStateOrUpdater(authState)
      : nextStateOrUpdater;

  authState = {
    ...authState,
    ...nextState,
  };

  notify();
  return authState;
};

export const hydrateAuthState = ({ accessToken, user, permissions, session }) => {
  authState = {
    ...BASE_AUTH_STATE,
    status: "authenticated",
    accessToken,
    user,
    permissions: permissions || [],
    session: session || null,
  };

  notify();
  return authState;
};

export const clearAuthState = (reason = "signed_out") => {
  authState = {
    ...BASE_AUTH_STATE,
    status: "anonymous",
    reason,
  };

  notify();
  return authState;
};

export const getInitialAuthState = () => ({ ...BASE_AUTH_STATE });
