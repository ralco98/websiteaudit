import type { Metadata, Viewport } from 'next';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://convertaudit.ai';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'ConvertAudit AI™ — Instant Website Conversion & Mobile UX Audit',
    template: '%s | ConvertAudit AI™',
  },
  description:
    'Find out why your website is failing to convert mobile visitors into leads. Plain-English diagnosis, Core Web Vitals, 5-second clarity tests, and prioritized developer briefs in under 90 seconds. A product by Web Axis Solutions (webaxissolutions.com).',
  applicationName: 'ConvertAudit AI',
  authors: [{ name: 'Web Axis Solutions', url: 'https://webaxissolutions.com' }],
  creator: 'Web Axis Solutions',
  publisher: 'Web Axis Solutions',
  keywords: [
    'website audit',
    'conversion rate optimization',
    'mobile ux audit',
    'core web vitals',
    'website speed test',
    'bounce rate reduction',
    'clarity test',
    'seo audit',
    'landing page analyzer',
    'cro tool',
    'convert audit',
  ],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: 'ConvertAudit AI',
    title: 'ConvertAudit AI™ — Instant Website Conversion & Mobile UX Audit',
    description:
      'Find out why your website is failing to convert mobile visitors into leads. Plain-English diagnosis, Core Web Vitals, and prioritized developer briefs in under 90 seconds.',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'ConvertAudit AI — Instant Website Conversion & Mobile UX Audit',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ConvertAudit AI™ — Instant Website Conversion & Mobile UX Audit',
    description:
      'Find out why your website is failing to convert mobile visitors into leads with AI-powered UX, clarity, and speed diagnosis.',
    creator: '@webaxissolutions',
    images: ['/opengraph-image'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#070b14',
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://webaxissolutions.com/#organization',
      name: 'Web Axis Solutions',
      url: 'https://webaxissolutions.com',
      logo: `${siteUrl}/icon`,
    },
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      url: siteUrl,
      name: 'ConvertAudit AI',
      publisher: {
        '@id': 'https://webaxissolutions.com/#organization',
      },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${siteUrl}/#application`,
      name: 'ConvertAudit AI',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'All',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      description:
        'Instant website conversion, mobile UX, clarity, and speed auditing platform for modern digital businesses.',
    },
  ],
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-screen bg-[#070b14] text-slate-100 font-sans antialiased selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
