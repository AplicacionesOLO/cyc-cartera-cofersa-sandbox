"""Auditoría y Control Legal: catálogos y reglas puras de garantías y solicitudes de actualización.

Equivalen a ``src/lib/auditoria-legal/{catalogo,ubicacion-archivo,persona}.ts`` del origen (lo que las
API Routes usaban para validar) y a los helpers de formato ``fmtCRC`` / ``fmtFecha``.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

MSG_NO_AUTORIZADO_MODULO = "No autorizado para este módulo"

TIPOS_TITULO = ("Pagaré", "Letra de Cambio")
ESTADOS_CUSTODIA = ("EN_BOVEDA", "ENVIADO_VENDEDOR", "EN_FIRMA")
ORIGENES_REGISTRO = ("EMITIDO_SISTEMA", "EXISTENTE_FISICA")
ESTADOS_CIVILES = ("Soltero", "Casado", "Divorciado", "Unión Libre")

ESTADO_CUSTODIA_LABEL = {
    "EN_BOVEDA": "En Bóveda",
    "ENVIADO_VENDEDOR": "Enviado a Vendedor",
    "EN_FIRMA": "En Firma",
}


@dataclass(frozen=True)
class AccionCustodia:
    label: str
    desde: tuple[str, ...]
    hacia: str
    evento: str


ACCION_CUSTODIA_CFG = {
    "ENTREGAR": AccionCustodia(
        "Despachar a Vendedor", ("EN_BOVEDA",), "ENVIADO_VENDEDOR", "ENTREGA_A_VENDEDOR"
    ),
    "TRAMITE_FIRMA": AccionCustodia(
        "Enviar a Trámite de Firma", ("ENVIADO_VENDEDOR",), "EN_FIRMA", "TRAMITE_DE_FIRMA"
    ),
    "REINGRESAR": AccionCustodia(
        "Reingresar a Custodia", ("ENVIADO_VENDEDOR", "EN_FIRMA"), "EN_BOVEDA", "REINGRESO_A_CUSTODIA"
    ),
}

# value → nombre corto (ubicacion-archivo.ts)
MUEBLES_ARCHIVO = {
    "ARCHIVERO_1": "Archivero 1",
    "ARCHIVERO_2": "Archivero 2",
    "BOVEDA_SEGURIDAD": "Bóveda de Seguridad",
}
GAVETAS_ARCHIVO = {
    "GAVETA_A": "Gaveta A",
    "GAVETA_B": "Gaveta B",
    "GAVETA_C": "Gaveta C",
    "GAVETA_D": "Gaveta D",
}
TOPE_GARANTIAS_POR_CARPETA = 25

# Campos que PATCH /garantias/{id} rechaza (400) en vez de ignorar en silencio.
CAMPOS_NO_EDITABLES = (
    "contribuyente",
    "cliente_nombre",
    "activo",
    "reemplazada_por_id",
    "estado_custodia",
    "documento_pdf_url",
    "analista_email",
    "vendedor_cod",
    "registrado_por",
    "id",
    "origen_registro",
)
# Campos impresos en el texto del pagaré: congelados una vez generado.
CAMPOS_CONGELADOS_POR_PAGARE = (
    "tipo_titulo",
    "monto_garantizado",
    "tiene_fiador",
    "fiador_nombre",
    "fiador_cedula",
    "fiador_telefono",
    "representante_legal",
    "fecha_emision",
    "fecha_vencimiento",
)
ETIQUETAS_CAMPOS = {
    "tipo_titulo": "Tipo de título",
    "monto_garantizado": "Monto",
    "tiene_fiador": "Fiador",
    "representante_legal": "Representante legal",
    "fecha_emision": "Fecha de emisión",
    "fecha_vencimiento": "Fecha de vencimiento",
    "fiador_nombre": "Nombre del fiador",
    "fiador_cedula": "Cédula del fiador",
    "fiador_telefono": "Teléfono del fiador",
}

# Solicitudes de actualización de perfil (portal público por token)
ESTADOS_SOLICITUD_SEGUIMIENTO = ("ENVIADA", "DATOS_RECIBIDOS", "APROBADA", "EXPIRADA")
MAX_SOLICITUDES_POR_HORA = 30
MAX_LEN_NOTA_REVISION = 500
DIAS_VIGENCIA_TOKEN = 7
MAX_MB_IMAGEN = 1
MAX_MB_PDF = 3
MAX_LEN_LARGO = 200
MAX_LEN_CORTO = 30
MIME_A_EXT_CEDULA = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
MAX_MB_DOCUMENTO_GARANTIA = 4


def es_mueble_valido(value: object) -> bool:
    return isinstance(value, str) and value in MUEBLES_ARCHIVO


def es_gaveta_valida(value: object) -> bool:
    return isinstance(value, str) and value in GAVETAS_ARCHIVO


def formatear_ubicacion_archivo(mueble: str, gaveta: str, carpeta: int) -> str:
    """'Archivero 1 · Gaveta A · Carpeta 04' (mismo texto que ``formatearUbicacionArchivo``)."""
    return (
        f"{MUEBLES_ARCHIVO.get(mueble, mueble)} · {GAVETAS_ARCHIVO.get(gaveta, gaveta)} · "
        f"Carpeta {str(carpeta).zfill(2)}"
    )


def es_persona_juridica(contribuyente: str) -> bool:
    """Cédula jurídica en Costa Rica: 10 dígitos que empiezan con 3."""
    value = (contribuyente or "").strip()
    return len(value) == 10 and value.startswith("3")


def fmt_crc(value: object) -> str:
    """``fmtCRC``: '₡1.234.567' (redondeo a entero, punto como separador de miles)."""
    try:
        number = Decimal(str(value or 0))
    except ArithmeticError:
        number = Decimal(0)
    entero = int(number.quantize(Decimal(1), rounding=ROUND_HALF_UP))
    signo = "-" if entero < 0 else ""
    return f"₡{signo}{abs(entero):,}".replace(",", ".")


def fmt_fecha(value: object) -> str:
    """``fmtFecha``: 'dd/mm/aaaa' (o '—' si no hay fecha)."""
    if value in (None, ""):
        return "—"
    if isinstance(value, date):
        d = value
    else:
        try:
            d = date.fromisoformat(str(value)[:10])
        except ValueError:
            return str(value)
    return f"{d.day:02d}/{d.month:02d}/{d.year}"
