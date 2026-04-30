/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Webhook routes must run on Node runtime to access raw body for signature verification.
  // Per-route runtime is set via `export const runtime = 'nodejs'` in route files.
};

module.exports = nextConfig;
