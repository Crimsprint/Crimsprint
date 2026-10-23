import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  redirects: async () => [
    { source: "/leagues", destination: "/leaderboards", permanent: true },
    { source: "/account", destination: "/profile", permanent: true }, // the guest "save progress" page is gone
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
