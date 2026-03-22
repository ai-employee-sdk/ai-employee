import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../../"),
  serverExternalPackages: ["@slack/bolt", "@slack/web-api", "express"],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@ai-employee-sdk/core": path.resolve(__dirname, "../../packages/core/src/index.ts"),
      "@ai-employee-sdk/store-file": path.resolve(__dirname, "../../packages/store-file/src/file-store.ts"),
      "@ai-employee-sdk/store-kv": path.resolve(__dirname, "../../packages/store-kv/src/kv-store.ts"),
    };
    return config;
  },
};

export default nextConfig;
