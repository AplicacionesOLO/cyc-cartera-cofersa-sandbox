'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiError } from '@/shared/api/api-error';
import type { RequestOptions } from '@/shared/api/http-client';
import { sincronizacionApi } from '../api/sincronizacion-api';
import type { ResultadoSync, SyncConteoResponse, SyncRow, SyncTipo } from '../types';

/** Consulta de GET /sync/estado mientras el worker SQS procesa (N8N + 12 s de espera + fn_sync_*). */
const POLL_MS = 4_000;
const POLL_MAX_MS = 120_000;
const MSG_EN_PROCESO =
  'La sincronización sigue en proceso; el historial se actualizará al terminar.';

function mensajeError(e: unknown): ResultadoSync {
  const err = e as ApiError;
  return {
    ok: false,
    msg: err.isNetworkError ? 'Error de conexión' : err.message || 'Error desconocido',
  };
}

function esperar(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new DOMException('aborted', 'AbortError'));
    });
  });
}

async function esperarResultado(
  tipo: SyncTipo,
  desde: string,
  signal: AbortSignal,
): Promise<SyncRow | null> {
  const limite = Date.now() + POLL_MAX_MS;
  while (Date.now() < limite) {
    await esperar(POLL_MS, signal);
    const estado = await sincronizacionApi.estado(tipo, desde, { signal });
    if (estado.ultimo) return estado.ultimo;
  }
  return null;
}

/**
 * Configuración → Sincronización. Cartera/Facturas/Saldos responden en el acto; Pagos y Pedidos
 * Retenidos se encolan (202) y se espera la fila nueva de sync_log (antes la API Route esperaba a N8N).
 */
export function useSincronizacionController(onHistorial?: (rows: SyncRow[]) => void) {
  const [historial, setHistorial] = useState<SyncRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [phase, setPhase] = useState(0);
  const [resultado, setResultado] = useState<ResultadoSync | null>(null);
  const [syncingCartera, setSyncingCartera] = useState(false);
  const [resultadoCartera, setResultadoCartera] = useState<ResultadoSync | null>(null);
  const [syncingFacturas, setSyncingFacturas] = useState(false);
  const [resultadoFacturas, setResultadoFacturas] = useState<ResultadoSync | null>(null);
  const [syncingSaldos, setSyncingSaldos] = useState(false);
  const [resultadoSaldos, setResultadoSaldos] = useState<ResultadoSync | null>(null);
  const [syncingPedidos, setSyncingPedidos] = useState(false);
  const [resultadoPedidos, setResultadoPedidos] = useState<ResultadoSync | null>(null);
  const onHistorialRef = useRef(onHistorial);
  onHistorialRef.current = onHistorial;
  const unmount = useRef(new AbortController());

  const fetchHistorial = useCallback(async (signal?: AbortSignal) => {
    let rows: SyncRow[] = [];
    try {
      rows = await sincronizacionApi.historial({ signal });
    } catch (e) {
      if ((e as ApiError).isCanceled) return;
    }
    setHistorial(rows);
    setLoading(false);
    onHistorialRef.current?.(rows);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    unmount.current = controller;
    void fetchHistorial(controller.signal);
    return () => controller.abort();
  }, [fetchHistorial]);

  async function conteo(
    llamar: (o?: RequestOptions) => Promise<SyncConteoResponse>,
    setBusy: (v: boolean) => void,
    setRes: (r: ResultadoSync | null) => void,
    msg: (total: string) => string,
  ) {
    setBusy(true);
    setRes(null);
    try {
      const json = await llamar({ signal: unmount.current.signal });
      setRes({ ok: true, msg: msg(Number(json.resultado.total_tabla).toLocaleString('es-CR')) });
      await fetchHistorial(unmount.current.signal);
    } catch (e) {
      if (!(e as ApiError).isCanceled) setRes(mensajeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function encolado(
    tipo: 'pagos' | 'pedidos_retenidos',
    setRes: (r: ResultadoSync | null) => void,
    msg: (row: SyncRow, n8nConfigurado: boolean) => string,
  ) {
    const signal = unmount.current.signal;
    const json =
      tipo === 'pagos'
        ? await sincronizacionApi.syncPagos({ signal })
        : await sincronizacionApi.syncPedidosRetenidos({ signal });
    const row = await esperarResultado(tipo, json.solicitado_en, signal);
    if (!row) setRes({ ok: true, msg: MSG_EN_PROCESO });
    else if (row.error) setRes({ ok: false, msg: row.error });
    else setRes({ ok: true, msg: msg(row, json.n8n_configurado) });
    await fetchHistorial(signal);
  }

  const handleSync = async () => {
    setSyncing(true);
    setPhase(0);
    setResultado(null);
    const t1 = setTimeout(() => setPhase(1), 3_000);
    const t2 = setTimeout(() => setPhase(2), 14_000);
    try {
      await encolado(
        'pagos',
        setResultado,
        (r) =>
          `N8N OK · ${r.insertados} nuevos · ${r.en_stage} en stage · ${r.omitidos} omitidos · total ${Number(r.total_tabla).toLocaleString('es-CR')} pagos`,
      );
    } catch (e) {
      if (!(e as ApiError).isCanceled && !(e instanceof DOMException))
        setResultado(mensajeError(e));
    } finally {
      clearTimeout(t1);
      clearTimeout(t2);
      setSyncing(false);
    }
  };

  const handleSyncPedidos = async () => {
    setSyncingPedidos(true);
    setResultadoPedidos(null);
    try {
      await encolado('pedidos_retenidos', setResultadoPedidos, (r, configurado) => {
        const nota = configurado
          ? ''
          : ' (webhook N8N aún no configurado -- solo se procesó lo que ya había en stage)';
        // sync_log no guarda "actualizados": en_stage = insertados + actualizados + omitidos
        const actualizados = Math.max(r.en_stage - r.insertados - r.omitidos, 0);
        return `${r.insertados} nuevos · ${actualizados} actualizados · total ${Number(r.total_tabla).toLocaleString('es-CR')} pedidos${nota}`;
      });
    } catch (e) {
      if (!(e as ApiError).isCanceled && !(e instanceof DOMException))
        setResultadoPedidos(mensajeError(e));
    } finally {
      setSyncingPedidos(false);
    }
  };

  const handleSyncCartera = () =>
    conteo(
      sincronizacionApi.syncCartera,
      setSyncingCartera,
      setResultadoCartera,
      (t) => `${t} clientes en cartera`,
    );
  const handleSyncFacturas = () =>
    conteo(
      sincronizacionApi.syncFacturas,
      setSyncingFacturas,
      setResultadoFacturas,
      (t) => `${t} facturas registradas`,
    );
  const handleSyncSaldos = () =>
    conteo(
      sincronizacionApi.syncSaldosFavor,
      setSyncingSaldos,
      setResultadoSaldos,
      (t) => `${t} saldos registrados`,
    );

  return {
    historial,
    loading,
    syncing,
    phase,
    resultado,
    syncingCartera,
    resultadoCartera,
    syncingFacturas,
    resultadoFacturas,
    syncingSaldos,
    resultadoSaldos,
    syncingPedidos,
    resultadoPedidos,
    handleSync,
    handleSyncCartera,
    handleSyncFacturas,
    handleSyncSaldos,
    handleSyncPedidos,
  };
}
