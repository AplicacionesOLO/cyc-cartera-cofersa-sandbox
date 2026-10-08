"""Usuario del SIC (tabla ``usuarios`` del origen) y reglas de rol.

El valor de ``rol`` se conserva tal cual (COORDINADOR / ANALISTA / ANALISTA_RIESGO / GERENCIA):
decenas de reglas lo comparan como string exacto.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

COORDINADOR = "COORDINADOR"
ANALISTA = "ANALISTA"
ANALISTA_RIESGO = "ANALISTA_RIESGO"
GERENCIA = "GERENCIA"
ROLES = (COORDINADOR, ANALISTA, ANALISTA_RIESGO, GERENCIA)
ROLES_PREVIEW = (ANALISTA, ANALISTA_RIESGO, GERENCIA)
# Roles con visión global (todas las carteras); GERENCIA en solo lectura.
ROLES_GLOBALES = (COORDINADOR, GERENCIA)


@dataclass(frozen=True)
class Usuario:
    id: UUID
    email: str
    nombre: str
    rol: str
    iniciales: str
    color: str
    activo: bool = True
    telefono: str | None = None
    whatsapp: str | None = None
    tiene_cartera_asignada: bool = False

    @property
    def es_coordinador(self) -> bool:
        return self.rol == COORDINADOR

    @property
    def es_global(self) -> bool:
        return self.rol in ROLES_GLOBALES

    @property
    def es_solo_lectura(self) -> bool:
        """GERENCIA ve lo mismo que COORDINADOR pero no crea/edita/aprueba (esSoloLectura)."""
        return self.rol == GERENCIA

    @property
    def puede_gestionar_cartera(self) -> bool:
        """Mismo criterio que ``puedeGestionarCartera`` del front (caso ANALISTA_RIESGO con cartera)."""
        return self.rol == ANALISTA or (self.rol == ANALISTA_RIESGO and self.tiene_cartera_asignada)

    def to_dict(self) -> dict[str, Any]:
        """Forma de ``PerfilUsuarioActual`` del front."""
        return {
            "id": str(self.id),
            "nombre": self.nombre,
            "email": self.email,
            "rol": self.rol,
            "iniciales": self.iniciales,
            "color": self.color,
            "telefono": self.telefono,
            "whatsapp": self.whatsapp,
            "tiene_cartera_asignada": self.tiene_cartera_asignada,
        }
