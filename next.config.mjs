/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["pg"],
  // Pin the workspace root to this app (there are sibling lockfiles in the parent dir).
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
