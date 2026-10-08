'use client';

import { useEffect, useState } from 'react';
import type { ApiError } from '@/shared/api/api-error';
import { browserHttp } from '@/shared/api/browser-http';
import { analistasConCarteraReal } from '@/lib/utils/analistas-equipo';
import {
  asuntoPresupuestoGeneral,
  htmlPresupuestoGeneral,
  type FilaPresupuestoGeneral,
} from '@/lib/reportes/email-presupuesto-general';
import type { RemitenteCorreo } from '@/lib/reportes/email-vendedor';
import { presupuestoApi } from '../api/presupuesto-api';
import type { DestinatariosPresupuesto, PresupuestoVendedorRow } from '../types';

interface Destinos {
  filas: FilaPresupuestoGeneral[];
  to: string[];
}

/** Arma filas del correo y destinatarios automáticos (misma lógica que el modal original). */
function armarDestinos(
  vendedores: PresupuestoVendedorRow[],
  dir: DestinatariosPresupuesto,
  emailsAnalistas: string[],
): Destinos {
  const codsConMeta = new Set(
    vendedores.filter((v) => (v.meta ?? v.ppto_total) > 0).map((v) => v.vendedor_cod),
  );
  const nombreMap: Record<string, string> = {};
  const emailMap: Record<string, string> = {};
  dir.vendedores.forEach((v) => {
    nombreMap[v.cod] = v.nombre;
    if (v.email) emailMap[v.cod] = v.email;
  });

  const gruposActivos = new Set(dir.grupos.map((g) => g.principal_cod));
  const miembrosActivos = dir.miembros.filter(
    (m) => m.activo && gruposActivos.has(m.principal_cod),
  );
  const miembrosPorPrincipal: Record<string, string[]> = {};
  miembrosActivos.forEach((m) => {
    if (!miembrosPorPrincipal[m.principal_cod]) miembrosPorPrincipal[m.principal_cod] = [];
    miembrosPorPrincipal[m.principal_cod].push(nombreMap[m.vendedor_cod] ?? m.vendedor_cod);
  });
  // Los miembros de una ruta acotada no tienen meta propia (vive en el Principal),
  // pero también venden y cobran a esos clientes -- deben recibir el correo igual.
  const codsMiembros = new Set(miembrosActivos.map((m) => m.vendedor_cod));

  // Filas del correo: solo vendedores con meta > 0, nombre enriquecido con miembros del grupo
  const filas: FilaPresupuestoGeneral[] = vendedores
    .filter((v) => (v.meta ?? v.ppto_total) > 0)
    .map((v) => {
      const otros = miembrosPorPrincipal[v.vendedor_cod] ?? [];
      const nombre =
        otros.length > 0 ? [v.vendedor_nombre, ...otros].join(', ') : v.vendedor_nombre;
      return { vendedor_cod: v.vendedor_cod, agente_nombre: nombre, meta: v.meta ?? v.ppto_total };
    });

  // Destinatarios automáticos: vendedores con meta + miembros de portafolio acotado + supervisores + analistas
  const codsDestino = new Set([...codsConMeta, ...codsMiembros]);
  const emailsVend = [...codsDestino].map((cod) => emailMap[cod]).filter(Boolean);
  const emailsSup = dir.supervisores.map((s) => s.email).filter(Boolean) as string[];
  return { filas, to: Array.from(new Set([...emailsVend, ...emailsSup, ...emailsAnalistas])) };
}

/** Modal "Enviar Presupuesto General": un solo correo a vendedores con meta, supervisores y analistas. */
export function useEnvioPresupuestoGeneralController(
  vendedores: PresupuestoVendedorRow[],
  mesLabel: string,
  metaTotal: number,
  remitente: RemitenteCorreo,
) {
  const [cargando, setCargando] = useState(true);
  const [toAuto, setToAuto] = useState<string[]>([]);
  const [filas, setFilas] = useState<FilaPresupuestoGeneral[]>([]);
  const [ccExtra, setCcExtra] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    // Destinatarios "analistas": elegible por rol ∩ con cartera real hoy (mismo criterio que el
    // filtro por analista en Gestiones/Promesas/Estados de Cuenta) — lo resuelve el API.
    Promise.all([
      presupuestoApi.destinatarios({ signal: controller.signal }),
      analistasConCarteraReal(browserHttp),
    ])
      .then(([dir, analistas]) => {
        if (controller.signal.aborted) return;
        const destinos = armarDestinos(
          vendedores,
          dir,
          analistas.map((a) => a.email).filter(Boolean),
        );
        setFilas(destinos.filas);
        setToAuto(destinos.to);
      })
      .catch((e: ApiError) => {
        if (controller.signal.aborted || e.isCanceled) return;
        setResultado({ ok: false, msg: e.message || 'Error al armar la lista de destinatarios.' });
      })
      .finally(() => {
        if (!controller.signal.aborted) setCargando(false);
      });
    return () => controller.abort();
  }, [vendedores]);

  async function enviar() {
    if (toAuto.length === 0 || enviando) return;
    setEnviando(true);
    setResultado(null);
    try {
      const j = await presupuestoApi.enviar({
        to: toAuto.join(';'),
        cc: ccExtra.trim()
          ? ccExtra
              .split(';')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
        subject: asuntoPresupuestoGeneral(mesLabel),
        html: htmlPresupuestoGeneral(filas, metaTotal, mesLabel, remitente),
      });
      if (j.email_sent)
        setResultado({ ok: true, msg: `Correo enviado a ${toAuto.length} destinatarios.` });
      else setResultado({ ok: false, msg: 'Error al enviar el correo.' });
    } catch (err) {
      setResultado({ ok: false, msg: (err as ApiError).message || 'Error de red' });
    } finally {
      setEnviando(false);
    }
  }

  return {
    cargando,
    nAuto: toAuto.length,
    toAuto,
    ccExtra,
    setCcExtra,
    enviando,
    resultado,
    enviar,
  };
}
