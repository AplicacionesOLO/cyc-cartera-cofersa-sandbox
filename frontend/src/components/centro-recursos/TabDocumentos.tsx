'use client';

import { useState } from 'react';
import { FileText, FileSpreadsheet, File, Download, Plus } from 'lucide-react';
import { fmtFecha } from '@/lib/utils/formato';
import ModalCargarDocumento from './ModalCargarDocumento';
import type { DocumentoRecurso } from '@/types/centro-recursos';

interface Props {
  documentos: DocumentoRecurso[];
  soyCoordinador: boolean;
}

const ICONO_TIPO: Record<string, { icon: typeof FileText; color: string; bg: string }> = {
  pdf: { icon: FileText, color: '#dc2626', bg: '#fef2f2' },
  docx: { icon: FileText, color: '#2563eb', bg: '#eff6ff' },
  xlsx: { icon: FileSpreadsheet, color: '#16a34a', bg: '#f0fdf4' },
};

export default function TabDocumentos({ documentos: init, soyCoordinador }: Props) {
  const [documentos, setDocumentos] = useState<DocumentoRecurso[]>(init);
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {soyCoordinador && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white transition"
            style={{ backgroundColor: '#009ee3' }}
          >
            <Plus size={14} /> Cargar Nuevo Documento
          </button>
        )}
      </div>

      {documentos.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">
          Todavía no hay documentos cargados.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {documentos.map((doc) => {
            const cfg = ICONO_TIPO[doc.tipo_archivo] ?? {
              icon: File,
              color: '#64748b',
              bg: '#f1f5f9',
            };
            const Icon = cfg.icon;
            return (
              <div
                key={doc.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col gap-3"
              >
                <div
                  className="flex items-center justify-center rounded-lg flex-shrink-0"
                  style={{
                    width: '40px',
                    height: '40px',
                    backgroundColor: cfg.bg,
                    color: cfg.color,
                  }}
                >
                  <Icon size={18} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-800">{doc.titulo}</p>
                  {doc.descripcion && (
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">{doc.descripcion}</p>
                  )}
                </div>
                <p className="text-[11px] text-gray-400">
                  Última actualización: {fmtFecha(doc.created_at)}
                </p>
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition"
                  style={{ backgroundColor: '#f1f5f9', color: '#374151' }}
                >
                  <Download size={13} /> Ver / Descargar
                </a>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <ModalCargarDocumento
          onClose={() => setShowModal(false)}
          onSuccess={(nuevo) => {
            setDocumentos((prev) => [nuevo, ...prev]);
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}
