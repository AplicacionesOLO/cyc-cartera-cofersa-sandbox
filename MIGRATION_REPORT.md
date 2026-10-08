# MIGRATION REPORT — cyc-cofersa

**Estado: MIGRATION COMPLETE**  
Generado: 2026-10-06T22:29:12+00:00 · Validación: 2026-10-06T22:28:59+00:00

## 1. Resumen

| Aspecto | Origen | Destino |
|---|---|---|
| Frontend | next (ts), router next-app | mismo framework y router · hosting ecs-fargate |
| API | Supabase (PostgREST, RPC, Edge Functions) | API Gateway REST REGIONAL + 181 endpoints Lambda python3.13 (hexagonal) |
| Base de datos | PostgreSQL Supabase (esquema: live_database) | Aurora PostgreSQL `cof_dev_cyc_cofersa_db` · 47 tablas, 2 vistas, 90 funciones |
| Autorización | RLS + auth.uid() | reglas en use cases (rls_mode: backend) |
| Auth | Supabase Auth | Amazon Cognito (grupos: ninguno) |
| Exposición | — | public — El SIC lo usan analistas y gerencia desde fuera de la red corporativa (hoy publicado en Vercel); API Gateway regional con Cognito en todas las rutas salvo ingesta M2M y formulario por token, WAF y throttling. |

## 2. Criterios de finalización (16)

| # | Criterio | Estado |
|---|---|---|
| 1 | Discovery completo: preflight, proyecto, uso de Supabase y esquema real | OK |
| 2 | Manifest revisado (sin borrador, endpoints válidos, reglas de autorización asignadas) | OK |
| 3 | Scripts Aurora completos por ambiente (provisioning, schema, validation, rollback, migration, datos) | OK |
| 4 | SQL Aurora validado en PostgreSQL efímero (idempotente, TOTAL_FALTA=0, rollback limpio) | OK |
| 5 | Backend hexagonal: handlers y use cases existen; dependencias entre capas y SQL en su lugar | OK |
| 6 | Tests del backend en verde (unitarios con fakes e integración contra el esquema generado) | OK |
| 7 | Lint del backend limpio (ruff) | OK |
| 8 | Template SAM único y samconfig dev/qa/prod con tags y rutas por ambiente | OK |
| 9 | Template válido (cfn-lint y transformación SAM) | OK |
| 10 | IAM mínimo y resiliencia (sin wildcards salvo ENI; SQS con DLQ, reintentos, visibility e idempotencia) | OK |
| 11 | Frontend con arquitectura estándar (Page → Controller → Api → axiosApiGateway, naming y tamaños) | OK |
| 12 | Frontend compila, cumple Prettier y sus tests pasan | OK |
| 13 | Cero residuos de Supabase (código, dependencias, variables) | OK |
| 14 | Sin secretos ni identificadores de ambiente hardcodeados | OK |
| 15 | Sin TODO/FIXME/pseudocódigo en el código generado | OK |
| 16 | Reporte final con matriz ORIGEN → DESTINO y solo pendientes de configuración | OK |

## 3. Matriz ORIGEN → DESTINO

### 3.1 Operaciones del frontend y Edge Functions

| Origen (archivo:línea) | Operación Supabase | Destino | Use case |
|---|---|---|---|
| src/middleware.ts:5 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/middleware.ts:17 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/(app)/auditoria-legal/garantias/ModalConfirmarEnvioVendedor.tsx:34 | table select vendedores | GET /garantias/{id}/vendedor → `AuditoriaLegalApi` | `GetVendedorGarantiaUseCase` |
| src/app/(app)/auditoria-legal/garantias/ModalConfirmarEnvioVendedor.tsx:47 | auth getSession | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/(app)/auditoria-legal/garantias/ModalEmitirPagare.tsx:174 | table select config_sistema | GET /garantias/config-pagare → `AuditoriaLegalApi` | `GetConfigPagareUseCase` |
| src/app/(app)/auditoria-legal/garantias/ModalEmitirPagare.tsx:262 | table select garantias | GET /garantias/contribuyentes/garantia-activa → `AuditoriaLegalApi` | `GetGarantiaActivaContribuyenteUseCase` |
| src/app/(app)/auditoria-legal/garantias/ModalEmitirPagare.tsx:336 | table select personas_legales | GET /garantias/personas-legales → `AuditoriaLegalApi` | `ListPersonasLegalesUseCase` |
| src/app/(app)/auditoria-legal/garantias/ModalEmitirPagare.tsx:354 | table select personas_legales | GET /garantias/personas-legales → `AuditoriaLegalApi` | `ListPersonasLegalesUseCase` |
| src/app/(app)/auditoria-legal/garantias/ModalEmitirPagare.tsx:373 | table select personas_legales | GET /garantias/personas-legales → `AuditoriaLegalApi` | `ListPersonasLegalesUseCase` |
| src/app/(app)/auditoria-legal/garantias/ModalEmitirPagare.tsx:504 | auth getSession | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/(app)/auditoria-legal/garantias/ModalGenerarPagare.tsx:97 | table select config_sistema | GET /garantias/config-pagare → `AuditoriaLegalApi` | `GetConfigPagareUseCase` |
| src/app/(app)/auditoria-legal/garantias/ModalGenerarPagare.tsx:108 | table select personas_legales | GET /garantias/personas-legales → `AuditoriaLegalApi` | `ListPersonasLegalesUseCase` |
| src/app/(app)/auditoria-legal/garantias/ModalGenerarPagare.tsx:161 | table select personas_legales | GET /garantias/personas-legales → `AuditoriaLegalApi` | `ListPersonasLegalesUseCase` |
| src/app/(app)/auditoria-legal/garantias/ModalHistorialGarantia.tsx:48 | table select garantia_eventos | GET /garantias/{id}/eventos → `AuditoriaLegalApi` | `ListEventosGarantiaUseCase` |
| src/app/(app)/auditoria-legal/garantias/ModalRegistrarGarantia.tsx:312 | table select garantias | GET /garantias/contribuyentes/garantia-activa → `AuditoriaLegalApi` | `GetGarantiaActivaContribuyenteUseCase` |
| src/app/(app)/auditoria-legal/garantias/ModalSolicitarActualizacion.tsx:37 | auth getSession | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/(app)/auditoria-legal/garantias/garantias-cliente.tsx:402 | table select solicitudes_actualizacion | GET /solicitudes-actualizacion → `AuditoriaLegalApi` | `ListSolicitudesActualizacionUseCase` |
| src/app/(app)/auditoria-legal/garantias/garantias-cliente.tsx:446 | table select vendedores | GET /garantias/vendedores → `AuditoriaLegalApi` | `ListVendedoresActivosUseCase` |
| src/app/(app)/auditoria-legal/garantias/garantias-cliente.tsx:703 | auth getSession | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/(app)/bandeja-pagos/page.tsx:9 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/(app)/clientes/actions.ts:22 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/(app)/clientes/[cod]/page.tsx:57 | table select cartera | GET /clientes/{cod}/ficha → `ClientesApi` | `GetFichaClienteUseCase` |
| src/app/(app)/clientes/[cod]/page.tsx:58 | table select maestro_clientes | GET /clientes/{cod}/ficha → `ClientesApi` | `GetFichaClienteUseCase` |
| src/app/(app)/clientes/[cod]/page.tsx:59 | table select gestiones | GET /clientes/{cod}/ficha → `ClientesApi` | `GetFichaClienteUseCase` |
| src/app/(app)/clientes/[cod]/page.tsx:60 | table select promesas | GET /clientes/{cod}/ficha → `ClientesApi` | `GetFichaClienteUseCase` |
| src/app/(app)/clientes/[cod]/page.tsx:62 | table select icp_por_cliente | GET /clientes/{cod}/ficha → `ClientesApi` | `GetFichaClienteUseCase` |
| src/app/(app)/clientes/[cod]/page.tsx:71 | table select pedidos_retenidos | GET /clientes/{cod}/ficha → `ClientesApi` | `GetFichaClienteUseCase` |
| src/app/(app)/clientes/[cod]/page.tsx:77 | table select solicitudes | GET /clientes/{cod}/ficha → `ClientesApi` | `GetFichaClienteUseCase` |
| src/app/(app)/clientes/[cod]/page.tsx:80 | table select usuarios | GET /clientes/{cod}/ficha → `ClientesApi` | `GetFichaClienteUseCase` |
| src/app/(app)/clientes/[cod]/page.tsx:179 | table select facturas | GET /clientes/{cod}/ficha → `ClientesApi` | `GetFichaClienteUseCase` |
| src/app/(app)/clientes/[cod]/page.tsx:184 | table select usuarios | GET /clientes/{cod}/ficha → `ClientesApi` | `GetFichaClienteUseCase` |
| src/app/(app)/clientes/[cod]/page.tsx:187 | table select usuarios | GET /clientes/{cod}/ficha → `ClientesApi` | `GetFichaClienteUseCase` |
| src/app/(app)/clientes/[cod]/page.tsx:35 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/(app)/clientes/[cod]/solicitudes/nueva/page.tsx:24 | table select cartera | GET /solicitudes/nueva-contexto → `SolicitudesApi` | `GetNuevaSolicitudContextoUseCase` |
| src/app/(app)/clientes/[cod]/solicitudes/nueva/page.tsx:25 | table select maestro_clientes | GET /solicitudes/nueva-contexto → `SolicitudesApi` | `GetNuevaSolicitudContextoUseCase` |
| src/app/(app)/clientes/[cod]/solicitudes/nueva/page.tsx:35 | table select facturas | GET /solicitudes/nueva-contexto → `SolicitudesApi` | `GetNuevaSolicitudContextoUseCase` |
| src/app/(app)/dashboard/page.tsx:117 | table select ventas_mensuales | GET /dashboard/coordinador → `DashboardApi` | `GetDashboardCoordinadorUseCase` |
| src/app/(app)/dashboard/page.tsx:127 | table select usuarios | GET /dashboard/coordinador → `DashboardApi` | `GetDashboardCoordinadorUseCase` |
| src/app/(app)/dashboard/page.tsx:130 | table select gestiones | GET /dashboard/coordinador → `DashboardApi` | `GetDashboardCoordinadorUseCase` |
| src/app/(app)/dashboard/page.tsx:131 | table select gestiones | GET /dashboard/coordinador → `DashboardApi` | `GetDashboardCoordinadorUseCase` |
| src/app/(app)/dashboard/page.tsx:132 | table select gestiones | GET /dashboard/coordinador → `DashboardApi` | `GetDashboardCoordinadorUseCase` |
| src/app/(app)/dashboard/page.tsx:135 | table select historico_cartera | GET /dashboard/coordinador → `DashboardApi` | `GetDashboardCoordinadorUseCase` |
| src/app/(app)/dashboard/page.tsx:145 | table select maestro_clientes | GET /dashboard/coordinador → `DashboardApi` | `GetDashboardCoordinadorUseCase` |
| src/app/(app)/dashboard/page.tsx:269 | table select config_sistema | GET /dashboard/coordinador → `DashboardApi` | `GetDashboardCoordinadorUseCase` |
| src/app/(app)/dashboard/page.tsx:464 | table select gestiones | GET /dashboard/analista → `DashboardApi` | `GetDashboardAnalistaUseCase` |
| src/app/(app)/dashboard/page.tsx:473 | table select promesas | GET /dashboard/analista → `DashboardApi` | `GetDashboardAnalistaUseCase` |
| src/app/(app)/dashboard/page.tsx:482 | table select promesas | GET /dashboard/analista → `DashboardApi` | `GetDashboardAnalistaUseCase` |
| src/app/(app)/dashboard/page.tsx:506 | table select config_sistema | GET /dashboard/analista → `DashboardApi` | `GetDashboardAnalistaUseCase` |
| src/app/(app)/dashboard/page.tsx:560 | table select maestro_clientes | GET /dashboard/analista → `DashboardApi` | `GetDashboardAnalistaUseCase` |
| src/app/(app)/gestion-cartera/saldos-favor/page.tsx:32 | table select usuarios | GET /saldos-favor → `GestionCarteraApi` | `ListSaldosFavorUseCase` |
| src/app/(app)/gestiones/page.tsx:35 | table select gestiones | GET /gestiones → `GestionesApi` | `ListGestionesUseCase` |
| src/app/(app)/gestiones/page.tsx:60 | table select usuarios | GET /gestiones → `GestionesApi` | `ListGestionesUseCase` |
| src/app/(app)/gestiones/page.tsx:79 | table select maestro_clientes | GET /gestiones/referencias → `GestionesApi` | `GetReferenciasGestionesUseCase` |
| src/app/(app)/gestiones/page.tsx:84 | table select cartera | GET /gestiones/referencias → `GestionesApi` | `GetReferenciasGestionesUseCase` |
| src/app/(app)/promesas/page.tsx:38 | table select promesas | GET /promesas → `PromesasApi` | `ListPromesasUseCase` |
| src/app/(app)/promesas/page.tsx:55 | table select usuarios | GET /promesas → `PromesasApi` | `ListPromesasUseCase` |
| src/app/(app)/promesas/page.tsx:73 | table select gestiones | GET /promesas → `PromesasApi` | `ListPromesasUseCase` |
| src/app/(app)/recibos-ruta/page.tsx:9 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/(app)/reportes/cartera-vencida/page.tsx:51 | table select maestro_clientes | GET /reportes/cartera-vencida → `ReportesApi` | `GetCarteraVencidaUseCase` |
| src/app/(app)/reportes/cartera-vencida/page.tsx:104 | table select gestiones | GET /reportes/cartera-vencida → `ReportesApi` | `GetCarteraVencidaUseCase` |
| src/app/(app)/reportes/cierre-mensual/page.tsx:129 | table select vendedores | GET /reportes/cierre-mensual → `ReportesApi` | `GetCierreMensualUseCase` |
| src/app/(app)/reportes/cierre-mensual/page.tsx:130 | table select portafolio_grupos | GET /reportes/cierre-mensual → `ReportesApi` | `GetCierreMensualUseCase` |
| src/app/(app)/reportes/cierre-mensual/page.tsx:131 | table select portafolio_acotado | GET /reportes/cierre-mensual → `ReportesApi` | `GetCierreMensualUseCase` |
| src/app/(app)/reportes/cierre-mensual/page.tsx:133 | table select maestro_clientes | GET /reportes/cierre-mensual → `ReportesApi` | `GetCierreMensualUseCase` |
| src/app/(app)/reportes/estados-cuenta/estados-cuenta-cliente.tsx:97 | auth getSession | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/(app)/reportes/estados-cuenta/page.tsx:41 | table select usuarios | GET /reportes/estados-cuenta → `ReportesApi` | `GetEstadosCuentaUseCase` |
| src/app/(app)/reportes/estados-cuenta/page.tsx:57 | table select maestro_clientes | GET /reportes/estados-cuenta → `ReportesApi` | `GetEstadosCuentaUseCase` |
| src/app/(app)/reportes/gestiones-periodo/gestiones-periodo-cliente.tsx:81 | table select gestiones | GET /reportes/gestiones-periodo → `ReportesApi` | `GetGestionesPeriodoUseCase` |
| src/app/(app)/reportes/gestiones-periodo/page.tsx:37 | table select gestiones | GET /reportes/gestiones-periodo → `ReportesApi` | `GetGestionesPeriodoUseCase` |
| src/app/(app)/reportes/migracion-mora/migracion-cliente.tsx:56 | table select supervisores | GET /reportes/migracion-mora/filtros → `ReportesApi` | `GetMigracionFiltrosUseCase` |
| src/app/(app)/reportes/migracion-mora/migracion-cliente.tsx:57 | table select vendedores | GET /reportes/migracion-mora/filtros → `ReportesApi` | `GetMigracionFiltrosUseCase` |
| src/app/(app)/reportes/mora-vendedor/detalle-bloqueados.tsx:99 | auth getSession | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/(app)/reportes/presupuesto-cobro/tab-presupuesto.tsx:364 | auth getSession | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/(app)/reportes/presupuesto-cobro/tab-recuperacion.tsx:181 | auth getSession | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/(app)/reportes/presupuesto-cobro/tab-sin-pago.tsx:50 | table select presupuesto_cobro | GET /presupuesto/sin-pago → `PresupuestoApi` | `GetSinPagoUseCase` |
| src/app/(app)/reportes/resumen-ejecutivo/page.tsx:47 | table select ventas_mensuales | GET /reportes/resumen-ejecutivo → `ReportesApi` | `GetResumenEjecutivoUseCase` |
| src/app/(app)/reportes/resumen-ejecutivo/page.tsx:55 | table select historico_cartera | GET /reportes/resumen-ejecutivo → `ReportesApi` | `GetResumenEjecutivoUseCase` |
| src/app/(app)/reportes/resumen-ejecutivo/resumen-ejecutivo-cliente.tsx:181 | auth getSession | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/(app)/solicitudes/page.tsx:44 | table select usuarios | GET /solicitudes → `SolicitudesApi` | `ListSolicitudesUseCase` |
| src/app/(app)/solicitudes/[id]/page.tsx:64 | table select usuarios | GET /solicitudes/{id} → `SolicitudesApi` | `GetSolicitudDetalleUseCase` |
| src/app/(app)/solicitudes/[id]/page.tsx:67 | table select gestiones | GET /solicitudes/{id} → `SolicitudesApi` | `GetSolicitudDetalleUseCase` |
| src/app/(app)/solicitudes/nueva/page.tsx:49 | table select cartera | GET /solicitudes/nueva-clientes → `SolicitudesApi` | `GetNuevaSolicitudClientesUseCase` |
| src/app/(app)/solicitudes/nueva/page.tsx:55 | table select maestro_clientes | GET /solicitudes/nueva-clientes → `SolicitudesApi` | `GetNuevaSolicitudClientesUseCase` |
| src/app/(app)/solicitudes/nueva/page.tsx:63 | table select gestiones | GET /solicitudes/nueva-clientes → `SolicitudesApi` | `GetNuevaSolicitudClientesUseCase` |
| src/app/(app)/solicitudes/nueva/page.tsx:95 | table select usuarios | GET /solicitudes/nueva-clientes → `SolicitudesApi` | `GetNuevaSolicitudClientesUseCase` |
| src/app/(print)/pagare/[id]/page.tsx:23 | table select garantias | GET /garantias/{id}/pagare → `AuditoriaLegalApi` | `GetPagareImprimibleUseCase` |
| src/app/(print)/pagare/[id]/page.tsx:46 | table select usuarios | GET /garantias/{id}/pagare → `AuditoriaLegalApi` | `GetPagareImprimibleUseCase` |
| src/app/(print)/pagare/[id]/page.tsx:54 | table select garantias | GET /garantias/{id}/pagare → `AuditoriaLegalApi` | `GetPagareImprimibleUseCase` |
| src/app/(print)/pagare/[id]/page.tsx:62 | table select config_sistema | GET /garantias/{id}/pagare → `AuditoriaLegalApi` | `GetPagareImprimibleUseCase` |
| src/app/(print)/pagare/[id]/page.tsx:42 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/ai/formalizar-bitacora/route.ts:9 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/ai/generate-email/route.ts:30 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/auditoria-legal/garantias/route.ts:85 | table select usuarios | POST /garantias → `AuditoriaLegalApi` | `RegistrarGarantiaUseCase` |
| src/app/api/auditoria-legal/garantias/route.ts:165 | table select garantias | POST /garantias → `AuditoriaLegalApi` | `RegistrarGarantiaUseCase` |
| src/app/api/auditoria-legal/garantias/route.ts:270 | table select usuarios | POST /garantias → `AuditoriaLegalApi` | `RegistrarGarantiaUseCase` |
| src/app/api/auditoria-legal/garantias/route.ts:80 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/auditoria-legal/garantias/[id]/route.ts:104 | table select usuarios | PATCH /garantias/{id} → `AuditoriaLegalApi` | `EditarGarantiaUseCase` |
| src/app/api/auditoria-legal/garantias/[id]/route.ts:118 | table select garantias | PATCH /garantias/{id} → `AuditoriaLegalApi` | `EditarGarantiaUseCase` |
| src/app/api/auditoria-legal/garantias/[id]/route.ts:99 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/auditoria-legal/garantias/[id]/custodia/route.ts:61 | table select usuarios | PATCH /garantias/{id}/custodia → `AuditoriaLegalApi` | `CambiarCustodiaGarantiaUseCase` |
| src/app/api/auditoria-legal/garantias/[id]/custodia/route.ts:70 | table select garantias | PATCH /garantias/{id}/custodia → `AuditoriaLegalApi` | `CambiarCustodiaGarantiaUseCase` |
| src/app/api/auditoria-legal/garantias/[id]/custodia/route.ts:101 | table select vendedores | PATCH /garantias/{id}/custodia → `AuditoriaLegalApi` | `CambiarCustodiaGarantiaUseCase` |
| src/app/api/auditoria-legal/garantias/[id]/custodia/route.ts:163 | table select supervisores | PATCH /garantias/{id}/custodia → `AuditoriaLegalApi` | `CambiarCustodiaGarantiaUseCase` |
| src/app/api/auditoria-legal/garantias/[id]/custodia/route.ts:172 | table select usuarios | PATCH /garantias/{id}/custodia → `AuditoriaLegalApi` | `CambiarCustodiaGarantiaUseCase` |
| src/app/api/auditoria-legal/garantias/[id]/custodia/route.ts:57 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/auditoria-legal/garantias/[id]/documento/route.ts:32 | table select usuarios | POST /garantias/{id}/documento/upload-url → `AuditoriaLegalApi` | `CrearUploadDocumentoGarantiaUseCase` |
| src/app/api/auditoria-legal/garantias/[id]/documento/route.ts:61 | table select garantias | POST /garantias/{id}/documento/upload-url → `AuditoriaLegalApi` | `CrearUploadDocumentoGarantiaUseCase` |
| src/app/api/auditoria-legal/garantias/[id]/documento/route.ts:70 | storage upload garantias-legal | POST /garantias/{id}/documento/upload-url → `AuditoriaLegalApi` | `CrearUploadDocumentoGarantiaUseCase` |
| src/app/api/auditoria-legal/garantias/[id]/documento/route.ts:74 | storage getPublicUrl garantias-legal | POST /garantias/{id}/documento → `AuditoriaLegalApi` | `AdjuntarDocumentoGarantiaUseCase` |
| src/app/api/auditoria-legal/garantias/[id]/documento/route.ts:27 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/auditoria-legal/garantias/[id]/pagare/route.ts:58 | table select usuarios | POST /garantias/{id}/pagare → `AuditoriaLegalApi` | `GenerarPagareUseCase` |
| src/app/api/auditoria-legal/garantias/[id]/pagare/route.ts:69 | table select garantias | POST /garantias/{id}/pagare → `AuditoriaLegalApi` | `GenerarPagareUseCase` |
| src/app/api/auditoria-legal/garantias/[id]/pagare/route.ts:54 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/auditoria-legal/solicitudes-actualizacion/route.ts:38 | table select usuarios | POST /solicitudes-actualizacion → `AuditoriaLegalApi` | `CrearSolicitudActualizacionUseCase` |
| src/app/api/auditoria-legal/solicitudes-actualizacion/route.ts:34 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/auditoria-legal/solicitudes-actualizacion/[id]/route.ts:21 | table select usuarios | GET /solicitudes-actualizacion/{id} → `AuditoriaLegalApi` | `GetSolicitudActualizacionUseCase` |
| src/app/api/auditoria-legal/solicitudes-actualizacion/[id]/route.ts:19 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/centro-recursos/aplicaciones/route.ts:8 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/centro-recursos/documentos/route.ts:10 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/chat/route.ts:38 | table select usuarios | POST /chat → `NotificacionesApi` | `EnviarMensajeChatUseCase` |
| src/app/api/chat/route.ts:30 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/clientes/buscar/route.ts:33 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/clientes/contacto/route.ts:19 | table select usuarios | PATCH /clientes/contacto → `ClientesApi` | `ActualizarContactoClienteUseCase` |
| src/app/api/clientes/contacto/route.ts:14 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/clientes/email-cobro/route.ts:65 | table select usuarios | POST /clientes/email-cobro → `ClientesApi` | `EnviarEmailCobroUseCase` |
| src/app/api/clientes/email-cobro/route.ts:44 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/clientes/estado/route.ts:28 | table select usuarios | POST /clientes/estado → `ClientesApi` | `CambiarEstadoClienteUseCase` |
| src/app/api/clientes/estado/route.ts:23 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/clientes/estado-cuenta/route.ts:69 | table select usuarios | POST /clientes/estado-cuenta → `ClientesApi` | `EnviarEstadoCuentaUseCase` |
| src/app/api/clientes/estado-cuenta/route.ts:92 | table select usuarios | POST /clientes/estado-cuenta → `ClientesApi` | `EnviarEstadoCuentaUseCase` |
| src/app/api/clientes/estado-cuenta/route.ts:47 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/clientes/estado-cuenta/data/route.ts:34 | table select usuarios | GET /clientes/estado-cuenta/data → `ClientesApi` | `GetEstadoCuentaDataUseCase` |
| src/app/api/clientes/estado-cuenta/data/route.ts:15 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/clientes/gestiones/route.ts:26 | table select usuarios | PATCH /clientes/gestiones → `GestionesApi` | `UpdateGestionUseCase` |
| src/app/api/clientes/gestiones/route.ts:65 | table select usuarios | PATCH /clientes/gestiones → `GestionesApi` | `UpdateGestionUseCase` |
| src/app/api/clientes/gestiones/route.ts:21 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/clientes/gestiones/route.ts:61 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/clientes/gestiones/nueva/route.ts:83 | table select promesas | POST /clientes/gestiones/nueva → `GestionesApi` | `RegistrarGestionUseCase` |
| src/app/api/clientes/gestiones/nueva/route.ts:132 | table select maestro_clientes | POST /clientes/gestiones/nueva → `GestionesApi` | `RegistrarGestionUseCase` |
| src/app/api/clientes/gestiones/nueva/route.ts:58 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/clientes/logistica/route.ts:34 | table select usuarios | PATCH /clientes/logistica → `ClientesApi` | `ActualizarLogisticaClienteUseCase` |
| src/app/api/clientes/logistica/route.ts:29 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/clientes/pagos/reportar/route.ts:73 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/clientes/promesas/route.ts:71 | table select usuarios | PATCH /clientes/promesas → `PromesasApi` | `ValidarPromesaUseCase` |
| src/app/api/clientes/promesas/route.ts:154 | table select usuarios | PATCH /clientes/promesas → `PromesasApi` | `ValidarPromesaUseCase` |
| src/app/api/clientes/promesas/route.ts:66 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/clientes/promesas/route.ts:150 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/clientes/promesas/reprogramar/route.ts:49 | table select usuarios | POST /clientes/promesas/reprogramar → `PromesasApi` | `ReprogramarPromesaUseCase` |
| src/app/api/clientes/promesas/reprogramar/route.ts:44 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/clientes/recordatorio/route.ts:17 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/gestion-cartera/pedidos-retenidos/[id]/route.ts:20 | table select usuarios | PUT /pedidos-retenidos/{id} → `GestionCarteraApi` | `ActualizarPedidoRetenidoUseCase` |
| src/app/api/gestion-cartera/pedidos-retenidos/[id]/route.ts:16 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/hacienda/route.ts:20 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/hacienda/cabys/route.ts:15 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/notas-rapidas/route.ts:16 | table select usuarios | GET /notas-rapidas → `GestionesApi` | `GetNotaRapidaUseCase` |
| src/app/api/notas-rapidas/route.ts:55 | table select usuarios | GET /notas-rapidas → `GestionesApi` | `GetNotaRapidaUseCase` |
| src/app/api/notas-rapidas/route.ts:12 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/notas-rapidas/route.ts:51 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/preview-rol/route.ts:16 | table select usuarios | POST /me/preview-rol → `MeApi` | `PreviewRolUseCase` |
| src/app/api/preview-rol/route.ts:12 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/reportes/enviar/route.ts:41 | table select usuarios | POST /reportes/enviar → `ReportesApi` | `EnviarReporteUseCase` |
| src/app/api/reportes/enviar/route.ts:35 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/saldos-favor/matching/route.ts:15 | table select usuarios | GET /saldos-favor/matching → `GestionCarteraApi` | `MatchingSaldosFavorUseCase` |
| src/app/api/saldos-favor/matching/route.ts:28 | table select maestro_clientes | GET /saldos-favor/matching → `GestionCarteraApi` | `MatchingSaldosFavorUseCase` |
| src/app/api/saldos-favor/matching/route.ts:11 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/solicitudes/route.ts:62 | table select usuarios | POST /solicitudes → `SolicitudesApi` | `CreateSolicitudUseCase` |
| src/app/api/solicitudes/route.ts:158 | table select usuarios | POST /solicitudes → `SolicitudesApi` | `CreateSolicitudUseCase` |
| src/app/api/solicitudes/route.ts:169 | table select usuarios | POST /solicitudes → `SolicitudesApi` | `CreateSolicitudUseCase` |
| src/app/api/solicitudes/route.ts:349 | table select usuarios | POST /solicitudes → `SolicitudesApi` | `CreateSolicitudUseCase` |
| src/app/api/solicitudes/route.ts:383 | table select usuarios | POST /solicitudes → `SolicitudesApi` | `CreateSolicitudUseCase` |
| src/app/api/solicitudes/route.ts:56 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/solicitudes/[id]/route.ts:23 | table select usuarios | PATCH /solicitudes/{id} → `SolicitudesApi` | `ResolverSolicitudUseCase` |
| src/app/api/solicitudes/[id]/route.ts:19 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/solicitudes/[id]/comentarios/route.ts:27 | table select usuarios | POST /solicitudes/{id}/comentarios → `SolicitudesApi` | `AgregarComentarioSolicitudUseCase` |
| src/app/api/solicitudes/[id]/comentarios/route.ts:23 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/solicitudes/[id]/estado/route.ts:36 | table select usuarios | PATCH /solicitudes/{id}/estado → `SolicitudesApi` | `CambiarEstadoSolicitudUseCase` |
| src/app/api/solicitudes/[id]/estado/route.ts:31 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/sync/cartera/route.ts:15 | table select usuarios | POST /sync/cartera → `JobsApi` → SQS `sync-manual` → `sync-manual-worker` | `SincronizarTablaUseCase` |
| src/app/api/sync/cartera/route.ts:9 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/sync/facturas/route.ts:15 | table select usuarios | POST /sync/facturas → `JobsApi` → SQS `sync-manual` → `sync-manual-worker` | `SincronizarTablaUseCase` |
| src/app/api/sync/facturas/route.ts:9 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/sync/pagos/route.ts:21 | table select usuarios | POST /sync/pagos → `JobsApi` → SQS `sync-manual` → `sync-manual-worker` | `EncolarSyncManualUseCase` |
| src/app/api/sync/pagos/route.ts:15 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/sync/pedidos-retenidos/route.ts:24 | table select usuarios | POST /sync/pedidos-retenidos → `JobsApi` → SQS `sync-manual` → `sync-manual-worker` | `EncolarSyncManualUseCase` |
| src/app/api/sync/pedidos-retenidos/route.ts:18 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/api/sync/saldos_favor/route.ts:15 | table select usuarios | POST /sync/saldos_favor → `JobsApi` → SQS `sync-manual` → `sync-manual-worker` | `SincronizarTablaUseCase` |
| src/app/api/sync/saldos_favor/route.ts:9 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/auth/callback/route.ts:40 | auth exchangeCodeForSession | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/auth/denegado/route.ts:11 | auth signOut | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/login/page.tsx:69 | auth signInWithOAuth | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/app/login/page.tsx:95 | auth signInWithPassword | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/components/topbar.tsx:192 | table select notificaciones | GET /notificaciones → `NotificacionesApi` | `ListNotificacionesUseCase` |
| src/components/topbar.tsx:201 | realtime notificaciones:${usuarioId} | API Gateway WebSocket (src/shared/realtime/realtime-client) | — |
| src/components/topbar.tsx:216 | realtime_cleanup | API Gateway WebSocket (unsubscribe del canal) | — |
| src/components/topbar.tsx:248 | auth signOut | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/components/clientes/ficha/ficha-cliente.tsx:1539 | table insert gestiones | POST /clientes/email-cobro → `ClientesApi` | `EnviarEmailCobroUseCase` |
| src/components/clientes/ficha/ficha-cliente.tsx:1458 | auth getSession | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/components/clientes/ficha/ficha-cliente.tsx:1711 | auth getSession | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/components/clientes/ficha/form-nueva-gestion.tsx:199 | table select maestro_clientes | GET /gestiones/codigos-contribuyente → `GestionesApi` | `ListCodigosContribuyenteUseCase` |
| src/components/clientes/ficha/modal-gestion.tsx:89 | table insert gestiones | POST /gestiones/rapida → `GestionesApi` | `RegistrarGestionRapidaUseCase` |
| src/components/clientes/ficha/modal-gestion.tsx:115 | table insert promesas | POST /gestiones/rapida → `GestionesApi` | `RegistrarGestionRapidaUseCase` |
| src/components/clientes/ficha/modal-nueva-solicitud.tsx:831 | auth getSession | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/components/layout/client-wrapper.tsx:38 | auth onAuthStateChange | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/components/reportes/DimensionFilter.tsx:18 | table select maestro_clientes | GET /reportes/dimensiones → `ReportesApi` | `ListDimensionOpcionesUseCase` |
| src/components/reportes/VendedorEnvioPanel.tsx:84 | auth getSession | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/components/solicitudes/form-nueva-solicitud.tsx:118 | table select facturas | GET /solicitudes/nueva-contexto → `SolicitudesApi` | `GetNuevaSolicitudContextoUseCase` |
| src/components/solicitudes/form-nueva-solicitud.tsx:134 | table select maestro_clientes | GET /solicitudes/nueva-contexto → `SolicitudesApi` | `GetNuevaSolicitudContextoUseCase` |
| src/components/solicitudes/form-solicitud-nueva.tsx:125 | table select facturas | GET /solicitudes/facturas → `SolicitudesApi` | `ListFacturasPendientesUseCase` |
| src/components/solicitudes/form-solicitud-nueva.tsx:247 | auth getSession | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/components/solicitudes/wizard-nueva-solicitud.tsx:798 | auth getSession | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/hooks/useChat.ts:103 | realtime mensajes_chat_realtime | API Gateway WebSocket (src/shared/realtime/realtime-client) | — |
| src/hooks/useChat.ts:129 | realtime_cleanup | API Gateway WebSocket (unsubscribe del canal) | — |
| src/hooks/useChat.ts:136 | realtime presencia_equipo_cyc | API Gateway WebSocket (src/shared/realtime/realtime-client) | — |
| src/hooks/useChat.ts:158 | realtime_cleanup | API Gateway WebSocket (unsubscribe del canal) | — |
| src/hooks/useSessionTimeout.ts:52 | auth signOut | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/lib/configuracion/admin.ts:28 | table select usuarios | GET /configuracion → `ConfiguracionApi` | `GetConfiguracionPantallaUseCase` |
| src/lib/configuracion/admin.ts:23 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| src/lib/utils/analistas-equipo.ts:29 | table select maestro_clientes | GET /me/analistas-con-cartera → `MeApi` | `ListAnalistasConCarteraUseCase` |
| src/lib/utils/cola-analista.ts:282 | table select maestro_clientes | GET /dashboard/mi-cartera → `DashboardApi` | `GetMiCarteraUseCase` |
| src/lib/utils/cola-analista.ts:283 | table select cartera | GET /dashboard/mi-cartera → `DashboardApi` | `GetMiCarteraUseCase` |
| src/lib/utils/cola-analista.ts:310 | table select gestiones | GET /dashboard/mi-cartera → `DashboardApi` | `GetMiCarteraUseCase` |
| src/lib/utils/cola-analista.ts:315 | table select promesas | GET /dashboard/mi-cartera → `DashboardApi` | `GetMiCarteraUseCase` |
| src/lib/utils/cola-analista.ts:319 | table select promesas | GET /dashboard/mi-cartera → `DashboardApi` | `GetMiCarteraUseCase` |
| src/lib/utils/cola-analista.ts:325 | table select icp_por_cliente | GET /dashboard/mi-cartera → `DashboardApi` | `GetMiCarteraUseCase` |
| src/lib/utils/cola-analista.ts:327 | table select pagos | GET /dashboard/mi-cartera → `DashboardApi` | `GetMiCarteraUseCase` |
| src/lib/utils/gmail-token.ts:50 | table select usuarios | GET /me/google/authorize-url → `MeApi` | `GoogleAuthorizeUrlUseCase` |
| src/lib/utils/usuario-actual.ts:49 | table select usuarios | GET /me → `MeApi` | `GetMeUseCase` |
| src/lib/utils/usuario-actual.ts:42 | auth getUser | Amazon Cognito (src/shared/auth/cognito-auth) | — |
| supabase/functions/mark-promesas-incumplidas/index.ts:53 | table select promesas | POST /jobs/conciliar-promesas → `JobsApi` → SQS `sync-manual` → `sync-manual-worker` | `ConciliarPromesasManualUseCase` |
| supabase/functions/mark-promesas-incumplidas/index.ts:80 | table update promesas | POST /jobs/conciliar-promesas → `JobsApi` → SQS `sync-manual` → `sync-manual-worker` | `ConciliarPromesasManualUseCase` |
| supabase/functions/mark-promesas-incumplidas/index.ts:101 | table select usuarios | POST /jobs/conciliar-promesas → `JobsApi` → SQS `sync-manual` → `sync-manual-worker` | `ConciliarPromesasManualUseCase` |
| supabase/functions/mark-promesas-incumplidas/index.ts:131 | table insert notificaciones | POST /jobs/conciliar-promesas → `JobsApi` → SQS `sync-manual` → `sync-manual-worker` | `ConciliarPromesasManualUseCase` |

### 3.2 Endpoints

| Método | Ruta | Función Lambda | Handler | Auth |
|---|---|---|---|---|
| GET | /analisis-pagos/ranking-clientes | AnalisisPagosApi | entrypoints.lambda_handlers.analisis_pagos.analisis_pagos_handler | cognito |
| GET | /analisis-pagos/perfil-vendedor | AnalisisPagosApi | entrypoints.lambda_handlers.analisis_pagos.analisis_pagos_handler | cognito |
| GET | /analisis-pagos/alertas-deterioro | AnalisisPagosApi | entrypoints.lambda_handlers.analisis_pagos.analisis_pagos_handler | cognito |
| GET | /analisis-pagos/concentracion | AnalisisPagosApi | entrypoints.lambda_handlers.analisis_pagos.analisis_pagos_handler | cognito |
| GET | /analisis-pagos/pagos-mes | AnalisisPagosApi | entrypoints.lambda_handlers.analisis_pagos.analisis_pagos_handler | cognito |
| POST | /pagos-anulados | AnalisisPagosApi | entrypoints.lambda_handlers.analisis_pagos.analisis_pagos_handler | cognito |
| DELETE | /pagos-anulados/{no_recibo} | AnalisisPagosApi | entrypoints.lambda_handlers.analisis_pagos.analisis_pagos_handler | cognito |
| POST | /pagos-duplicado-descartado | AnalisisPagosApi | entrypoints.lambda_handlers.analisis_pagos.analisis_pagos_handler | cognito |
| DELETE | /pagos-duplicado-descartado/{no_recibo} | AnalisisPagosApi | entrypoints.lambda_handlers.analisis_pagos.analisis_pagos_handler | cognito |
| GET | /garantias | AuditoriaLegalApi | entrypoints.lambda_handlers.auditoria_legal.auditoria_legal_handler | cognito |
| POST | /garantias | AuditoriaLegalApi | entrypoints.lambda_handlers.auditoria_legal.auditoria_legal_handler | cognito |
| GET | /garantias/sin-garantia | AuditoriaLegalApi | entrypoints.lambda_handlers.auditoria_legal.auditoria_legal_handler | cognito |
| GET | /garantias/vendedores | AuditoriaLegalApi | entrypoints.lambda_handlers.auditoria_legal.auditoria_legal_handler | cognito |
| GET | /garantias/contribuyentes | AuditoriaLegalApi | entrypoints.lambda_handlers.auditoria_legal.auditoria_legal_handler | cognito |
| GET | /garantias/contribuyentes/saldo | AuditoriaLegalApi | entrypoints.lambda_handlers.auditoria_legal.auditoria_legal_handler | cognito |
| GET | /garantias/contribuyentes/garantia-activa | AuditoriaLegalApi | entrypoints.lambda_handlers.auditoria_legal.auditoria_legal_handler | cognito |
| GET | /garantias/contribuyentes/vendedores | AuditoriaLegalApi | entrypoints.lambda_handlers.auditoria_legal.auditoria_legal_handler | cognito |
| GET | /garantias/personas-legales | AuditoriaLegalApi | entrypoints.lambda_handlers.auditoria_legal.auditoria_legal_handler | cognito |
| GET | /garantias/config-pagare | AuditoriaLegalApi | entrypoints.lambda_handlers.auditoria_legal.auditoria_legal_handler | cognito |
| GET | /garantias/carpetas/conteo | AuditoriaLegalApi | entrypoints.lambda_handlers.auditoria_legal.auditoria_legal_handler | cognito |
| GET | /garantias/carpetas/siguiente | AuditoriaLegalApi | entrypoints.lambda_handlers.auditoria_legal.auditoria_legal_handler | cognito |
| PATCH | /garantias/{id} | AuditoriaLegalApi | entrypoints.lambda_handlers.auditoria_legal.auditoria_legal_handler | cognito |
| GET | /garantias/{id}/vendedor | AuditoriaLegalApi | entrypoints.lambda_handlers.auditoria_legal.auditoria_legal_handler | cognito |
| GET | /garantias/{id}/eventos | AuditoriaLegalApi | entrypoints.lambda_handlers.auditoria_legal.auditoria_legal_handler | cognito |
| PATCH | /garantias/{id}/custodia | AuditoriaLegalApi | entrypoints.lambda_handlers.auditoria_legal.auditoria_legal_handler | cognito |
| POST | /garantias/{id}/documento/upload-url | AuditoriaLegalApi | entrypoints.lambda_handlers.auditoria_legal.auditoria_legal_handler | cognito |
| POST | /garantias/{id}/documento | AuditoriaLegalApi | entrypoints.lambda_handlers.auditoria_legal.auditoria_legal_handler | cognito |
| GET | /garantias/{id}/pagare | AuditoriaLegalApi | entrypoints.lambda_handlers.auditoria_legal.auditoria_legal_handler | cognito |
| POST | /garantias/{id}/pagare | AuditoriaLegalApi | entrypoints.lambda_handlers.auditoria_legal.auditoria_legal_handler | cognito |
| GET | /solicitudes-actualizacion | AuditoriaLegalApi | entrypoints.lambda_handlers.auditoria_legal.auditoria_legal_handler | cognito |
| POST | /solicitudes-actualizacion | AuditoriaLegalApi | entrypoints.lambda_handlers.auditoria_legal.auditoria_legal_handler | cognito |
| GET | /solicitudes-actualizacion/{id} | AuditoriaLegalApi | entrypoints.lambda_handlers.auditoria_legal.auditoria_legal_handler | cognito |
| PATCH | /solicitudes-actualizacion/{id} | AuditoriaLegalApi | entrypoints.lambda_handlers.auditoria_legal.auditoria_legal_handler | cognito |
| GET | /actualizar-perfil/{token} | ActualizarPerfilApi | entrypoints.lambda_handlers.actualizar_perfil.actualizar_perfil_handler | none |
| POST | /actualizar-perfil/{token}/archivos | ActualizarPerfilApi | entrypoints.lambda_handlers.actualizar_perfil.actualizar_perfil_handler | none |
| POST | /actualizar-perfil/{token} | ActualizarPerfilApi | entrypoints.lambda_handlers.actualizar_perfil.actualizar_perfil_handler | none |
| GET | /centro-recursos | CentroRecursosApi | entrypoints.lambda_handlers.centro_recursos.centro_recursos_handler | cognito |
| GET | /centro-recursos/aplicaciones | CentroRecursosApi | entrypoints.lambda_handlers.centro_recursos.centro_recursos_handler | cognito |
| POST | /centro-recursos/aplicaciones | CentroRecursosApi | entrypoints.lambda_handlers.centro_recursos.centro_recursos_handler | cognito |
| PUT | /centro-recursos/aplicaciones/{id} | CentroRecursosApi | entrypoints.lambda_handlers.centro_recursos.centro_recursos_handler | cognito |
| GET | /centro-recursos/documentos | CentroRecursosApi | entrypoints.lambda_handlers.centro_recursos.centro_recursos_handler | cognito |
| POST | /centro-recursos/documentos/upload-url | CentroRecursosApi | entrypoints.lambda_handlers.centro_recursos.centro_recursos_handler | cognito |
| POST | /centro-recursos/documentos | CentroRecursosApi | entrypoints.lambda_handlers.centro_recursos.centro_recursos_handler | cognito |
| POST | /centro-recursos/marcas | CentroRecursosApi | entrypoints.lambda_handlers.centro_recursos.centro_recursos_handler | cognito |
| PUT | /centro-recursos/marcas/{id} | CentroRecursosApi | entrypoints.lambda_handlers.centro_recursos.centro_recursos_handler | cognito |
| GET | /clientes | ClientesApi | entrypoints.lambda_handlers.clientes.clientes_handler | cognito |
| GET | /clientes/buscar | ClientesApi | entrypoints.lambda_handlers.clientes.clientes_handler | cognito |
| GET | /clientes/{cod}/ficha | ClientesApi | entrypoints.lambda_handlers.clientes.clientes_handler | cognito |
| PATCH | /clientes/contacto | ClientesApi | entrypoints.lambda_handlers.clientes.clientes_handler | cognito |
| PATCH | /clientes/logistica | ClientesApi | entrypoints.lambda_handlers.clientes.clientes_handler | cognito |
| POST | /clientes/estado | ClientesApi | entrypoints.lambda_handlers.clientes.clientes_handler | cognito |
| POST | /clientes/recordatorio | ClientesApi | entrypoints.lambda_handlers.clientes.clientes_handler | cognito |
| GET | /clientes/estado-cuenta/data | ClientesApi | entrypoints.lambda_handlers.clientes.clientes_handler | cognito |
| POST | /clientes/email-cobro | ClientesApi | entrypoints.lambda_handlers.clientes.clientes_handler | cognito |
| POST | /clientes/estado-cuenta | ClientesApi | entrypoints.lambda_handlers.clientes.clientes_handler | cognito |
| POST | /ai/generate-email | ClientesApi | entrypoints.lambda_handlers.clientes.clientes_handler | cognito |
| GET | /configuracion | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| GET | /configuracion/parametros | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| PUT | /configuracion/parametros | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| GET | /configuracion/semaforo | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| PUT | /configuracion/semaforo | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| GET | /configuracion/sla | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| PUT | /configuracion/sla | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| GET | /configuracion/automatizaciones | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| PUT | /configuracion/automatizaciones | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| GET | /configuracion/automatizaciones/feed | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| PATCH | /configuracion/automatizaciones/feed/{id} | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| GET | /configuracion/cierre-mes | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| PUT | /configuracion/cierre-mes | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| GET | /configuracion/log | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| GET | /configuracion/usuarios | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| POST | /configuracion/usuarios | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| PUT | /configuracion/usuarios/{id} | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| GET | /configuracion/vendedores | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| POST | /configuracion/vendedores | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| PUT | /configuracion/vendedores/{cod} | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| DELETE | /configuracion/vendedores/{cod} | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| GET | /configuracion/supervisores | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| POST | /configuracion/supervisores | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| PUT | /configuracion/supervisores/{cod} | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| DELETE | /configuracion/supervisores/{cod} | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| GET | /configuracion/directorio | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| POST | /configuracion/directorio | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| PUT | /configuracion/directorio/{id} | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| DELETE | /configuracion/directorio/{id} | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| GET | /configuracion/directorio-activo | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| GET | /configuracion/portafolio-acotado | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| POST | /configuracion/portafolio-acotado | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| PUT | /configuracion/portafolio-acotado/{principal_cod} | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| DELETE | /configuracion/portafolio-acotado/{principal_cod} | ConfiguracionApi | entrypoints.lambda_handlers.configuracion.configuracion_handler | cognito |
| GET | /dashboard/coordinador | DashboardApi | entrypoints.lambda_handlers.dashboard.dashboard_handler | cognito |
| GET | /dashboard/analista | DashboardApi | entrypoints.lambda_handlers.dashboard.dashboard_handler | cognito |
| GET | /dashboard/mi-cartera | DashboardApi | entrypoints.lambda_handlers.dashboard.dashboard_handler | cognito |
| GET | /pedidos-retenidos | GestionCarteraApi | entrypoints.lambda_handlers.gestion_cartera.gestion_cartera_handler | cognito |
| PUT | /pedidos-retenidos/{id} | GestionCarteraApi | entrypoints.lambda_handlers.gestion_cartera.gestion_cartera_handler | cognito |
| GET | /saldos-favor | GestionCarteraApi | entrypoints.lambda_handlers.gestion_cartera.gestion_cartera_handler | cognito |
| GET | /saldos-favor/por-cliente | GestionCarteraApi | entrypoints.lambda_handlers.gestion_cartera.gestion_cartera_handler | cognito |
| POST | /saldos-favor/{id}/aplicar | GestionCarteraApi | entrypoints.lambda_handlers.gestion_cartera.gestion_cartera_handler | cognito |
| GET | /saldos-favor/matching | GestionCarteraApi | entrypoints.lambda_handlers.gestion_cartera.gestion_cartera_handler | cognito |
| POST | /gestion-cartera/comprobantes/upload-url | GestionCarteraApi | entrypoints.lambda_handlers.gestion_cartera.gestion_cartera_handler | cognito |
| GET | /gestion-cartera/comprobantes/download-url | GestionCarteraApi | entrypoints.lambda_handlers.gestion_cartera.gestion_cartera_handler | cognito |
| POST | /clientes/pagos/reportar | GestionCarteraApi | entrypoints.lambda_handlers.gestion_cartera.gestion_cartera_handler | cognito |
| GET | /gestiones | GestionesApi | entrypoints.lambda_handlers.gestiones.gestiones_handler | cognito |
| GET | /gestiones/referencias | GestionesApi | entrypoints.lambda_handlers.gestiones.gestiones_handler | cognito |
| GET | /gestiones/codigos-contribuyente | GestionesApi | entrypoints.lambda_handlers.gestiones.gestiones_handler | cognito |
| POST | /gestiones/rapida | GestionesApi | entrypoints.lambda_handlers.gestiones.gestiones_handler | cognito |
| PATCH | /clientes/gestiones | GestionesApi | entrypoints.lambda_handlers.gestiones.gestiones_handler | cognito |
| DELETE | /clientes/gestiones | GestionesApi | entrypoints.lambda_handlers.gestiones.gestiones_handler | cognito |
| POST | /clientes/gestiones/nueva | GestionesApi | entrypoints.lambda_handlers.gestiones.gestiones_handler | cognito |
| GET | /notas-rapidas | GestionesApi | entrypoints.lambda_handlers.gestiones.gestiones_handler | cognito |
| POST | /notas-rapidas | GestionesApi | entrypoints.lambda_handlers.gestiones.gestiones_handler | cognito |
| POST | /ai/formalizar-bitacora | GestionesApi | entrypoints.lambda_handlers.gestiones.gestiones_handler | cognito |
| GET | /me | MeApi | entrypoints.lambda_handlers.me.me_handler | cognito |
| GET | /me/analistas-con-cartera | MeApi | entrypoints.lambda_handlers.me.me_handler | cognito |
| POST | /me/preview-rol | MeApi | entrypoints.lambda_handlers.me.me_handler | cognito |
| GET | /me/google/authorize-url | MeApi | entrypoints.lambda_handlers.me.me_handler | cognito |
| POST | /me/google/connect | MeApi | entrypoints.lambda_handlers.me.me_handler | cognito |
| GET | /me/calendar/events | MeApi | entrypoints.lambda_handlers.me.me_handler | cognito |
| POST | /sync/pagos | JobsApi | entrypoints.lambda_handlers.jobs.jobs_handler | cognito |
| POST | /sync/pedidos-retenidos | JobsApi | entrypoints.lambda_handlers.jobs.jobs_handler | cognito |
| POST | /sync/cartera | JobsApi | entrypoints.lambda_handlers.jobs.jobs_handler | cognito |
| POST | /sync/facturas | JobsApi | entrypoints.lambda_handlers.jobs.jobs_handler | cognito |
| POST | /sync/saldos_favor | JobsApi | entrypoints.lambda_handlers.jobs.jobs_handler | cognito |
| GET | /sync/historial | JobsApi | entrypoints.lambda_handlers.jobs.jobs_handler | cognito |
| GET | /sync/estado | JobsApi | entrypoints.lambda_handlers.jobs.jobs_handler | cognito |
| POST | /ingesta/{tabla} | IngestaApi | entrypoints.lambda_handlers.ingesta.ingesta_handler | none |
| POST | /jobs/conciliar-promesas | JobsApi | entrypoints.lambda_handlers.jobs.jobs_handler | cognito |
| GET | /notificaciones | NotificacionesApi | entrypoints.lambda_handlers.notificaciones.notificaciones_handler | cognito |
| PATCH | /notificaciones/{id} | NotificacionesApi | entrypoints.lambda_handlers.notificaciones.notificaciones_handler | cognito |
| POST | /notificaciones/leer-todas | NotificacionesApi | entrypoints.lambda_handlers.notificaciones.notificaciones_handler | cognito |
| GET | /chat | NotificacionesApi | entrypoints.lambda_handlers.notificaciones.notificaciones_handler | cognito |
| POST | /chat | NotificacionesApi | entrypoints.lambda_handlers.notificaciones.notificaciones_handler | cognito |
| GET | /tipo-cambio | NotificacionesApi | entrypoints.lambda_handlers.notificaciones.notificaciones_handler | cognito |
| GET | /hacienda | NotificacionesApi | entrypoints.lambda_handlers.notificaciones.notificaciones_handler | cognito |
| GET | /hacienda/cabys | NotificacionesApi | entrypoints.lambda_handlers.notificaciones.notificaciones_handler | cognito |
| GET | /presupuesto/mes | PresupuestoApi | entrypoints.lambda_handlers.presupuesto.presupuesto_handler | cognito |
| POST | /presupuesto/mes/congelar | PresupuestoApi | entrypoints.lambda_handlers.presupuesto.presupuesto_handler | cognito |
| POST | /presupuesto/mes/meta | PresupuestoApi | entrypoints.lambda_handlers.presupuesto.presupuesto_handler | cognito |
| POST | /presupuesto/mes/reasignar | PresupuestoApi | entrypoints.lambda_handlers.presupuesto.presupuesto_handler | cognito |
| GET | /presupuesto/vendedores | PresupuestoApi | entrypoints.lambda_handlers.presupuesto.presupuesto_handler | cognito |
| GET | /presupuesto/destinatarios | PresupuestoApi | entrypoints.lambda_handlers.presupuesto.presupuesto_handler | cognito |
| POST | /presupuesto/enviar | PresupuestoApi | entrypoints.lambda_handlers.presupuesto.presupuesto_handler | cognito |
| GET | /presupuesto/recuperacion | PresupuestoApi | entrypoints.lambda_handlers.presupuesto.presupuesto_handler | cognito |
| GET | /presupuesto/proyeccion | PresupuestoApi | entrypoints.lambda_handlers.presupuesto.presupuesto_handler | cognito |
| GET | /presupuesto/sin-pago | PresupuestoApi | entrypoints.lambda_handlers.presupuesto.presupuesto_handler | cognito |
| GET | /presupuesto/recuperacion-mom | PresupuestoApi | entrypoints.lambda_handlers.presupuesto.presupuesto_handler | cognito |
| GET | /presupuesto/recuperacion-periodo | PresupuestoApi | entrypoints.lambda_handlers.presupuesto.presupuesto_handler | cognito |
| GET | /presupuesto/recuperacion-tramos | PresupuestoApi | entrypoints.lambda_handlers.presupuesto.presupuesto_handler | cognito |
| GET | /presupuesto/meta-analista | PresupuestoApi | entrypoints.lambda_handlers.presupuesto.presupuesto_handler | cognito |
| GET | /promesas | PromesasApi | entrypoints.lambda_handlers.promesas.promesas_handler | cognito |
| PATCH | /clientes/promesas | PromesasApi | entrypoints.lambda_handlers.promesas.promesas_handler | cognito |
| DELETE | /clientes/promesas | PromesasApi | entrypoints.lambda_handlers.promesas.promesas_handler | cognito |
| POST | /clientes/promesas/reprogramar | PromesasApi | entrypoints.lambda_handlers.promesas.promesas_handler | cognito |
| GET | /reportes/aging | ReportesApi | entrypoints.lambda_handlers.reportes.reportes_handler | cognito |
| GET | /reportes/cei | ReportesApi | entrypoints.lambda_handlers.reportes.reportes_handler | cognito |
| POST | /reportes/cei/cierre | ReportesApi | entrypoints.lambda_handlers.reportes.reportes_handler | cognito |
| GET | /reportes/efectividad | ReportesApi | entrypoints.lambda_handlers.reportes.reportes_handler | cognito |
| GET | /reportes/icp-vendedor | ReportesApi | entrypoints.lambda_handlers.reportes.reportes_handler | cognito |
| GET | /reportes/migracion-mora | ReportesApi | entrypoints.lambda_handlers.reportes.reportes_handler | cognito |
| GET | /reportes/migracion-mora/filtros | ReportesApi | entrypoints.lambda_handlers.reportes.reportes_handler | cognito |
| GET | /reportes/mora-vendedor | ReportesApi | entrypoints.lambda_handlers.reportes.reportes_handler | cognito |
| GET | /reportes/bloqueados | ReportesApi | entrypoints.lambda_handlers.reportes.reportes_handler | cognito |
| GET | /reportes/plazo-especial | ReportesApi | entrypoints.lambda_handlers.reportes.reportes_handler | cognito |
| GET | /reportes/portafolio-destinatarios | ReportesApi | entrypoints.lambda_handlers.reportes.reportes_handler | cognito |
| GET | /reportes/dimensiones | ReportesApi | entrypoints.lambda_handlers.reportes.reportes_handler | cognito |
| GET | /reportes/estados-cuenta | ReportesApi | entrypoints.lambda_handlers.reportes.reportes_handler | cognito |
| GET | /reportes/cartera-vencida | ReportesApi | entrypoints.lambda_handlers.reportes.reportes_handler | cognito |
| GET | /reportes/gestiones-periodo | ReportesApi | entrypoints.lambda_handlers.reportes.reportes_handler | cognito |
| GET | /reportes/resumen-ejecutivo | ReportesApi | entrypoints.lambda_handlers.reportes.reportes_handler | cognito |
| GET | /reportes/cierre-mensual | ReportesApi | entrypoints.lambda_handlers.reportes.reportes_handler | cognito |
| POST | /reportes/enviar | ReportesApi | entrypoints.lambda_handlers.reportes.reportes_handler | cognito |
| GET | /solicitudes | SolicitudesApi | entrypoints.lambda_handlers.solicitudes.solicitudes_handler | cognito |
| POST | /solicitudes | SolicitudesApi | entrypoints.lambda_handlers.solicitudes.solicitudes_handler | cognito |
| GET | /solicitudes/nueva-clientes | SolicitudesApi | entrypoints.lambda_handlers.solicitudes.solicitudes_handler | cognito |
| GET | /solicitudes/nueva-contexto | SolicitudesApi | entrypoints.lambda_handlers.solicitudes.solicitudes_handler | cognito |
| GET | /solicitudes/facturas | SolicitudesApi | entrypoints.lambda_handlers.solicitudes.solicitudes_handler | cognito |
| POST | /solicitudes/adjuntos/upload-url | SolicitudesApi | entrypoints.lambda_handlers.solicitudes.solicitudes_handler | cognito |
| GET | /solicitudes/{id} | SolicitudesApi | entrypoints.lambda_handlers.solicitudes.solicitudes_handler | cognito |
| PATCH | /solicitudes/{id} | SolicitudesApi | entrypoints.lambda_handlers.solicitudes.solicitudes_handler | cognito |
| PATCH | /solicitudes/{id}/estado | SolicitudesApi | entrypoints.lambda_handlers.solicitudes.solicitudes_handler | cognito |
| POST | /solicitudes/{id}/comentarios | SolicitudesApi | entrypoints.lambda_handlers.solicitudes.solicitudes_handler | cognito |

### 3.3 Objetos de base de datos

| Origen | Aurora | Tipo |
|---|---|---|
| public.cartera | cof_dev_cyc_cofersa_sch_core.tbl_cartera | table |
| public.cartera_id_seq | cof_dev_cyc_cofersa_sch_core.seq_cartera_id | sequence |
| public.centro_recursos_aplicaciones | cof_dev_cyc_cofersa_sch_core.tbl_centro_recursos_aplicaciones | table |
| public.centro_recursos_documentos | cof_dev_cyc_cofersa_sch_core.tbl_centro_recursos_documentos | table |
| public.config_audit_log | cof_dev_cyc_cofersa_sch_core.tbl_config_audit_log | table |
| public.config_sistema | cof_dev_cyc_cofersa_sch_core.tbl_config_sistema | table |
| public.cuentas_bancarias | cof_dev_cyc_cofersa_sch_core.tbl_cuentas_bancarias | table |
| public.cuentas_bancarias_id_seq | cof_dev_cyc_cofersa_sch_core.seq_cuentas_bancarias_id | sequence |
| public.directorio_empresa | cof_dev_cyc_cofersa_sch_core.tbl_directorio_empresa | table |
| public.facturas | cof_dev_cyc_cofersa_sch_core.tbl_facturas | table |
| public.facturas_id_seq | cof_dev_cyc_cofersa_sch_core.seq_facturas_id | sequence |
| public.garantia_eventos | cof_dev_cyc_cofersa_sch_core.tbl_garantia_eventos | table |
| public.garantias | cof_dev_cyc_cofersa_sch_core.tbl_garantias | table |
| public.garantias_consecutivo_anual | cof_dev_cyc_cofersa_sch_core.tbl_garantias_consecutivo_anual | table |
| public.gestiones | cof_dev_cyc_cofersa_sch_core.tbl_gestiones | table |
| public.historico_aging_factura | cof_dev_cyc_cofersa_sch_core.tbl_historico_aging_factura | table |
| public.historico_bloqueados | cof_dev_cyc_cofersa_sch_core.tbl_historico_bloqueados | table |
| public.historico_bloqueados_id_seq | cof_dev_cyc_cofersa_sch_core.seq_historico_bloqueados_id | sequence |
| public.historico_cartera | cof_dev_cyc_cofersa_sch_core.tbl_historico_cartera | table |
| public.historico_cierres_cartera | cof_dev_cyc_cofersa_sch_core.tbl_historico_cierres_cartera | table |
| public.historico_pedidos_retenidos | cof_dev_cyc_cofersa_sch_core.tbl_historico_pedidos_retenidos | table |
| public.icp_por_cliente | cof_dev_cyc_cofersa_sch_core.vw_icp_por_cliente | view |
| public.maestro_clientes | cof_dev_cyc_cofersa_sch_core.tbl_maestro_clientes | table |
| public.maestro_clientes_id_seq | cof_dev_cyc_cofersa_sch_core.seq_maestro_clientes_id | sequence |
| public.marcas | cof_dev_cyc_cofersa_sch_core.tbl_marcas | table |
| public.notas_rapidas | cof_dev_cyc_cofersa_sch_core.tbl_notas_rapidas | table |
| public.notificaciones | cof_dev_cyc_cofersa_sch_core.tbl_notificaciones | table |
| public.pagos | cof_dev_cyc_cofersa_sch_core.tbl_pagos | table |
| public.pagos_anulados | cof_dev_cyc_cofersa_sch_core.tbl_pagos_anulados | table |
| public.pagos_duplicado_descartado | cof_dev_cyc_cofersa_sch_core.tbl_pagos_duplicado_descartado | table |
| public.pagos_stage | cof_dev_cyc_cofersa_sch_core.tbl_pagos_stage | table |
| public.pedidos_retenidos | cof_dev_cyc_cofersa_sch_core.tbl_pedidos_retenidos | table |
| public.pedidos_retenidos_stage | cof_dev_cyc_cofersa_sch_core.tbl_pedidos_retenidos_stage | table |
| public.personas_legales | cof_dev_cyc_cofersa_sch_core.tbl_personas_legales | table |
| public.portafolio_acotado | cof_dev_cyc_cofersa_sch_core.tbl_portafolio_acotado | table |
| public.portafolio_grupos | cof_dev_cyc_cofersa_sch_core.tbl_portafolio_grupos | table |
| public.presupuesto_cobro | cof_dev_cyc_cofersa_sch_core.tbl_presupuesto_cobro | table |
| public.presupuesto_cobro_id_seq | cof_dev_cyc_cofersa_sch_core.seq_presupuesto_cobro_id | sequence |
| public.presupuesto_meta_vendedor | cof_dev_cyc_cofersa_sch_core.tbl_presupuesto_meta_vendedor | table |
| public.presupuesto_meta_vendedor_id_seq | cof_dev_cyc_cofersa_sch_core.seq_presupuesto_meta_vendedor_id | sequence |
| public.promesas | cof_dev_cyc_cofersa_sch_core.tbl_promesas | table |
| public.proyeccion_semana_snapshot | cof_dev_cyc_cofersa_sch_core.tbl_proyeccion_semana_snapshot | table |
| public.reporte_pago_detalles | cof_dev_cyc_cofersa_sch_core.tbl_reporte_pago_detalles | table |
| public.reportes_pago | cof_dev_cyc_cofersa_sch_core.tbl_reportes_pago | table |
| public.saldos_favor | cof_dev_cyc_cofersa_sch_core.tbl_saldos_favor | table |
| public.solicitud_comentarios | cof_dev_cyc_cofersa_sch_core.tbl_solicitud_comentarios | table |
| public.solicitud_historial_estados | cof_dev_cyc_cofersa_sch_core.tbl_solicitud_historial_estados | table |
| public.solicitudes | cof_dev_cyc_cofersa_sch_core.tbl_solicitudes | table |
| public.solicitudes_actualizacion | cof_dev_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion | table |
| public.solicitudes_actualizacion_id_seq | cof_dev_cyc_cofersa_sch_core.seq_solicitudes_actualizacion_id | sequence |
| public.solicitudes_consecutivo_seq | cof_dev_cyc_cofersa_sch_core.seq_solicitudes_numero_consecutivo | sequence |
| public.supervisores | cof_dev_cyc_cofersa_sch_core.tbl_supervisores | table |
| public.sync_log | cof_dev_cyc_cofersa_sch_core.tbl_sync_log | table |
| public.sync_log_id_seq | cof_dev_cyc_cofersa_sch_core.seq_sync_log_id | sequence |
| public.sync_salud | cof_dev_cyc_cofersa_sch_core.tbl_sync_salud | table |
| public.usuarios | cof_dev_cyc_cofersa_sch_core.tbl_usuarios | table |
| public.v_automatizaciones_feed | cof_dev_cyc_cofersa_sch_core.vw_v_automatizaciones_feed | view |
| public.vendedores | cof_dev_cyc_cofersa_sch_core.tbl_vendedores | table |
| public.ventas_mensuales | cof_dev_cyc_cofersa_sch_core.tbl_ventas_mensuales | table |
| auth.users | cof_dev_cyc_cofersa_sch_core.tbl_app_users | table |
| public._recalc_metas | cof_dev_cyc_cofersa_sch_core.fn__recalc_metas | function |
| public.fn_actualizar_contacto_cliente | cof_dev_cyc_cofersa_sch_core.fn_actualizar_contacto_cliente | function |
| public.fn_actualizar_logistica_cliente | cof_dev_cyc_cofersa_sch_core.fn_actualizar_logistica_cliente | function |
| public.fn_aging_por_dimension | cof_dev_cyc_cofersa_sch_core.fn_aging_por_dimension | function |
| public.fn_analisis_alertas_deterioro | cof_dev_cyc_cofersa_sch_core.fn_analisis_alertas_deterioro | function |
| public.fn_analisis_concentracion | cof_dev_cyc_cofersa_sch_core.fn_analisis_concentracion | function |
| public.fn_analisis_perfil_vendedor | cof_dev_cyc_cofersa_sch_core.fn_analisis_perfil_vendedor | function |
| public.fn_analisis_ranking_clientes | cof_dev_cyc_cofersa_sch_core.fn_analisis_ranking_clientes | function |
| public.fn_asignar_analista_por_vendedor | cof_dev_cyc_cofersa_sch_core.fn_asignar_analista_por_vendedor | function |
| public.fn_automatizaciones_resumen | cof_dev_cyc_cofersa_sch_core.fn_automatizaciones_resumen | function |
| public.fn_buscar_contribuyentes | cof_dev_cyc_cofersa_sch_core.fn_buscar_contribuyentes | function |
| public.fn_cargar_pagos_stage | cof_dev_cyc_cofersa_sch_core.fn_cargar_pagos_stage | function |
| public.fn_check_recibos_reversion | cof_dev_cyc_cofersa_sch_core.fn_check_recibos_reversion | function |
| public.fn_check_sync_salud | cof_dev_cyc_cofersa_sch_core.fn_check_sync_salud | function |
| public.fn_cierre_mensual_icp | cof_dev_cyc_cofersa_sch_core.fn_cierre_mensual_icp | function |
| public.fn_cierre_mensual_meses | cof_dev_cyc_cofersa_sch_core.fn_cierre_mensual_meses | function |
| public.fn_cierre_mensual_mora | cof_dev_cyc_cofersa_sch_core.fn_cierre_mensual_mora | function |
| public.fn_cierre_mensual_pedidos_retenidos | cof_dev_cyc_cofersa_sch_core.fn_cierre_mensual_pedidos_retenidos | function |
| public.fn_cierre_mensual_riesgo_vendedor | cof_dev_cyc_cofersa_sch_core.fn_cierre_mensual_riesgo_vendedor | function |
| public.fn_clientes_lista | cof_dev_cyc_cofersa_sch_core.fn_clientes_lista | function |
| public.fn_cola_del_dia | cof_dev_cyc_cofersa_sch_core.fn_cola_del_dia | function |
| public.fn_conciliar_promesas | cof_dev_cyc_cofersa_sch_core.fn_conciliar_promesas | function |
| public.fn_contar_garantias_en_carpeta | cof_dev_cyc_cofersa_sch_core.fn_contar_garantias_en_carpeta | function |
| public.fn_cron_cierre_mensual | cof_dev_cyc_cofersa_sch_core.fn_cron_cierre_mensual | function |
| public.fn_dashboard_analista_kpis | cof_dev_cyc_cofersa_sch_core.fn_dashboard_analista_kpis | function |
| public.fn_dashboard_vendedores_analista | cof_dev_cyc_cofersa_sch_core.fn_dashboard_vendedores_analista | function |
| public.fn_es_usuario_activo | cof_dev_cyc_cofersa_sch_core.fn_es_usuario_activo | function |
| public.fn_estados_cuenta | cof_dev_cyc_cofersa_sch_core.fn_estados_cuenta | function |
| public.fn_expirar_solicitudes_actualizacion | cof_dev_cyc_cofersa_sch_core.fn_expirar_solicitudes_actualizacion | function |
| public.fn_garantias_clientes_sin_garantia | cof_dev_cyc_cofersa_sch_core.fn_garantias_clientes_sin_garantia | function |
| public.fn_garantias_lista | cof_dev_cyc_cofersa_sch_core.fn_garantias_lista | function |
| public.fn_matching_saldos_favor | cof_dev_cyc_cofersa_sch_core.fn_matching_saldos_favor | function |
| public.fn_meta_analista_mes | cof_dev_cyc_cofersa_sch_core.fn_meta_analista_mes | function |
| public.fn_normalizar_analista_nombre | cof_dev_cyc_cofersa_sch_core.fn_normalizar_analista_nombre | function |
| public.fn_notificar_pedido_en_regla | cof_dev_cyc_cofersa_sch_core.fn_notificar_pedido_en_regla | function |
| public.fn_notificar_pedido_retenido | cof_dev_cyc_cofersa_sch_core.fn_notificar_pedido_retenido | function |
| public.fn_notificar_promesas_hoy | cof_dev_cyc_cofersa_sch_core.fn_notificar_promesas_hoy | function |
| public.fn_notificar_sin_gestion | cof_dev_cyc_cofersa_sch_core.fn_notificar_sin_gestion | function |
| public.fn_notificar_sla_vencido | cof_dev_cyc_cofersa_sch_core.fn_notificar_sla_vencido | function |
| public.fn_pagos_mes_resumen | cof_dev_cyc_cofersa_sch_core.fn_pagos_mes_resumen | function |
| public.fn_pedidos_retenidos | cof_dev_cyc_cofersa_sch_core.fn_pedidos_retenidos | function |
| public.fn_portafolio_destinatarios | cof_dev_cyc_cofersa_sch_core.fn_portafolio_destinatarios | function |
| public.fn_presupuesto_calc | cof_dev_cyc_cofersa_sch_core.fn_presupuesto_calc | function |
| public.fn_presupuesto_frozen | cof_dev_cyc_cofersa_sch_core.fn_presupuesto_frozen | function |
| public.fn_presupuesto_guardar | cof_dev_cyc_cofersa_sch_core.fn_presupuesto_guardar | function |
| public.fn_presupuesto_meta | cof_dev_cyc_cofersa_sch_core.fn_presupuesto_meta | function |
| public.fn_presupuesto_preview | cof_dev_cyc_cofersa_sch_core.fn_presupuesto_preview | function |
| public.fn_presupuesto_reasignar | cof_dev_cyc_cofersa_sch_core.fn_presupuesto_reasignar | function |
| public.fn_propagar_analista_vendedor | cof_dev_cyc_cofersa_sch_core.fn_propagar_analista_vendedor | function |
| public.fn_proteger_contacto_manual | cof_dev_cyc_cofersa_sch_core.fn_proteger_contacto_manual | function |
| public.fn_proteger_logistica_manual | cof_dev_cyc_cofersa_sch_core.fn_proteger_logistica_manual | function |
| public.fn_proyeccion_cobro | cof_dev_cyc_cofersa_sch_core.fn_proyeccion_cobro | function |
| public.fn_recuperacion | cof_dev_cyc_cofersa_sch_core.fn_recuperacion | function |
| public.fn_recuperacion_mom | cof_dev_cyc_cofersa_sch_core.fn_recuperacion_mom | function |
| public.fn_recuperacion_periodo | cof_dev_cyc_cofersa_sch_core.fn_recuperacion_periodo | function |
| public.fn_recuperacion_tramos | cof_dev_cyc_cofersa_sch_core.fn_recuperacion_tramos | function |
| public.fn_registrar_historico_cartera | cof_dev_cyc_cofersa_sch_core.fn_registrar_historico_cartera | function |
| public.fn_reporte_aging | cof_dev_cyc_cofersa_sch_core.fn_reporte_aging | function |
| public.fn_reporte_bloqueados | cof_dev_cyc_cofersa_sch_core.fn_reporte_bloqueados | function |
| public.fn_reporte_cei | cof_dev_cyc_cofersa_sch_core.fn_reporte_cei | function |
| public.fn_reporte_efectividad | cof_dev_cyc_cofersa_sch_core.fn_reporte_efectividad | function |
| public.fn_reporte_migracion_mora | cof_dev_cyc_cofersa_sch_core.fn_reporte_migracion_mora | function |
| public.fn_reporte_mora_vendedor | cof_dev_cyc_cofersa_sch_core.fn_reporte_mora_vendedor | function |
| public.fn_reporte_plazo_especial | cof_dev_cyc_cofersa_sch_core.fn_reporte_plazo_especial | function |
| public.fn_resolver_responsables_contribuyente | cof_dev_cyc_cofersa_sch_core.fn_resolver_responsables_contribuyente | function |
| public.fn_saldo_contribuyente | cof_dev_cyc_cofersa_sch_core.fn_saldo_contribuyente | function |
| public.fn_saldos_favor | cof_dev_cyc_cofersa_sch_core.fn_saldos_favor | function |
| public.fn_siguiente_carpeta_disponible | cof_dev_cyc_cofersa_sch_core.fn_siguiente_carpeta_disponible | function |
| public.fn_siguiente_consecutivo_garantia | cof_dev_cyc_cofersa_sch_core.fn_siguiente_consecutivo_garantia | function |
| public.fn_sin_pago_cliente | cof_dev_cyc_cofersa_sch_core.fn_sin_pago_cliente | function |
| public.fn_sincronizar_analista_nombre | cof_dev_cyc_cofersa_sch_core.fn_sincronizar_analista_nombre | function |
| public.fn_snapshot_aging_factura | cof_dev_cyc_cofersa_sch_core.fn_snapshot_aging_factura | function |
| public.fn_snapshot_bloqueados_semana | cof_dev_cyc_cofersa_sch_core.fn_snapshot_bloqueados_semana | function |
| public.fn_snapshot_cierre_cartera | cof_dev_cyc_cofersa_sch_core.fn_snapshot_cierre_cartera | function |
| public.fn_snapshot_cierre_completo | cof_dev_cyc_cofersa_sch_core.fn_snapshot_cierre_completo | function |
| public.fn_snapshot_proyeccion_semana | cof_dev_cyc_cofersa_sch_core.fn_snapshot_proyeccion_semana | function |
| public.fn_sync_cartera | cof_dev_cyc_cofersa_sch_core.fn_sync_cartera | function |
| public.fn_sync_facturas | cof_dev_cyc_cofersa_sch_core.fn_sync_facturas | function |
| public.fn_sync_pagos | cof_dev_cyc_cofersa_sch_core.fn_sync_pagos | function |
| public.fn_sync_pedidos_retenidos | cof_dev_cyc_cofersa_sch_core.fn_sync_pedidos_retenidos | function |
| public.fn_sync_saldos_favor | cof_dev_cyc_cofersa_sch_core.fn_sync_saldos_favor | function |
| public.fn_sync_salud_eval | cof_dev_cyc_cofersa_sch_core.fn_sync_salud_eval | function |
| public.fn_tendencia_pago_cliente | cof_dev_cyc_cofersa_sch_core.fn_tendencia_pago_cliente | function |
| public.fn_vendedores_por_contribuyente | cof_dev_cyc_cofersa_sch_core.fn_vendedores_por_contribuyente | function |
| public.get_kpis_cartera | cof_dev_cyc_cofersa_sch_core.fn_get_kpis_cartera | function |
| public.get_kpis_saldos_favor | cof_dev_cyc_cofersa_sch_core.fn_get_kpis_saldos_favor | function |
| public.get_mi_rol | cof_dev_cyc_cofersa_sch_core.fn_get_mi_rol | function |
| public.get_usuario_id | cof_dev_cyc_cofersa_sch_core.fn_get_usuario_id | function |
| public.set_updated_at | cof_dev_cyc_cofersa_sch_core.fn_set_updated_at | function |
| public.update_updated_at | cof_dev_cyc_cofersa_sch_core.fn_update_updated_at | function |
| auth.uid() | fn_auth_uid() | auth helper |
| auth.role() | fn_auth_role() | auth helper |
| auth.email() | fn_auth_email() | auth helper |
| auth.jwt() | fn_auth_jwt() | auth helper |

Roles: `ro_cyc_cofersa`, `rw_cyc_cofersa`, `ddl_cyc_cofersa`, `admin_cyc_cofersa` · Usuarios: `usr_cyc_cofersa_report`, `usr_cyc_cofersa_app`, `usr_cyc_cofersa_deploy`, `usr_cyc_cofersa_dba` · search_path: `cof_dev_cyc_cofersa_sch_core`

### 3.4 Políticas RLS → reglas de autorización

| Tabla | Regla | Comando | Condición | Se aplica en |
|---|---|---|---|---|
| public.pagos | pagos_select_usuarios_activos | SELECT | (EXISTS ( SELECT 1    FROM usuarios   WHERE ((usuarios.email = (auth.jwt() ->> 'email'::text)) AND (usuarios.activo = true)))) | GetRankingClientesUseCase / GetPerfilVendedorUseCase / GetAlertasDeterioroUseCase (require_usuario + scope_email: ANALISTA o ANALISTA_RIESGO con cartera solo su email), GetConcentracionUseCase (require_usuario; ForbiddenError para quien gestiona cartera propia), GetPagosMesResumenUseCase (require_roles COORDINADOR\|GERENCIA) |
| public.pagos | pagos_write_coordinador | ALL | (EXISTS ( SELECT 1    FROM usuarios   WHERE ((usuarios.email = (auth.jwt() ->> 'email'::text)) AND (usuarios.rol = 'COORDINADOR'::text) AND (usuarios.activo = true)))) | Sin escrituras desde la API: tbl_pagos solo la escribe la sincronización (fn_sync_pagos / módulo jobs). Este módulo solo lee pagos vía fn_* SECURITY DEFINER. |
| public.pagos_anulados | Solo coordinador accede a pagos_anulados | ALL | (EXISTS ( SELECT 1    FROM usuarios   WHERE ((usuarios.email = (auth.jwt() ->> 'email'::text)) AND (usuarios.rol = 'COORDINADOR'::text) AND (usuarios.activo = true)))) | MarcarPagosAnuladosUseCase / DesmarcarPagoAnuladoUseCase (require_usuario + require_coordinador, 'Acceso restringido al coordinador'); la lectura solo ocurre dentro de fn_pagos_mes_resumen (GetPagosMesResumenUseCase: COORDINADOR\|GERENCIA) |
| public.pagos_duplicado_descartado | Solo coordinador accede a pagos_duplicado_descartado | ALL | (EXISTS ( SELECT 1    FROM usuarios   WHERE ((usuarios.email = (auth.jwt() ->> 'email'::text)) AND (usuarios.rol = 'COORDINADOR'::text) AND (usuarios.activo = true)))) | DescartarDuplicadoUseCase / RevertirDescarteDuplicadoUseCase (require_usuario + require_coordinador); la lectura solo ocurre dentro de fn_pagos_mes_resumen (GetPagosMesResumenUseCase: COORDINADOR\|GERENCIA) |
| public.garantias | garantias_select_activos | SELECT | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | List/Get*UseCase de auditoria_legal (require_modulo = require_usuario activo; ANALISTA_RIESGO 403) |
| public.garantias | garantias_insert_activos | INSERT | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | RegistrarGarantiaUseCase (require_escritura_modulo: usuario activo, no ANALISTA_RIESGO, no GERENCIA) |
| public.garantias | garantias_update_activos | UPDATE | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | EditarGarantiaUseCase, CambiarCustodiaGarantiaUseCase, AdjuntarDocumentoGarantiaUseCase, GenerarPagareUseCase, RegistrarGarantiaUseCase (sustitución) — require_escritura_modulo |
| public.garantia_eventos | garantia_eventos_select_activos | SELECT | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | ListEventosGarantiaUseCase (require_modulo) |
| public.garantia_eventos | garantia_eventos_insert_activos | INSERT | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | Use cases de escritura de garantías (require_escritura_modulo); usuario_id = perfil del principal |
| public.garantias_consecutivo_anual | garantias_consecutivo_anual_bloqueada | ALL | false | Sin acceso directo: solo fn_siguiente_consecutivo_garantia desde RegistrarGarantiaUseCase (repository) |
| public.personas_legales | personas_legales_select_activos | SELECT | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | ListPersonasLegalesUseCase (require_modulo) |
| public.personas_legales | personas_legales_insert_activos | INSERT | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | GenerarPagareUseCase y GestionarSolicitudActualizacionUseCase APROBAR (require_escritura_modulo) |
| public.personas_legales | personas_legales_update_activos | UPDATE | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | GenerarPagareUseCase y GestionarSolicitudActualizacionUseCase APROBAR (upsert, require_escritura_modulo) |
| public.solicitudes_actualizacion | solicitudes_actualizacion_select_activos | SELECT | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | ListSolicitudesActualizacionUseCase, GetSolicitudActualizacionUseCase (require_modulo); portal público: solo por SHA-256 del token vigente (ValidarTokenActualizacionUseCase) |
| public.solicitudes_actualizacion | solicitudes_actualizacion_insert_activos | INSERT | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | CrearSolicitudActualizacionUseCase (require_escritura_modulo + límite 30/hora por usuario) |
| public.solicitudes_actualizacion | solicitudes_actualizacion_update_activos | UPDATE | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | GestionarSolicitudActualizacionUseCase (require_escritura_modulo); EnviarActualizacionPerfilUseCase (token vigente + CAS estado ENVIADA) |
| storage.objects | usuarios_activos_suben_garantias_legal | INSERT | ((bucket_id = 'garantias-legal'::text) AND fn_es_usuario_activo()) | CrearUploadDocumentoGarantiaUseCase (require_escritura_modulo antes de firmar la URL PUT; key generada por el backend `<id>_<ms>.pdf`, PDF ≤4MB) |
| public.centro_recursos_aplicaciones | authenticated_read_aplicaciones | SELECT | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | GetCentroRecursosUseCase / ListAplicacionesUseCase (require_usuario = usuario activo); escritura solo CrearAplicacionUseCase / ActualizarAplicacionUseCase (require_coordinador, rol real) |
| public.centro_recursos_documentos | authenticated_read_documentos | SELECT | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | GetCentroRecursosUseCase / ListDocumentosUseCase (require_usuario = usuario activo); escritura solo CrearUrlCargaDocumentoUseCase / CrearDocumentoUseCase (require_coordinador) |
| public.marcas | authenticated_read_marcas | SELECT | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | GetCentroRecursosUseCase (require_usuario = usuario activo); escritura solo CrearMarcaUseCase / ActualizarMarcaUseCase (require_coordinador) |
| public.cartera | cartera_select_autenticados | SELECT | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | ListClientesUseCase / GetFichaClienteUseCase (require_usuario: usuario activo; sin scope por analista, igual que el origen) |
| public.cuentas_bancarias | authenticated_read_cuentas_bancarias | SELECT | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | GetEstadoCuentaDataUseCase / EnviarEstadoCuentaUseCase (require_usuario) |
| public.facturas | facturas_select_usuarios_activos | SELECT | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | GetFichaClienteUseCase / BuscarGlobalUseCase / GetEstadoCuentaDataUseCase / EnviarEstadoCuentaUseCase (require_usuario) |
| public.historico_aging_factura | solo_usuarios_activos | ALL | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | Sin uso en el alcance de clientes; quien la lea (reportes/jobs) debe exigir require_usuario. Escrituras solo por jobs (service_role) |
| public.historico_cartera | read_historico_cartera | SELECT | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | Sin uso en el alcance de clientes (la leen dashboard/reportes: require_usuario en sus casos de uso) |
| public.maestro_clientes | maestro_clientes_select_autenticados | SELECT | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | ListClientesUseCase / BuscarGlobalUseCase / GetFichaClienteUseCase / GetEstadoCuentaDataUseCase (require_usuario) |
| public.maestro_clientes | maestro_clientes_update_autenticados | UPDATE | ((( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) AND (analista_email = (auth.jwt() ->> 'email'::text))) OR (EXISTS ( SELECT 1    FROM usuarios   WHERE ((usuarios.email = (auth.jwt() ->> 'email'::text)) AND (usuarios.rol = 'COORDINADOR'::text) AND (usuarios.activo = true))))) | ActualizarContactoClienteUseCase / ActualizarLogisticaClienteUseCase (_require_editor_cliente: COORDINADOR o analista_email = usuario) y CambiarEstadoClienteUseCase (require_coordinador) |
| public.config_audit_log | Solo coordinador accede al log | ALL | (EXISTS ( SELECT 1    FROM usuarios   WHERE ((usuarios.email = (auth.jwt() ->> 'email'::text)) AND (usuarios.rol = 'COORDINADOR'::text) AND (usuarios.activo = true)))) | ListAuditLogUseCase / GetConfiguracionPantallaUseCase (require_usuario + require_coordinador); las escrituras solo vía registrar_auditoria() dentro de casos de uso de coordinador |
| public.config_sistema | config_sistema_select_usuarios_activos | SELECT | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | Get{Parametros,Semaforo,Sla,Automatizaciones}UseCase y GetConfiguracionPantallaUseCase (require_usuario activo + require_coordinador, más estricto que la política: en el origen estas lecturas también exigían COORDINADOR vía checkCoordinador); escrituras: Update{Parametro,Semaforo,Sla}UseCase / ToggleAutomatizacionUseCase (solo coordinador) |
| public.directorio_empresa | Coordinador gestiona directorio | ALL | (EXISTS ( SELECT 1    FROM usuarios   WHERE ((usuarios.email = (auth.jwt() ->> 'email'::text)) AND (usuarios.rol = 'COORDINADOR'::text) AND (usuarios.activo = true)))) | ListDirectorioUseCase, CreateContactoUseCase, UpdateContactoUseCase, DeactivateContactoUseCase (require_usuario + require_coordinador) |
| public.directorio_empresa | Todos leen directorio para autocomplete | SELECT | (EXISTS ( SELECT 1    FROM usuarios   WHERE ((usuarios.email = (auth.jwt() ->> 'email'::text)) AND (usuarios.activo = true)))) | ListContactosDirectorioUseCase (require_usuario activo; solo contactos activos y columnas id, nombre, email, cargo, area) |
| public.portafolio_acotado | solo_usuarios_activos | ALL | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | ListRutasUseCase, CreateRutaUseCase, UpdateRutaUseCase, DeactivateRutaUseCase, GetConfiguracionPantallaUseCase (require_usuario activo + require_coordinador; en el origen se escribía con service_role tras checkCoordinador) |
| public.portafolio_grupos | solo_usuarios_activos | ALL | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | ListRutasUseCase, CreateRutaUseCase, UpdateRutaUseCase, DeactivateRutaUseCase, UpdateVendedorUseCase/DeactivateVendedorUseCase (lectura de ruta activa) (require_usuario activo + require_coordinador) |
| public.supervisores | Analistas leen supervisores | SELECT | (EXISTS ( SELECT 1    FROM usuarios   WHERE ((usuarios.email = (auth.jwt() ->> 'email'::text)) AND (usuarios.activo = true)))) | ListSupervisoresConfigUseCase / ListVendedoresConfigUseCase / GetConfiguracionPantallaUseCase (require_usuario activo + require_coordinador; las lecturas de supervisores de otros módulos aplican require_usuario en su propio caso de uso) |
| public.supervisores | Coordinador gestiona supervisores | ALL | (EXISTS ( SELECT 1    FROM usuarios   WHERE ((usuarios.email = (auth.jwt() ->> 'email'::text)) AND (usuarios.rol = 'COORDINADOR'::text) AND (usuarios.activo = true)))) | CreateSupervisorUseCase, UpdateSupervisorUseCase, DeactivateSupervisorUseCase (require_usuario + require_coordinador) |
| public.usuarios | usuarios_select_autenticados | SELECT | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | ListUsuariosConfigUseCase / GetConfiguracionPantallaUseCase (require_usuario activo + require_coordinador; nunca devuelve google_refresh_token); altas/ediciones: CreateUsuarioUseCase / UpdateUsuarioUseCase (solo coordinador, antes service_role) |
| public.vendedores | Analistas leen vendedores | SELECT | (EXISTS ( SELECT 1    FROM usuarios   WHERE ((usuarios.email = (auth.jwt() ->> 'email'::text)) AND (usuarios.activo = true)))) | ListVendedoresConfigUseCase / ListRutasUseCase / GetConfiguracionPantallaUseCase (require_usuario activo + require_coordinador) |
| public.vendedores | Coordinador gestiona vendedores | ALL | (EXISTS ( SELECT 1    FROM usuarios   WHERE ((usuarios.email = (auth.jwt() ->> 'email'::text)) AND (usuarios.rol = 'COORDINADOR'::text) AND (usuarios.activo = true)))) | CreateVendedorUseCase, UpdateVendedorUseCase, DeactivateVendedorUseCase (require_usuario + require_coordinador) |
| public.pedidos_retenidos | pedidos_retenidos_select_activos | SELECT | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | GetPedidosRetenidosUseCase (require_usuario: cualquier usuario activo; email opcional = Vista Global) |
| public.pedidos_retenidos | pedidos_retenidos_update_activos | UPDATE | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | ActualizarPedidoRetenidoUseCase (require_usuario + require_escritura: Gerencia 403 'Sin permisos para modificar pedidos retenidos') |
| public.saldos_favor | saldos_favor_select | SELECT | ((EXISTS ( SELECT 1    FROM usuarios u   WHERE ((u.email = (auth.jwt() ->> 'email'::text)) AND (u.rol = 'COORDINADOR'::text)))) OR (cliente_cod IN ( SELECT m.cliente_cod    FROM maestro_clientes m   WHERE (m.analista_email = (auth.jwt() ->> 'email'::text))))) | ListSaldosFavorUseCase (analista/riesgo con cartera → su email forzado), ListSaldosFavorClienteUseCase (global o cliente de maestro_clientes.analista_email = email), MatchingSaldosFavorUseCase (filtra por clientes_de_analista) |
| public.saldos_favor | saldos_favor_update | UPDATE | ((EXISTS ( SELECT 1    FROM usuarios u   WHERE ((u.email = (auth.jwt() ->> 'email'::text)) AND (u.rol = 'COORDINADOR'::text)))) OR (cliente_cod IN ( SELECT m.cliente_cod    FROM maestro_clientes m   WHERE (m.analista_email = (auth.jwt() ->> 'email'::text))))) | AplicarSaldoFavorUseCase (require_usuario + require_escritura + COORDINADOR o cliente en la cartera del analista) |
| storage.objects | usuarios_activos_suben_comprobantes | INSERT | ((bucket_id = 'comprobantes-pago'::text) AND fn_es_usuario_activo()) | CrearUrlSubidaComprobanteUseCase (require_usuario antes de firmar la URL PUT; content-type limitado a image/webp\|jpeg\|png; key safe_key(cliente_cod, <ms>_<nombre>.<ext>)) |
| public.gestiones | gestiones_select_autenticados | SELECT | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | ListGestionesUseCase / GetReferenciasGestionesUseCase (require_usuario activo + require_gestor_cartera + analista_scope: ANALISTA/ANALISTA_RIESGO solo las propias, COORDINADOR todas o la del filtro); ListPromesasUseCase lee la gestion origen bajo el mismo guard |
| public.gestiones | gestiones_insert_autenticados | INSERT | ((( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) AND (analista_email = (auth.jwt() ->> 'email'::text))) OR (EXISTS ( SELECT 1    FROM usuarios   WHERE ((usuarios.email = (auth.jwt() ->> 'email'::text)) AND (usuarios.rol = 'COORDINADOR'::text) AND (usuarios.activo = true))))) | RegistrarGestionUseCase (require_usuario activo + require_escritura + require_gestor_cartera; analista_email = usuario actual siempre) / RegistrarGestionRapidaUseCase (analista_email propio salvo COORDINADOR) |
| public.gestiones | gestiones_update_autenticados | UPDATE | ((( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) AND (analista_email = (auth.jwt() ->> 'email'::text))) OR (EXISTS ( SELECT 1    FROM usuarios   WHERE ((usuarios.email = (auth.jwt() ->> 'email'::text)) AND (usuarios.rol = 'COORDINADOR'::text) AND (usuarios.activo = true))))) | UpdateGestionUseCase (dueno de la gestion o COORDINADOR + require_escritura + require_gestor_cartera; lista blanca de columnas) / DeleteGestionUseCase (solo COORDINADOR, soft-delete activo=false) |
| public.notas_rapidas | notas_select_own | SELECT | (usuario_id = ( SELECT usuarios.id    FROM usuarios   WHERE (usuarios.email = (auth.jwt() ->> 'email'::text))  LIMIT 1)) | GetNotaRapidaUseCase (usuario_id = id del perfil activo del principal; el cliente no envia usuario_id) |
| public.notas_rapidas | notas_insert_own | INSERT | (usuario_id = ( SELECT usuarios.id    FROM usuarios   WHERE (usuarios.email = (auth.jwt() ->> 'email'::text))  LIMIT 1)) | SaveNotaRapidaUseCase (upsert con usuario_id = id del perfil activo del principal) |
| public.notas_rapidas | notas_update_own | UPDATE | (usuario_id = ( SELECT usuarios.id    FROM usuarios   WHERE (usuarios.email = (auth.jwt() ->> 'email'::text))  LIMIT 1)) | SaveNotaRapidaUseCase (ON CONFLICT (usuario_id, fecha) solo sobre la fila del propio usuario) |
| public.notas_rapidas | notas_delete_own | DELETE | (usuario_id = ( SELECT usuarios.id    FROM usuarios   WHERE (usuarios.email = (auth.jwt() ->> 'email'::text))  LIMIT 1)) | Sin endpoint de borrado (el original tampoco borraba notas); cualquier borrado futuro debe filtrar por usuario_id del principal |
| public.pagos_stage | solo_usuarios_activos | ALL | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | IngestarLoteUseCase (x-ingesta-key, service_role) + EjecutarTareaProgramadaUseCase / ProcesarSyncManualUseCase (service_role vía fn_sync_pagos); ningún endpoint de usuario lee ni escribe el stage |
| public.pedidos_retenidos_stage | pedidos_retenidos_stage_activos | ALL | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | IngestarLoteUseCase (x-ingesta-key, service_role) + EjecutarTareaProgramadaUseCase / ProcesarSyncManualUseCase (service_role vía fn_sync_pedidos_retenidos); ningún endpoint de usuario lo expone |
| public.sync_log | sync_log_insert_usuarios_activos | INSERT | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | Solo las fn_sync_* insertan (SECURITY DEFINER): SincronizarTablaUseCase / EncolarSyncManualUseCase (require_usuario + require_coordinador) y jobs programados (service_role); no hay INSERT directo desde el API |
| public.sync_log | sync_log_select_usuarios_activos | SELECT | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | ListarHistorialSyncUseCase / ObtenerEstadoSyncUseCase (require_usuario: usuario activo) |
| public.sync_salud | Solo coordinador lee sync_salud | SELECT | (EXISTS ( SELECT 1    FROM usuarios   WHERE ((usuarios.email = (auth.jwt() ->> 'email'::text)) AND (usuarios.rol = 'COORDINADOR'::text) AND (usuarios.activo = true)))) | Sin endpoint de lectura (el front original no la consultaba); solo la usa fn_check_sync_salud desde el job check-sync-salud (service_role). Un futuro GET debe usar require_coordinador |
| public.notificaciones | Usuario ve sus propias notificaciones | SELECT | (usuario_id = ( SELECT usuarios.id    FROM usuarios   WHERE (usuarios.email = (auth.jwt() ->> 'email'::text))  LIMIT 1)) | ListNotificacionesUseCase (require_usuario; WHERE usuario_id = perfil.id del principal, se ignora cualquier id del front) |
| public.notificaciones | Usuario actualiza sus notificaciones | UPDATE | (usuario_id = ( SELECT usuarios.id    FROM usuarios   WHERE (usuarios.email = (auth.jwt() ->> 'email'::text))  LIMIT 1)) | MarcarNotificacionLeidaUseCase / MarcarTodasLeidasUseCase (require_usuario; UPDATE ... WHERE usuario_id = perfil.id; solo leida = true) |
| public.notificaciones | notificaciones_insert_usuarios_activos | INSERT | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | NotificacionesApi no expone inserción; los INSERT los hacen funciones SQL/cron (service_role) y los casos de uso de otros módulos (solicitudes, clientes, auditoria_legal) después de require_usuario (= fn_es_usuario_activo) |
| public.presupuesto_cobro | solo_usuarios_activos | ALL | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | Todos los casos de uso de presupuesto (require_usuario = usuario activo). Lectura: GetPresupuestoMesUseCase / GetRecuperacionMesUseCase (require_roles COORDINADOR\|GERENCIA), GetSinPagoUseCase (cualquier usuario activo). Escritura (fn_presupuesto_guardar / fn_presupuesto_reasignar): CongelarPresupuestoUseCase y ReasignarClientePresupuestoUseCase (require_coordinador; GERENCIA solo lectura) |
| public.presupuesto_meta_vendedor | solo_usuarios_activos | ALL | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | GetPresupuestoMesUseCase (require_usuario + require_roles COORDINADOR\|GERENCIA), GetMetaAnalistaMesUseCase (require_usuario + scope_email: ANALISTA solo su email), AjustarMetaVendedorUseCase / CongelarPresupuestoUseCase / ReasignarClientePresupuestoUseCase (require_coordinador; fn_presupuesto_meta / fn__recalc_metas) |
| public.proyeccion_semana_snapshot | solo_usuarios_activos | ALL | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | GetProyeccionCobroUseCase (require_usuario + require_roles COORDINADOR\|GERENCIA; fn_proyeccion_cobro escribe el snapshot vía fn_snapshot_proyeccion_semana y el caso de uso hace commit) |
| public.promesas | promesas_select_autenticados | SELECT | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | ListPromesasUseCase (require_usuario activo + require_gestor_cartera + analista_scope: ANALISTA/ANALISTA_RIESGO solo las propias, COORDINADOR todas o la del filtro); RegistrarGestionUseCase solo consulta duplicados |
| public.promesas | promesas_insert_autenticados | INSERT | ((( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) AND (analista_email = (auth.jwt() ->> 'email'::text))) OR (EXISTS ( SELECT 1    FROM usuarios   WHERE ((usuarios.email = (auth.jwt() ->> 'email'::text)) AND (usuarios.rol = 'COORDINADOR'::text) AND (usuarios.activo = true))))) | RegistrarGestionUseCase / RegistrarGestionRapidaUseCase (analista_email = usuario actual, o el indicado solo si es COORDINADOR) y ReprogramarPromesaUseCase (dueno de la original o COORDINADOR; la nueva conserva el analista_email de la original) |
| public.promesas | promesas_update_autenticados | UPDATE | ((( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) AND (analista_email = (auth.jwt() ->> 'email'::text))) OR (EXISTS ( SELECT 1    FROM usuarios   WHERE ((usuarios.email = (auth.jwt() ->> 'email'::text)) AND (usuarios.rol = 'COORDINADOR'::text) AND (usuarios.activo = true))))) | ValidarPromesaUseCase / ReprogramarPromesaUseCase (dueno por analista_email o COORDINADOR + require_escritura + require_gestor_cartera; fila bloqueada FOR UPDATE) y DeletePromesaUseCase (solo COORDINADOR, soft-delete activo=false) |
| public.historico_bloqueados | solo_usuarios_activos | ALL | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | GetBloqueadosUseCase (require_usuario + roles mora-vendedor; el INSERT via fn_snapshot_bloqueados_semana solo si el usuario real es COORDINADOR) |
| public.historico_cierres_cartera | solo_usuarios_activos | ALL | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | TomarCierreCarteraUseCase (require_usuario + roles cei + require_escritura) / GetCeiUseCase, GetMigracionMoraUseCase (require_usuario + roles del registry, lectura via fn_reporte_*) |
| public.historico_pedidos_retenidos | historico_pedidos_retenidos_select_activos | SELECT | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | Sin acceso directo desde el front de reportes; solo lo leen fn_* SECURITY DEFINER invocadas tras require_usuario (GetCierreMensualUseCase y demás casos de uso del módulo) |
| public.ventas_mensuales | Coordinador gestiona ventas mensuales | ALL | (EXISTS ( SELECT 1    FROM usuarios   WHERE ((usuarios.email = (auth.jwt() ->> 'email'::text)) AND (usuarios.rol = 'COORDINADOR'::text) AND (usuarios.activo = true)))) | El módulo reportes no escribe ventas_mensuales (solo lectura); escritura no expuesta por ReportesApi |
| public.ventas_mensuales | Todos leen ventas mensuales | SELECT | (EXISTS ( SELECT 1    FROM usuarios   WHERE ((usuarios.email = (auth.jwt() ->> 'email'::text)) AND (usuarios.activo = true)))) | GetResumenEjecutivoUseCase (require_usuario + roles resumen-ejecutivo COORDINADOR/GERENCIA) |
| public.solicitudes | Analista lee sus propias solicitudes | SELECT | (solicitante_id = get_usuario_id()) | ListSolicitudesUseCase / GetSolicitudDetalleUseCase (require_usuario + scope solicitante_id = usuario.id si no es COORDINADOR/GERENCIA; ajena → 404) |
| public.solicitudes | Coordinador lee todas las solicitudes | SELECT | (get_mi_rol() = 'COORDINADOR'::text) | ListSolicitudesUseCase / GetSolicitudDetalleUseCase (usuario.es_global → sin filtro) |
| public.solicitudes | Gerencia lee todas las solicitudes | SELECT | (get_mi_rol() = 'GERENCIA'::text) | ListSolicitudesUseCase / GetSolicitudDetalleUseCase (usuario.es_global → sin filtro; escrituras bloqueadas con require_escritura) |
| public.solicitudes | solicitudes_insert_usuarios_activos | INSERT | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | CreateSolicitudUseCase (require_usuario activo + require_acceso_modulo + GERENCIA 403; solicitante_id = usuario.id) |
| public.solicitudes | Analista actualiza sus solicitudes pendientes | UPDATE | ((solicitante_id = get_usuario_id()) AND (estado = 'PENDIENTE'::text)) | CambiarEstadoSolicitudUseCase / ResolverSolicitudUseCase (no coordinador: solo propias y con estado = 'PENDIENTE', si no 403/404) |
| public.solicitudes | Coordinador actualiza solicitudes | UPDATE | (get_mi_rol() = 'COORDINADOR'::text) | CambiarEstadoSolicitudUseCase / ResolverSolicitudUseCase (usuario.es_coordinador → cualquier solicitud) |
| public.solicitud_comentarios | sol_com_insert | INSERT | (( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) AND (usuario_id = get_usuario_id())) | AgregarComentarioSolicitudUseCase (require_usuario activo; usuario_id = usuario.id del principal) |
| public.solicitud_comentarios | sol_com_select | SELECT | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | GetSolicitudDetalleUseCase (require_usuario activo) |
| public.solicitud_historial_estados | sol_hist_insert | INSERT | (( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) AND (usuario_id = get_usuario_id())) | CreateSolicitudUseCase / CambiarEstadoSolicitudUseCase (require_usuario activo; usuario_id = usuario.id del principal) |
| public.solicitud_historial_estados | sol_hist_select | SELECT | ( SELECT fn_es_usuario_activo() AS fn_es_usuario_activo) | GetSolicitudDetalleUseCase (require_usuario activo) |

### 3.5 Servicios

| Origen | Destino |
|---|---|
| Supabase Auth | Amazon Cognito User Pool + authorizer de API Gateway |
| Storage bucket `comprobantes-pago` | S3 privado cifrado + URLs prefirmadas (GestionCarteraApi, SolicitudesApi) |
| Storage bucket `documentos-recursos` | S3 privado cifrado + URLs prefirmadas (CentroRecursosApi) |
| Storage bucket `expedientes-clientes` | S3 privado cifrado + URLs prefirmadas (ActualizarPerfilApi, AuditoriaLegalApi) |
| Storage bucket `garantias-legal` | S3 privado cifrado + URLs prefirmadas (AuditoriaLegalApi) |
| Trabajo asíncrono (JobsApi) | SQS `sync-manual` + DLQ → Lambda `sync-manual-worker` |
| pg_cron `check-recibos-reversion` | EventBridge Scheduler cron(15 23 ? * MON-FRI *) → `job-check-recibos-reversion` |
| pg_cron `check-sync-salud` | EventBridge Scheduler cron(15 13-23 ? * MON-FRI *) → `job-check-sync-salud` |
| pg_cron `cierre-cartera-mensual` | EventBridge Scheduler cron(50 5 * * ? *) → `job-cierre-cartera-mensual` |
| pg_cron `cierre-mensual-pedidos-retenidos` | EventBridge Scheduler cron(59 5 * * ? *) → `job-cierre-mensual-pedidos-retenidos` |
| pg_cron `conciliar-promesas` | EventBridge Scheduler cron(30 23 * * ? *) → `job-conciliar-promesas` |
| pg_cron `expirar-solicitudes-actualizacion` | EventBridge Scheduler cron(0 12 * * ? *) → `job-expirar-solicitudes-actualizacion` |
| pg_cron `historico-cartera` | EventBridge Scheduler cron(30 23 * * ? *) → `job-historico-cartera` |
| pg_cron `notificar-pedido-en-regla` | EventBridge Scheduler cron(25 13-23 ? * MON-FRI *) → `job-notificar-pedido-en-regla` |
| pg_cron `notificar-promesas-hoy` | EventBridge Scheduler cron(0 13 ? * MON-FRI *) → `job-notificar-promesas-hoy` |
| pg_cron `notificar-sin-gestion` | EventBridge Scheduler cron(10 13 ? * MON-FRI *) → `job-notificar-sin-gestion` |
| pg_cron `notificar-sla-vencido` | EventBridge Scheduler cron(20 13-23 ? * MON-FRI *) → `job-notificar-sla-vencido` |
| pg_cron `snapshot-proyeccion-semana` | EventBridge Scheduler cron(5 13 ? * MON *) → `job-snapshot-proyeccion-semana` |
| pg_cron `sync-pagos` | EventBridge Scheduler cron(5 13-23 * * ? *) → `job-sync-pagos` |
| pg_cron `sync-cartera` | EventBridge Scheduler cron(5 13-23 * * ? *) → `job-sync-cartera` |
| pg_cron `sync-facturas` | EventBridge Scheduler cron(5 13-23 * * ? *) → `job-sync-facturas` |
| pg_cron `sync-saldos-favor` | EventBridge Scheduler cron(5 13-23 * * ? *) → `job-sync-saldos-favor` |
| pg_cron `sync-pedidos-retenidos` | EventBridge Scheduler cron(5 13-23 * * ? *) → `job-sync-pedidos-retenidos` |

## 4. Cambios estructurales, incompatibilidades y riesgos

**Cambios estructurales:** 
- [analisis_pagos] Las 4 API Routes de Next (pagos-anulados, pagos-anulados/[no_recibo], pagos-duplicado-descartado, pagos-duplicado-descartado/[no_recibo]) se borraron y quedan como endpoints de AnalisisPagosApi con el mismo método, body y respuesta ({ok, marcados} / {ok}); el upsert con service role pasa a INSERT ... ON CONFLICT en el repository y la auditoría a tbl_config_audit_log dentro de un SAVEPOINT (un fallo de auditoría no aborta, como insertAuditLog).
- [analisis_pagos] Los RPC fn_analisis_ranking_clientes / perfil_vendedor / alertas_deterioro / concentracion y fn_pagos_mes_resumen pasan a GET /analisis-pagos/* con los mismos parámetros (query string) y la misma forma JSON.
- [analisis_pagos] Frontend: módulo src/views/analisis-pagos (api/analisis-pagos-api.ts, hooks/use-analisis-icp-controller.ts, hooks/use-pagos-aplicados-controller.ts, use-remote-resource.ts, types.ts). Tab*/PagosAplicadosCliente conservan su JSX; los modales Anular/Descartar usan controllers propios. Los tipos ReciboRow/ResumenResult salieron del componente a views/analisis-pagos/types.ts.
- [analisis_pagos] Las páginas host (gestion-pagos/analisis/page.tsx y reportes/pagos-aplicados/page.tsx) no usaban Supabase (getUsuarioActual ya migrado): no se modificaron.
- [auditoria_legal] Las 8 API Routes de /api/auditoria-legal/** y /api/actualizar-perfil/[token] pasan a la Lambda AuditoriaLegalApi (paths /garantias*, /solicitudes-actualizacion*) y a la Lambda pública ActualizarPerfilApi (/actualizar-perfil/{token}*). Mismos cuerpos, respuestas y textos de error.
- [auditoria_legal] Las consultas directas de supabase-js de la pantalla de Garantías y sus modales (fn_garantias_lista, fn_garantias_clientes_sin_garantia, fn_buscar_contribuyentes, fn_saldo_contribuyente, fn_vendedores_por_contribuyente, fn_contar_garantias_en_carpeta, fn_siguiente_carpeta_disponible, garantia_eventos+usuarios, personas_legales, config_sistema, vendedores, solicitudes_actualizacion) son endpoints GET con intención bajo /garantias/* y /solicitudes-actualizacion.
- [auditoria_legal] Subidas: el PDF firmado (antes multipart a la API Route → bucket público) y los archivos del portal público (antes multipart) ahora van directo a S3 con URL prefirmada PUT emitida por el backend, y un segundo POST confirma (el backend verifica existencia, prefijo de la key y tamaño con list()).
- [auditoria_legal] garantias.documento_pdf_url guarda ahora la key S3 (`<id>_<ms>.pdf`); al listar se devuelve una URL prefirmada GET (1 h). Las filas migradas con la URL pública de Supabase se resuelven extrayendo la key tras '/garantias-legal/'.
- [auditoria_legal] Gmail (correo al vendedor en ENTREGAR, correo de Auditoría Anual al crear/reenviar solicitud) lo envía el backend con UsuarioMailer; el front ya no manda providerToken/providerRefreshToken.
- [auditoria_legal] POST /garantias corre en una sola transacción (consecutivo, desactivar anterior, insertar, eventos, vínculo, notificación al coordinador): ya no hace falta la compensación manual de reactivar la anterior.
- [auditoria_legal] fetchSolicitudes: el backend devuelve todas las solicitudes ENVIADA/DATOS_RECIBIDOS/APROBADA/EXPIRADA y el front filtra por los contribuyentes del tab (antes .in('contribuyente', [...]) con cientos de valores, que no cabe en una query string).
- [auditoria_legal] Hacienda: los modales usan useHaciendaController (módulo notificaciones, GET /hacienda) en vez de fetch('/api/hacienda').
- [auditoria_legal] Borrados del front (solo servidor, ya en el backend): lib/auditoria-legal/token-solicitud.ts, validar-token-solicitud.ts, storage-expedientes.ts; email-actualizacion-perfil.ts queda solo con el asunto (vista previa del modal); el HTML vive en domain/services/auditoria_legal_correos.py.
- [centro_recursos] El Server Component /centro-recursos hacía 9 consultas en paralelo con service_role; ahora llama a UN endpoint agregado GET /centro-recursos que devuelve las mismas filas crudas (vendedores, supervisores, usuarios, documentos, aplicaciones, grupos, miembros, directorio, marcas). El armado del directorio/árbol/compradores sigue en el page.tsx sin cambios.
- [centro_recursos] Carga de documentos: antes multipart/form-data a la API Route que subía a Storage; ahora 2 pasos: POST /centro-recursos/documentos/upload-url (URL prefirmada PUT, key `${ms}_${nombre_saneado}` como el path original) → uploadToPresignedUrl → POST /centro-recursos/documentos {key, titulo, descripcion, categoria}, que valida que el objeto exista y registra la fila + auditoría.
- [centro_recursos] Bucket documentos-recursos pasa de público (getPublicUrl) a privado: en BD (columna url) se guarda la key del objeto y al leer se devuelve una URL prefirmada GET (1 h) en el mismo campo `url`. Filas migradas con la URL pública de Supabase se resuelven extrayendo la key después de '/documentos-recursos/'; enlaces externos se devuelven tal cual.
- [centro_recursos] checkCoordinador + insertAuditLog (src/lib/configuracion/admin.ts) se reimplementan en los casos de uso (require_coordinador con el rol real) y en PostgresCentroRecursosRepository.registrar_auditoria (tbl_config_audit_log dentro de un SAVEPOINT para que un fallo de auditoría no aborte la operación, igual que el try/catch original).
- [centro_recursos] Los componentes (modales, TabAplicaciones, TabDirectorioAgentes) usan useCentroRecursosController (src/views/centro-recursos/hooks); TabAplicaciones usa useHaciendaController (módulo notificaciones) para Hacienda/CABYS.
- [clientes] La Ficha 360° (/clientes/[cod]) hacía ~11 consultas a Supabase en dos tandas; ahora es un solo GET /clientes/{cod}/ficha?volver=... que devuelve cartera (o la cartera sintética en ₡0), maestro, facturas, gestiones, promesas, solicitudes + solicitante_map, ICP, tendencia, pedidos retenidos, contacto del analista asignado y Anterior/Siguiente (calculado en el backend a partir de los filtros de `volver`). El rol/usuario sale de getUsuarioActual().
- [clientes] La Server Action fetchTodosLosClientes (actions.ts) se eliminó: el Excel usa GET /clientes?todos=true desde useExportarClientesController.
- [clientes] Los tipos ClienteRow/KPIsClientes/FiltrosClientes/... se movieron a src/views/clientes/types.ts (page.tsx los re-exporta); ClienteResultado/FacturaResultado/MarcaResultado (antes exportados por la route.ts de buscar) también.
- [clientes] Email de cobro: la gestión tipo CORREO que el navegador insertaba con supabase.from('gestiones').insert ahora la registra el backend dentro de POST /clientes/email-cobro tras un envío exitoso (mismo texto de nota; el body agrega `contribuyente`).
- [clientes] El front ya no manda providerToken/providerRefreshToken: el envío usa UsuarioMailer con el refresh token guardado del usuario.
- [clientes] El texto libre del usuario (mensaje, observaciones, nombres) se escapa como HTML en los correos (render idéntico para texto normal; evita inyección de HTML).
- [clientes] Editar gestión desde la ficha usa gestionesApi.actualizar (PATCH /clientes/gestiones del módulo Gestiones); ClientesApi no registra rutas /clientes/gestiones*, /clientes/promesas* ni /clientes/pagos/reportar.
- [clientes] Errores de carga en /clientes y /clientes/[cod] ya no lanzan (pantalla de error de Next): se muestra un mensaje en rojo (regla 8); 404 de la ficha sigue llamando notFound().
- [configuracion] Las 18 API Routes de /api/configuracion/** pasan a la Lambda ConfiguracionApi con los mismos paths sin /api, mismo método, mismo body y misma forma de respuesta ({data}, {ok}, {data,total,page,pageSize}, {data,mostrados,truncado}); 201 en las altas. checkCoordinador() + insertAuditLog() de src/lib/configuracion/admin.ts quedan en coordinador()/registrar_auditoria() del caso de uso (mismo texto 'Acceso restringido al coordinador'); el archivo admin.ts se eliminó (los demás módulos ya no lo importan).
- [configuracion] Altas de usuarios: siguen restringidas a @cofersa.cr / @mayoreo.biz y la fila en tbl_usuarios es la que da acceso. Con Cognito + Google federado NO se crea nada en el User Pool desde Configuración: en el primer login con Google, Cognito crea el usuario federado y ResolveCurrentUserUseCase/GET /me lo vincula por email verificado con tbl_usuarios (tbl_app_users). Desactivar un usuario (activo=false) corta el acceso en el siguiente request (require_usuario exige fila activa), aunque la sesión de Cognito siga viva.
- [configuracion] configuracion/page.tsx: las 12 consultas con service_role + el armado (n_clientes, supervisor_nombre, n_vendedores, semáforo con defaults, SLA, rutas, mes de cierre sugerido) se reemplazan por GET /configuracion (GetConfiguracionPantallaUseCase), que devuelve ConfigTabsData ya procesado. Si fn_automatizaciones_resumen falla, el tab Automatizaciones viene vacío sin tumbar la pantalla (igual que el .catch original).
- [configuracion] Registro de automatizaciones (REGLAS, DEFAULTS_AUTOMATIZACIONES) y el cálculo de última/próxima corrida pg_cron (cron.ts) se movieron a backend/src/domain/entities/configuracion.py; src/lib/automatizaciones/registry.ts queda solo con los tipos (ReglaId) y se borraron cron.ts y obtener-datos.ts.
- [configuracion] DirectorioInput (autocomplete usado en Ficha 360°, Solicitudes y reportes) y lib/utils/directorio.ts leían directorio_empresa directo con la sesión del usuario; ahora usan GET /configuracion/directorio-activo (cualquier usuario activo; solo contactos activos) vía useDirectorioContactosController (misma caché de módulo, una consulta por sesión) y createConfiguracionApi(getServerHttp()) en server.
- [configuracion] Log del Sistema → Exportar CSV: antes window.open de la API Route (respuesta text/csv); ahora GET /configuracion/log?format=csv devuelve todas las filas en JSON y el navegador arma el mismo CSV (mismas columnas y formato de fecha es-CR/America/Costa_Rica) y lo descarga como audit-log-AAAA-MM-DD.csv.
- [configuracion] Las escrituras multi-paso (crear/editar ruta con sus miembros, upserts de semáforo/SLA) ahora son transaccionales: si una parte falla se revierte todo. La auditoría corre en un SAVEPOINT para que un fallo de config_audit_log no aborte la operación principal.
- [configuracion] GET /configuracion/usuarios y la pantalla devuelven columnas explícitas de tbl_usuarios (sin google_refresh_token); antes PUT/POST devolvían select() completo.
- [dashboard] Regla de scope (antes RLS de solo lectura fn_es_usuario_activo + filtros por analista_email en el front): todo endpoint exige perfil activo (require_usuario). GET /dashboard/coordinador solo COORDINADOR o GERENCIA (403 al resto). GET /dashboard/analista y /dashboard/mi-cartera: COORDINADOR/GERENCIA pueden pedir ?email= de cualquier analista (por defecto el propio); ANALISTA/ANALISTA_RIESGO siempre quedan limitados a su propio email aunque pidan otro (analista_scope).
- [dashboard] Guard de Mi Cartera duplicado en el backend con el rol REAL: GERENCIA → 403; ANALISTA_RIESGO sin tiene_cartera_asignada → 403; COORDINADOR y ANALISTA entran (Usuario.puede_gestionar_cartera). El page.tsx conserva el redirect por rolEfectivo ('Ver como') y además redirige a /dashboard si el API responde 403.
- [dashboard] computarColaDia (7 consultas + Algoritmo V4) pasa al backend: domain/services/cola_dia.py (calcular_agenda, construir_cola, puro y con tests) + application/use_cases/dashboard.py: computar_cola_dia (lecturas vía DashboardRepository). cola-analista.ts queda solo con los tipos CarteraRow/KPIs e icpColor/icpLabel (usados por mi-cartera-view y DashboardResumen). Se replican Math.round (mitades hacia +inf), fmtCRC y el formato numérico de JS en los motivos.
- [dashboard] Dashboard coordinador: 10 consultas → 1 endpoint agregado; los conteos de gestiones Hoy/Semana/Mes de 'Mi Equipo' se agregan en SQL (count FILTER) en vez de traer filas; el fallback config_sistema.meta_mensual solo se consulta si fn_recuperacion no trae meta (igual que antes). La página cruza 'equipo' (elegibles por rol) con analistasConCarteraReal (GET /me/analistas-con-cartera) en lugar de leer maestro_clientes.range(0,4999). Los cálculos de presentación (DSO, avalúo, días hábiles, proyección) siguen en el page.tsx.
- [dashboard] Dashboard analista: 9 consultas + enriquecimiento de nombres → 1 endpoint agregado. La cola llega ya filtrada (en_agenda && !gestionado_hoy); el nombre del cliente de la agenda se resuelve en SQL (subconsulta a maestro_clientes, última fila por id); las etiquetas PROXIMA_ACCION_LABELS y el fallback de meta_gestiones_diarias (15) siguen en el page.tsx.
- [dashboard] Tareas sugeridas (notificaciones ALERTA 'Sin gestión ≥%' no leídas) ya no usan el cliente service_role del front: el backend las lee por el usuarios.id del analista consultado (ya no hay mezcla de espacios de UUID Auth vs usuarios).
- [dashboard] googleCalendarService.fetchCalendarEvents(timeMin, timeMax[, api]) usa identidadApi.calendarEvents (GET /me/calendar/events, refresh token guardado) en lugar del provider_token; se elimina el parámetro accessToken y se conserva el mapeo a CalendarEvent y el rango RFC 3339 con -06:00. No tenía consumidores en el código.
- [dashboard] Nuevo módulo frontend src/views/dashboard/ (api/dashboard-api.ts + types.ts). No hay controller hooks: todas las pantallas del alcance son Server Components (page.tsx con createDashboardApi(await getServerHttp())); los componentes de src/components/analista|cartera|dashboard no hacían consultas y quedan intactos. equipo/page.tsx es estático (sin consultas).
- [gestion_cartera] reportes_pago y reporte_pago_detalles tienen RLS habilitado SIN políticas en Supabase (deny-all para authenticated): la regla se define en ReportarPagoUseCase = usuario activo (require_usuario) y no Gerencia (require_escritura); analista_email = email del principal (no lo manda el front).
- [gestion_cartera] POST /clientes/pagos/reportar: cabecera + detalles se insertan en UNA transacción real (antes INSERT + INSERT + DELETE de rollback manual); la referencia duplicada sigue respondiendo 409 con el mismo texto y además la protege uq_reportes_pago_referencia.
- [gestion_cartera] Bucket comprobantes-pago pasa de público (getPublicUrl) a privado: el front pide POST /gestion-cartera/comprobantes/upload-url, sube con uploadToPresignedUrl y guarda la KEY S3 en reportes_pago.url_comprobante; la lectura se hace con GET /gestion-cartera/comprobantes/download-url?key= (acepta también la URL pública legada de Supabase y extrae la key).
- [gestion_cartera] La compresión de imágenes sigue en el navegador (lib/utils/comprimir-imagen, Canvas → WebP/JPEG) antes de pedir la URL prefirmada; la key la arma el backend con el mismo patrón `${cliente_cod}/${Date.now()}_${base}.${ext}`.
- [gestion_cartera] Saldos a favor: el UPDATE directo a saldos_favor desde el navegador pasa a POST /saldos-favor/{id}/aplicar (aplicado_por = email del principal, aplicado_en = now() en BD).
- [gestion_cartera] Tab Saldos a Favor de la Ficha 360°: GERENCIA ahora ve los saldos del cliente (es_global) en solo lectura; con la RLS original (solo rol COORDINADOR exacto) veía la lista vacía. Consistente con CLAUDE.md (Gerencia = alcance de Coordinador, sin editar).
- [gestion_cartera] Matching (GET /saldos-favor/matching): el scope por cartera se aplica a ANALISTA y a ANALISTA_RIESGO con tiene_cartera_asignada (puede_gestionar_cartera), igual que la página de Saldos a Favor; antes solo rol === 'ANALISTA'. Se quitaron los headers Cache-Control privados (API Gateway/Lambda).
- [gestion_cartera] GET /saldos-favor: el email pedido solo se respeta para roles globales y ANALISTA_RIESGO sin cartera; ANALISTA (y riesgo con cartera) siempre recibe su propia cartera (antes lo decidía el Server Component con el rol efectivo).
- [gestion_cartera] Página Saldos a Favor: si falla la carga muestra un mensaje de error visible (regla 8) en vez de una tabla vacía; la lista de analistas usa analistasConCarteraReal (GET /me/analistas-con-cartera).
- [gestion_cartera] bandeja-pagos y recibos-ruta (placeholders) solo verificaban sesión con supabase.auth.getUser(): ahora usan getUsuarioActual(). gestion-pagos/* no tenía acceso a Supabase (sin cambios).
- [gestion_cartera] fn_get_kpis_saldos_favor no tiene consumidores en el front (ni en el src original): no se expuso endpoint.
- [gestion_cartera] Front: src/views/gestion-cartera/ (api/gestion-cartera-api.ts, types.ts, hooks use-pedidos-retenidos / use-saldos-favor-cliente / use-saldos-favor-matching / use-aplicar-saldo / use-reportar-pago -controller.ts). Borradas las 3 route.ts del alcance.
- [gestiones] La bandeja /gestiones (Server Component) ya no hace 6 consultas a Supabase: GET /gestiones (lotes de 1000 con offset, mismo orden fecha/hora/id desc; el front itera como antes con .range) + GET /gestiones/referencias (solicitudes ligadas, estado de promesas, nombres de maestro_clientes y codigos con cartera, resueltos en SQL con el mismo alcance). La lista de analistas del filtro viene de analistasConCarteraReal (GET /me/analistas-con-cartera).
- [gestiones] POST /clientes/gestiones/nueva: gestion + promesa + vinculo promesa_id en UNA transaccion (antes 3 escrituras con rollback manual via DELETE, que ademas fallaba en silencio porque gestiones no tiene politica DELETE).
- [gestiones] modal-gestion.tsx insertaba directo en gestiones y promesas desde el navegador: ahora POST /gestiones/rapida (misma forma de datos, atomico). El componente no esta importado en ninguna pantalla hoy; se migro igual.
- [gestiones] form-nueva-gestion.tsx: la consulta directa a maestro_clientes (otros codigos del contribuyente) pasa a GET /gestiones/codigos-contribuyente; las llamadas viven en useNuevaGestionController (src/views/gestiones/hooks). El tipo NuevaGestionBody se movio de la API Route a src/views/gestiones/types.ts.
- [gestiones] NotasRapidas.tsx: carga/guardado en useNotasRapidasController (GET/POST /notas-rapidas); JSX igual.
- [gestiones] DELETE /clientes/gestiones recibe el id por query (?id=) porque HttpClient.delete no envia cuerpo; el handler acepta tambien {id} en el body (forma original).
- [gestiones] /ai/formalizar-bitacora usa container.language_model() (Anthropic Messages API, clave anthropic_api_key del secreto) con el mismo modelo claude-haiku-4-5-20251001, mismo system prompt y max_tokens 512.
- [gestiones] Guard server-side replicado: page.tsx redirige (GERENCIA y ANALISTA_RIESGO sin cartera -> /dashboard; COORDINADOR entra) y los use cases aplican require_gestor_cartera (COORDINADOR o puede_gestionar_cartera) + require_escritura en escrituras.
- [identidad] Supabase Auth (Google OAuth) → Cognito User Pool con Google como IdP federado (Hosted UI). El acceso real sigue dado por tener fila activa en `usuarios` (GET /me responde 403 acceso_denegado si no), igual que el layout original + /auth/denegado. El primer login vincula el sub de Cognito con tbl_app_users por email verificado (mismos ids que auth.users).
- [identidad] Gmail/Calendar: Supabase entregaba provider_token/provider_refresh_token de Google en la sesión; Cognito no los expone. Se agregó un consentimiento de Google propio (/me/google/authorize-url → /auth/google → /me/google/connect) que guarda el refresh token en usuarios.google_refresh_token (la misma columna que ya usaba /auth/callback). Los envíos de correo se hacen en el backend con ese refresh token (UsuarioMailer). Los refresh tokens existentes siguen sirviendo si se usa el mismo cliente OAuth de Google (google_client_id/secret).
- [identidad] 'Ver como': la cookie sic_ver_como la fija ahora el navegador (no httpOnly) después de que POST /me/preview-rol valida que el rol real es COORDINADOR. Solo cambia qué se renderiza; el API autoriza siempre con el rol real (igual que el original).
- [identidad] Layout: totalEquipo y última sincronización vienen en GET /me (antes 2 consultas con service_role y unstable_cache).
- [identidad] Server Components llaman al API Gateway con el ID token de la sesión (cookies de Amplify, @aws-amplify/adapter-nextjs); nunca a la base.
- [jobs] pg_cron → EventBridge Scheduler (ScheduleV2, UTC): 17 Lambdas programadas, una por job lógico (handlers en entrypoints/lambda_handlers/jobs_programados.py → EjecutarTareaProgramadaUseCase con uow_factory(None) = service_role). Mismos horarios UTC; los 55 jobs sync_*_HHMMcr (5 tipos × 11 horas) se consolidan en 5 reglas cron(5 13-23 * * ? *) todos los días, igual que el original. Las fn_* siguen leyendo sus toggles tbl_config_sistema.automatizacion_*_activa.
- [jobs] POST /api/sync/{pagos,pedidos-retenidos} esperaban a N8N (hasta 30 s) + 12 s (> 29 s de API Gateway): ahora POST /sync/pagos y /sync/pedidos-retenidos validan COORDINADOR, encolan en SQS sync-manual y responden 202 {ok, encolado, tipo, solicitado_en, n8n_configurado}. El worker sync-manual-worker (timeout 90 s, visibility 540 s, DLQ, maxReceive 5, ReportBatchItemFailures, idempotencia DynamoDB) llama al webhook N8N (n8n_webhook_pagos_url con fallback https://n8n.mayoreo.biz/webhook/Flujos_SIC; n8n_webhook_pedidos_retenidos_url, sin fallback como el original), espera 12 s y ejecuta fn_sync_* con p_ejecutado_por = email del coordinador.
- [jobs] UI (TabSincronizacion.tsx): mismo JSX; los datos salen de views/sincronizacion (sincronizacionApi + useSincronizacionController). Para pagos/pedidos mantiene el estado 'en proceso' (fases originales) y consulta GET /sync/estado?tipo=&desde=solicitado_en cada 4 s (máx. 120 s) hasta ver la fila nueva de sync_log; luego arma el mismo mensaje y refresca GET /sync/historial (antes supabase.from('sync_log') limit 600).
- [jobs] cartera/facturas/saldos_favor manuales siguen síncronos: POST /sync/{cartera,facturas,saldos_favor} → fn_sync_*(p_ejecutado_por) → {ok, resultado}. Se borraron las 5 route.ts de src/app/api/sync/.
- [jobs] Ingesta externa: N8N y Google Apps Script ya NO pueden escribir directo en la base (Aurora en VPC privada, sin PostgREST). Nuevo POST /ingesta/{tabla} (Lambda IngestaApi, sin Cognito, header x-ingesta-key validado con hmac.compare_digest contra ingesta_api_key del secreto) para pagos_stage, pedidos_retenidos_stage, cartera, facturas, saldos_favor y maestro_clientes. Cuerpo {modo: reemplazar|agregar|actualizar, lote, total_lotes, sync_id?, purgar_anteriores?, filas:[...]}; lista blanca de columnas por tabla (domain/entities/jobs.py TABLAS_INGESTA; columna desconocida = 400, igual que PostgREST); todas las filas del lote con las mismas columnas; máx. 5000 filas/lote; cada lote es UNA transacción. reemplazar: DELETE de la tabla destino en el lote 1 y luego INSERT. actualizar: INSERT ... ON CONFLICT (clave natural) DO UPDATE de las columnas recibidas (+ updated_at = now()); con purgar_anteriores en el último lote borra las filas de otro sync_id (equivale al upsert + 'DELETE por sync_id' que hacía N8N en saldos_favor). El sync_id del cuerpo se agrega a las filas que no lo traen. En las tablas stage los valores se guardan como texto (fn_cargar_pagos_stage / fn_sync_pedidos_retenidos castean igual que antes).
- [jobs] Modos por tabla: pagos_stage y pedidos_retenidos_stage → reemplazar|agregar; cartera y facturas → reemplazar|agregar|actualizar (clave contribuyente+cliente_cod / contribuyente+documento); saldos_favor → agregar|actualizar (clave documento; sin reemplazar para no perder estado_manual/aplicado_por/aplicado_en del SIC); maestro_clientes → agregar|actualizar (clave cliente_cod, upsert diario del GAS; sin reemplazar: tbl_solicitudes.cliente_id ON DELETE SET NULL y columnas SIC-exclusivas). maestro_clientes no acepta estado_manual, asignacion_manual ni la logística SIC (dia_visita, dia_pago, metodo_pago, observaciones_logistica, hora_recibo_*, persona_recibe); los triggers fn_proteger_contacto_manual, fn_asignar_analista_por_vendedor y fn_sincronizar_analista_nombre siguen activos.
- [jobs] Se copiaron tal cual los assets de la skill (assets/backend-async): application/ports/message_queue.py, application/ports/idempotency_store.py, entrypoints/lambda_handlers/sqs_adapter.py, infrastructure/aws/sqs_message_queue.py, infrastructure/aws/dynamodb_idempotency_store.py, tests/unit/test_sqs_adapter.py. Como container.py es base compartida, jobs.py arma localmente SqsMessageQueue(SYNC_MANUAL_QUEUE_URL) y DynamoDbIdempotencyStore(IDEMPOTENCY_TABLE_NAME) (nombres de env que genera generate_sam.py).
- [jobs] Edge Function mark-promesas-incumplidas (HTTP, obsoleta en el origen) → POST /jobs/conciliar-promesas (solo COORDINADOR) que ejecuta fn_conciliar_promesas a pedido; la ejecución diaria sigue en el job job-evening-conciliar-promesas.
- [notificaciones] REALTIME: el canal Supabase postgres_changes (INSERT en notificaciones filtrado por usuario_id) se reemplazó por polling en useNotificacionesController: carga al montar, cada 60 s y al volver a enfocar/mostrar la ventana. No se usa WebSocket porque las notificaciones las insertan funciones SQL/cron (fn_check_sync_salud, fn_check_recibos_reversion, triggers) y no la API, así que un publisher en el backend no las vería. Badge, panel y tabs se conservan; marcar leída/todas sigue siendo optimista.
- [notificaciones] El usuario_id de las notificaciones ya no viene del front: el backend usa siempre el perfil (tbl_usuarios.id) del principal Cognito (equivale a las políticas RLS por email del JWT).
- [notificaciones] Marcar como leída: supabase.update → PATCH /notificaciones/{id} {leida: true}; marcar todas → POST /notificaciones/leer-todas.
- [notificaciones] Topbar: 'Ver como' usa useVerComoController (POST /me/preview-rol + cookie en el front) en lugar de fetch('/api/preview-rol'); cerrar sesión usa signOutUser() de Cognito. ClientWrapper usa onAuthStateChange de src/shared/auth/cognito-auth.ts (SIGNED_OUT o SESSION_EXPIRED → /login; Supabase emitía SIGNED_OUT también cuando fallaba el refresh).
- [notificaciones] Tipo de cambio: BCCR_TOKEN (env de Vercel) pasa a la clave bccr_token del secreto de integraciones (container.integration_config()); las llamadas HTTP salen por container.external_http(); el respaldo sigue en config_sistema (tipo_cambio_compra/venta/fecha). bccr_email no lo usaba el origen y no se usa.
- [notificaciones] Hacienda (estado tributario y CABYS) pasa de API Routes de Next a NotificacionesApi vía external_http, con el mismo User-Agent de navegador, timeout de 8 s y la misma forma de respuesta ({data, notFound, error} / {data, error}).
- [notificaciones] useChat (src/hooks/useChat.ts) re-exporta useChatController (src/views/notificaciones/hooks) que usa GET/POST /chat.
- [presupuesto] tab-presupuesto: las dos llamadas fn_presupuesto_frozen + fn_presupuesto_preview pasan a un único GET /presupuesto/mes que devuelve el congelado o el estimado con congelado:false (misma forma que el estado `Data` del componente).
- [presupuesto] Congelar, regenerar, editar meta y reasignar (antes rpc genérico con p_email del front) son POST /presupuesto/mes/{congelar|meta|reasignar}; el email que se guarda en generado_por/updated_por es el del usuario autenticado (no el que mande el front). La prop userEmail de TabPresupuesto queda sin uso.
- [presupuesto] Modal 'Enviar Presupuesto General': las 5 lecturas (vendedores, supervisores, usuarios+cartera real, portafolio_grupos, portafolio_acotado) pasan a GET /presupuesto/destinatarios + analistasConCarteraReal (GET /me/analistas-con-cartera); el cruce de destinatarios y filas del correo se conserva idéntico en use-envio-presupuesto-general-controller.
- [presupuesto] Envío por correo de tab-presupuesto y tab-recuperacion (antes fetch a /api/reportes/enviar con providerToken) pasa a POST /presupuesto/enviar → EnviarCorreoPresupuestoUseCase → UsuarioMailer (refresh token guardado). Mismas validaciones y textos ('to, subject y html son requeridos', 'Dirección de correo inválida: x', 'No tenés permiso para enviar estos reportes'); respuesta {ok, email_sent, to}.
- [presupuesto] tab-sin-pago: fn_sin_pago_cliente + SUM(presupuesto_cobro.ppto_cartera) en un único GET /presupuesto/sin-pago → {filas, ppto_total}.
- [presupuesto] RecuperacionPeriodoCliente: fn_recuperacion_periodo → GET /presupuesto/recuperacion-periodo y fn_meta_analista_mes → GET /presupuesto/meta-analista ({meta}); un fallo al leer la meta deja 0 como en el original.
- [presupuesto] Frontend: módulo src/views/presupuesto (api/presupuesto-api.ts, hooks/use-*-controller.ts, use-remote-resource.ts con AbortController, types.ts). Los componentes conservan su JSX; solo cambian las fuentes de datos.
- [presupuesto] fn_presupuesto_calc y fn__recalc_metas no se exponen: se ejecutan dentro de fn_presupuesto_guardar / fn_presupuesto_preview / fn_presupuesto_reasignar (SECURITY DEFINER en Aurora).
- [promesas] La bandeja /promesas (Server Component) hacia 2 consultas a Supabase (promesas activas tope 800 + gestion origen); ahora GET /promesas devuelve {promesas, gestionesMap} con la misma forma. Analistas del filtro: analistasConCarteraReal.
- [promesas] Reprogramar: INSERT de la promesa nueva + UPDATE de la original a REPROGRAMADA en UNA transaccion (antes 2 escrituras con rollback manual via DELETE, que fallaba por falta de politica DELETE).
- [promesas] Validar/Reprogramar leen la promesa con SELECT ... FOR UPDATE antes de anexar el evento al JSONB eventos (evita perder eventos con dos validaciones simultaneas).
- [promesas] DELETE /clientes/promesas recibe el id por query (?id=); el handler acepta tambien {id} en el body. Hoy ninguna pantalla lo llama.
- [promesas] Edge Function supabase/functions/mark-promesas-incumplidas NO se porta: esta OBSOLETA desde 2026-06-15 (reemplazada por fn_conciliar_promesas via cron, que migra el modulo jobs). No tiene endpoint ni job en este modulo.
- [promesas] El modal de accion de tabla-promesas.tsx usa useAccionPromesaController (src/views/promesas/hooks) -> promesasApi; JSX, validaciones de cliente y textos sin cambios. GestionOrigen se movio a src/views/promesas/types.ts (re-exportado desde page.tsx).
- [reportes] Roles por reporte de src/lib/reportes/registry.ts replicados en domain/entities/reportes.py (REPORTE_ROLES) y aplicados en cada caso de uso (antes solo redirect en page.tsx; las RPC SECURITY DEFINER respondían a cualquier usuario activo). Los reportes exclusivos de ANALISTA (gestiones-periodo, cartera-vencida) también admiten COORDINADOR para 'Ver como' y siempre se acotan al email del propio usuario.
- [reportes] Scope por analista en backend: mora-vendedor, bloqueados, plazo-especial y estados-cuenta usan analista_scope (un ANALISTA / ANALISTA_RIESGO con cartera siempre queda limitado a su email aunque mande otro).
- [reportes] Server Components resumen-ejecutivo y cierre-mensual: las 5 / 9 consultas paralelas pasan a UN endpoint agregado cada uno, con los datos crudos de la misma forma; el cálculo de KPIs/tops sigue en page.tsx. Las ventanas de fechas ICP del cierre se calculan en el backend (GetCierreMensualUseCase).
- [reportes] estados-cuenta/page.tsx: enriquecimiento con vendedor del código representativo se hace en el backend; filtro 'por analista' usa analistasConCarteraReal (GET /me/analistas-con-cartera). El envío/descarga por cliente usa clientesApi (/clientes/estado-cuenta[/data], módulo clientes).
- [reportes] cartera-vencida: maestro + cartera + última gestión en una sola consulta SQL (subselect max(fecha)).
- [reportes] DimensionFilter, VendedorEnvioPanel, detalle-bloqueados, resumen-ejecutivo-cliente: datos y envío vía hooks de src/views/reportes/hooks; ya no se manda providerToken.
- [reportes] Borrada src/app/api/reportes/enviar/route.ts → POST /reportes/enviar (UsuarioMailer, adjunto base64 → EmailAttachment).
- [solicitudes] Las 4 API Routes (/api/solicitudes, /[id], /[id]/estado, /[id]/comentarios) pasan a SolicitudesApi con los mismos paths sin /api, mismos bodies y misma forma de respuesta (ok, id, numero, email_sent, email_to, email_error...).
- [solicitudes] Las consultas directas de los Server Components se agrupan en un endpoint por pantalla: GET /solicitudes (lista + solicitante_map), GET /solicitudes/{id} (solicitud + comentarios + historial con autor_nombre + gestion_origen + solicitante_nombre), GET /solicitudes/nueva-clientes (cartera + maestro + analista_nombres + gestion_origen) y GET /solicitudes/nueva-contexto?cod= (cartera + maestro + facturas del cliente).
- [solicitudes] Los tipos ClienteConDatos, GestionOrigenPreload, ComentarioConAutor, HistorialConAutor y GestionOrigenLink se movieron a src/views/solicitudes/types.ts; los page.tsx los re-exportan para no romper imports.
- [solicitudes] DetalleSolicitud usa useDetalleSolicitudController (estado, historial optimista y comentarios); los 3 formularios de creación usan useCrearSolicitudController; form-solicitud-nueva usa useFacturasClienteController (AbortController).
- [solicitudes] Guard del módulo también en backend: todos los endpoints exigen COORDINADOR/GERENCIA o puede_gestionar_cartera (ANALISTA, o ANALISTA_RIESGO con cartera); GERENCIA no escribe. Las páginas detalle y nueva (incluida /clientes/[cod]/solicitudes/nueva) aplican el mismo redirect que el listado.
- [solicitudes] El correo (ambas ramas) sale con UsuarioMailer (refresh token guardado del solicitante); el front ya no envía providerToken/providerRefreshToken. EMAIL_COORDINADOR → integration_config('email_coordinador') con fallback jdiaz@cofersa.cr; NEXT_PUBLIC_APP_URL → integration_config('app_url') con fallback https://cyc-cartera-cofersa.vercel.app.
- [solicitudes] El correo se envía después del commit (la solicitud no se deshace si Gmail falla, igual que el original).

**Incompatibilidades:** 
- [analisis_pagos] Antes el p_email del análisis lo decidía el front (esAnalista); ahora el backend lo fuerza al email propio para ANALISTA / ANALISTA_RIESGO con cartera aunque se pida otro, y bloquea Concentración para ellos (antes solo lo ocultaba la UI).
- [analisis_pagos] checkCoordinador no exigía usuarios.activo; require_usuario sí (usuario inactivo → 403 acceso_denegado).
- [auditoria_legal] Rate limit de solicitudes (30/hora): antes respondía 429; ahora 422 (BusinessRuleViolation code rate_limited) con el mismo mensaje — el adaptador HTTP no tiene 429.
- [auditoria_legal] Usuario sin fila en usuarios: antes 400 'Tu usuario no está registrado en el sistema.'; ahora 403 acceso_denegado de require_usuario (el layout ya no deja entrar a esos usuarios).
- [auditoria_legal] Error de Gmail: antes se distinguía 401/403 de Gmail con textos propios; ahora email_error trae el mensaje de UsuarioMailer ('No se pudo obtener acceso a Gmail...' sin refresh token, o 'Gmail rechazó el envío: ...').
- [auditoria_legal] GET /actualizar-perfil/{token} con token inválido devuelve 404 {error:{message:'Este enlace ya no es válido.'}} en vez de {valido:false}; la página pública lo trata igual (muestra 'Este enlace ya no es válido').
- [auditoria_legal] El tope de tamaño de la subida a S3 no se puede imponer en una URL PUT prefirmada: se valida el tamaño declarado al firmar y el real al confirmar (si excede se borra el objeto y se responde el mismo error).
- [centro_recursos] Las URLs de documentos ya no son permanentes: caducan a la hora. Si el usuario deja la pantalla abierta más de 1 h, el enlace de descarga expira y debe recargar la página.
- [centro_recursos] Errores de base de datos que antes devolvían error.message de PostgREST (500) ahora devuelven el mensaje genérico del adaptador (500) o el de translate_db_error (p. ej. FK inválida de comprador → 409).
- [centro_recursos] PUT /centro-recursos/aplicaciones/{id} sin campos editables devuelve la fila actual (en el origen el update vacío de PostgREST era indefinido).
- [clientes] Límite de 30 correos/hora: el original respondía 429; ahora BusinessRuleViolation (422) con el mismo mensaje ('Límite de 30 correos por hora alcanzado. Esperá unos minutos.').
- [clientes] Sin Gmail conectado el mensaje ahora es el de UsuarioMailer (gmail_no_conectado) en lugar de 'Sesión de Google expirada. Cerrá sesión y volvé a ingresar.'; un rechazo de Gmail en email-cobro llega como 'Gmail rechazó el envío: ...' (antes 'Error Gmail API: ...'); en estado-cuenta se sigue devolviendo en email_error con 200.
- [clientes] POST /api/clientes/estado estaba roto en el origen (hacía .select('analista_id, nombre') sobre maestro_clientes, columnas inexistentes) y no tenía llamadores en el front. Se implementó el comportamiento intencionado: actualiza estado_manual, registra gestión SISTEMA y notifica al analista asignado resolviendo su id por maestro_clientes.analista_email (solo usuarios activos). Cliente inexistente → 404 'Cliente no encontrado'.
- [clientes] La hora/fecha de la gestión SISTEMA de cambio de estado ahora es hora Costa Rica (el original usaba la hora del servidor/UTC).
- [clientes] GERENCIA ya no puede enviar email de cobro/estado de cuenta ni registrar recordatorios (require_escritura); en el origen solo lo impedía la UI.
- [clientes] Un usuario autenticado sin fila activa en usuarios recibe 403 en /clientes/buscar (antes RLS devolvía listas vacías); el buscador muestra listas vacías igual.
- [clientes] Los adjuntos PDF/Excel siguen viajando en base64 en el JSON: API Gateway/Lambda limitan el payload (~6 MB en Lambda síncrona).
- [configuracion] Errores de base de datos: antes la UI mostraba error.message de PostgREST (p. ej. 'duplicate key value violates unique constraint ...'); ahora los errores de unicidad/FK/NOT NULL llegan traducidos por el adaptador ('El registro ya existe.', 'La operación viola una referencia entre registros.', 'Los datos no cumplen las reglas de la base de datos.'). Ej.: crear un supervisor sin email (tbl_supervisores.email es NOT NULL, igual que en Supabase) sigue fallando, con el mensaje genérico.
- [configuracion] El filtro q del directorio escapa % y _ (antes se interpolaban crudos en el .or() de PostgREST).
- [configuracion] PUT /configuracion/portafolio-acotado/{principal_cod} con el principal dentro de miembros: antes los cambios de nombre/rol ya quedaban guardados antes del 400; ahora el 400 revierte toda la operación.
- [configuracion] Ids inválidos: PUT usuarios/directorio con id no-UUID responde 404 con el mismo texto ('Usuario no encontrado' / 'Contacto no encontrado'); DELETE directorio y PATCH feed con id no-UUID responden 400 (antes 500 con el error de PostgreSQL).
- [dashboard] Antes cada consulta tenía fallback silencioso (Promise.allSettled → ceros/listas vacías). Ahora el endpoint agregado corre en una sola transacción: si falla, la página muestra 'No se pudo cargar el dashboard: <mensaje>' (regla 8) en vez de KPIs en cero. La lista de analistas con cartera sí conserva el fallback (Mi Equipo vacío).
- [dashboard] La vista icp_por_cliente se toleraba ausente en el origen; en Aurora vw_icp_por_cliente existe, así que se consulta directo.
- [dashboard] tbl_cartera no tiene columna dias_mora (tampoco la tenía cartera en Supabase): el origen leía c.dias_mora → undefined → 0; el backend replica dias_mora = 0 para que el scoring dé exactamente los mismos resultados.
- [dashboard] Los conteos de gestiones de Mi Equipo y la lista de clientes de la cola ya no sufren el tope de 1000 filas de PostgREST (antes gMes podía quedar truncado en analistas con >1000 gestiones/mes).
- [dashboard] Orden de desempate de la cola: el origen ordenaba por score/mora con orden base Object.values() (claves numéricas primero); el backend usa el orden de lectura de la BD. Solo afecta empates exactos de score y mora.
- [gestion_cartera] En Supabase el reporte de pago fallaba siempre por RLS (reportes_pago sin políticas + cliente de sesión); en AWS funciona con la regla de ReportarPagoUseCase. El toast dice 'el coordinador recibirá una notificación' pero no existe trigger de notificación sobre tbl_reportes_pago (tampoco en el origen): se conservó el texto.
- [gestion_cartera] Las URLs públicas de comprobantes ya guardadas en url_comprobante dejan de funcionar al apagar Supabase Storage; ObtenerUrlComprobanteUseCase extrae la key de esas URLs, pero los objetos deben copiarse al bucket S3 con la misma ruta (cliente_cod/archivo).
- [gestion_cartera] El update de un saldo de otra cartera antes 'tenía éxito' en silencio (RLS filtraba 0 filas); ahora responde 403 y la UI muestra 'No se pudo marcar como aplicado. Intentá de nuevo.'.
- [gestion_cartera] PUT /pedidos-retenidos/{id} con un id inexistente responde 404 'Pedido retenido no encontrado' (antes 500 con el error de .single()).
- [gestiones] El 401/503 que la API Route distinguia (sesion vencida vs. Supabase Auth caido) ahora lo emite API Gateway/Cognito antes de la Lambda: useNuevaGestionController mapea 401 -> 'Su sesion vencio...' y error de red/503 -> 'El servicio de autenticacion no esta respondiendo...' (mismos textos que el original).
- [gestiones] El monto en el mensaje de promesa duplicada usaba toLocaleString('es-CR'); ahora usa el formato fmtCRC (simbolo de colon + punto de miles, redondeado) por la regla 4 del CLAUDE.md.
- [gestiones] La consulta de solicitudes ligadas en la bandeja dependia de la RLS de solicitudes; ahora se limita a solicitudes cuyas gestiones estan en el alcance del usuario (misma informacion para la UI).
- [identidad] Login silencioso de Google (login_hint + prompt=none desde la app): el Hosted UI de Cognito no permite pasar esos parámetros al IdP; el usuario hace clic en 'Ingresar con Google' (Cognito recuerda la sesión del IdP).
- [identidad] Login correo/contraseña: en Supabase existía para cuentas no-Google; en Cognito requiere crear esos usuarios en el User Pool (las contraseñas de Supabase no se pueden migrar).
- [jobs] El 202 de /sync/pagos y /sync/pedidos-retenidos ya no trae resultado ni n8n_status: la UI lo reconstruye de la fila de sync_log (insertados, en_stage, omitidos, total_tabla). Para pedidos, 'actualizados' no se guarda en sync_log: se deriva como max(en_stage - insertados - omitidos, 0) (exacto salvo duplicados en el stage).
- [jobs] Si el worker tarda más de 120 s la UI muestra 'La sincronización sigue en proceso; el historial se actualizará al terminar.' en vez de bloquear el botón.
- [jobs] Un fallo de conexión/BD en el worker se reintenta (SQS, hasta 5 veces y luego DLQ) y vuelve a llamar al webhook N8N; el original fallaba una sola vez con 500. Los errores de negocio de fn_sync_* no reintentan: la función los registra en sync_log.error y devuelve {error}, como antes.
- [jobs] EventBridge Scheduler no tiene equivalente a cron.job_run_details: el historial de ejecuciones queda en CloudWatch Logs/Metrics de cada Lambda (y en sync_log para los sync_*).
- [jobs] La ingesta no es el upsert genérico de PostgREST (on_conflict libre): la clave de conflicto es fija por tabla y el modo actualizar es explícito.
- [notificaciones] Las notificaciones nuevas aparecen con hasta 60 s de demora (o al enfocar la ventana) en lugar de instantáneamente por Realtime.
- [notificaciones] Chat del equipo: sin Supabase Realtime ni Presence no hay mensajes en vivo ni lista de conectados (conectados = []). El ChatPanel está desmontado en ClientWrapper ('ChatPanel desactivado'), así que no hay impacto visible.
- [notificaciones] /api/tipo-cambio tenía revalidate = 3600 (caché de Next); en la Lambda cada GET /tipo-cambio consulta al BCCR (el topbar lo pide una vez al montar, y persiste entre navegaciones).
- [notificaciones] /api/tipo-cambio era público (sin sesión); GET /tipo-cambio exige token Cognito (solo lo usa el topbar autenticado).
- [notificaciones] MarcarNotificacionLeida sobre una notificación ajena o inexistente responde 404 (antes el UPDATE con RLS afectaba 0 filas en silencio); el controller ignora el error igual que el original.
- [presupuesto] El original devolvía HTTP 200 con {ok:false, email_sent:false, error} cuando Gmail rechazaba el envío; ahora UsuarioMailer lanza BusinessRuleViolation (422) y la UI muestra el mismo mensaje vía ApiError.message en el mismo recuadro de resultado.
- [presupuesto] Sin provider_token de Supabase: el envío usa siempre el refresh token de Gmail persistido; si no existe se muestra MSG_GMAIL_NO_CONECTADO (antes 'Sesión de Google expirada...').
- [presupuesto] GERENCIA podía (por RLS solo_usuarios_activos) congelar/editar el presupuesto desde la UI; ahora las escrituras exigen COORDINADOR (regla de solo lectura de GERENCIA del CLAUDE.md). La UI sigue mostrando los botones; el error se muestra con el mismo alert('Error al aplicar el cambio.').
- [promesas] mark-promesas-incumplidas (Edge Function Deno con service role) no tiene equivalente en este modulo: su funcion la cumple fn_conciliar_promesas via el cron del modulo jobs.
- [promesas] Los montos en las descripciones de eventos (abono, reprogramacion) usaban toLocaleString('es-CR'); ahora fmtCRC (simbolo de colon + punto de miles) por la regla 4 del CLAUDE.md. Los eventos historicos ya guardados no cambian.
- [promesas] El texto 'Para reprogramar use /api/promesas/reprogramar' del error de estado invalido se conserva literal aunque el path real es /clientes/promesas/reprogramar.
- [reportes] POST /reportes/enviar: el origen respondía 200 {ok:false, email_sent:false, error} si Gmail fallaba; ahora el fallo de Gmail es 422 (BusinessRuleViolation) y el front muestra ApiError.message. En éxito se mantiene {ok:true, email_sent:true, to}. Sin refresh token de Gmail el mensaje es el de UsuarioMailer (antes 'Sesión de Google expirada...').
- [reportes] Cierre manual del CEI (fn_snapshot_cierre_cartera): antes cualquier usuario activo (incluida GERENCIA) podía dispararlo; ahora require_escritura → solo COORDINADOR (GERENCIA recibe 403 y ve el alert 'No se pudo guardar el cierre de cartera.').
- [reportes] resumen-ejecutivo / cierre-mensual: el origen degradaba por consulta (Promise.allSettled / errores ignorados); ahora si el endpoint agregado falla la página muestra un mensaje de error (regla 8) en vez de datos parciales.
- [reportes] Snapshot semanal de bloqueados: se ejecuta en una transacción propia; si falla (DomainError) se ignora igual que el origen.
- [solicitudes] Adjuntos: el bucket comprobantes-pago era público (getPublicUrl) y en AWS es privado. El front pide URL prefirmada (POST /solicitudes/adjuntos/upload-url) y guarda la key en datos.adjuntos[].path con url=null; GET /solicitudes/{id} firma cada adjunto (1 h). Para filas migradas con URL pública de Supabase se extrae la key de la URL (/storage/v1/object/public/comprobantes-pago/<key>) y se firma igual.
- [solicitudes] Los links de adjuntos en el correo son URLs prefirmadas (pedido de 7 días); con credenciales temporales del rol de la Lambda caducan antes (al expirar la sesión). Antes eran URLs públicas permanentes. El adjunto sigue accesible desde el detalle de la solicitud en el SIC.
- [solicitudes] Rama legacy sin acceso a Gmail: antes 401 'Sesión de Google expirada...'; ahora 422 (gmail_no_conectado) con el MISMO texto, para no disparar el cierre de sesión de Cognito que hace el cliente HTTP ante un 401. Sigue sin insertar la solicitud.
- [solicitudes] Errores de Gmail: GmailApiSender no distingue 401/403, así que email_error muestra 'Gmail rechazó el envío: <detalle>' en vez de los textos específicos 401/403 del original; sin refresh token (rama catálogo) se mantiene 'Token de Google no disponible y no se pudo renovar...'.
- [solicitudes] PATCH /solicitudes/{id}/estado: en el original, un analista sobre una solicitud propia que no estuviera en 'PENDIENTE' (p. ej. las del catálogo nuevo, que nacen 'Pendiente') recibía ok=true y se insertaba historial, pero el UPDATE quedaba anulado en silencio por RLS. Ahora se responde 403 'Sin permisos para cambiar el estado de la solicitud' y no se escribe historial.
- [solicitudes] PATCH /solicitudes/{id} con una accion desconocida ahora responde 400 'accion inválida' (antes hacía un update parcial).
- [solicitudes] Comentarios: ahora la solicitud tiene que ser visible para el usuario (404 si no); antes RLS dejaba comentar cualquier solicitud por id.

**Riesgos:** 
- [analisis_pagos] fn_analisis_* recalculan ICP sobre 9 meses de tbl_pagos: vigilar el límite de 29 s de API Gateway con el volumen real.
- [analisis_pagos] path param {no_recibo}: recibos con caracteres especiales viajan codificados (seg()) y API Gateway los entrega decodificados; el recibo '—' (sin número) también se puede desmarcar.
- [auditoria_legal] Archivos huérfanos en expedientes-clientes / garantias-legal si el cliente sube a S3 y nunca confirma; conviene una regla de ciclo de vida o limpieza periódica.
- [auditoria_legal] Migración de datos de Storage: copiar los objetos de los buckets de Supabase garantias-legal y expedientes-clientes a S3 con la MISMA key (las filas guardan esa ruta); documento_pdf_url con URL pública de Supabase sigue funcionando por la extracción de la key.
- [auditoria_legal] El link del correo usa integration_config 'app_url' (fallback https://cyc-cartera-cofersa.vercel.app); si no se configura con el dominio de Amplify, los links apuntarán a Vercel.
- [auditoria_legal] La Lambda pública ActualizarPerfilApi no tiene autenticación: conviene throttling en API Gateway (usage plan / WAF) para el path /actualizar-perfil/*.
- [centro_recursos] Los objetos existentes del bucket documentos-recursos de Supabase deben copiarse a S3 con la MISMA key (path después de /documentos-recursos/); database/data_migration.sh no cubre Storage. Si no se copian, los documentos migrados devolverán URLs prefirmadas a objetos inexistentes (403/404 de S3).
- [centro_recursos] El CORS del bucket S3 documentos-recursos debe permitir PUT desde el origen del frontend (subida prefirmada) con header Content-Type.
- [clientes] GET /clientes/{cod}/ficha con `volver` del listado ejecuta fn_clientes_lista completa (sin paginar) para Anterior/Siguiente, igual que el original; con ~1.400 clientes es aceptable pero conviene vigilar la latencia (timeout 29 s).
- [clientes] pathParameters de API Gateway: el use case aplica unquote() al código del cliente (equivale al decodeURIComponent del page.tsx); un código con '%' literal se decodificaría dos veces.
- [clientes] Los envíos de correo dependen de que cada analista haya conectado Gmail en el SIC (refresh token en usuarios.google_refresh_token).
- [clientes] fn_actualizar_contacto_cliente / fn_actualizar_logistica_cliente no son SECURITY DEFINER: el usuario de la app necesita UPDATE sobre tbl_maestro_clientes (y el trigger de protección del sync GAS debe respetar app.contacto_manual / app.logistica_manual).
- [configuracion] GET /configuracion/log?format=csv sin filtros devuelve todo el log en una respuesta JSON: si config_audit_log crece mucho puede acercarse al límite de 6 MB de respuesta de Lambda/API Gateway (en el origen no había límite). Mitigación: exportar con filtro de fechas.
- [configuracion] Reasignar el analista de un vendedor (PUT /configuracion/vendedores/{cod}) dispara trg_vendedores_trg_propagar_analista_vendedor → fn_propagar_analista_vendedor sobre tbl_maestro_clientes dentro de la misma transacción; con muchos clientes el UPDATE debe terminar dentro de los 29 s de API Gateway (verificado sobre esquema vacío).
- [configuracion] Validación de dominio en altas de usuarios es sensible a mayúsculas como el original (email.split('@')[1] exacto): 'X@Cofersa.cr' se rechaza.
- [dashboard] 'mañana' de la agenda se calcula, igual que el original, sobre la fecha UTC (Date.now()+1 día), no la de Costa Rica: entre 18:00 y 24:00 CR apunta a pasado mañana. Se conservó a propósito; corregirlo es un cambio funcional a decidir.
- [dashboard] fn_recuperacion, fn_pedidos_retenidos y fn_dashboard_analista_kpis son pesadas: el dashboard coordinador ahora las ejecuta en serie dentro de una Lambda (antes en paralelo desde Next). Vigilar latencia frente al corte de 29 s de API Gateway.
- [dashboard] Mi Cartera devuelve todas las filas de la cartera del analista (~cientos) en un solo JSON; tamaño acotado pero mayor que el resto de respuestas.
- [gestion_cartera] Copiar los objetos del bucket Supabase comprobantes-pago a S3 conservando las keys; sin eso los reportes históricos quedan sin comprobante.
- [gestion_cartera] El matching (fn_matching_saldos_favor) sin cliente recorre todos los saldos/facturas: verificar que termine dentro de los 29 s en Aurora con datos reales (antes se cacheaba 5 min con Cache-Control).
- [gestion_cartera] Las notificaciones de pedidos retenidos dependen del trigger trg_pedidos_retenidos_trg_notificar_pedido_retenido (fn_notificar_pedido_retenido) en Aurora: validar que el job de sync de pedidos (otro módulo) siga insertando en tbl_pedidos_retenidos.
- [gestiones] La bandeja de Coordinador trae todas las gestiones (~8.9k filas hoy) en lotes de 1000 por llamada (cada respuesta muy por debajo de 6 MB); si el volumen crece mucho conviene paginar en la UI.
- [gestiones] Las gestiones con activo=false se siguen devolviendo en la bandeja (el original tampoco filtraba); se conserva el comportamiento.
- [gestiones] ANALISTA_RIESGO sin cartera y GERENCIA ya no pueden registrar ni editar gestiones (antes la RLS lo permitia para analista_email propio): se aplica el guard pedido para el modulo.
- [identidad] Si el cliente OAuth de Google usado por el backend no es el mismo que emitió los refresh tokens guardados, todos los usuarios deberán volver a autorizar Gmail (lo hace solo el flujo de /auth/callback).
- [jobs] HORARIO DE SERVICIO: aws-project-deployer apaga Aurora y las Lambdas fuera de 5:00–17:00 CR. Quedarían sin ejecutarse: el ciclo sync_* de las 17:05 CR (23:05 UTC), check-sync-salud y check-recibos-reversion 17:15, notificar-sla-vencido 17:20, notificar-pedido-en-regla 17:25, conciliar-promesas e historico-cartera 17:30 (el snapshot diario de cartera se perdería todos los días), cierre-cartera-mensual 23:50 CR y cierre-mensual-pedidos-retenidos 23:59 CR (el cierre de mes nunca correría). Recomendación: ampliar el horario de servicio a 5:00–18:30 CR (todos los días, porque los sync_* e historico-cartera corren también en fin de semana) y abrir una ventana 23:30–00:30 CR para el cierre mensual (o mover ambos cierres dentro del horario, decisión del coordinador). Aurora Serverless v2 pausada agrega ~15–30 s de arranque en el primer job del día.
- [jobs] N8N y GAS dejan de cargar datos el día del corte si no se reconfiguran: deben pasar de 'escribir en Supabase' a POST /ingesta/{tabla} con x-ingesta-key, en lotes ≤ ~5 MB (límite 6 MB del payload síncrono de Lambda; máx. 5000 filas por lote) y terminar de cargar pagos_stage antes del :05 (fn_sync_pagos trunca el stage al procesar, igual que antes). Mantener ORIGEN N8N = PRODUCCIÓN de Softland (incidente 24–25/06/2026).
- [jobs] El worker sync-manual-worker corre en la VPC: necesita salida a Internet (NAT Gateway) para llamar a https://n8n.mayoreo.biz; sin NAT el webhook falla por timeout (30 s) y solo se procesa lo que ya haya en stage.
- [jobs] IngestaApi es público (auth none): ingesta_api_key debe ser larga y aleatoria, rotarse en Secrets Manager y compartirse solo con N8N/GAS; aplican WAF rate-limit y throttling del stage. Sin ingesta_api_key en el secreto toda ingesta responde 401 (falla cerrada).
- [jobs] EventBridge Scheduler reintenta por defecto hasta 185 veces en 24 h si la invocación falla; un job que falle por Aurora apagada se reintentaría fuera de hora. Conviene fijar RetryPolicy (p. ej. MaximumRetryAttempts 2, MaximumEventAgeInSeconds 3600) y DLQ del schedule en template.yaml.
- [jobs] Los 5 sync_* del :05 corren en 5 Lambdas en paralelo (en pg_cron también eran jobs independientes); fn_check_sync_salud del :15 sigue comparando conteo + sumas.
- [notificaciones] R-SCHEMA-MISMATCH: la tabla mensajes_chat (usada por src/app/api/chat/route.ts y src/hooks/useChat.ts) NO existe en el esquema real de producción, por lo que el chat no funciona en el origen. Decisión: no se inventa la tabla; GET /chat responde 422 'No se pudieron cargar los mensajes.' y POST /chat valida igual que el origen (mensaje vacío / >1000 / usuario) y responde 422 'Error al enviar el mensaje' (code chat_no_disponible). Si se decide habilitar el chat, hay que crear la tabla con un cambio versionado de BD y reimplementar los casos de uso.
- [notificaciones] La Lambda NotificacionesApi necesita salida a Internet (NAT) para api.hacienda.go.cr y apim.bccr.fi.cr. Hacienda bloqueaba tráfico desde nubes (Vercel) con su WAF: puede pasar lo mismo desde AWS; en ese caso la UI muestra el error de conexión normal (sin romper).
- [notificaciones] Tipo de cambio: dos llamadas secuenciales al BCCR con timeout de 8 s c/u; la Lambda debe tener timeout 29 s.
- [presupuesto] GET /presupuesto/proyeccion hace commit porque fn_proyeccion_cobro inserta el snapshot semanal (antes lo hacía el RPC VOLATILE de PostgREST en su propia transacción).
- [presupuesto] fn_recuperacion_*/fn_presupuesto_preview recorren pagos/facturas completas: timeout de 29 s de API Gateway; validar tiempos con datos reales (antes PostgREST tenía su propio statement_timeout).
- [presupuesto] Sin pago este mes (fn_sin_pago_cliente) no filtra por analista en la base: igual que el original, un ANALISTA en Mi Recuperación ve la lista completa del mes.
- [presupuesto] scope_email: ANALISTA y ANALISTA_RIESGO con cartera quedan acotados a su email en recuperación-mom/periodo/tramos/meta aunque pidan otro; COORDINADOR/GERENCIA/ANALISTA_RIESGO sin cartera ven lo pedido. 'Ver como' de un coordinador manda su propio email (igual que antes).
- [promesas] Con 'Ver como' ANALISTA el Coordinador ve solo sus propias promesas (igual que antes: la page pasa ?analista=<su email>); las escrituras se autorizan con el rol real.
- [reportes] historico_cartera se sigue leyendo ORDER BY fecha ASC LIMIT 90 (comportamiento original: las 90 filas más antiguas); con >90 días de histórico la tendencia del resumen ejecutivo no muestra lo más reciente.
- [reportes] Adjuntos base64 en POST /reportes/enviar: límite de payload de Lambda (6 MB) / API Gateway (10 MB); adjuntos grandes fallarán.
- [reportes] maestro_clientes completo (~1.5k filas) viaja en GET /reportes/cierre-mensual; crecer mucho afecta la latencia (límite 29 s).
- [reportes] PostgREST limitaba a 1000 filas las consultas directas (cartera-vencida, gestiones-periodo); ahora no hay límite, resultados pueden ser mayores que antes.
- [solicitudes] Las solicitudes del catálogo nuevo ('Pendiente', 'En revisión'...) solo las puede cambiar de estado el COORDINADOR (igual que el efecto real del RLS original, que comparaba con 'PENDIENTE' en mayúsculas). Si el negocio espera que los analistas las muevan, hay que decidir y ajustar la regla.
- [solicitudes] Para que las URLs de adjuntos migradas funcionen, los objetos de Storage de comprobantes-pago se tienen que copiar a S3 con la misma key (ruta dentro del bucket).
- [solicitudes] Un ANALISTA_RIESGO sin cartera ya no puede crear solicitudes desde la ficha del cliente (antes RLS lo permitía a cualquier usuario activo); queda alineado con el guard del módulo pedido en el CLAUDE.md.
- [solicitudes] El correo legacy necesita que el usuario haya conectado Gmail (refresh token en usuarios.google_refresh_token); si no, la solicitud no se crea, como antes con el token vencido.

**Revisiones del generador SQL:**
- `public.fn_es_usuario_activo` (auth_users_ref): auth.users → tbl_app_users: solo existen id, cognito_sub, email, created_at, updated_at
- `public.get_mi_rol` (auth_users_ref): auth.users → tbl_app_users: solo existen id, cognito_sub, email, created_at, updated_at
- `public.get_usuario_id` (auth_users_ref): auth.users → tbl_app_users: solo existen id, cognito_sub, email, created_at, updated_at

## 5. Pendientes (solo configuración de ambiente)

- **dev** — crear parámetros SSM: `/dev/cyc-cofersa/network/subnets` (VpcSubnetIds), `/dev/cyc-cofersa/network/lambda-sg` (LambdaSecurityGroupId), `/dev/cyc-cofersa/db/proxy-endpoint` (DbProxyEndpoint), `/dev/cyc-cofersa/frontend/origin` (AllowedOrigins)
- **dev** — crear el secreto de Secrets Manager `/dev/cyc-cofersa/db/app` con `username`/`password` del usuario `usr_<app>_app`
- **qa** — crear parámetros SSM: `/qa/cyc-cofersa/network/subnets` (VpcSubnetIds), `/qa/cyc-cofersa/network/lambda-sg` (LambdaSecurityGroupId), `/qa/cyc-cofersa/db/proxy-endpoint` (DbProxyEndpoint), `/qa/cyc-cofersa/frontend/origin` (AllowedOrigins)
- **qa** — crear el secreto de Secrets Manager `/qa/cyc-cofersa/db/app` con `username`/`password` del usuario `usr_<app>_app`
- **prod** — crear parámetros SSM: `/prod/cyc-cofersa/network/subnets` (VpcSubnetIds), `/prod/cyc-cofersa/network/lambda-sg` (LambdaSecurityGroupId), `/prod/cyc-cofersa/db/proxy-endpoint` (DbProxyEndpoint), `/prod/cyc-cofersa/frontend/origin` (AllowedOrigins)
- **prod** — crear el secreto de Secrets Manager `/prod/cyc-cofersa/db/app` con `username`/`password` del usuario `usr_<app>_app`
- Frontend — variables por ambiente en Amplify/pipeline: `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_COGNITO_USER_POOL_ID`, `NEXT_PUBLIC_COGNITO_CLIENT_ID` (salidas del stack SAM)
- Base de datos — ejecutar provisioning con las 4 contraseñas por variable de psql (`-v pass_ro=... -v pass_rw=... -v pass_ddl=... -v pass_admin=...`), nunca en archivos
- Usuarios — importar usuarios a Cognito (CSV de importación o Lambda de migración) y comunicar el restablecimiento de contraseña
- Opcional — `AlarmTopicArn` (SNS) en parameter_overrides para recibir las alarmas
- Seguridad — al terminar, borrar `.env.supabase` y rotar en Supabase la secret key, la password de la base y el access token usados en la migración

## 6. Validaciones ejecutadas

| Criterio | Verificación | Estado | Detalle |
|---|---|---|---|
| C1 | Artefactos de discovery | OK |  |
| C1 | Origen del esquema | OK | fuente: live_database |
| C2 | Manifest completo | OK |  |
| C2 | Cada regla de autorización tiene dónde se aplica (enforced_in) | OK |  |
| C2 | Sin errores pendientes declarados en el manifest | OK |  |
| C3 | Scripts Aurora por ambiente (dev, qa, prd) | OK |  |
| C3 | Objetos sin equivalente en Aurora documentados | OK |  |
| C4 | SQL en PostgreSQL efímero (idempotencia, validación, rollback) | OK | dev: PASSED; qa: PASSED; prd: PASSED |
| C8 | Un único template SAM parametrizado | OK |  |
| C8 | Template conforme al estándar (parámetros, runtime, logs) | OK |  |
| C5 | Estructura hexagonal del backend | OK |  |
| C5 | Handlers del manifest y del template implementados | OK | 35 handlers |
| C5 | Use cases del manifest implementados | OK | 178 use cases |
| C5 | Dependencias entre capas y handlers delgados | OK |  |
| C5 | SQL solo en adapters y con nombres de Aurora | OK |  |
| C6 | pytest (unitarios con fakes) | OK | 281 passed, 30 skipped in 0.69s |
| C6 | Cada módulo del manifest tiene tests unitarios | OK |  |
| C6 | pytest de integración contra el esquema generado (PG efímero) | OK | 30 passed in 53.96s |
| C7 | ruff check | OK |  |
| C8 | samconfig.toml dev/qa/prod con tags y rutas por ambiente | OK |  |
| C9 | cfn-lint | OK |  |
| C9 | Transformación SAM | OK | 348 recursos CloudFormation |
| C10 | IAM sin comodines (salvo ENI documentado) | OK |  |
| C10 | Colas SQS con los 4 controles del estándar | OK | 1 cola(s) |
| C11 | Capa compartida (gateway HTTP, auth, env) | OK |  |
| C11 | HTTP solo vía axiosApiGateway | OK |  |
| C11 | Módulos src/views con Page → Controller → Api | OK |  |
| C11 | Naming kebab-case (-page, use-*-controller, -api) | OK |  |
| C11 | Límites de tamaño de pages y secciones | OK |  |
| C11 | Componentes fuera de views/ ≤ 250 líneas | WARN | 72 hallazgo(s) |
| C11 | Variables por ambiente y hosting | OK |  |
| C12 | Instalación y build del frontend | OK | install + build |
| C12 | Prettier | OK |  |
| C12 | Tests del frontend | OK | el proyecto no tiene tests (no aplica) |
| C13 | Cero referencias a Supabase en frontend y backend | OK |  |
| C14 | Sin secretos en código ni configuración | OK |  |
| C14 | Sin IDs/ARNs/endpoints de AWS hardcodeados | OK |  |
| C15 | Sin TODO/FIXME/pseudocódigo | OK |  |

<details><summary>WARN — Componentes fuera de views/ ≤ 250 líneas</summary>

- frontend/src/app/(app)/auditoria-legal/garantias/ModalEmitirPagare.tsx: 1154 líneas
- frontend/src/app/(app)/auditoria-legal/garantias/ModalGenerarPagare.tsx: 788 líneas
- frontend/src/app/(app)/auditoria-legal/garantias/ModalRegistrarGarantia.tsx: 966 líneas
- frontend/src/app/(app)/auditoria-legal/garantias/ModalRevisarActualizacion.tsx: 252 líneas
- frontend/src/app/(app)/auditoria-legal/garantias/garantias-cliente.tsx: 2161 líneas
- frontend/src/app/(app)/dashboard/page.tsx: 1061 líneas
- frontend/src/app/(app)/gestion-cartera/pedidos-retenidos/pedidos-retenidos-cliente.tsx: 1334 líneas
- frontend/src/app/(app)/gestion-cartera/saldos-favor/saldos-favor-cliente.tsx: 540 líneas
- frontend/src/app/(app)/reportes/aging-consolidado/aging-cliente.tsx: 418 líneas
- frontend/src/app/(app)/reportes/cartera-vencida/cartera-vencida-cliente.tsx: 333 líneas
- frontend/src/app/(app)/reportes/cei/cei-cliente.tsx: 484 líneas
- frontend/src/app/(app)/reportes/cierre-mensual/cierre-mensual-cliente.tsx: 1230 líneas
- frontend/src/app/(app)/reportes/cierre-mensual/page.tsx: 311 líneas
- frontend/src/app/(app)/reportes/efectividad-gestiones/efectividad-cliente.tsx: 678 líneas
- frontend/src/app/(app)/reportes/estados-cuenta/estados-cuenta-cliente.tsx: 792 líneas
- frontend/src/app/(app)/reportes/facturas-plazo-especial/plazo-especial-cliente.tsx: 397 líneas
- frontend/src/app/(app)/reportes/gestiones-periodo/gestiones-periodo-cliente.tsx: 405 líneas
- frontend/src/app/(app)/reportes/icp-vendedor/icp-vendedor-cliente.tsx: 376 líneas
- frontend/src/app/(app)/reportes/migracion-mora/migracion-cliente.tsx: 476 líneas
- frontend/src/app/(app)/reportes/mora-vendedor/detalle-bloqueados.tsx: 823 líneas
- frontend/src/app/(app)/reportes/mora-vendedor/mora-vendedor-cliente.tsx: 907 líneas
- frontend/src/app/(app)/reportes/presupuesto-cobro/tab-presupuesto.tsx: 783 líneas
- frontend/src/app/(app)/reportes/presupuesto-cobro/tab-proyeccion.tsx: 545 líneas
- frontend/src/app/(app)/reportes/presupuesto-cobro/tab-recuperacion.tsx: 968 líneas
- frontend/src/app/(app)/reportes/presupuesto-cobro/tab-sin-pago.tsx: 263 líneas
- frontend/src/app/(app)/reportes/resumen-ejecutivo/resumen-ejecutivo-cliente.tsx: 1051 líneas
- frontend/src/app/(print)/pagare/[id]/PagareImprimible.tsx: 251 líneas
- frontend/src/app/actualizar-perfil/[token]/formulario-actualizacion.tsx: 288 líneas
- frontend/src/app/login/page.tsx: 315 líneas
- frontend/src/components/BuscadorGlobal.tsx: 562 líneas
- frontend/src/components/sidebar.tsx: 784 líneas
- frontend/src/components/topbar.tsx: 690 líneas
- frontend/src/components/analisis-pagos/PagosAplicadosCliente.tsx: 782 líneas
- frontend/src/components/analisis-pagos/TabAlertasDeterioro.tsx: 252 líneas
- frontend/src/components/analisis-pagos/TabConcentracion.tsx: 439 líneas
- frontend/src/components/analisis-pagos/TabPerfilVendedor.tsx: 364 líneas
- frontend/src/components/analisis-pagos/TabRankingClientes.tsx: 598 líneas
- frontend/src/components/analista/DashboardResumen.tsx: 353 líneas
- frontend/src/components/analista/PorVendedor.tsx: 300 líneas
- frontend/src/components/cartera/mi-cartera-view.tsx: 1332 líneas
- frontend/src/components/centro-recursos/TabAplicaciones.tsx: 520 líneas
- frontend/src/components/centro-recursos/TabDirectorioAgentes.tsx: 1025 líneas
- frontend/src/components/clientes/tabla-clientes.tsx: 892 líneas
- frontend/src/components/clientes/ficha/TendenciaPagoCard.tsx: 333 líneas
- frontend/src/components/clientes/ficha/ficha-cliente.tsx: 4132 líneas
- frontend/src/components/clientes/ficha/form-nueva-gestion.tsx: 999 líneas
- frontend/src/components/clientes/ficha/modal-gestion.tsx: 303 líneas
- frontend/src/components/clientes/ficha/modal-nueva-solicitud.tsx: 1478 líneas
- frontend/src/components/clientes/ficha/tab-reportar-pago.tsx: 1258 líneas
- frontend/src/components/clientes/ficha/timeline-gestiones-v2.tsx: 463 líneas
- frontend/src/components/configuracion/FeedActividadAutomatizaciones.tsx: 253 líneas
- frontend/src/components/configuracion/TabCierreMes.tsx: 373 líneas
- frontend/src/components/configuracion/TabDirectorio.tsx: 635 líneas
- frontend/src/components/configuracion/TabSincronizacion.tsx: 612 líneas
- frontend/src/components/configuracion/TabSupervisores.tsx: 464 líneas
- frontend/src/components/configuracion/TabUsuarios.tsx: 409 líneas
- frontend/src/components/configuracion/TabVendedores.tsx: 1428 líneas
- frontend/src/components/coordinador/DSOTendenciaCard.tsx: 313 líneas
- frontend/src/components/coordinador/TendenciaCarteraChart.tsx: 368 líneas
- frontend/src/components/gestiones/tabla-gestiones-base.tsx: 478 líneas
- frontend/src/components/gestiones/tabla-gestiones.tsx: 445 líneas
- frontend/src/components/layout/ChatPanel.tsx: 467 líneas
- frontend/src/components/promesas/tabla-promesas.tsx: 916 líneas
- frontend/src/components/reportes/RecuperacionMom.tsx: 518 líneas
- frontend/src/components/reportes/RecuperacionPeriodoCliente.tsx: 679 líneas
- frontend/src/components/reportes/RecuperacionTramos.tsx: 535 líneas
- frontend/src/components/reportes/VendedorEnvioPanel.tsx: 590 líneas
- frontend/src/components/saldos-favor/saldos-favor-tabla.tsx: 498 líneas
- frontend/src/components/solicitudes/detalle-solicitud.tsx: 526 líneas
- frontend/src/components/solicitudes/form-nueva-solicitud.tsx: 526 líneas
- frontend/src/components/solicitudes/form-solicitud-nueva.tsx: 1074 líneas
- frontend/src/components/solicitudes/wizard-nueva-solicitud.tsx: 1759 líneas

</details>

## 7. Despliegue

```bash
# 1. Base de datos (por ambiente; desde database/ o database/environments/<amb>/)
psql "$ADMIN_URL/postgres" -v pass_ro=*** -v pass_rw=*** -v pass_ddl=*** -v pass_admin=*** \
     -f aurora_postgresql_provisioning.sql
psql "$ADMIN_URL/cof_dev_cyc_cofersa_db" -f aurora_postgresql_schema.sql
psql "$ADMIN_URL/cof_dev_cyc_cofersa_db" -f aurora_postgresql_data.sql             # datos del origen (re-ejecutable)
psql "$ADMIN_URL/cof_dev_cyc_cofersa_db" -At -f aurora_postgresql_validation.sql   # TOTAL_FALTA debe ser 0
# datos: origen Supabase en solo lectura, credenciales desde .env.supabase (nunca en la línea de comandos)
TARGET_DATABASE_URL=... python "$SKILL/scripts/supabase_connect.py" exec -- ./data_migration.sh
python "$SKILL/scripts/supabase_connect.py" storage-export --out ./storage-export   # Storage
aws s3 sync ./storage-export/<bucket> s3://<bucket-del-stack>/
# 2. Backend
cd backend && sam build && sam deploy --config-env dev   # qa / prod
# 3. Frontend: configurar variables por rama en Amplify (o build del Dockerfile) y desplegar
```

