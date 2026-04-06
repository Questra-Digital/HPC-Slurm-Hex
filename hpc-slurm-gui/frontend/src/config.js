const readEnv = (name, fallback = "") => {
	if (name === "VITE_BACKEND_API_BASE_URL" && typeof window !== "undefined" && window.__APP_API_BASE_URL__) {
		return window.__APP_API_BASE_URL__;
	}

	const env = globalThis?.process?.env;
	if (env && env[name]) {
		return env[name];
	}

	return fallback;
};

export const API_BASE_URL = readEnv("VITE_BACKEND_API_BASE_URL", "/api");
export const MASTER_PORT = readEnv("VITE_MASTER_PORT", "");
