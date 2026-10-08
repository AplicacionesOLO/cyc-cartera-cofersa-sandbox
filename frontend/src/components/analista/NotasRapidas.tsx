'use client';

// src/components/analista/NotasRapidas.tsx
// Mini lista de tareas del día.
// - Input superior: escribir + Enter (o botón +) para agregar un ítem.
// - Cada ítem aparece con checkbox, texto y botón de borrar (hover).
// - Marcar como completado: verde + tachado.
// - Auto-guarda en la BD (API /notas-rapidas) en cada acción (add / toggle / delete).
// - Persiste entre recargas; convierte texto legacy a un único ítem.

import { useState, useRef } from 'react';
import { FileText, Plus, Check, X, Loader2 } from 'lucide-react';
import { useNotasRapidasController } from '@/views/gestiones/hooks/use-notas-rapidas-controller';

interface Props {
  hoyStr: string;
}

interface NotaItem {
  id: string;
  texto: string;
  completada: boolean;
}

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function labelFecha(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

/** Intenta parsear el contenido guardado como JSON; soporta texto plano legacy. */
function parseItems(raw: string): NotaItem[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as NotaItem[];
    // legacy: era plain text
    const text = String(parsed).trim();
    if (!text) return [];
    return [{ id: String(Date.now()), texto: text, completada: false }];
  } catch {
    // legacy: plain text con posibles saltos de línea
    return raw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((texto, i) => ({
        id: `${Date.now()}-${i}`,
        texto,
        completada: false,
      }));
  }
}

export default function NotasRapidas({ hoyStr }: Props) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  // Carga / guardado vía API (GET/POST /notas-rapidas)
  const { items, setItems, loaded, saveState, saveItems } = useNotasRapidasController<NotaItem>(
    hoyStr,
    parseItems,
  );

  // ── Acciones ─────────────────────────────────────────────────────
  function addItem() {
    const texto = input.trim();
    if (!texto) return;
    const item: NotaItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      texto,
      completada: false,
    };
    const next = [...items, item];
    setItems(next);
    setInput('');
    saveItems(next);
    // devolver foco al input
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function toggleItem(id: string) {
    const next = items.map((it) => (it.id === id ? { ...it, completada: !it.completada } : it));
    setItems(next);
    saveItems(next);
  }

  function deleteItem(id: string) {
    const next = items.filter((it) => it.id !== id);
    setItems(next);
    saveItems(next);
  }

  const nPendientes = items.filter((it) => !it.completada).length;
  const nCompletadas = items.filter((it) => it.completada).length;

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div
      className="bg-white border border-slate-200 rounded-lg overflow-hidden flex-1"
      style={{ borderTop: '3px solid #003B5C' }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={13} style={{ color: '#009ee3' }} />
          <span className="text-xs font-semibold text-slate-700">Notas del Día</span>
        </div>
        <div className="text-[10px] h-4 flex items-center gap-1">
          {saveState === 'saving' && (
            <>
              <Loader2 size={10} className="animate-spin text-slate-400" />
              <span className="text-slate-400">Guardando...</span>
            </>
          )}
          {saveState === 'saved' && (
            <>
              <Check size={10} className="text-emerald-500" />
              <span className="text-emerald-500">Guardado</span>
            </>
          )}
          {saveState === 'error' && <span className="text-red-500">Error al guardar</span>}
        </div>
      </div>

      <div className="p-3 flex flex-col gap-2">
        <p className="text-[10px] text-slate-400">{labelFecha(hoyStr)}</p>

        {/* Input: escribir + Enter / botón + */}
        <div className="flex gap-1.5">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addItem();
              }
            }}
            placeholder="Agregar nota... (Enter)"
            className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 bg-white
                       focus:outline-none focus:border-[#009ee3] transition placeholder:text-slate-300"
            style={{ fontFamily: 'Nunito, sans-serif' }}
          />
          <button
            onClick={addItem}
            disabled={!input.trim()}
            title="Agregar nota"
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0
                       transition disabled:opacity-30 hover:opacity-80"
            style={{ backgroundColor: '#009EE3' }}
          >
            <Plus size={14} color="white" />
          </button>
        </div>

        {/* Lista de ítems */}
        {!loaded ? (
          <div className="flex justify-center py-4">
            <Loader2 size={14} className="animate-spin text-slate-300" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-[10px] text-slate-300 italic text-center py-3">Sin notas para hoy</p>
        ) : (
          <div className="space-y-1">
            {items.map((item) => (
              <div
                key={item.id}
                className={`flex items-start gap-2 px-2 py-1.5 rounded-lg group transition
                  ${item.completada ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
              >
                {/* Checkbox */}
                <button
                  onClick={() => toggleItem(item.id)}
                  title={item.completada ? 'Marcar pendiente' : 'Marcar completada'}
                  className={`w-4 h-4 rounded flex-shrink-0 mt-0.5 border-2 flex items-center justify-center transition
                    ${
                      item.completada
                        ? 'bg-emerald-500 border-emerald-500'
                        : 'border-slate-300 hover:border-[#009EE3]'
                    }`}
                >
                  {item.completada && <Check size={9} color="white" strokeWidth={3} />}
                </button>

                {/* Texto */}
                <span
                  className={`flex-1 text-xs leading-relaxed break-words
                  ${item.completada ? 'line-through text-slate-400' : 'text-slate-700'}`}
                >
                  {item.texto}
                </span>

                {/* Borrar (visible solo al hacer hover) */}
                <button
                  onClick={() => deleteItem(item.id)}
                  title="Eliminar nota"
                  className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center
                             flex-shrink-0 mt-0.5 transition rounded hover:bg-red-50"
                >
                  <X size={10} className="text-red-400" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Contador al pie */}
        {items.length > 0 && (
          <p className="text-[9px] text-slate-400 text-right tabular-nums">
            {nCompletadas > 0 && (
              <span className="text-emerald-500">
                {nCompletadas} completada{nCompletadas !== 1 ? 's' : ''} ·{' '}
              </span>
            )}
            {nPendientes} pendiente{nPendientes !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  );
}
