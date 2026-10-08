import { redirect, notFound } from 'next/navigation';
import PagareImprimible from './PagareImprimible';
import type { Metadata } from 'next';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';
import { getServerHttp } from '@/shared/api/server-http';
import { createAuditoriaLegalApi } from '@/views/auditoria-legal/api/auditoria-legal-api';
import type { PagareImprimibleResponse } from '@/views/auditoria-legal/types';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

async function cargarPagare(garantiaId: number): Promise<PagareImprimibleResponse | null> {
  try {
    return await createAuditoriaLegalApi(await getServerHttp()).pagareImprimible(garantiaId);
  } catch {
    return null;
  }
}

// Título de pestaña/página específico del pagaré -- si el analista deja
// activo "Encabezados y pies de página" del navegador al imprimir/exportar a
// PDF (no se puede suprimir por código, ver PagareImprimible.tsx), al menos
// sale algo útil en vez del título genérico del sistema. El backend ya protege el
// dato: una sesión sin acceso simplemente no recibe cliente_nombre acá.
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const garantiaId = Number(id);
  if (!Number.isInteger(garantiaId) || garantiaId <= 0) return { title: 'Pagaré' };
  const nombre = (await cargarPagare(garantiaId))?.garantia?.cliente_nombre;
  return { title: nombre ? `Pagaré ${id} — ${nombre}` : `Pagaré ${id}` };
}

export default async function PagarePage({ params }: Params) {
  const { id } = await params;
  const garantiaId = Number(id);
  if (!Number.isInteger(garantiaId) || garantiaId <= 0) notFound();

  const { user, rolEfectivo } = await getUsuarioActual();
  if (!user) redirect('/login');
  // Auditoría y Control Legal no está disponible para ANALISTA_RIESGO (CLAUDE.md §2.2) --
  // mismo guard que src/app/(app)/auditoria-legal/garantias/page.tsx.
  if ((rolEfectivo ?? 'ANALISTA') === 'ANALISTA_RIESGO') redirect('/dashboard');

  const data = await cargarPagare(garantiaId);
  const garantia = data?.garantia;
  if (!data || !garantia) notFound();
  // El pagaré es inmutable una vez generado -- esta vista nunca debe renderizar
  // una garantía a la que todavía no se le capturaron los datos legales (Task 5/6).
  if (!garantia.documento_pagare_generado_en) notFound();

  // La identidad del acreedor no es opcional en un pagaré: si falta en
  // config_sistema, el documento NO se debe poder ver ni imprimir con
  // "a la orden de , cédula jurídica número ," en blanco -- eso es un
  // documento legal defectuoso, no un valor por defecto aceptable.
  const { razonSocial, cedulaJuridica } = data.acreedor;
  if (!razonSocial || !cedulaJuridica) notFound();

  return <PagareImprimible garantia={garantia} acreedor={{ razonSocial, cedulaJuridica }} />;
}
