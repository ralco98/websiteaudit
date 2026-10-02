import { ImageResponse } from 'next/og';

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
          justifyContent: 'space-between',
          backgroundColor: '#070b14',
          fontFamily: 'sans-serif',
          color: 'white',
          padding: '60px 80px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(99, 102, 241, 0.15)',
            border: '1px solid #4f46e5',
            borderRadius: '9999px',
            padding: '10px 28px',
            fontSize: '20px',
            fontWeight: 700,
            color: '#a5b4fc',
          }}
        >
          ⚡ AI-POWERED CONVERSION & SPEED AUDIT
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: '68px',
              fontWeight: 900,
              letterSpacing: '-0.02em',
              color: '#ffffff',
              marginBottom: '16px',
            }}
          >
            ConvertAudit AI™
          </div>
          <div
            style={{
              fontSize: '28px',
              color: '#94a3b8',
              maxWidth: '960px',
              lineHeight: 1.4,
              textAlign: 'center',
            }}
          >
            Find out why your website is failing to convert visitors into customers in under 90 seconds.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '20px',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '12px',
              padding: '14px 24px',
              fontSize: '20px',
              color: '#38bdf8',
              fontWeight: 700,
            }}
          >
            Core Web Vitals
          </div>
          <div
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '12px',
              padding: '14px 24px',
              fontSize: '20px',
              color: '#c084fc',
              fontWeight: 700,
            }}
          >
            5-Second Clarity Test
          </div>
          <div
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '12px',
              padding: '14px 24px',
              fontSize: '20px',
              color: '#34d399',
              fontWeight: 700,
            }}
          >
            Conversion Leak Heuristics
          </div>
        </div>

        <div
          style={{
            fontSize: '18px',
            color: '#64748b',
            display: 'flex',
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
