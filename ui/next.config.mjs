/** @type {import('next').NextConfig} */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const nextConfig = {
  reactStrictMode: true,
  // Two lockfiles in the workspace (the monorepo + the UI). Pin the trace
  // root so Next.js stops inferring the wrong one.
  outputFileTracingRoot: projectRoot,
};

export default nextConfig;
