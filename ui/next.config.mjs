/** @type {import('next').NextConfig} */
const path = await import('node:path');
const projectRoot = path.resolve(process.cwd(), '..');

const nextConfig = {
  reactStrictMode: true,
  // Two lockfiles in the workspace (the agent + the UI). Tell Next where the
  // project root really is so it doesn't infer the wrong one.
  outputFileTracingRoot: projectRoot,
  env: {
    CEPID_DATA_DIR: process.env.CEPID_DATA_DIR ?? path.join(projectRoot, 'data'),
  },
};

export default nextConfig;
