'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Solicitud } from '@/types/database';
import { solicitudesApi } from '../api/solicitudes-api';
import type { ComentarioConAutor, HistorialConAutor } from '../types';
import { mensajeError } from './use-crear-solicitud-controller';

/**
 * Detalle de una solicitud: cambio de estado (+ historial) y comentarios internos, con UI optimista
 * (antes API Routes PATCH .../estado y POST .../comentarios).
 */
export function useDetalleSolicitudController(
  solicitud: Solicitud,
  comIni: ComentarioConAutor[],
  histIni: HistorialConAutor[],
) {
  const router = useRouter();

  const [estado, setEstado] = useState(solicitud.estado);
  const [nuevoEstado, setNuevoEstado] = useState(solicitud.estado);
  const [notaEstado, setNotaEstado] = useState('');
  const [savingEst, setSavingEst] = useState(false);
  const [errEst, setErrEst] = useState('');

  const [comentarios, setComentarios] = useState<ComentarioConAutor[]>(comIni);
  const [historial, setHistorial] = useState<HistorialConAutor[]>(histIni);
  const [nuevoCom, setNuevoCom] = useState('');
  const [savingCom, setSavingCom] = useState(false);
  const [errCom, setErrCom] = useState('');

  async function guardarEstado() {
    if (nuevoEstado === estado) {
      setErrEst('Seleccioná un estado distinto al actual');
      return;
    }
    setSavingEst(true);
    setErrEst('');
    try {
      const d = await solicitudesApi.cambiarEstado(
        solicitud.id,
        nuevoEstado,
        notaEstado.trim() || undefined,
      );
      setEstado(nuevoEstado);
      setHistorial((prev) => [
        {
          id: crypto.randomUUID(),
          solicitud_id: solicitud.id,
          estado_anterior: d.estado_anterior ?? estado,
          estado_nuevo: nuevoEstado,
          usuario_id: '',
          nota: notaEstado.trim() || null,
          created_at: new Date().toISOString(),
          autor_nombre: 'Vos',
        },
        ...prev,
      ]);
      setNotaEstado('');
      router.refresh();
    } catch (e) {
      setErrEst(mensajeError(e, 'Error al cambiar el estado'));
    } finally {
      setSavingEst(false);
    }
  }

  async function agregarComentario() {
    if (!nuevoCom.trim()) return;
    setSavingCom(true);
    setErrCom('');
    try {
      const { comentario: c } = await solicitudesApi.comentar(solicitud.id, nuevoCom.trim());
      setComentarios((prev) => [
        ...prev,
        {
          id: c.id,
          solicitud_id: solicitud.id,
          usuario_id: c.usuario_id,
          contenido: c.contenido,
          created_at: c.created_at,
          autor_nombre: c.usuario_nombre ?? 'Vos',
        },
      ]);
      setNuevoCom('');
    } catch (e) {
      setErrCom(mensajeError(e, 'Error al guardar el comentario'));
    } finally {
      setSavingCom(false);
    }
  }

  return {
    estado,
    nuevoEstado,
    setNuevoEstado,
    notaEstado,
    setNotaEstado,
    savingEst,
    errEst,
    guardarEstado,
    comentarios,
    historial,
    nuevoCom,
    setNuevoCom,
    savingCom,
    errCom,
    agregarComentario,
  };
}
