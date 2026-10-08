import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SIC | Sistema Inteligente de Cobranza — Cofersa',
    short_name: 'SIC Cofersa',
    description: 'Sistema Inteligente de Cobranza — Cofersa',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#003B5C',
    theme_color: '#003B5C',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
