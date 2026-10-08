// Google Calendar API v3 — vía backend (GET /me/calendar/events): el backend usa el refresh
// token de Google guardado del usuario (Cognito no expone provider_token).
// Requiere scope: https://www.googleapis.com/auth/calendar.readonly (consentimiento en /me/google).
import { identidadApi, type GoogleCalendarItem } from '@/views/identidad/api/identidad-api';

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string; // YYYY-MM-DD (allDay) o ISO datetime
  end: string;
  allDay: boolean;
  colorHex: string; // color del evento para el dot del calendario
}

// Mapa de colorId de Google Calendar → hex
const COLOR_MAP: Record<string, string> = {
  '1': '#a4bdfc', // Lavanda
  '2': '#7ae7bf', // Salvia
  '3': '#dbadff', // Uva
  '4': '#ff887c', // Flamingo
  '5': '#fbd75b', // Banana
  '6': '#ffb878', // Mandarina
  '7': '#46d6db', // Pavo real
  '8': '#e1e1e1', // Grafito
  '9': '#5484ed', // Arándano
  '10': '#51b749', // Salvia
  '11': '#dc2626', // Tomate
};
const DEFAULT_COLOR = '#009ee3'; // Cyan Cofersa

export async function fetchCalendarEvents(
  timeMin: string, // YYYY-MM-DD
  timeMax: string, // YYYY-MM-DD
  api: Pick<typeof identidadApi, 'calendarEvents'> = identidadApi,
): Promise<CalendarEvent[]> {
  let items: GoogleCalendarItem[];
  try {
    // Costa Rica UTC-6 (mismo rango RFC 3339 que se mandaba a Google)
    items = await api.calendarEvents(`${timeMin}T00:00:00-06:00`, `${timeMax}T23:59:59-06:00`);
  } catch {
    // Token expirado u otro error — devolver vacío para degradar elegantemente
    return [];
  }
  if (!Array.isArray(items)) return [];

  return items
    .filter((e) => e.status !== 'cancelled')
    .map((e) => {
      const allDay = Boolean(e.start?.date && !e.start?.dateTime);
      const start = e.start?.date ?? e.start?.dateTime?.split('T')[0] ?? timeMin;
      const end = e.end?.date ?? e.end?.dateTime?.split('T')[0] ?? start;
      return {
        id: e.id,
        summary: e.summary ?? '(Sin título)',
        start,
        end,
        allDay,
        colorHex: e.colorId ? (COLOR_MAP[e.colorId] ?? DEFAULT_COLOR) : DEFAULT_COLOR,
      };
    });
}
