"""Cola de trabajo diaria del analista — Algoritmo V4 con ICP (antes ``lib/utils/cola-analista.ts``).

Fuente única de verdad para la priorización (Dashboard Analista y Mi Cartera: mismos resultados).

V4 incorpora el ICP (Índice de Comportamiento de Pago, 0-100):
  · Hard Include: ICP < 35 + mora ≥ ₡500K + tramo ≥ 31d (riesgo crónico)
  · Smart Exclude: ICP ≥ 80 + solo 1-30d + gestionado ≤ 5d (buen pagador puntual)
  · Pesos: 35% monto | 25% días mora | 15% sin gestión | 10% promesa | 15% ICP riesgo
  · Ajuste de tier: ICP < 40 sube un nivel · ICP ≥ 80 baja un nivel (mora ≤ 60d)

La regla de ``proxima_accion_fecha`` se verifica ANTES del ICP Hard Include: una acción futura
programada siempre se respeta.

Todo es puro (stdlib): los datos llegan ya leídos por el caso de uso.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date
from typing import Any

MORA_MINIMA = 100_000  # ₡100K — por debajo no entra a la cola
ICP_HARD_INCLUDE = 35  # ICP por debajo → riesgo crónico
ICP_SMART_EXCLUDE = 80  # ICP por encima → buen pagador, se excluye si puntual
VENTANA_PAGO_RECIENTE = 5  # días — ventana para la señal de pago reciente
ICP_MORA_MINIMA_HARD = 500_000  # mora mínima para el hard include de ICP
ICP_NEUTRO = 50  # valor asignado cuando no hay historial
TOPE_DIARIO = 30
SIN_GESTION = 999  # días sin gestión cuando nunca hubo una

_LOG_MIN = math.log(MORA_MINIMA)
_LOG_MAX = math.log(10_000_000)

CRITICO, URGENTE, SEGUIMIENTO, RUTINA = "critico", "urgente", "seguimiento", "rutina"


def js_round(value: float) -> int:
    """``Math.round`` de JavaScript (mitades hacia +∞, no al par como ``round``)."""
    return math.floor(value + 0.5)


def fmt_crc(value: float) -> str:
    """``fmtCRC`` del front: ₡ + entero redondeado con punto como separador de miles."""
    return "₡" + format(js_round(value), ",").replace(",", ".")


def js_num(value: float) -> str:
    """``${n}`` de JavaScript: sin ``.0`` cuando el número es entero."""
    return str(int(value)) if float(value).is_integer() else repr(float(value))


def icp_label(score: float) -> str:
    if score >= 80:
        return "Bueno"
    if score >= 60:
        return "Regular"
    if score >= 40:
        return "Irregular"
    if score >= 20:
        return "Malo"
    return "Muy malo"


@dataclass(frozen=True)
class EntradaAgenda:
    dias_mora: int
    mora_total: float
    mora_120_plus: float
    dias_sin_gestion: int
    promesa_activa: bool
    promesa_fecha: date | None
    promesa_monto: float | None
    proxima_accion_fecha: date | None
    gestionado_hoy: bool
    icp: float | None  # None = sin historial → neutro


@dataclass(frozen=True)
class ResultadoAgenda:
    en_agenda: bool
    is_hard_include: bool
    prioridad: str
    motivo: str
    score: int


def _fuera(motivo: str = "") -> ResultadoAgenda:
    return ResultadoAgenda(False, False, RUTINA, motivo, 0)


def _hard(score: int, motivo: str) -> ResultadoAgenda:
    return ResultadoAgenda(True, True, CRITICO, motivo, score)


def _reglas_pendiente(p: EntradaAgenda, hoy: date, icp: float, dsg: int) -> ResultadoAgenda | None:
    """Rama B (pendiente): hard includes y exclusiones. ``None`` = pasa al scoring."""
    # ① promesa vencida o vence hoy
    if p.promesa_activa and p.promesa_fecha:
        dias_venc = (hoy - p.promesa_fecha).days
        if dias_venc > 0:
            monto = f"{fmt_crc(p.promesa_monto)} " if p.promesa_monto else ""
            return _hard(97, f"Promesa de {monto}venció hace {dias_venc}d — sin pago")
        if dias_venc == 0:
            return _hard(95, "Promesa vence hoy — confirmar si pagó")
    # ② próxima acción futura programada (se respeta aun con ICP bajo)
    if p.proxima_accion_fecha and p.proxima_accion_fecha > hoy:
        return _fuera()
    # ③ mora en tramo +120 días
    if (p.mora_120_plus or 0) > 0 or p.dias_mora > 120:
        return _hard(92, f"Mora supera 120 días ({fmt_crc(p.mora_total)}) — crítico")
    # ④ ICP bajo + mora significativa
    if (
        p.icp is not None
        and icp < ICP_HARD_INCLUDE
        and p.mora_total >= ICP_MORA_MINIMA_HARD
        and p.dias_mora >= 31
    ):
        return _hard(
            88,
            f"ICP {js_num(icp)} ({icp_label(icp)}) — historial crítico. {fmt_crc(p.mora_total)} en mora",
        )
    # ⑤ buen pagador, atraso puntual, gestionado recientemente
    if icp >= ICP_SMART_EXCLUDE and p.dias_mora <= 30 and dsg <= 5:
        return _fuera("Buen pagador, atraso puntual, contactado recientemente")
    # ⑥ promesa vigente futura + gestión reciente
    if p.promesa_activa and p.promesa_fecha and (p.promesa_fecha - hoy).days > 0 and dsg <= 3:
        return _fuera()
    # ⑦ mora por debajo del mínimo operativo
    if p.mora_total < MORA_MINIMA:
        return _fuera()
    return None


def _score(p: EntradaAgenda, hoy: date, icp: float, dsg: int) -> int:
    monto_score = min(
        1.0, max(0.0, (math.log(max(p.mora_total, MORA_MINIMA)) - _LOG_MIN) / (_LOG_MAX - _LOG_MIN))
    )
    mora_score = min(1.0, p.dias_mora / 120)
    gestion_score = min(1.0, dsg / 30)
    icp_risk = (100 - icp) / 100
    boost = 0.0
    if p.promesa_activa and p.promesa_fecha:
        dias = (p.promesa_fecha - hoy).days
        boost = 1.0 if dias <= 3 else 0.7 if dias <= 7 else 0.4 if dias <= 14 else 0.0
    total = 0.35 * monto_score + 0.25 * mora_score + 0.15 * gestion_score + 0.10 * boost + 0.15 * icp_risk
    return min(89, max(1, js_round(total * 100)))


def _tier(p: EntradaAgenda, score: int, dsg: int) -> tuple[str, str]:
    mora = fmt_crc(p.mora_total)
    if score >= 65:
        if p.dias_mora > 90:
            return CRITICO, f"Mora +{p.dias_mora}d ({mora}) — acción urgente"
        return CRITICO, f"Alta exposición: {mora} en mora"
    if score >= 40:
        if p.dias_mora >= 31:
            return URGENTE, f"Mora {p.dias_mora}d — {mora} pendiente"
        return URGENTE, f"{mora} en mora — sin gestión reciente"
    if score >= 15:
        dsg_label = "sin gestiones previas" if p.dias_sin_gestion == SIN_GESTION else f"{dsg}d sin contacto"
        return SEGUIMIENTO, f"{mora} — {dsg_label}"
    return RUTINA, f"{mora} — seguimiento preventivo"


def calcular_agenda(p: EntradaAgenda, hoy: date) -> ResultadoAgenda:
    dsg = 30 if p.dias_sin_gestion == SIN_GESTION else p.dias_sin_gestion
    icp = p.icp if p.icp is not None else ICP_NEUTRO

    if p.gestionado_hoy:
        # Rama A: ya gestionado hoy (sección "Gestionados hoy" de Mi Cartera, no entra a la Cola)
        if p.mora_total < MORA_MINIMA:
            return _fuera()
    else:
        regla = _reglas_pendiente(p, hoy, icp, dsg)
        if regla is not None:
            return regla

    score = _score(p, hoy, icp, dsg)
    prioridad, motivo = _tier(p, score, dsg)

    suffix = ""
    if p.icp is not None and icp < 40:
        if prioridad == URGENTE:
            prioridad = CRITICO
        if prioridad == SEGUIMIENTO:
            prioridad = URGENTE
        suffix = f" · ICP {js_num(icp)} ({icp_label(icp)})"
    elif p.icp is not None and icp >= ICP_SMART_EXCLUDE and p.dias_mora <= 60:
        if prioridad == CRITICO:
            prioridad = URGENTE
        if prioridad == URGENTE and p.dias_mora <= 30:
            prioridad = SEGUIMIENTO
        suffix = f" · ICP {js_num(icp)} — buen historial"
    elif p.icp is None:
        suffix = " · sin historial ICP"

    return ResultadoAgenda(True, False, prioridad, motivo + suffix, score)


@dataclass
class DatosCola:
    """Lecturas crudas que necesita la cola (ver ``ComputarColaDia`` en application)."""

    cartera: list[dict[str, Any]] = field(default_factory=list)
    gestiones: list[dict[str, Any]] = field(default_factory=list)  # fecha desc, created_at desc
    promesas_pendientes: list[dict[str, Any]] = field(default_factory=list)  # fecha_promesa asc
    recuperado_mes: float = 0.0
    icp: dict[str, float] = field(default_factory=dict)
    pagos_recientes: list[dict[str, Any]] = field(default_factory=list)


def _num(value: Any) -> float:
    return float(value or 0)


def _as_date(value: Any) -> date | None:
    if value in (None, ""):
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _tramo_peor(c: dict[str, Any]) -> str:
    for key, label in (
        ("mora_120_plus", "+120 días"),
        ("mora_91_120", "91-120 días"),
        ("mora_61_90", "61-90 días"),
        ("mora_31_60", "31-60 días"),
        ("mora_1_30", "1-30 días"),
    ):
        if _num(c.get(key)) > 0:
            return label
    return "Al día"


def _dedup_cartera(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Una fila por cliente (la de ``fecha_corte`` más reciente, comparación de texto)."""
    by_cod: dict[str, dict[str, Any]] = {}
    for c in rows:
        prev = by_cod.get(c["cliente_cod"])
        if prev is None or (c.get("fecha_corte") or "") > (prev.get("fecha_corte") or ""):
            by_cod[c["cliente_cod"]] = c
    return list(by_cod.values())


def _indices(datos: DatosCola, hoy: date) -> tuple[dict, dict, dict]:
    ultima: dict[str, dict[str, Any]] = {}
    for g in datos.gestiones:
        ultima.setdefault(g["cliente_cod"], g)
    promesa: dict[str, dict[str, Any]] = {}
    for p in datos.promesas_pendientes:
        promesa.setdefault(p["cliente_cod"], p)
    pagos: dict[str, dict[str, float]] = {}
    for p in datos.pagos_recientes:
        dias = max(0, (hoy - _as_date(p["fecha_pago"])).days)
        cur = pagos.get(p["cliente_cod"])
        pagos[p["cliente_cod"]] = {
            "monto": (cur["monto"] if cur else 0) + _num(p.get("monto_pago")),
            "dias": min(cur["dias"], dias) if cur else dias,
        }
    return ultima, promesa, pagos


def _fila(c: dict[str, Any], hoy: date, datos: DatosCola, idx: tuple[dict, dict, dict]) -> dict[str, Any]:
    ultima_map, promesa_map, pagos_map = idx
    cod = c["cliente_cod"]
    mora_total = sum(_num(c.get(k)) for k in ("mora_1_30", "mora_31_60", "mora_61_90", "mora_91_120"))
    mora_total += _num(c.get("mora_120_plus"))
    gestion = ultima_map.get(cod)
    ultima = _as_date(gestion["fecha"]) if gestion else None
    dias_sin_gestion = max(0, (hoy - ultima).days) if ultima else SIN_GESTION
    promesa = promesa_map.get(cod)
    promesa_fecha = _as_date(promesa["fecha_promesa"]) if promesa else None
    promesa_monto = None if not promesa or promesa.get("monto") is None else _num(promesa["monto"])
    proxima_fecha = _as_date(gestion.get("proxima_accion_fecha")) if gestion else None
    dias_mora = int(_num(c.get("dias_mora")))  # tbl_cartera no trae dias_mora: igual que el origen → 0
    icp_score = datos.icp.get(cod)
    res = calcular_agenda(
        EntradaAgenda(
            dias_mora=dias_mora,
            mora_total=mora_total,
            mora_120_plus=_num(c.get("mora_120_plus")),
            dias_sin_gestion=dias_sin_gestion,
            promesa_activa=promesa_fecha is not None,
            promesa_fecha=promesa_fecha,
            promesa_monto=promesa_monto,
            proxima_accion_fecha=proxima_fecha,
            gestionado_hoy=ultima == hoy,
            icp=icp_score,
        ),
        hoy,
    )
    return {
        "cliente_cod": cod,
        "cliente_nombre": c.get("cliente_nombre"),
        "vendedor_nombre": c.get("vendedor_nombre") or "—",
        "mora_total": mora_total,
        "dias_mora": dias_mora,
        "tramo_peor": _tramo_peor(c),
        "ultima_gestion_fecha": ultima.isoformat() if ultima else None,
        "dias_sin_gestion": dias_sin_gestion,
        "promesa_activa": promesa_fecha is not None,
        "promesa_fecha": promesa_fecha.isoformat() if promesa_fecha else None,
        "promesa_monto": promesa_monto,
        "score": res.score,
        "prioridad": res.prioridad,
        "gestionado_hoy": ultima == hoy,
        "en_agenda": res.en_agenda,
        "is_hard_include": res.is_hard_include,
        "motivo": res.motivo,
        "proxima_accion": gestion.get("proxima_accion") if gestion else None,
        "proxima_accion_fecha": proxima_fecha.isoformat() if proxima_fecha else None,
        "icp_score": icp_score,
        "pago_reciente": pagos_map.get(cod),
    }


def _aplicar_tope(rows: list[dict[str, Any]]) -> None:
    """Hasta ``TOPE_DIARIO`` pendientes: hard includes + mejores candidatos; gestionados hoy se quedan."""
    hard = {r["cliente_cod"] for r in rows if r["is_hard_include"] and not r["gestionado_hoy"]}
    candidatos = [r for r in rows if r["en_agenda"] and not r["is_hard_include"] and not r["gestionado_hoy"]]
    cupo = max(0, TOPE_DIARIO - len(hard))
    en_cola = hard | {r["cliente_cod"] for r in candidatos[:cupo]}
    en_cola |= {r["cliente_cod"] for r in rows if r["gestionado_hoy"] and r["en_agenda"]}
    for r in rows:
        if r["cliente_cod"] not in en_cola:
            r["en_agenda"] = False


def construir_cola(datos: DatosCola, hoy: date) -> dict[str, Any]:
    """``{rows, recuperadoMes, totalPromesasActivas}`` — misma forma que ``computarColaDia``."""
    idx = _indices(datos, hoy)
    rows = [_fila(c, hoy, datos, idx) for c in _dedup_cartera(datos.cartera)]
    rows.sort(key=lambda r: (-r["score"], -r["mora_total"]))
    _aplicar_tope(rows)
    return {
        "rows": rows,
        "recuperadoMes": datos.recuperado_mes,
        "totalPromesasActivas": len({p["cliente_cod"] for p in datos.promesas_pendientes}),
    }
