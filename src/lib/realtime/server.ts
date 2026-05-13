import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import type { RealtimeEventName } from "./events";

export type RealtimeServer = Server;

export function createRealtimeServer(httpServer: HttpServer) {
  return new Server(httpServer, {
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    },
  });
}

export function emitRealtimeEvent<TPayload>(
  server: RealtimeServer,
  eventName: RealtimeEventName,
  payload: TPayload,
) {
  server.emit(eventName, payload);
}
