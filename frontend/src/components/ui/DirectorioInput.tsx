'use client';

import { useState, useEffect, useRef } from 'react';
import { useDirectorioContactosController } from '@/views/configuracion/hooks/use-directorio-contactos-controller';

interface Contacto {
  id: string;
  nombre: string;
  email: string;
  cargo: string | null;
  area: string | null;
}

/** Devuelve el fragmento que el usuario está tecleando (último segmento tras ';') */
function getCurrentQuery(value: string): string {
  const idx = value.lastIndexOf(';');
  return idx === -1 ? value.trim() : value.slice(idx + 1).trim();
}

/** Reemplaza el último segmento con el email seleccionado */
function replaceLastSegment(value: string, email: string): string {
  const idx = value.lastIndexOf(';');
  if (idx === -1) return email + '; ';
  return value.slice(0, idx + 1) + ' ' + email + '; ';
}

interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  onBlur?: () => void;
  /** Se invoca con el contacto elegido del directorio (para llenar nombre+email, etc.) */
  onSelect?: (c: Contacto) => void;
  /** true (default): admite varios emails separados por ';'. false: un solo destinatario (el padre maneja el valor vía onSelect). */
  multiple?: boolean;
  disabled?: boolean;
}

export default function DirectorioInput({
  value,
  onChange,
  placeholder,
  className,
  style,
  onBlur,
  onSelect,
  multiple = true,
  disabled = false,
}: Props) {
  const { contactos } = useDirectorioContactosController();
  const [filtered, setFiltered] = useState<Contacto[]>([]);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Cierra al hacer clic fuera del componente
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    onChange(val);
    const q = getCurrentQuery(val).toLowerCase();
    if (q.length === 0) {
      setFiltered([]);
      setOpen(false);
      return;
    }
    const results = contactos
      .filter((c) => c.nombre.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
      .slice(0, 7);
    setFiltered(results);
    setOpen(results.length > 0);
    setCursor(0);
  }

  function select(c: Contacto) {
    onSelect?.(c);
    // En modo "varios" insertamos el email en el texto; en modo "uno solo"
    // el padre maneja el valor a través de onSelect (ej: llenar nombre+email o agregar tag).
    if (multiple) onChange(replaceLastSegment(value, c.email));
    setOpen(false);
    setFiltered([]);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((cur) => Math.min(cur + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((cur) => Math.max(cur - 1, 0));
    } else if (e.key === 'Enter' && filtered[cursor]) {
      e.preventDefault();
      select(filtered[cursor]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={onBlur}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        style={style}
        autoComplete="off"
      />

      {open && (
        <ul
          style={{
            position: 'absolute',
            top: 'calc(100% + 2px)',
            left: 0,
            right: 0,
            zIndex: 9999,
            margin: 0,
            padding: 0,
            listStyle: 'none',
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            boxShadow: '0 4px 20px rgba(0,59,92,0.13)',
            maxHeight: 228,
            overflowY: 'auto',
          }}
        >
          {filtered.map((c, i) => (
            <li
              key={c.id}
              onMouseDown={(e) => {
                e.preventDefault();
                select(c);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '7px 12px',
                cursor: 'pointer',
                background: i === cursor ? '#eff8ff' : 'transparent',
                borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none',
                transition: 'background 80ms',
              }}
              onMouseEnter={() => setCursor(i)}
            >
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#0f172a',
                    margin: 0,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {c.nombre}
                </p>
                {(c.cargo || c.area) && (
                  <p
                    style={{
                      fontSize: 10,
                      color: '#94a3b8',
                      margin: '1px 0 0',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {[c.cargo, c.area].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <span
                style={{
                  fontSize: 11,
                  color: '#009ee3',
                  fontWeight: 500,
                  flexShrink: 0,
                  fontFamily: 'monospace',
                }}
              >
                {c.email}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
