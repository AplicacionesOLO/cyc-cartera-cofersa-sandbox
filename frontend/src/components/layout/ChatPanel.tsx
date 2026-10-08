'use client';

/**
 * ChatPanel
 *
 * Panel flotante de chat del equipo C&C.
 * Flota en la esquina inferior derecha sobre todo el contenido.
 *
 * Funcionalidades:
 *   - Toggle abierto/cerrado
 *   - Lista de mensajes con scroll automático al último
 *   - Indicador de presencia (quién está conectado ahora)
 *   - Input + envío con Enter o botón
 *   - Badge "NUEVO" parpadeante cuando llega mensaje con panel cerrado
 *   - Separadores de fecha entre mensajes de distintos días
 */

import { useState, useEffect, useRef } from 'react';
import { Send, ChevronDown } from 'lucide-react';
import { useChat } from '@/hooks/useChat';
import type { MensajeChatConUsuario } from '@/types/database';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtHora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtFechaChat(iso: string): string {
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return 'Hoy';
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit' });
}

// ── Avatar ─────────────────────────────────────────────────────────────────

function AvatarChip({
  iniciales,
  color,
  size = 28,
}: {
  iniciales: string;
  color: string;
  size?: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.35,
        fontWeight: 700,
        color: 'white',
      }}
    >
      {iniciales}
    </div>
  );
}

// ── Burbuja de mensaje ──────────────────────────────────────────────────────

function BurbujaMensaje({
  msg,
  esMio,
  mostrarNombre,
}: {
  msg: MensajeChatConUsuario;
  esMio: boolean;
  mostrarNombre: boolean;
}) {
  const nombre = msg.usuario?.nombre ?? 'Usuario';
  const iniciales = msg.usuario?.iniciales ?? '??';
  const color = msg.usuario?.color ?? '#64748b';

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        flexDirection: esMio ? 'row-reverse' : 'row',
        alignItems: 'flex-end',
      }}
    >
      {!esMio && <AvatarChip iniciales={iniciales} color={color} size={26} />}
      <div style={{ maxWidth: '72%' }}>
        {mostrarNombre && !esMio && (
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#003B5C',
              marginBottom: 2,
              marginLeft: 2,
            }}
          >
            {nombre.split(' ')[0]}
          </p>
        )}
        <div
          style={{
            padding: '7px 11px',
            borderRadius: esMio ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
            background: esMio ? '#009ee3' : 'white',
            color: esMio ? 'white' : '#1e293b',
            fontSize: 12,
            lineHeight: 1.5,
            border: esMio ? 'none' : '1px solid #e2e8f0',
            wordBreak: 'break-word',
          }}
        >
          {msg.mensaje}
        </div>
        <p
          style={{
            fontSize: 9,
            color: '#94a3b8',
            marginTop: 2,
            textAlign: esMio ? 'right' : 'left',
          }}
        >
          {fmtHora(msg.created_at)}
        </p>
      </div>
      {esMio && <AvatarChip iniciales={iniciales} color={color} size={26} />}
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────

interface ChatPanelProps {
  usuarioId: string;
  nombre: string;
  iniciales: string;
  color: string;
  totalEquipo: number;
}

// ── Componente principal ───────────────────────────────────────────────────

export default function ChatPanel({
  usuarioId,
  nombre,
  iniciales,
  color,
  totalEquipo,
}: ChatPanelProps) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [tieneNuevo, setTieneNuevo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevCount = useRef(-1); // -1 = carga inicial pendiente
  const cargaLista = useRef(false);

  const { mensajes, conectados, cargando, enviarMensaje } = useChat({
    usuarioId,
    nombre,
    iniciales,
    color,
  });

  // Scroll al último mensaje al abrir o al llegar uno nuevo
  useEffect(() => {
    if (abierto) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
      setTieneNuevo(false);
    }
  }, [abierto, mensajes.length]);

  // Badge de nuevo mensaje cuando el panel está cerrado
  // Solo cuenta mensajes que llegan DESPUÉS de la carga inicial
  useEffect(() => {
    if (cargando) return; // todavía cargando — no hacer nada

    if (!cargaLista.current) {
      // Primera vez que cargando pasa a false: fijar baseline sin activar NUEVO
      prevCount.current = mensajes.length;
      cargaLista.current = true;
      return;
    }

    if (!abierto && mensajes.length > prevCount.current) setTieneNuevo(true);
    prevCount.current = mensajes.length;
  }, [mensajes.length, abierto, cargando]);

  function necesitaSeparador(i: number): boolean {
    if (i === 0) return true;
    return (
      new Date(mensajes[i - 1].created_at).toDateString() !==
      new Date(mensajes[i].created_at).toDateString()
    );
  }

  async function handleEnviar() {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    setErrorEnvio(false);
    setTexto('');
    const ok = await enviarMensaje(t);
    setEnviando(false);
    if (!ok) {
      // Devolver el texto para que el usuario no lo pierda y sepa que falló
      setTexto(t);
      setErrorEnvio(true);
      setTimeout(() => setErrorEnvio(false), 4000);
    }
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEnviar();
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        right: 20,
        width: 340,
        zIndex: 200,
        fontFamily: "'Nunito', sans-serif",
      }}
    >
      {/* Panel expandido */}
      {abierto && (
        <div
          style={{
            height: 480,
            background: 'white',
            borderRadius: '14px 14px 0 0',
            border: '1px solid #e2e8f0',
            borderBottom: 'none',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.10)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '11px 14px',
              background: '#003B5C',
              borderRadius: '14px 14px 0 0',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexShrink: 0,
            }}
          >
            <div style={{ flex: 1 }}>
              <p style={{ color: 'white', fontWeight: 700, fontSize: 13, margin: 0 }}>
                💬 Equipo C&amp;C
              </p>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, margin: 0 }}>
                {conectados.length}/{totalEquipo} conectados ahora
              </p>
            </div>
            <div style={{ display: 'flex' }}>
              {conectados.slice(0, 4).map((u, i) => (
                <div key={u.usuario_id} style={{ marginLeft: i === 0 ? 0 : -6 }}>
                  <AvatarChip iniciales={u.iniciales} color={u.color} size={22} />
                </div>
              ))}
            </div>
            <button
              onClick={() => setAbierto(false)}
              style={{
                color: 'rgba(255,255,255,0.6)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
              }}
            >
              <ChevronDown size={16} />
            </button>
          </div>

          {/* Mensajes */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px 12px 6px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              background: '#f8fafc',
            }}
          >
            {cargando ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: 20 }}>
                Cargando…
              </div>
            ) : mensajes.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: 20 }}>
                Sin mensajes aún. ¡Escribí el primero!
              </div>
            ) : (
              mensajes.map((msg, i) => (
                <div key={msg.id}>
                  {necesitaSeparador(i) && (
                    <div style={{ textAlign: 'center', margin: '4px 0' }}>
                      <span
                        style={{
                          fontSize: 10,
                          color: '#94a3b8',
                          background: '#e8edf2',
                          padding: '2px 10px',
                          borderRadius: 99,
                        }}
                      >
                        {fmtFechaChat(msg.created_at)}
                      </span>
                    </div>
                  )}
                  <BurbujaMensaje
                    msg={msg}
                    esMio={msg.usuario_id === usuarioId}
                    mostrarNombre={i === 0 || mensajes[i - 1].usuario_id !== msg.usuario_id}
                  />
                </div>
              ))
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div
            style={{
              padding: '10px 10px 12px',
              borderTop: '1px solid #e2e8f0',
              background: 'white',
              flexShrink: 0,
            }}
          >
            {errorEnvio && (
              <p style={{ fontSize: 10, color: '#dc2626', marginBottom: 6, textAlign: 'center' }}>
                ⚠️ No se pudo enviar. Intentá de nuevo.
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                ref={inputRef}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escribe un mensaje al equipo…"
                maxLength={1000}
                disabled={enviando}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  border: errorEnvio ? '1px solid #dc2626' : '1px solid #e2e8f0',
                  padding: '8px 12px',
                  fontSize: 12,
                  outline: 'none',
                  fontFamily: 'inherit',
                  color: '#1e293b',
                }}
              />
              <button
                onClick={handleEnviar}
                disabled={!texto.trim() || enviando}
                style={{
                  width: 34,
                  height: 34,
                  background: texto.trim() ? '#009ee3' : '#e2e8f0',
                  borderRadius: 9,
                  border: 'none',
                  cursor: texto.trim() ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
              >
                <Send size={14} color={texto.trim() ? 'white' : '#94a3b8'} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Botón flotante (siempre visible) */}
      <button
        onClick={() => {
          setAbierto((v) => !v);
          setTieneNuevo(false);
        }}
        style={{
          width: '100%',
          padding: '10px 16px',
          background: '#003B5C',
          border: 'none',
          borderRadius: abierto ? 0 : '12px 12px 0 0',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span style={{ fontSize: 16 }}>💬</span>
        <span style={{ color: 'white', fontWeight: 700, fontSize: 13, flex: 1, textAlign: 'left' }}>
          Equipo C&amp;C
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#22c55e',
              display: 'inline-block',
            }}
          />
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>
            {conectados.length}/{totalEquipo}
          </span>
        </span>
        {tieneNuevo && !abierto && (
          <span
            style={{
              background: '#dc2626',
              color: 'white',
              fontSize: 9,
              fontWeight: 800,
              padding: '1px 5px',
              borderRadius: 99,
            }}
          >
            NUEVO
          </span>
        )}
        <ChevronDown
          size={14}
          color="rgba(255,255,255,0.4)"
          style={{
            transform: abierto ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        />
      </button>
    </div>
  );
}
