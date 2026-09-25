import { io } from "socket.io-client";
import { getBackendUrl } from "./config";

export function initSocket() {
    const url = getBackendUrl();
    return io(url, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: 15,
        reconnectionDelay: 1500,
        timeout: 10000
    });
}
