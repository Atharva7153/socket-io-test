/**
 * Central Configuration for Backend URL & Cloudflare Tunneling
 * 
 * Vite automatically loads environment variables with prefix `VITE_` from `.env`.
 * If VITE_BACKEND_URL is set, it will be used as the default backend URL.
 * Otherwise, it falls back to http://localhost:3000.
 */

const ENV_BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "http://localhost:3000").replace(/\/+$/, "");

// Check if user set a temporary manual override in localStorage
const STORED_OVERRIDE_KEY = "socket_bidding_backend_url_override";

export function getBackendUrl() {
    const override = localStorage.getItem(STORED_OVERRIDE_KEY);
    if (override && override.trim().length > 0) {
        return override.trim().replace(/\/+$/, "");
    }
    return ENV_BACKEND_URL;
}

export function setBackendUrlOverride(url) {
    if (!url || url.trim() === "" || url.trim() === ENV_BACKEND_URL) {
        localStorage.removeItem(STORED_OVERRIDE_KEY);
    } else {
        localStorage.setItem(STORED_OVERRIDE_KEY, url.trim().replace(/\/+$/, ""));
    }
}

export function getDefaultBackendUrl() {
    return ENV_BACKEND_URL;
}

export const BACKEND_URL = getBackendUrl();
