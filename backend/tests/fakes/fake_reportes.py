"""Repository de Reportes en memoria: registra las llamadas y devuelve datos configurables."""

from __future__ import annotations

from datetime import date
from typing import Any

from application.ports.reportes import ReportesRepository, Row


class FakeReportesRepository(ReportesRepository):
    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple]] = []
        self.contribuyentes: list[Row] = []
        self.maestro: list[Row] = []
        self.cartera: list[Row] = []
        self.gestiones: list[Row] = []
        self.snapshots_bloqueados = 0
        self.cierres: list[tuple[int, int, bool, str]] = []
        self.fail_snapshot: Exception | None = None

    def _log(self, name: str, *args: Any) -> dict[str, Any]:
        self.calls.append((name, args))
        return {"fn": name, "args": list(args)}

    def called(self, name: str) -> list[tuple]:
        return [args for n, args in self.calls if n == name]

    def aging(self) -> Any:
        return self._log("aging")

    def cei(self, anio: int, mes: int) -> Any:
        self._log("cei", anio, mes)
        return [{"vendedor_cod": "V1", "cobrado": 10, "vencido": 20}]

    def snapshot_cierre_cartera(self, anio: int, mes: int, provisional: bool, generado_por: str) -> Any:
        self.cierres.append((anio, mes, provisional, generado_por))
        return {"ok": True, "anio": anio, "mes": mes}

    def efectividad(self, ini: date, fin: date, email: str | None) -> Any:
        return self._log("efectividad", ini, fin, email)

    def perfil_vendedor(self, meses: int, orden: str) -> Any:
        return self._log("perfil_vendedor", meses, orden)

    def migracion_mora(
        self, anio: int, mes: int, supervisor_cod: str | None, vendedor_cod: str | None
    ) -> Any:
        return self._log("migracion_mora", anio, mes, supervisor_cod, vendedor_cod)

    def supervisores(self) -> list[Row]:
        return [{"cod": "S1", "nombre": "Sup"}]

    def vendedores_activos(self) -> list[Row]:
        return [{"cod": "V1", "nombre": "Vend", "supervisor_cod": "S1"}]

    def mora_vendedor(self, email: str | None) -> Any:
        return self._log("mora_vendedor", email)

    def snapshot_bloqueados_semana(self) -> int:
        if self.fail_snapshot:
            raise self.fail_snapshot
        self.snapshots_bloqueados += 1
        return 3

    def bloqueados(self, email: str | None) -> Any:
        return self._log("bloqueados", email)

    def plazo_especial(self, email: str | None) -> Any:
        return self._log("plazo_especial", email)

    def portafolio_destinatarios(self) -> dict[str, list[str]]:
        return {"V1": ["a@x.com"]}

    def dimension_opciones(self, columna: str) -> list[str]:
        self._log("dimension_opciones", columna)
        return ["A", "B"]

    def kpis_cartera(self) -> list[Row]:
        return [{"total_cartera": 100}]

    def ventas_mensuales(self) -> list[Row]:
        return [{"anio": 2026, "mes": 9, "total_ventas_sin_iva": 50, "cartera_total_mes": None}]

    def concentracion(self) -> Any:
        return {"top10": [], "hhi": 0}

    def recuperacion_mom(self, meses: int, email: str | None) -> Any:
        self._log("recuperacion_mom", meses, email)
        return None

    def historico_cartera(self, limit: int) -> list[Row]:
        self._log("historico_cartera", limit)
        return []

    def cierre_meses(self) -> list[Row]:
        return [{"anio": 2026, "mes": 8}]

    def vendedores_zona(self) -> list[Row]:
        return [{"cod": "V1", "nombre": "Vend", "zona": "GAM"}]

    def portafolio_grupos_activos(self) -> list[Row]:
        return []

    def portafolio_miembros_activos(self) -> list[Row]:
        return []

    def maestro_clientes_resumen(self) -> list[Row]:
        return list(self.maestro)

    def recuperacion(self, anio: int, mes: int) -> Any:
        return self._log("recuperacion", anio, mes)

    def cierre_riesgo_vendedor(self, anio: int, mes: int) -> list[Row]:
        self._log("cierre_riesgo_vendedor", anio, mes)
        return []

    def cierre_mora(self, anio: int, mes: int, anio_ant: int, mes_ant: int) -> list[Row]:
        self._log("cierre_mora", anio, mes, anio_ant, mes_ant)
        return []

    def cierre_icp(
        self, reciente_ini: date, reciente_fin: date, previo_ini: date, previo_fin: date
    ) -> list[Row]:
        self._log("cierre_icp", reciente_ini, reciente_fin, previo_ini, previo_fin)
        return []

    def estados_cuenta(self, email: str | None) -> list[Row]:
        self._log("estados_cuenta", email)
        return [c for c in self.contribuyentes if email is None or c.get("analista_email") == email]

    def vendedores_de_clientes(self, cliente_cods: list[str]) -> list[Row]:
        self._log("vendedores_de_clientes", tuple(cliente_cods))
        return [m for m in self.maestro if m["cliente_cod"] in cliente_cods]

    def cartera_vencida(self, analista_email: str) -> list[Row]:
        self._log("cartera_vencida", analista_email)
        return list(self.cartera)

    def gestiones_periodo(self, analista_email: str, ini: date, fin: date) -> list[Row]:
        self._log("gestiones_periodo", analista_email, ini, fin)
        return [
            g for g in self.gestiones if g["analista_email"] == analista_email and ini <= g["fecha"] <= fin
        ]
