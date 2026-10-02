/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@convertaudit/contracts',
    '@convertaudit/domain',
    '@convertaudit/evidence',
    '@convertaudit/policy',
    '@convertaudit/ssrf',
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'artifacts.convertaudit-cdn.com',
      },
    ],
  },
};

export default nextConfig;
