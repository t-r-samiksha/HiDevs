import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Without this, Turbopack walks up and finds the empty package-lock.json
    // at the repo root (Helm/package-lock.json, 0 packages) and uses that
    // parent dir as the module-resolution root — nothing resolves, blank page.
    root: path.resolve(__dirname),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "26mb",
    },
  },
};

export default nextConfig;
