import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ConvertAudit AI™ — Instant Website Conversion & Mobile UX Audit',
  description: 'Find out why your website is failing to convert mobile visitors into leads. Plain-English diagnosis, Core Web Vitals, and prioritized developer briefs in under 90 seconds. A product by Web Axis Solutions (webaxissolutions.com).',
  authors: [{ name: 'Web Axis Solutions', url: 'https://webaxissolutions.com' }],
  creator: 'Web Axis Solutions',
  publisher: 'Web Axis Solutions',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[#070b14] text-slate-100 font-sans antialiased selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
