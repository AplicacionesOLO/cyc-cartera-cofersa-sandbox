"""Repository en memoria de Auditoría y Control Legal."""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from application.ports.auditoria_legal import AuditoriaLegalRepository

Row = dict[str, Any]

GARANTIA_BASE: Row = {
    "contribuyente": "3101000001",
    "cliente_nombre": "FERRETERIA PRUEBA S.A.",
    "tipo_titulo": "Pagaré",
    "monto_garantizado": Decimal("1000000"),
    "tiene_fiador": False,
    "fiador_nombre": None,
    "fiador_cedula": None,
    "fiador_telefono": None,
    "representante_legal": "JUAN PEREZ",
    "fecha_emision": date(2026, 1, 10),
    "fecha_vencimiento": date(2027, 1, 10),
    "ubicacion_archivero": "Archivero 1 · Gaveta A · Carpeta 01",
    "ubicacion_archivero_mueble": "ARCHIVERO_1",
    "ubicacion_archivero_gaveta": "GAVETA_A",
    "ubicacion_archivero_carpeta": 1,
    "estado_custodia": "EN_BOVEDA",
    "documento_pdf_url": None,
    "activo": True,
    "reemplazada_por_id": None,
    "analista_email": "ana@cofersa.cr",
    "vendedor_cod": "V01",
    "documento_pagare_generado_en": None,
    "consecutivo": "PAG-2026-0001",
    "origen_registro": "EMITIDO_SISTEMA",
}


class FakeAuditoriaLegalRepository(AuditoriaLegalRepository):
    def __init__(self) -> None:
        self.garantias: dict[int, Row] = {}
        self.eventos_rows: list[Row] = []
        self.personas: dict[str, Row] = {}
        self.solicitudes: dict[int, Row] = {}
        self.notificaciones: list[Row] = []
        self.vendedores: dict[str, Row] = {
            "V01": {
                "email": "vend@cofersa.cr",
                "nombre": "Vendedor Uno",
                "supervisor_cod": "S01",
                "activo": True,
            }
        }
        self.supervisores: dict[str, str] = {"S01": "sup@cofersa.cr"}
        self.config: dict[str, str] = {}
        self.responsables: Row = {
            "analista_email": "ana@cofersa.cr",
            "vendedor_cod": "V01",
            "hay_conflicto_analista": False,
        }
        self.vendedores_contribuyente: list[Row] = [
            {"vendedor_cod": "V01", "vendedor_nombre": "Vendedor Uno", "saldo": Decimal(10)}
        ]
        self.coordinador_id: UUID | None = None
        self._consecutivo = 0
        self._next_id = 1

    def add_garantia(self, **extra: Any) -> int:
        gid = extra.pop("id", self._next_id)
        self._next_id = max(self._next_id, gid) + 1
        self.garantias[gid] = {**GARANTIA_BASE, "id": gid, **extra}
        return gid

    def add_solicitud(self, **extra: Any) -> int:
        sid = extra.pop("id", len(self.solicitudes) + 1)
        self.solicitudes[sid] = {
            "id": sid,
            "contribuyente": "3101000001",
            "cliente_nombre": "FERRETERIA PRUEBA S.A.",
            "tipo_persona": "JURIDICA",
            "estado": "ENVIADA",
            "token_hash": "x",
            "datos_temporales": None,
            "url_cedula": None,
            "url_personeria": None,
            "enviada_en": datetime.now(UTC),
            "respondida_en": None,
            "aprobada_en": None,
            "aprobada_por": None,
            "garantia_id": None,
            "nota_revision": None,
            "correo_destino": "cli@x.com",
            "enviada_por": None,
            "token_expira_en": datetime(2099, 1, 1, tzinfo=UTC),
            **extra,
        }
        return sid

    # lecturas
    def lista_garantias(self, analista_email):
        return [
            dict(g)
            for g in self.garantias.values()
            if g["activo"] and (analista_email is None or g["analista_email"] == analista_email)
        ]

    def clientes_sin_garantia(self, analista_email):
        return [{"contribuyente": "999", "analista_email": analista_email}]

    def vendedores_activos(self):
        return [{"cod": c, "nombre": v["nombre"]} for c, v in self.vendedores.items() if v["activo"]]

    def vendedor(self, cod):
        v = self.vendedores.get(cod)
        return {k: v[k] for k in ("email", "nombre", "supervisor_cod")} if v else None

    def email_supervisor(self, cod):
        return self.supervisores.get(cod)

    def eventos(self, garantia_id):
        return [e for e in reversed(self.eventos_rows) if e["garantia_id"] == garantia_id]

    def buscar_contribuyentes(self, texto):
        return [{"contribuyente": "3101000001", "cliente_nombre": texto.upper(), "n_codigos": 1}]

    def saldo_contribuyente(self, contribuyente):
        return {"saldo_actual": Decimal(100), "monto_objetivo": Decimal(110)}

    def garantia_activa(self, contribuyente):
        g = next(
            (g for g in self.garantias.values() if g["contribuyente"] == contribuyente and g["activo"]), None
        )
        return {k: g[k] for k in ("id", "tipo_titulo", "monto_garantizado")} if g else None

    def vendedores_por_contribuyente(self, contribuyente):
        return list(self.vendedores_contribuyente)

    def personas_legales(self, cedulas):
        return [p for c, p in self.personas.items() if c in cedulas]

    def config_valores(self, claves):
        return {k: v for k, v in self.config.items() if k in claves}

    def contar_en_carpeta(self, mueble, gaveta, carpeta, excluir_id):
        return sum(
            1
            for g in self.garantias.values()
            if (
                g["ubicacion_archivero_mueble"],
                g["ubicacion_archivero_gaveta"],
                g["ubicacion_archivero_carpeta"],
            )
            == (mueble, gaveta, carpeta)
            and g["estado_custodia"] == "EN_BOVEDA"
            and g["activo"]
            and g["id"] != excluir_id
        )

    def siguiente_carpeta(self, mueble, gaveta, desde):
        carpeta = desde
        while self.contar_en_carpeta(mueble, gaveta, carpeta, None) >= 25:
            carpeta += 1
        return carpeta

    def garantia(self, garantia_id):
        g = self.garantias.get(garantia_id)
        return dict(g) if g else None

    # escrituras
    def resolver_responsables(self, contribuyente):
        return dict(self.responsables)

    def siguiente_consecutivo(self):
        self._consecutivo += 1
        return f"PAG-2026-{self._consecutivo:04d}"

    def desactivar_garantia(self, garantia_id):
        self.garantias[garantia_id]["activo"] = False

    def insertar_garantia(self, datos):
        if any(g["contribuyente"] == datos["contribuyente"] and g["activo"] for g in self.garantias.values()):
            raise AssertionError("violación de uidx_garantias_contribuyente_partial")
        return self.add_garantia(
            **datos, documento_pdf_url=None, reemplazada_por_id=None, documento_pagare_generado_en=None
        )

    def vincular_reemplazo(self, anterior_id, nueva_id):
        self.garantias[anterior_id]["reemplazada_por_id"] = nueva_id

    def registrar_evento(self, garantia_id, tipo_evento, usuario_id, nota):
        self.eventos_rows.append(
            {
                "id": len(self.eventos_rows) + 1,
                "garantia_id": garantia_id,
                "tipo_evento": tipo_evento,
                "usuario_id": usuario_id,
                "nota": nota,
            }
        )

    def id_coordinador(self):
        return self.coordinador_id

    def crear_notificacion(self, usuario_id, tipo, titulo, mensaje, link):
        self.notificaciones.append(
            {"usuario_id": usuario_id, "tipo": tipo, "titulo": titulo, "mensaje": mensaje}
        )

    def actualizar_garantia(self, garantia_id, cambios, *, sin_pagare):
        g = self.garantias.get(garantia_id)
        if not g or not g["activo"] or (sin_pagare and g["documento_pagare_generado_en"]):
            return False
        g.update(cambios)
        return True

    def actualizar_custodia(self, garantia_id, estado_actual, cambios):
        g = self.garantias.get(garantia_id)
        if not g or g["estado_custodia"] != estado_actual:
            return False
        g.update(cambios)
        return True

    def set_documento(self, garantia_id, ruta):
        self.garantias[garantia_id]["documento_pdf_url"] = ruta

    def generar_pagare(self, garantia_id, cambios):
        g = self.garantias.get(garantia_id)
        if not g or not g["activo"] or g["documento_pagare_generado_en"]:
            return False
        g.update(cambios)
        return True

    def upsert_persona_legal(self, persona):
        previa = self.personas.get(persona["cedula"], {})
        self.personas[persona["cedula"]] = {"telefono": previa.get("telefono"), **persona}

    def contar_solicitudes_desde(self, usuario_id, desde):
        return sum(
            1
            for s in self.solicitudes.values()
            if s["enviada_por"] == usuario_id and s["enviada_en"] >= desde
        )

    def crear_solicitud(self, datos):
        if any(
            s["contribuyente"] == datos["contribuyente"] and s["estado"] in ("ENVIADA", "DATOS_RECIBIDOS")
            for s in self.solicitudes.values()
        ):
            return None
        return self.add_solicitud(**datos)

    def solicitudes_seguimiento(self):
        return [dict(s) for s in self.solicitudes.values() if s["estado"] != "CANCELADA"]

    def solicitud(self, solicitud_id):
        s = self.solicitudes.get(solicitud_id)
        return dict(s) if s else None

    def solicitud_por_token_hash(self, token_hash):
        return next((dict(s) for s in self.solicitudes.values() if s["token_hash"] == token_hash), None)

    def cambiar_estado_solicitud(self, solicitud_id, desde, cambios):
        s = self.solicitudes.get(solicitud_id)
        if not s or s["estado"] not in desde:
            return False
        s.update(cambios)
        return True
