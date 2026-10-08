"""Catálogos de Configuración (solo COORDINADOR para listar/escribir): usuarios, vendedores,
supervisores, directorio de la empresa y rutas de portafolio acotado.

Reemplaza las API Routes ``/api/configuracion/{usuarios,vendedores,supervisores,directorio,
portafolio-acotado}`` (+ ``/[id|cod|principal_cod]``). Cada escritura queda en ``config_audit_log``.
El autocomplete del directorio (``DirectorioInput``) lo puede leer cualquier usuario activo.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from application.dto.principal import Principal
from application.use_cases.common import require_usuario
from application.use_cases.configuracion import ConfiguracionBase, coordinador, registrar_auditoria
from domain.entities.configuracion import (
    AREAS_VALIDAS,
    CARGO_JEFE_REGIONAL_DEFAULT,
    COLOR_DEFAULT,
    DOMINIOS_PERMITIDOS,
    EMAIL_RE,
    ROLES_VALIDOS,
    TIPO_CANAL_DEFAULT,
)
from domain.exceptions import ConflictError, NotFoundError, ValidationError

MSG_ROL_INVALIDO = f"rol debe ser uno de: {', '.join(ROLES_VALIDOS)}"
MSG_CORREO_INVALIDO = "Formato de correo inválido"


def _texto(value: Any) -> str:
    return str(value or "").strip()


def _email_valido(value: Any) -> bool:
    return bool(EMAIL_RE.match(str(value)))


def _uuid_o_404(raw: str, message: str) -> UUID:
    try:
        return UUID(str(raw))
    except ValueError as error:
        raise NotFoundError(message) from error


def _pick(row: dict[str, Any], keys: tuple[str, ...]) -> dict[str, Any]:
    return {k: row.get(k) for k in keys}


def _miembros_unicos(raw: Any) -> list[str]:
    """``Array.from(new Set(miembros.map(trim).filter(Boolean)))``."""
    items = raw if isinstance(raw, list) else []
    return list(dict.fromkeys(_texto(m) for m in items if _texto(m)))


def _ahora_iso() -> str:
    return datetime.now(UTC).isoformat()


# ── usuarios ──────────────────────────────────────────────────────────────
class ListUsuariosConfigUseCase(ConfiguracionBase):
    def execute(self, principal: Principal) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            coordinador(uow, principal)
            return {"data": uow.configuracion.list_usuarios()}


class CreateUsuarioUseCase(ConfiguracionBase):
    """Alta en ``usuarios`` = acceso al SIC (el primer login con Google se vincula por email)."""

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = coordinador(uow, principal)
            nombre, email = _texto(body.get("nombre")), _texto(body.get("email"))
            if not nombre or not email:
                raise ValidationError("nombre y email son requeridos")
            rol = body.get("rol")
            if rol not in ROLES_VALIDOS:
                raise ValidationError(MSG_ROL_INVALIDO)
            partes = str(body["email"]).split("@")
            if len(partes) < 2 or partes[1] not in DOMINIOS_PERMITIDOS:
                raise ValidationError("Solo se permiten correos @cofersa.cr o @mayoreo.biz")
            iniciales_raw = body.get("iniciales")
            iniciales = (
                str(iniciales_raw)[:2].upper()
                if iniciales_raw is not None
                else "".join(p[:1] for p in str(body["nombre"]).split(" "))[:2].upper()
            )
            fila = uow.configuracion.insert_usuario(
                {
                    "nombre": nombre,
                    "email": email.lower(),
                    "rol": rol,
                    "iniciales": iniciales,
                    "color": body.get("color") or COLOR_DEFAULT,
                    "activo": True,
                    "meta_individual": body.get("meta_individual") or 0,
                    "telefono": body.get("telefono"),
                    "whatsapp": body.get("whatsapp"),
                }
            )
            registrar_auditoria(
                uow,
                usuario,
                tabla="usuarios",
                accion="INSERT",
                descripcion=f"Usuario {body['email']} ({rol}) creado",
                valor_nuevo={"nombre": body["nombre"], "email": body["email"], "rol": rol},
            )
            uow.commit()
        return {"data": fila}


class UpdateUsuarioUseCase(ConfiguracionBase):
    """Editable: nombre, rol, activo, meta_individual, telefono, whatsapp, iniciales, color (no email)."""

    _CAMPOS = ("nombre", "rol", "activo", "meta_individual", "telefono", "whatsapp", "color")

    def execute(self, principal: Principal, usuario_id: str, body: dict[str, Any]) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = coordinador(uow, principal)
            if body.get("rol") and body["rol"] not in ROLES_VALIDOS:
                raise ValidationError(MSG_ROL_INVALIDO)
            uid = _uuid_o_404(usuario_id, "Usuario no encontrado")
            actual = uow.configuracion.get_usuario(uid)
            if actual is None:
                raise NotFoundError("Usuario no encontrado")
            anterior = _pick(actual, ("nombre", "rol", "activo", "email"))
            cambios = {k: body[k] for k in self._CAMPOS if k in body}
            if "iniciales" in body:
                cambios["iniciales"] = str(body["iniciales"] or "")[:2].upper()
            fila = uow.configuracion.update_usuario(uid, cambios)
            if "activo" in body:
                desc = f"Usuario {anterior['email']} {'activado' if body['activo'] else 'desactivado'}"
            elif "rol" in body:
                desc = f"Usuario {anterior['email']} cambió rol: {anterior['rol']} → {body['rol']}"
            else:
                desc = f"Usuario {anterior['email']} actualizado"
            registrar_auditoria(
                uow,
                usuario,
                tabla="usuarios",
                accion="UPDATE",
                descripcion=desc,
                valor_anterior=anterior,
                valor_nuevo=cambios,
            )
            uow.commit()
        return {"data": fila}


# ── vendedores ────────────────────────────────────────────────────────────
class ListVendedoresConfigUseCase(ConfiguracionBase):
    def execute(self, principal: Principal) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            coordinador(uow, principal)
            vendedores = uow.configuracion.list_vendedores(solo_activos=True)
            supervisores = uow.configuracion.list_supervisores(solo_activos=True)
        nombres = {s["cod"]: s["nombre"] for s in supervisores}
        return {
            "data": [
                {
                    **v,
                    "supervisor_nombre": nombres.get(v["supervisor_cod"])
                    if v.get("supervisor_cod")
                    else None,
                }
                for v in vendedores
            ]
        }


class CreateVendedorUseCase(ConfiguracionBase):
    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = coordinador(uow, principal)
            cod, nombre = _texto(body.get("cod")), _texto(body.get("nombre"))
            if not cod or not nombre:
                raise ValidationError("cod y nombre son requeridos")
            fila = uow.configuracion.insert_vendedor(
                {
                    "cod": cod,
                    "nombre": nombre,
                    "email": body.get("email"),
                    "zona": body.get("zona"),
                    "telefono": body.get("telefono"),
                    "supervisor_cod": body.get("supervisor_cod"),
                    "analista_email": body.get("analista_email"),
                    "tipo_canal": body.get("tipo_canal") or TIPO_CANAL_DEFAULT,
                    "activo": True,
                    "asignado_por": usuario.email,
                    "asignado_en": datetime.now(UTC),
                }
            )
            registrar_auditoria(
                uow,
                usuario,
                tabla="vendedores",
                accion="INSERT",
                descripcion=f"Vendedor {body['cod']} ({body['nombre']}) creado",
                valor_nuevo=body,
            )
            uow.commit()
        return {"data": fila}


def _bloquear_si_principal_de_ruta(uow: Any, cod: str) -> None:
    """No se desactiva un vendedor que es principal de una ruta de portafolio acotado activa."""
    ruta = uow.configuracion.ruta_activa_de_principal(cod)
    if ruta is not None:
        raise ConflictError(
            f'No se puede desactivar: es el principal de la ruta "{ruta}". Reasigná esa ruta a otro '
            "vendedor o desactivala primero."
        )


class UpdateVendedorUseCase(ConfiguracionBase):
    """Reasigna analista (el trigger fn_propagar_analista_vendedor lo propaga a maestro_clientes)."""

    _CAMPOS = ("supervisor_cod", "zona", "nombre", "email", "telefono", "tipo_canal", "activo")
    _AUDIT = ("analista_email", "nombre", "zona", "supervisor_cod", "email", "telefono")

    def execute(self, principal: Principal, cod: str, body: dict[str, Any]) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = coordinador(uow, principal)
            actual = uow.configuracion.get_vendedor(cod)
            if actual is None:
                raise NotFoundError("Vendedor no encontrado")
            anterior = _pick(actual, self._AUDIT)
            cambios: dict[str, Any] = {}
            if "analista_email" in body:
                cambios.update(
                    analista_email=body["analista_email"],
                    asignado_por=usuario.email,
                    asignado_en=datetime.now(UTC),
                )
            cambios.update({k: body[k] for k in self._CAMPOS if k in body})
            if body.get("activo") is False:
                _bloquear_si_principal_de_ruta(uow, cod)
            fila = uow.configuracion.update_vendedor(cod, cambios)
            if "analista_email" in body:
                desc = (
                    f"Vendedor {cod} reasignado: {anterior['analista_email'] or 'sin asignación'} → "
                    f"{body['analista_email'] or 'sin asignación'}"
                )
            elif body.get("activo") is True:
                desc = f"Vendedor {cod} reactivado"
            else:
                desc = f"Vendedor {cod} actualizado"
            registrar_auditoria(
                uow,
                usuario,
                tabla="vendedores",
                accion="UPDATE",
                descripcion=desc,
                valor_anterior=anterior,
                valor_nuevo=cambios,
            )
            uow.commit()
        return {"data": fila}


class DeactivateVendedorUseCase(ConfiguracionBase):
    def execute(self, principal: Principal, cod: str) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = coordinador(uow, principal)
            _bloquear_si_principal_de_ruta(uow, cod)
            uow.configuracion.update_vendedor(cod, {"activo": False})
            registrar_auditoria(
                uow,
                usuario,
                tabla="vendedores",
                accion="DELETE",
                descripcion=f"Vendedor {cod} desactivado",
                valor_nuevo={"activo": False},
            )
            uow.commit()
        return {"ok": True}


# ── supervisores ──────────────────────────────────────────────────────────
class ListSupervisoresConfigUseCase(ConfiguracionBase):
    def execute(self, principal: Principal) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            coordinador(uow, principal)
            supervisores = uow.configuracion.list_supervisores()
            vendedores = uow.configuracion.list_vendedores(solo_activos=True)
        cuenta: dict[str, int] = {}
        for v in vendedores:
            if v.get("supervisor_cod"):
                cuenta[v["supervisor_cod"]] = cuenta.get(v["supervisor_cod"], 0) + 1
        return {"data": [{**s, "n_vendedores": cuenta.get(s["cod"], 0)} for s in supervisores]}


class CreateSupervisorUseCase(ConfiguracionBase):
    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = coordinador(uow, principal)
            cod, nombre = _texto(body.get("cod")), _texto(body.get("nombre"))
            if not cod or not nombre:
                raise ValidationError("cod y nombre son requeridos")
            if body.get("email") and not _email_valido(body["email"]):
                raise ValidationError(MSG_CORREO_INVALIDO)
            jefe = bool(body.get("es_jefe_regional"))
            fila = uow.configuracion.insert_supervisor(
                {
                    "cod": cod,
                    "nombre": nombre,
                    "email": body.get("email"),
                    "activo": True,
                    "es_jefe_regional": jefe,
                    "jefe_regional_cod": None if jefe else body.get("jefe_regional_cod"),
                    "cargo_jerarquia": (_texto(body.get("cargo_jerarquia")) or CARGO_JEFE_REGIONAL_DEFAULT)
                    if jefe
                    else None,
                }
            )
            registrar_auditoria(
                uow,
                usuario,
                tabla="supervisores",
                accion="INSERT",
                descripcion=f"Supervisor {body['cod']} ({body['nombre']}) creado",
                valor_nuevo=body,
            )
            uow.commit()
        return {"data": fila}


class UpdateSupervisorUseCase(ConfiguracionBase):
    def execute(self, principal: Principal, cod: str, body: dict[str, Any]) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = coordinador(uow, principal)
            if body.get("email") and not _email_valido(body["email"]):
                raise ValidationError(MSG_CORREO_INVALIDO)
            anterior = uow.configuracion.get_supervisor(cod)
            if anterior is None:
                raise NotFoundError("Supervisor no encontrado")
            cambios = {k: body[k] for k in ("nombre", "email", "activo") if k in body}
            jefe = bool(body.get("es_jefe_regional"))
            if "es_jefe_regional" in body:
                cambios["es_jefe_regional"] = body["es_jefe_regional"]
                if jefe:
                    cambios["jefe_regional_cod"] = None
                else:
                    cambios["cargo_jerarquia"] = None
            if "jefe_regional_cod" in body and not jefe:
                cambios["jefe_regional_cod"] = body["jefe_regional_cod"] or None
            if "cargo_jerarquia" in body and jefe:
                cambios["cargo_jerarquia"] = body["cargo_jerarquia"] or CARGO_JEFE_REGIONAL_DEFAULT
            fila = uow.configuracion.update_supervisor(cod, cambios)
            registrar_auditoria(
                uow,
                usuario,
                tabla="supervisores",
                accion="UPDATE",
                descripcion=f"Supervisor {cod} actualizado",
                valor_anterior=anterior,
                valor_nuevo=cambios,
            )
            uow.commit()
        return {"data": fila}


class DeactivateSupervisorUseCase(ConfiguracionBase):
    def execute(self, principal: Principal, cod: str) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = coordinador(uow, principal)
            vendedores = uow.configuracion.vendedores_activos_de_supervisor(cod)
            if vendedores:
                raise ConflictError(
                    "No se puede desactivar: tiene vendedores activos asignados",
                    details={"vendedores": vendedores},
                )
            uow.configuracion.update_supervisor(cod, {"activo": False})
            registrar_auditoria(
                uow,
                usuario,
                tabla="supervisores",
                accion="DELETE",
                descripcion=f"Supervisor {cod} desactivado",
                valor_nuevo={"activo": False},
            )
            uow.commit()
        return {"ok": True}


# ── directorio ────────────────────────────────────────────────────────────
class ListDirectorioUseCase(ConfiguracionBase):
    def execute(self, principal: Principal, area: str | None, q: str | None) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            coordinador(uow, principal)
            return {"data": uow.configuracion.list_directorio(area=area or None, q=q or None)}


class ListContactosDirectorioUseCase(ConfiguracionBase):
    """Autocomplete de correos (política "Todos leen directorio para autocomplete")."""

    def execute(
        self, principal: Principal, q: str | None, area: str | None, limit: int | None
    ) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            require_usuario(uow, principal)
            filas = uow.configuracion.list_contactos_activos(q=q or None, area=area or None, limit=limit)
        return {"data": filas}


class CreateContactoUseCase(ConfiguracionBase):
    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = coordinador(uow, principal)
            nombre, email = _texto(body.get("nombre")), _texto(body.get("email"))
            if not nombre or not email:
                raise ValidationError("nombre y email son requeridos")
            if not _email_valido(body["email"]):
                raise ValidationError(MSG_CORREO_INVALIDO)
            if body.get("area") not in AREAS_VALIDAS:
                raise ValidationError(f"Área inválida. Permitidas: {', '.join(AREAS_VALIDAS)}")
            fila = uow.configuracion.insert_contacto(
                {
                    "nombre": nombre,
                    "email": email.lower(),
                    "cargo": body.get("cargo"),
                    "area": body["area"],
                    "telefono": _texto(body.get("telefono")) or None,
                    "activo": True,
                    "es_comprador": bool(body.get("es_comprador") or False),
                }
            )
            registrar_auditoria(
                uow,
                usuario,
                tabla="directorio_empresa",
                accion="INSERT",
                descripcion=f"Contacto {body['email']} ({body['area']}) agregado al directorio",
                valor_nuevo=body,
            )
            uow.commit()
        return {"data": fila}


class UpdateContactoUseCase(ConfiguracionBase):
    def execute(self, principal: Principal, contacto_id: str, body: dict[str, Any]) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = coordinador(uow, principal)
            if body.get("email") and not _email_valido(body["email"]):
                raise ValidationError(MSG_CORREO_INVALIDO)
            if body.get("area") and body["area"] not in AREAS_VALIDAS:
                raise ValidationError("Área inválida")
            cid = _uuid_o_404(contacto_id, "Contacto no encontrado")
            anterior = uow.configuracion.get_contacto(cid)
            if anterior is None:
                raise NotFoundError("Contacto no encontrado")
            cambios = {k: body[k] for k in ("nombre", "cargo", "area", "activo", "es_comprador") if k in body}
            if "email" in body:
                cambios["email"] = str(body["email"] or "").lower()
            if "telefono" in body:
                cambios["telefono"] = _texto(body["telefono"]) or None
            fila = uow.configuracion.update_contacto(cid, cambios)
            registrar_auditoria(
                uow,
                usuario,
                tabla="directorio_empresa",
                accion="UPDATE",
                descripcion=f"Contacto {anterior['email']} actualizado",
                valor_anterior=anterior,
                valor_nuevo=cambios,
            )
            uow.commit()
        return {"data": fila}


class DeactivateContactoUseCase(ConfiguracionBase):
    def execute(self, principal: Principal, contacto_id: str) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = coordinador(uow, principal)
            try:
                cid = UUID(str(contacto_id))
            except ValueError as error:
                raise ValidationError("'id' no es un identificador válido.") from error
            contacto = uow.configuracion.get_contacto(cid)
            uow.configuracion.update_contacto(cid, {"activo": False})
            email = contacto["email"] if contacto else contacto_id
            registrar_auditoria(
                uow,
                usuario,
                tabla="directorio_empresa",
                accion="DELETE",
                descripcion=f"Contacto {email} desactivado del directorio",
                valor_nuevo={"activo": False},
            )
            uow.commit()
        return {"ok": True}


# ── portafolio acotado (rutas) ────────────────────────────────────────────
class ListRutasUseCase(ConfiguracionBase):
    def execute(self, principal: Principal) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            coordinador(uow, principal)
            grupos = uow.configuracion.list_grupos()
            miembros = uow.configuracion.list_miembros()
            vendedores = uow.configuracion.list_vendedores(solo_activos=False)
        nombre = {v["cod"]: v["nombre"] for v in vendedores}
        activo = {v["cod"]: v["activo"] for v in vendedores}
        data = [
            {
                "principal_cod": g["principal_cod"],
                "principal_nombre": nombre.get(g["principal_cod"], g["principal_cod"]),
                "nombre_ruta": g["nombre_ruta"],
                "rol_funcional": g["rol_funcional"],
                "activo": g["activo"],
                "miembros": [
                    {
                        "cod": m["vendedor_cod"],
                        "nombre": nombre.get(m["vendedor_cod"], m["vendedor_cod"]),
                        "activo": m["activo"],
                    }
                    for m in miembros
                    if m["principal_cod"] == g["principal_cod"] and activo.get(m["vendedor_cod"]) is not False
                ],
            }
            for g in grupos
        ]
        return {"data": data}


MSG_PRINCIPAL_EN_MIEMBROS = "El principal no puede estar también en la lista de miembros"


class CreateRutaUseCase(ConfiguracionBase):
    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = coordinador(uow, principal)
            principal_cod = _texto(body.get("principal_cod"))
            nombre_ruta = _texto(body.get("nombre_ruta"))
            rol_funcional = _texto(body.get("rol_funcional")) or None
            miembros = _miembros_unicos(body.get("miembros"))
            if not principal_cod:
                raise ValidationError("Vendedor principal requerido")
            if not nombre_ruta:
                raise ValidationError("Nombre de ruta requerido")
            if not miembros:
                raise ValidationError("Agregá al menos un miembro adicional")
            if principal_cod in miembros:
                raise ValidationError(MSG_PRINCIPAL_EN_MIEMBROS)
            existente = uow.configuracion.get_grupo(principal_cod)
            if existente and existente["activo"]:
                raise ConflictError(
                    "Ya existe una ruta activa para este vendedor — editala en vez de crear una nueva."
                )
            uow.configuracion.upsert_grupo(principal_cod, nombre_ruta, rol_funcional)
            uow.configuracion.activar_miembros(principal_cod, miembros)
            registrar_auditoria(
                uow,
                usuario,
                tabla="portafolio_grupos",
                accion="INSERT",
                descripcion=(
                    f'Ruta "{nombre_ruta}" creada — principal {principal_cod}, '
                    f'miembros: {", ".join(miembros)}'
                ),
                valor_nuevo={
                    "principal_cod": principal_cod,
                    "nombre_ruta": nombre_ruta,
                    "rol_funcional": rol_funcional,
                    "miembros": miembros,
                },
            )
            uow.commit()
        return {"ok": True}


class UpdateRutaUseCase(ConfiguracionBase):
    """``{nombre_ruta?, rol_funcional?, activo?}`` actualiza la ruta; ``{miembros?}`` los reconcilia."""

    def execute(self, principal: Principal, principal_cod: str, body: dict[str, Any]) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = coordinador(uow, principal)
            repo = uow.configuracion
            cambios: dict[str, Any] = {}
            if "nombre_ruta" in body:
                cambios["nombre_ruta"] = _texto(body["nombre_ruta"])
            if "rol_funcional" in body:
                cambios["rol_funcional"] = _texto(body["rol_funcional"]) or None
            if "activo" in body:
                cambios["activo"] = body["activo"]
            if cambios:
                repo.update_grupo(principal_cod, cambios)
                if "activo" in body:
                    estado = "reactivada" if body["activo"] else "desactivada"
                    desc = f"Ruta (principal {principal_cod}) {estado}"
                else:
                    desc = f"Ruta (principal {principal_cod}) actualizada"
                registrar_auditoria(
                    uow,
                    usuario,
                    tabla="portafolio_grupos",
                    accion="UPDATE",
                    descripcion=desc,
                    valor_nuevo={**cambios, "updated_at": _ahora_iso()},
                )
            if "miembros" in body:
                miembros = _miembros_unicos(body["miembros"])
                if principal_cod in miembros:
                    raise ValidationError(MSG_PRINCIPAL_EN_MIEMBROS)
                activos = [m["vendedor_cod"] for m in repo.list_miembros(principal_cod) if m["activo"]]
                a_activar = [m for m in miembros if m not in activos]
                a_desactivar = [m for m in activos if m not in miembros]
                if a_activar:
                    repo.activar_miembros(principal_cod, a_activar)
                if a_desactivar:
                    repo.desactivar_miembros(principal_cod, a_desactivar)
                registrar_auditoria(
                    uow,
                    usuario,
                    tabla="portafolio_acotado",
                    accion="UPDATE",
                    descripcion=(
                        f"Miembros de la ruta (principal {principal_cod}) actualizados: "
                        f"{', '.join(miembros) or '(sin miembros)'}"
                    ),
                    valor_nuevo={"miembros": miembros},
                )
            uow.commit()
        return {"ok": True}


class DeactivateRutaUseCase(ConfiguracionBase):
    """Desactiva la ruta; los miembros quedan tal cual para cuando se reactive."""

    def execute(self, principal: Principal, principal_cod: str) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = coordinador(uow, principal)
            uow.configuracion.update_grupo(principal_cod, {"activo": False})
            registrar_auditoria(
                uow,
                usuario,
                tabla="portafolio_grupos",
                accion="DELETE",
                descripcion=f"Ruta (principal {principal_cod}) desactivada",
                valor_nuevo={"activo": False},
            )
            uow.commit()
        return {"ok": True}
