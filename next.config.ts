import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: [
    "pg",
    "pg-pool",
    "pg-types",
    "pg-protocol",
    "pg-connection-string",
    "pgpass",
    "pg-cloudflare",
    "pg-native",
    "drizzle-orm",
    "drizzle-kit",
    "chokidar",
    "googleapis",
    "google-auth-library",
  ],
};

export default nextConfig;
