// Realtime (Socket.io) client scaffold — NOT yet wired anywhere in the app.
// Typed loosely and loaded dynamically so it stays build-safe regardless of the
// transitively-installed socket.io-client version (the MetaAPI SDK pulls its own).
/* eslint-disable @typescript-eslint/no-explicit-any */

let socket: any = null;

export async function getRealtimeClient(): Promise<any> {
  if (!socket) {
    const mod: any = await import("socket.io-client");
    socket = mod.io(process.env.NEXT_PUBLIC_REALTIME_URL ?? "/", {
      autoConnect: false,
      transports: ["websocket"],
    });
  }

  return socket;
}
