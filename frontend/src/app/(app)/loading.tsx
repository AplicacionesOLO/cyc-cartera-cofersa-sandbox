import PageSkeleton from '@/components/ui/page-skeleton';

// Se muestra al instante en cada navegación dentro de la app, mientras el
// Server Component de la pantalla carga sus datos. Mejora la velocidad percibida.
export default function Loading() {
  return <PageSkeleton kpis={4} />;
}
