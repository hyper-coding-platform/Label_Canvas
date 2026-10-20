import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This example lives inside the SDK repository; pin the workspace root to the example itself.
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
  // No transpilePackages entry is needed: the SDK ships standard ESM with "use client" boundaries.
};
export default nextConfig;
