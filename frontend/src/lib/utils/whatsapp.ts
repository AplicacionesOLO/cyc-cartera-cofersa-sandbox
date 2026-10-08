// Arma un link de WhatsApp Web (wa.me) a partir de un teléfono almacenado en BD.
// Antepone el código de país de Costa Rica (506) si el número no lo trae ya.
export function buildWhatsAppUrl(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  const tel = telefono.replace(/\D/g, '');
  if (!tel) return null;
  const numero = tel.startsWith('506') ? tel : '506' + tel;
  return `https://wa.me/${numero}`;
}
