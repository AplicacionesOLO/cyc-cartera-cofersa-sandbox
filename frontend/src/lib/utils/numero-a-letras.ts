// src/lib/utils/numero-a-letras.ts
//
// Convierte un monto entero en colones a su expresión formal en letras, para
// el texto legal de un pagaré (ej. 2500000 -> "DOS MILLONES QUINIENTOS MIL
// COLONES EXACTOS"). Sin céntimos: los montos de este sistema siempre son
// enteros (fmtCRC ya redondea, ver src/lib/utils/formato.ts).
//
// Límite: hasta ₡999.999.999 -- muy por encima de cualquier monto_garantizado
// real (la cartera completa de Cofersa es ₡4.02B, pero eso es la suma de
// miles de facturas, no el monto de un solo título). Un monto mayor lanza,
// no trunca en silencio.
//
// Validación de entrada: NaN/Infinity/no-numérico y montos negativos lanzan
// explícitamente en vez de resolverse en silencio (ej. NaN caía por los tres
// branches de partes[] sin agregar nada y devolvía " COLONES EXACTOS" vacío).
// Este es texto de un documento legal firmado por un cliente real -- para eso
// mismo existe el constraint monto_garantizado > 0 en la base de datos, pero
// esta función no debe confiar únicamente en eso ni reinterpretar el signo
// con Math.abs() sin avisar.
//
// Nota conocida: no maneja el singular ("UN COLÓN EXACTO" para monto=1) --
// no es un caso real para un pagaré de garantía, así que no se resuelve.

const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const ESPECIALES_10_19 = [
  'DIEZ',
  'ONCE',
  'DOCE',
  'TRECE',
  'CATORCE',
  'QUINCE',
  'DIECISÉIS',
  'DIECISIETE',
  'DIECIOCHO',
  'DIECINUEVE',
];
const ESPECIALES_20_29 = [
  'VEINTE',
  'VEINTIUNO',
  'VEINTIDÓS',
  'VEINTITRÉS',
  'VEINTICUATRO',
  'VEINTICINCO',
  'VEINTISÉIS',
  'VEINTISIETE',
  'VEINTIOCHO',
  'VEINTINUEVE',
];
const DECENAS = [
  '',
  '',
  '',
  'TREINTA',
  'CUARENTA',
  'CINCUENTA',
  'SESENTA',
  'SETENTA',
  'OCHENTA',
  'NOVENTA',
];
const CENTENAS = [
  '',
  'CIENTO',
  'DOSCIENTOS',
  'TRESCIENTOS',
  'CUATROCIENTOS',
  'QUINIENTOS',
  'SEISCIENTOS',
  'SETECIENTOS',
  'OCHOCIENTOS',
  'NOVECIENTOS',
];

/** 0-99 */
function dosDigitos(n: number): string {
  if (n < 10) return UNIDADES[n];
  if (n < 20) return ESPECIALES_10_19[n - 10];
  if (n < 30) return ESPECIALES_20_29[n - 20];
  const d = Math.floor(n / 10);
  const u = n % 10;
  return u === 0 ? DECENAS[d] : `${DECENAS[d]} Y ${UNIDADES[u]}`;
}

/** 0-999 */
function tresDigitos(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  if (c === 0) return dosDigitos(resto);
  if (resto === 0) return CENTENAS[c];
  return `${CENTENAS[c]} ${dosDigitos(resto)}`;
}

// Apócope de "uno" antes de un sustantivo ("veintiún mil", "un millón" ya se
// maneja aparte como caso especial). Sólo afecta la última palabra del token.
//
// "VEINTIUNO" se ancla al FINAL del string (no exige límite de palabra antes):
// cuando hay una centena delante ("CIENTO VEINTIUNO", "QUINIENTOS VEINTIUNO")
// el texto ya no es exactamente 'VEINTIUNO', y el regex de respaldo /\bUNO$/
// tampoco lo detecta porque \b no marca límite dentro de la palabra fusionada
// "VEINTIUNO" (no hay borde entre la "I" y la "U"). Se reemplaza primero para
// que la segunda regla ya no pueda chocar con ella.
function apocope(texto: string): string {
  return texto.replace(/VEINTIUNO$/, 'VEINTIÚN').replace(/\bUNO$/, 'UN');
}

export function numeroALetras(monto: number): string {
  if (!Number.isFinite(monto))
    throw new Error(`numeroALetras: monto inválido (se recibió ${monto})`);
  if (monto < 0)
    throw new Error(
      `numeroALetras: monto inválido (se recibió ${monto}, debe ser un monto positivo)`,
    );

  const n = Math.round(monto);
  if (n > 999_999_999) throw new Error('numeroALetras: monto fuera de rango (máximo ₡999.999.999)');
  if (n === 0) return 'CERO COLONES EXACTOS';

  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;

  const partes: string[] = [];
  if (millones > 0)
    partes.push(millones === 1 ? 'UN MILLÓN' : `${apocope(tresDigitos(millones))} MILLONES`);
  if (miles > 0) partes.push(miles === 1 ? 'MIL' : `${apocope(tresDigitos(miles))} MIL`);
  if (resto > 0) partes.push(apocope(tresDigitos(resto)));

  return `${partes.join(' ')} COLONES EXACTOS`;
}
