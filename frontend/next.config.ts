import type { NextConfig } from 'next';

// Cabeceras de seguridad (hosting propio en ECS Fargate; antes las ponía Vercel).
// connect-src: API Gateway, Cognito (Hosted UI + tokens) y S3 (URLs prefirmadas).
const SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://*.googleusercontent.com https://*.amazonaws.com",
      // tesseract.js (OCR de comprobantes) baja worker/core/idioma de jsDelivr y tessdata
      "connect-src 'self' https://*.amazonaws.com https://*.amazoncognito.com https://cdn.jsdelivr.net https://tessdata.projectnaptha.com",
      "worker-src 'self' blob: https://cdn.jsdelivr.net",
      "frame-ancestors 'none'",
      "form-action 'self' https://*.amazoncognito.com https://accounts.google.com",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  // Imagen de contenedor mínima para ECS Fargate (frontend/Dockerfile).
  output: 'standalone',
  // frontend/ vive dentro de otro repo con package-lock propio: fijar la raíz del workspace.
  turbopack: { root: __dirname },
  outputFileTracingRoot: __dirname,
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      {
        // Fuentes TTF y logo: inmutables — se versionan con el deploy
        source: '/fonts/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/logo-cofersa.png',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
