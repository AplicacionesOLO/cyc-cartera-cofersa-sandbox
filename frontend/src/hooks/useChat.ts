'use client';

/**
 * useChat
 *
 * Hook del chat interno del equipo C&C (lo usa ChatPanel). La lógica vive en el controller del
 * módulo de notificaciones (GET/POST /chat en lugar de el SDK anterior + Realtime + Presence).
 */
export { useChatController as useChat } from '@/views/notificaciones/hooks/use-chat-controller';
