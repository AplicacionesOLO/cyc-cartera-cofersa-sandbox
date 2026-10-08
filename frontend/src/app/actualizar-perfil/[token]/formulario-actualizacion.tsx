'use client';

import { useState } from 'react';
import imageCompression from 'browser-image-compression';
import { ESTADO_CIVIL_OPCIONES } from '@/types/auditoria-legal';
import type { TokenValidoResponse } from '@/types/actualizacion-perfil';
import {
  MAX_MB_IMAGEN,
  MAX_MB_PDF,
  MAX_LEN_LARGO,
  MAX_LEN_CORTO,
} from '@/lib/auditoria-legal/limites-actualizacion';
import { useActualizarPerfilController } from '@/views/auditoria-legal/hooks/use-actualizar-perfil-controller';
import type { ApiError } from '@/shared/api/api-error';

const MIME_CEDULA_ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp'];

const INPUT =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition';
const LABEL = 'block text-[11px] font-bold text-gray-500 uppercase mb-1';

export default function FormularioActualizacion({
  token,
  data,
}: {
  token: string;
  data: TokenValidoResponse;
}) {
  const previos = data.datos_previos;
  const [nombre, setNombre] = useState(previos?.nombre ?? '');
  const [cedula, setCedula] = useState(previos?.cedula ?? '');
  const [estadoCivil, setEstadoCivil] = useState(previos?.estado_civil ?? '');
  const [profesion, setProfesion] = useState(previos?.profesion ?? '');
  const [domicilio, setDomicilio] = useState(previos?.domicilio ?? '');
  const [telefono, setTelefono] = useState(previos?.telefono ?? '');
  const [cedulaFile, setCedulaFile] = useState<File | null>(null);
  const [personeriaFile, setPersoneriaFile] = useState<File | null>(null);
  const [comprimiendo, setComprimiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [enviado, setEnviado] = useState(false);
  const { enviar } = useActualizarPerfilController(token);

  async function onCedulaFile(f: File | null) {
    if (!f) {
      setCedulaFile(null);
      return;
    }
    if (!MIME_CEDULA_ACEPTADOS.includes(f.type)) {
      setError('Formato de imagen no soportado. Usá JPG, PNG o WebP.');
      setCedulaFile(null);
      return;
    }
    setComprimiendo(true);
    setError('');
    try {
      const comprimido = await imageCompression(f, {
        maxSizeMB: 0.8,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      });
      if (comprimido.size > MAX_MB_IMAGEN * 1024 * 1024) {
        setError(
          `La imagen de cédula supera ${MAX_MB_IMAGEN}MB incluso comprimida. Probá con otra foto.`,
        );
        setCedulaFile(null);
        return;
      }
      setCedulaFile(comprimido);
    } catch {
      setError('No se pudo procesar la imagen de la cédula. Probá con otra foto.');
      setCedulaFile(null);
    } finally {
      setComprimiendo(false);
    }
  }

  function onPersoneriaFile(f: File | null) {
    if (!f) {
      setPersoneriaFile(null);
      return;
    }
    if (f.type !== 'application/pdf') {
      setError('El archivo de personería debe ser un PDF.');
      return;
    }
    if (f.size > MAX_MB_PDF * 1024 * 1024) {
      setError(`El PDF de personería supera ${MAX_MB_PDF}MB. Escaneá en menor resolución.`);
      return;
    }
    setError('');
    setPersoneriaFile(f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (
      !nombre.trim() ||
      !cedula.trim() ||
      !estadoCivil ||
      !profesion.trim() ||
      !domicilio.trim()
    ) {
      setError('Completá todos los campos requeridos.');
      return;
    }
    if (!cedulaFile) {
      setError('Adjuntá la imagen de tu cédula.');
      return;
    }
    if (data.tipo_persona === 'JURIDICA' && !personeriaFile) {
      setError('Adjuntá la certificación de personería jurídica.');
      return;
    }

    setEnviando(true);
    try {
      // Antes un multipart a la API Route; ahora el backend firma las subidas (S3) y luego recibe los datos.
      await enviar(
        {
          nombre: nombre.toUpperCase(),
          cedula: cedula.trim(),
          estado_civil: estadoCivil,
          profesion: profesion.trim(),
          domicilio: domicilio.trim(),
          telefono: telefono.trim(),
        },
        cedulaFile,
        personeriaFile,
      );
      setEnviado(true);
    } catch (e) {
      setError((e as ApiError).message ?? 'Error al enviar la información');
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <div className="bg-white rounded-2xl p-8 text-center">
        <p className="text-[15px] font-bold text-green-600">¡Recibimos tu información!</p>
        <p className="text-[12px] text-gray-500 mt-2">
          Un analista la va a revisar. Gracias por completar tu actualización de perfil.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 space-y-3">
      {data.nota_revision && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-800">
          Su envío anterior requiere corrección: <b>{data.nota_revision}</b>. Por favor actualice
          los datos o adjuntos solicitados.
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div>
        <label htmlFor="nombre" className={LABEL}>
          Nombre Completo *
        </label>
        <input
          id="nombre"
          value={nombre}
          maxLength={MAX_LEN_LARGO}
          onChange={(e) => setNombre(e.target.value.toUpperCase())}
          disabled={enviando}
          className={`${INPUT} uppercase`}
        />
      </div>
      <div>
        <label htmlFor="cedula" className={LABEL}>
          Cédula *
        </label>
        <input
          id="cedula"
          value={cedula}
          maxLength={MAX_LEN_CORTO}
          onChange={(e) => setCedula(e.target.value)}
          disabled={enviando}
          className={INPUT}
        />
      </div>
      <div>
        <label htmlFor="estado_civil" className={LABEL}>
          Estado Civil *
        </label>
        <select
          id="estado_civil"
          value={estadoCivil}
          onChange={(e) => setEstadoCivil(e.target.value)}
          disabled={enviando}
          className={`${INPUT} bg-white`}
        >
          <option value="">Seleccionar...</option>
          {ESTADO_CIVIL_OPCIONES.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="profesion" className={LABEL}>
          Profesión *
        </label>
        <input
          id="profesion"
          value={profesion}
          maxLength={MAX_LEN_LARGO}
          onChange={(e) => setProfesion(e.target.value)}
          disabled={enviando}
          className={INPUT}
        />
      </div>
      <div>
        <label htmlFor="domicilio" className={LABEL}>
          Domicilio *
        </label>
        <input
          id="domicilio"
          value={domicilio}
          maxLength={MAX_LEN_LARGO}
          onChange={(e) => setDomicilio(e.target.value)}
          disabled={enviando}
          className={INPUT}
        />
      </div>
      <div>
        <label htmlFor="telefono" className={LABEL}>
          Teléfono (opcional)
        </label>
        <input
          id="telefono"
          value={telefono}
          maxLength={MAX_LEN_CORTO}
          onChange={(e) => setTelefono(e.target.value)}
          disabled={enviando}
          className={INPUT}
        />
      </div>
      <div>
        <label htmlFor="cedula_file" className={LABEL}>
          Foto de su Cédula *
        </label>
        <input
          id="cedula_file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => onCedulaFile(e.target.files?.[0] ?? null)}
          disabled={enviando || comprimiendo}
          className="text-[13px]"
        />
        {comprimiendo && <p className="text-[11px] text-gray-400 mt-1">Procesando imagen...</p>}
      </div>
      {data.tipo_persona === 'JURIDICA' && (
        <div>
          <label htmlFor="personeria_file" className={LABEL}>
            Certificación de Personería Jurídica (PDF) *
          </label>
          <input
            id="personeria_file"
            type="file"
            accept="application/pdf"
            onChange={(e) => onPersoneriaFile(e.target.files?.[0] ?? null)}
            disabled={enviando}
            className="text-[13px]"
          />
        </div>
      )}
      <button
        type="submit"
        disabled={enviando || comprimiendo}
        className="w-full rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-60"
        style={{ background: '#009ee3' }}
      >
        {enviando ? 'Enviando...' : 'Enviar Información'}
      </button>
    </form>
  );
}
