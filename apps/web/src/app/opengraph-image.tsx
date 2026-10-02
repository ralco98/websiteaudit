import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'ConvertAudit AI — Instant Website Conversion & Mobile UX Audit';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#070b14',
          backgroundImage: 'radial-gradient(circle at 50% 20%, rgba(99, 102, 241, 0.25) 0%, transparent 60%)',
          fontFamily: 'sans-serif',
          color: 'white',
          padding: '40px 60px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: '20px',
            background: 'rgba(99, 102, 241, 0.15)',
            border: '1px solid rgba(99, 102, 241, 0.4)',
            borderRadius: '9999px',
            padding: '8px 24px',
            fontSize: '18px',
            fontWeight: 600,
            color: '#a5b4fc',
          }}
        >
          ⚡ AI-POWERED CONVERSION & SPEED AUDITS
        </div>

        <div
          style={{
            fontSize: '64px',
            fontWeight: 900,
            letterSpacing: '-0.03em',
            textAlign: 'center',
            background: 'linear-gradient(180deg, #ffffff 0%, #cbd5e1 100%)',
            backgroundClip: 'text',
            color: 'transparent',
            marginBottom: '20px',
            lineHeight: 1.1,
          }}
        >
          ConvertAudit AI™
        </div>

        <div
          style={{
            fontSize: '28px',
            color: '#94a3b8',
            textAlign: 'center',
            maxWidth: '900px',
            marginBottom: '40px',
            lineHeight: 1.4,
          }}
        >
          Diagnose why your site fails to convert mobile visitors into paying customers in under 90 seconds.
        </div>

        <div
          style={{
            display: 'flex',
            gap: '16px',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              background: 'rgba(30, 41, 59, 0.8)',
              border: '1px solid rgba(51, 65, 85, 0.8)',
              borderRadius: '12px',
              padding: '12px 20px',
              fontSize: '18px',
              color: '#38bdf8',
              fontWeight: 600,
            }}
          >
            Core Web Vitals
          </div>
          <div
            style={{
              background: 'rgba(30, 41, 59, 0.8)',
              border: '1px solid rgba(51, 65, 85, 0.8)',
              borderRadius: '12px',
              padding: '12px 20px',
              fontSize: '18px',
              color: '#a855f7',
              fontWeight: 600,
            }}
          >
            5-Second Clarity Test
          </div>
          <div
            style={{
              background: 'rgba(30, 41, 59, 0.8)',
              border: '1px solid rgba(51, 65, 85, 0.8)',
              borderRadius: '12px',
              padding: '12px 20px',
              fontSize: '18px',
              color: '#34d399',
              fontWeight: 600,
            }}
          >
            Conversion Leak Heuristics
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: '30px',
            fontSize: '16px',
            color: '#64748b',
          }}
        >
          A product by Web Axis Solutions (webaxissolutions.com)
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
