import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ConvertAudit AI™ — Instant Website Conversion & Mobile UX Audit',
    short_name: 'ConvertAudit AI',
    description: 'Find out why your website is failing to convert mobile visitors into leads with AI-powered UX, clarity, and speed audits.',
    start_url: '/',
    display: 'standalone',
    background_color: '#070b14',
    theme_color: '#4f46e5',
    icons: [
      {
        src: '/icon',
        sizes: 'any',
        type: 'image/png',
      },
    ],
  };
}
