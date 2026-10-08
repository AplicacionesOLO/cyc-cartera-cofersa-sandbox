"""Repository en memoria del módulo Solicitudes."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from application.ports.solicitudes import SolicitudesRepository


class FakeSolicitudesRepository(SolicitudesRepository):
    def __init__(self) -> None:
        self.solicitudes: dict[UUID, dict[str, Any]] = {}
        self.comentarios: list[dict[str, Any]] = []
        self.historial: list[dict[str, Any]] = []
        self.notificaciones: list[dict[str, Any]] = []
        self.usuarios: dict[UUID, dict[str, Any]] = {}  # id → {email, nombre, rol}
        self.gestiones: dict[UUID, dict[str, Any]] = {}
        self.cartera: list[dict[str, Any]] = []
        self.maestro: list[dict[str, Any]] = []
        self.facturas: list[dict[str, Any]] = []
        self._consecutivo = 0

    def add_usuario(self, usuario) -> None:
        self.usuarios[usuario.id] = {"email": usuario.email, "nombre": usuario.nombre, "rol": usuario.rol}

    def add_solicitud(self, **values: Any) -> dict[str, Any]:
        self._consecutivo += 1
        row = {
            "id": uuid4(),
            "estado": "PENDIENTE",
            "tipo": "AUMENTO_LIMITE",
            "cliente_cod": "C1",
            "cliente_nombre": "Cliente Uno",
            "solicitante_id": None,
            "gestion_id": None,
            "datos": None,
            "numero_consecutivo": self._consecutivo,
            "created_at": datetime.now(UTC),
            **values,
        }
        self.solicitudes[row["id"]] = row
        return row

    def list_solicitudes(self, solicitante_id: UUID | None) -> list[dict[str, Any]]:
        rows = [
            r
            for r in self.solicitudes.values()
            if solicitante_id is None or r["solicitante_id"] == solicitante_id
        ]
        return sorted(rows, key=lambda r: r["created_at"], reverse=True)

    def find_solicitud(self, solicitud_id: UUID) -> dict[str, Any] | None:
        row = self.solicitudes.get(solicitud_id)
        return dict(row) if row else None

    def insert_solicitud(self, values: dict[str, Any]) -> dict[str, Any]:
        row = self.add_solicitud(**values)
        return {"id": row["id"], "numero_consecutivo": row["numero_consecutivo"]}

    def update_estado(self, solicitud_id: UUID, estado: str) -> None:
        self.solicitudes[solicitud_id]["estado"] = estado

    def resolver_solicitud(
        self, solicitud_id: UUID, estado: str, comentario: str | None, revisor_id: UUID | None
    ) -> None:
        self.solicitudes[solicitud_id].update(
            estado=estado, comentario_revisor=comentario, revisor_id=revisor_id
        )

    def list_comentarios(self, solicitud_id: UUID) -> list[dict[str, Any]]:
        return [c for c in self.comentarios if c["solicitud_id"] == solicitud_id]

    def insert_comentario(self, solicitud_id: UUID, usuario_id: UUID, contenido: str) -> dict[str, Any]:
        row = {
            "id": uuid4(),
            "solicitud_id": solicitud_id,
            "usuario_id": usuario_id,
            "contenido": contenido,
            "created_at": datetime.now(UTC),
        }
        self.comentarios.append(row)
        return {"id": row["id"], "contenido": contenido, "created_at": row["created_at"]}

    def list_historial(self, solicitud_id: UUID) -> list[dict[str, Any]]:
        return [h for h in reversed(self.historial) if h["solicitud_id"] == solicitud_id]

    def insert_historial(self, solicitud_id, estado_anterior, estado_nuevo, usuario_id, nota) -> None:
        self.historial.append(
            {
                "id": uuid4(),
                "solicitud_id": solicitud_id,
                "estado_anterior": estado_anterior,
                "estado_nuevo": estado_nuevo,
                "usuario_id": usuario_id,
                "nota": nota,
                "created_at": datetime.now(UTC),
            }
        )

    def insert_notificacion(self, usuario_id, tipo, titulo, mensaje, link) -> None:
        self.notificaciones.append(
            {"usuario_id": usuario_id, "tipo": tipo, "titulo": titulo, "mensaje": mensaje, "link": link}
        )

    def find_coordinador_id(self) -> UUID | None:
        return next((i for i, u in self.usuarios.items() if u["rol"] == "COORDINADOR"), None)

    def existe_usuario_email(self, email: str) -> bool:
        return any(u["email"].lower() == email.lower() for u in self.usuarios.values())

    def nombres_usuarios(self, ids: list[UUID]) -> dict[str, str]:
        return {str(i): self.usuarios[i]["nombre"] for i in ids if i in self.usuarios}

    def nombres_por_email(self, emails: list[str]) -> dict[str, str]:
        return {u["email"]: u["nombre"] for u in self.usuarios.values() if u["email"] in emails}

    def find_gestion(self, gestion_id: UUID) -> dict[str, Any] | None:
        return self.gestiones.get(gestion_id)

    def list_cartera_resumen(self) -> list[dict[str, Any]]:
        return sorted(self.cartera, key=lambda c: c["cliente_nombre"])

    def list_maestro_resumen(self, analista_email: str | None) -> list[dict[str, Any]]:
        return [m for m in self.maestro if analista_email is None or m["analista_email"] == analista_email]

    def find_cartera(self, cliente_cod: str) -> dict[str, Any] | None:
        return next((c for c in self.cartera if c["cliente_cod"] == cliente_cod), None)

    def find_maestro(self, cliente_cod: str) -> dict[str, Any] | None:
        return next((m for m in self.maestro if m["cliente_cod"] == cliente_cod), None)

    def list_facturas_pendientes(self, contribuyente: str, limit: int = 100) -> list[dict[str, Any]]:
        rows = [f for f in self.facturas if f["contribuyente"] == contribuyente and f["saldo"] > 0]
        return sorted(rows, key=lambda f: f["saldo"], reverse=True)[:limit]
