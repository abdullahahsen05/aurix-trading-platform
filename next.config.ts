import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // metaapi.cloud-sdk is a heavy, Node-only SDK. Marking it external keeps Next
  // from bundling its browser-ESM entry point (which references `window`) into
  // server route handlers — server code uses require() → dist/index.js instead.
  // It must only ever be imported from server-only modules (broker services).
  serverExternalPackages: ["metaapi.cloud-sdk"],
};

export default nextConfig;
