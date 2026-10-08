/**
 * CYC COFERSA v3.0 — Utilidades de formato
 *
 * REGLA CRÍTICA: NUNCA usar toLocaleString() para montos.
 * En algunos browsers produce espacios en lugar de puntos.
 * Siempre usar fmtCRC() o fmtM().
 */

// ── Montos CRC ────────────────────────────────────────────────────

/**
 * Formatea un número como colones costarricenses.
 * Ejemplo: 1500000 → "₡1.500.000"
 */
export function fmtCRC(n: number | null | undefined): string {
  const val = Math.round(Number(n) || 0);
  return '₡' + val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Formatea montos grandes en forma compacta para KPIs y gráficos.
 * Ejemplo: 4020000000 → "₡4.02B" | 822300000 → "₡822.3M"
 * Regla: B con 2 decimales, M con 1 decimal, menos → fmtCRC completo
 */
export function fmtM(n: number | null | undefined): string {
  const val = Math.round(Number(n) || 0);
  if (val >= 1_000_000_000) return `₡${(val / 1_000_000_000).toFixed(2)}B`;
  if (val >= 1_000_000) return `₡${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `₡${(val / 1_000).toFixed(0)}K`;
  return fmtCRC(val);
}

/**
 * Formatea montos en USD.
 * Ejemplo: 1500.50 → "$1.500,50"
 */
export function fmtUSD(n: number | null | undefined): string {
  const val = Number(n) || 0;
  const entero = Math.floor(val);
  const decimales = Math.round((val - entero) * 100)
    .toString()
    .padStart(2, '0');
  return '$' + entero.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + decimales;
}

// ── Fechas ────────────────────────────────────────────────────────

/**
 * Formatea una fecha ISO (YYYY-MM-DD o TIMESTAMPTZ) a dd/mm/yyyy.
 * Usa métodos UTC para evitar desfases por zona horaria.
 * Ejemplo: "2026-04-30T00:00:00Z" → "30/04/2026"
 */
export function fmtFecha(raw: string | null | undefined): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Formatea fecha mostrando también la hora (hh:mm).
 * Ejemplo: "2026-04-30T14:32:00Z" → "30/04/2026 · 14:32"
 */
export function fmtFechaHora(raw: string | null | undefined): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} · ${hh}:${min}`;
}

/**
 * Retorna cuántos días han pasado desde una fecha.
 * Útil para "última gestión hace X días".
 */
export function diasDesde(raw: string | null | undefined): number {
  if (!raw) return 999;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return 999;
  const hoy = new Date();
  const diff = hoy.getTime() - d.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Hoy en formato YYYY-MM-DD (zona Costa Rica UTC-6).
 */
export function hoyISO(): string {
  return new Date(Date.now() - 6 * 3600 * 1000).toISOString().split('T')[0];
}

/**
 * Formatea montos grandes para KPIs del coordinador.
 * Siempre en millones, 1 decimal, punto de miles, coma decimal.
 * Ejemplo: 5_092_800_000 → "₡5.092,8 M" | 469_000_000 → "₡469,0 M"
 */
export function fmtKPI(n: number | null | undefined): string {
  const millones = (Number(n) || 0) / 1_000_000;
  const parts = millones.toFixed(1).split('.');
  const entero = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `₡${entero},${parts[1]} M`;
}

/**
 * Monto completo con 2 decimales y puntos de miles — solo para la Ficha del Cliente.
 * Limpia decimales raros del origen con Math.round(*100)/100.
 * Ejemplo: 97342156.891 → "₡97.342.156,89"
 * NUNCA usar en tablas de listado — usar fmtCRC() o fmtM() allá.
 */
export function fmtCRC2(n: number | null | undefined): string {
  const val = Math.round((Number(n) || 0) * 100) / 100;
  const entero = Math.floor(val);
  const centavos = Math.round((val - entero) * 100)
    .toString()
    .padStart(2, '0');
  const miles = entero.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `₡${miles},${centavos}`;
}
