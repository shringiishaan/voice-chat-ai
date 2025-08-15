/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  // If deploying under /voice path, uncomment basePath and assetPrefix
  // basePath: '/voice',
  // assetPrefix: '/voice/',
  images: {
    unoptimized: true
  }
};

module.exports = nextConfig;
