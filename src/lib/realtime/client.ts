import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getRealtimeClient() {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_REALTIME_URL ?? "/", {
      autoConnect: false,
      transports: ["websocket"],
    });
  }

  return socket;
}
