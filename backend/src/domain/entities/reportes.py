"""Catálogo de reportes: roles con acceso a cada uno (espejo de ``src/lib/reportes/registry.ts``).

En el origen la restricción por rol solo vivía en el ``page.tsx`` (redirect a /reportes) y las RPC
``SECURITY DEFINER`` respondían a cualquier usuario activo. Aquí se aplica también en el backend.

COORDINADOR se incluye en los reportes exclusivos de ANALISTA porque es el único rol que puede
usar "Ver como" (previsualizar como analista); los datos de esos reportes siempre se acotan al
email del propio usuario, así que no ve cartera ajena.
"""

from __future__ import annotations

from domain.entities.usuario import ANALISTA, ANALISTA_RIESGO, COORDINADOR, GERENCIA, Usuario

GLOBALES = (COORDINADOR, GERENCIA)
CON_VENDEDORES = (COORDINADOR, ANALISTA, GERENCIA)

REPORTE_ROLES: dict[str, tuple[str, ...]] = {
    "resumen-ejecutivo": GLOBALES,
    "cierre-mensual": GLOBALES,
    "migracion-mora": GLOBALES,
    "mora-vendedor": CON_VENDEDORES,
    "facturas-plazo-especial": CON_VENDEDORES,
    "icp-vendedor": GLOBALES,
    "cei": GLOBALES,
    "aging-consolidado": GLOBALES,
    "efectividad-gestiones": GLOBALES,
    "estados-cuenta": CON_VENDEDORES,
    "gestiones-periodo": (ANALISTA, COORDINADOR),
    "cartera-vencida": (ANALISTA, COORDINADOR),
}

# Roles que pueden enviar reportes por correo (POST /api/reportes/enviar del origen)
ROLES_ENVIO = (COORDINADOR, ANALISTA)

DIMENSIONES_CLIENTE = ("dimension", "agrupacion")

MSG_SIN_ACCESO_REPORTE = "No tenés acceso a este reporte"
MSG_SIN_PERMISO_ENVIO = "No tenés permiso para enviar estos reportes"


def puede_ver_reporte(usuario: Usuario, reporte_id: str) -> bool:
    roles = REPORTE_ROLES.get(reporte_id, ())
    if usuario.rol in roles:
        return True
    # Estados de cuenta: ANALISTA_RIESGO con cartera propia se acota igual que ANALISTA (page.tsx)
    return (
        reporte_id == "estados-cuenta" and usuario.rol == ANALISTA_RIESGO and usuario.puede_gestionar_cartera
    )
