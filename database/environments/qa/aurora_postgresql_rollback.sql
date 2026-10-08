-- =============================================================================
-- cof_qa_cyc_cofersa — Aurora PostgreSQL — ROLLBACK
-- Ambiente: qa | Base: cof_qa_cyc_cofersa_db
-- Ejecutar como: master conectado a cof_qa_cyc_cofersa_db. Orden descendente; NUNCA contra Supabase
-- psql -v ON_ERROR_STOP=1 ... Generado por la skill aws-project-* (no editar a mano;
-- ajustar config.yaml y regenerar).
-- =============================================================================
\set ON_ERROR_STOP on
DO $do$
BEGIN
  IF current_database() <> 'cof_qa_cyc_cofersa_db' THEN
    RAISE EXCEPTION 'Rollback abortado: base actual % distinta de cof_qa_cyc_cofersa_db', current_database();
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname IN ('auth', 'storage', 'supabase_functions', 'realtime')) THEN
    RAISE EXCEPTION 'Rollback abortado: se detectaron esquemas de Supabase en la base actual.';
  END IF;
END
$do$;
BEGIN;
-- 0a. extensiones del aplicativo (la base es exclusiva del aplicativo; arrastran sus índices)
DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE;
DROP EXTENSION IF EXISTS pgcrypto CASCADE;
DROP EXTENSION IF EXISTS pg_stat_statements CASCADE;
-- 0b. todo lo que pertenece al rol ddl del aplicativo: lo generado por la skill y lo agregado por
--     database/changes (incluida tbl_schema_changes) aunque dependa entre sí. Un objeto de OTRO
--     dueño que dependa de estos hace fallar el rollback (DROP OWNED no usa CASCADE).
DROP OWNED BY ddl_cyc_cofersa;
-- 1. triggers y políticas
DO $do$
BEGIN
  IF to_regclass('cof_qa_cyc_cofersa_sch_core.tbl_garantias') IS NOT NULL THEN DROP TRIGGER IF EXISTS trg_garantias_updated_at ON cof_qa_cyc_cofersa_sch_core.tbl_garantias; END IF;
  IF to_regclass('cof_qa_cyc_cofersa_sch_core.tbl_maestro_clientes') IS NOT NULL THEN DROP TRIGGER IF EXISTS trg_maestro_clientes_trg_asignar_analista ON cof_qa_cyc_cofersa_sch_core.tbl_maestro_clientes; END IF;
  IF to_regclass('cof_qa_cyc_cofersa_sch_core.tbl_maestro_clientes') IS NOT NULL THEN DROP TRIGGER IF EXISTS trg_maestro_clientes_trg_normalizar_analista_nombre ON cof_qa_cyc_cofersa_sch_core.tbl_maestro_clientes; END IF;
  IF to_regclass('cof_qa_cyc_cofersa_sch_core.tbl_maestro_clientes') IS NOT NULL THEN DROP TRIGGER IF EXISTS trg_maestro_clientes_trg_proteger_contacto_manual ON cof_qa_cyc_cofersa_sch_core.tbl_maestro_clientes; END IF;
  IF to_regclass('cof_qa_cyc_cofersa_sch_core.tbl_maestro_clientes') IS NOT NULL THEN DROP TRIGGER IF EXISTS trg_maestro_clientes_trg_proteger_logistica_manual ON cof_qa_cyc_cofersa_sch_core.tbl_maestro_clientes; END IF;
  IF to_regclass('cof_qa_cyc_cofersa_sch_core.tbl_maestro_clientes') IS NOT NULL THEN DROP TRIGGER IF EXISTS trg_maestro_clientes_trg_sincronizar_analista_nombre ON cof_qa_cyc_cofersa_sch_core.tbl_maestro_clientes; END IF;
  IF to_regclass('cof_qa_cyc_cofersa_sch_core.tbl_notas_rapidas') IS NOT NULL THEN DROP TRIGGER IF EXISTS trg_notas_rapidas_updated_at ON cof_qa_cyc_cofersa_sch_core.tbl_notas_rapidas; END IF;
  IF to_regclass('cof_qa_cyc_cofersa_sch_core.tbl_pedidos_retenidos') IS NOT NULL THEN DROP TRIGGER IF EXISTS trg_pedidos_retenidos_trg_notificar_pedido_retenido ON cof_qa_cyc_cofersa_sch_core.tbl_pedidos_retenidos; END IF;
  IF to_regclass('cof_qa_cyc_cofersa_sch_core.tbl_personas_legales') IS NOT NULL THEN DROP TRIGGER IF EXISTS trg_personas_legales_updated_at ON cof_qa_cyc_cofersa_sch_core.tbl_personas_legales; END IF;
  IF to_regclass('cof_qa_cyc_cofersa_sch_core.tbl_solicitudes') IS NOT NULL THEN DROP TRIGGER IF EXISTS trg_solicitudes_updated_at ON cof_qa_cyc_cofersa_sch_core.tbl_solicitudes; END IF;
  IF to_regclass('cof_qa_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion') IS NOT NULL THEN DROP TRIGGER IF EXISTS trg_solicitudes_actualizacion_updated_at ON cof_qa_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion; END IF;
  IF to_regclass('cof_qa_cyc_cofersa_sch_core.tbl_vendedores') IS NOT NULL THEN DROP TRIGGER IF EXISTS trg_vendedores_trg_propagar_analista_vendedor ON cof_qa_cyc_cofersa_sch_core.tbl_vendedores; END IF;
END
$do$;
-- 2. vistas materializadas y vistas
DROP VIEW IF EXISTS cof_qa_cyc_cofersa_sch_core.vw_v_automatizaciones_feed;
DROP VIEW IF EXISTS cof_qa_cyc_cofersa_sch_core.vw_icp_por_cliente;
-- 3. FK
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_garantia_eventos DROP CONSTRAINT IF EXISTS fk_garantia_eventos_garantias;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_garantia_eventos DROP CONSTRAINT IF EXISTS fk_garantia_eventos_usuarios;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_garantias DROP CONSTRAINT IF EXISTS fk_garantias_garantias;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_garantias DROP CONSTRAINT IF EXISTS fk_garantias_usuarios;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_historico_bloqueados DROP CONSTRAINT IF EXISTS fk_historico_bloqueados_vendedores;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_historico_cierres_cartera DROP CONSTRAINT IF EXISTS fk_historico_cierres_cartera_vendedores;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_maestro_clientes DROP CONSTRAINT IF EXISTS fk_maestro_clientes_usuarios;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_maestro_clientes DROP CONSTRAINT IF EXISTS fk_maestro_clientes_vendedores;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_marcas DROP CONSTRAINT IF EXISTS fk_marcas_directorio_empresa;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_notas_rapidas DROP CONSTRAINT IF EXISTS fk_notas_rapidas_usuarios;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_notificaciones DROP CONSTRAINT IF EXISTS fk_notificaciones_usuarios;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_portafolio_acotado DROP CONSTRAINT IF EXISTS fk_portafolio_acotado_portafolio_grupos;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_portafolio_acotado DROP CONSTRAINT IF EXISTS fk_portafolio_acotado_vendedores;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_presupuesto_cobro DROP CONSTRAINT IF EXISTS fk_presupuesto_cobro_vendedores;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_presupuesto_meta_vendedor DROP CONSTRAINT IF EXISTS fk_presupuesto_meta_vendedor_vendedores;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_promesas DROP CONSTRAINT IF EXISTS fk_promesas_promesas;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_reporte_pago_detalles DROP CONSTRAINT IF EXISTS fk_reporte_pago_detalles_reportes_pago;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_solicitud_comentarios DROP CONSTRAINT IF EXISTS fk_solicitud_comentarios_solicitudes;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_solicitud_comentarios DROP CONSTRAINT IF EXISTS fk_solicitud_comentarios_usuarios;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_solicitud_historial_estados DROP CONSTRAINT IF EXISTS fk_solicitud_historial_estados_solicitudes;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_solicitud_historial_estados DROP CONSTRAINT IF EXISTS fk_solicitud_historial_estados_usuarios;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_solicitudes DROP CONSTRAINT IF EXISTS fk_solicitudes_maestro_clientes;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_solicitudes DROP CONSTRAINT IF EXISTS fk_solicitudes_gestiones;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_solicitudes DROP CONSTRAINT IF EXISTS fk_solicitudes_usuarios_revisor_id;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_solicitudes DROP CONSTRAINT IF EXISTS fk_solicitudes_usuarios_solicitante_id;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion DROP CONSTRAINT IF EXISTS fk_solicitudes_actualizacion_usuarios_aprobada_por;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion DROP CONSTRAINT IF EXISTS fk_solicitudes_actualizacion_usuarios_enviada_por;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion DROP CONSTRAINT IF EXISTS fk_solicitudes_actualizacion_garantias;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_supervisores DROP CONSTRAINT IF EXISTS fk_supervisores_supervisores;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_vendedores DROP CONSTRAINT IF EXISTS fk_vendedores_usuarios;
ALTER TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_vendedores DROP CONSTRAINT IF EXISTS fk_vendedores_supervisores;
-- 4. tablas (orden topológico inverso)
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_solicitud_historial_estados;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_solicitud_comentarios;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_solicitudes;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_presupuesto_meta_vendedor;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_presupuesto_cobro;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_portafolio_acotado;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_maestro_clientes;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_historico_cierres_cartera;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_historico_bloqueados;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_garantia_eventos;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_vendedores;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_reporte_pago_detalles;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_notificaciones;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_notas_rapidas;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_marcas;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_garantias;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_ventas_mensuales;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_usuarios;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_sync_salud;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_sync_log;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_supervisores;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_saldos_favor;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_reportes_pago;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_proyeccion_semana_snapshot;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_promesas;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_portafolio_grupos;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_personas_legales;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_pedidos_retenidos_stage;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_pedidos_retenidos;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_pagos_stage;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_pagos_duplicado_descartado;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_pagos_anulados;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_pagos;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_historico_pedidos_retenidos;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_historico_cartera;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_historico_aging_factura;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_gestiones;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_garantias_consecutivo_anual;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_facturas;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_directorio_empresa;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_cuentas_bancarias;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_config_sistema;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_config_audit_log;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_centro_recursos_documentos;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_centro_recursos_aplicaciones;
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_cartera;
-- 5. funciones
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_update_updated_at();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_set_updated_at();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_get_usuario_id();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_get_mi_rol();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_get_kpis_saldos_favor(analista_email text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_get_kpis_cartera();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_vendedores_por_contribuyente(p_contribuyente text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_tendencia_pago_cliente(p_cliente_cod text, p_meses integer);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_sync_salud_eval(p_tabla text, p_fingerprint text, p_umbral integer);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_sync_saldos_favor(p_ejecutado_por text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_sync_pedidos_retenidos(p_ejecutado_por text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_sync_pagos(p_ejecutado_por text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_sync_facturas(p_ejecutado_por text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_sync_cartera(p_ejecutado_por text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_snapshot_proyeccion_semana();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_snapshot_cierre_completo(p_anio integer, p_mes integer, p_provisional boolean, p_generado_por text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_snapshot_cierre_cartera(p_anio integer, p_mes integer, p_provisional boolean, p_generado_por text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_snapshot_bloqueados_semana();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_snapshot_aging_factura(p_anio integer, p_mes integer, p_provisional boolean, p_generado_por text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_sincronizar_analista_nombre();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_sin_pago_cliente(p_anio integer, p_mes integer);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_siguiente_consecutivo_garantia();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_siguiente_carpeta_disponible(p_mueble text, p_gaveta text, p_carpeta_desde integer);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_saldos_favor(p_email text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_saldo_contribuyente(p_contribuyente text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_resolver_responsables_contribuyente(p_contribuyente text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_reporte_plazo_especial(p_email text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_reporte_mora_vendedor(p_email text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_reporte_migracion_mora(p_anio integer, p_mes integer, p_supervisor_cod text, p_vendedor_cod text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_reporte_efectividad(p_ini date, p_fin date, p_email text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_reporte_cei(p_anio integer, p_mes integer);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_reporte_bloqueados(p_email text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_reporte_aging();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_registrar_historico_cartera(p_fecha date);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_recuperacion_tramos(p_ini date, p_fin date, p_email text, p_group text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_recuperacion_periodo(p_ini date, p_fin date, p_email text, p_group text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_recuperacion_mom(p_meses integer, p_email text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_recuperacion(p_anio integer, p_mes integer);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_proyeccion_cobro(p_semanas integer, p_ignore_snapshot boolean, p_semanas_pasadas integer);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_proteger_logistica_manual();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_proteger_contacto_manual();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_propagar_analista_vendedor();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_presupuesto_reasignar(p_anio integer, p_mes integer, p_cliente_cod text, p_vendedor_cod text, p_email text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_presupuesto_preview(p_anio integer, p_mes integer);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_presupuesto_meta(p_anio integer, p_mes integer, p_vendedor_cod text, p_meta numeric, p_email text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_presupuesto_guardar(p_anio integer, p_mes integer, p_email text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_presupuesto_frozen(p_anio integer, p_mes integer);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_presupuesto_calc(p_anio integer, p_mes integer);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_portafolio_destinatarios();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_pedidos_retenidos(p_email text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_pagos_mes_resumen(p_anio integer, p_mes integer);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_notificar_sla_vencido();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_notificar_sin_gestion();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_notificar_promesas_hoy();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_notificar_pedido_retenido();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_notificar_pedido_en_regla();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_normalizar_analista_nombre();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_meta_analista_mes(p_email text, p_anio integer, p_mes integer);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_matching_saldos_favor(p_cliente_cod text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_garantias_lista(p_email text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_garantias_clientes_sin_garantia(p_email text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_expirar_solicitudes_actualizacion();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_estados_cuenta(p_email text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_es_usuario_activo();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_dashboard_vendedores_analista(p_email text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_dashboard_analista_kpis(p_email text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_cron_cierre_mensual();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_contar_garantias_en_carpeta(p_mueble text, p_gaveta text, p_carpeta integer, p_excluir_id integer);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_conciliar_promesas();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_cola_del_dia(p_email text, p_limit integer);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_clientes_lista(p_q text, p_analista text, p_vendedor text, p_plazo text, p_nivel_precio text, p_dimension text, p_sort text, p_dir text, p_page integer, p_page_size integer, p_hoy date);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_cierre_mensual_riesgo_vendedor(p_anio integer, p_mes integer);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_cierre_mensual_pedidos_retenidos();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_cierre_mensual_mora(p_anio integer, p_mes integer, p_anio_ant integer, p_mes_ant integer);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_cierre_mensual_meses();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_cierre_mensual_icp(p_reciente_ini date, p_reciente_fin date, p_previo_ini date, p_previo_fin date);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_check_sync_salud();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_check_recibos_reversion();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_cargar_pagos_stage();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_buscar_contribuyentes(p_query text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_automatizaciones_resumen();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_asignar_analista_por_vendedor();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_analisis_ranking_clientes(p_email text, p_meses integer, p_offset integer, p_limit integer, p_clasificacion text, p_dimension text, p_vendedor_cod text, p_busqueda text, p_orden text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_analisis_perfil_vendedor(p_email text, p_meses integer, p_orden text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_analisis_concentracion();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_analisis_alertas_deterioro(p_email text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_aging_por_dimension();
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_actualizar_logistica_cliente(p_cliente_cod text, p_dia_visita text[], p_dia_pago text[], p_metodo_pago text[], p_observaciones_logistica text, p_persona_recibe text, p_actualizar_horario boolean, p_hora_recibo_inicio time without time zone, p_hora_recibo_fin time without time zone);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_actualizar_contacto_cliente(p_cliente_cod text, p_nombre_cxp text, p_telefono text, p_telefono2 text, p_correo text);
DROP ROUTINE IF EXISTS cof_qa_cyc_cofersa_sch_core.fn__recalc_metas(p_anio integer, p_mes integer, p_email text);
DROP TABLE IF EXISTS cof_qa_cyc_cofersa_sch_core.tbl_app_users;
DROP FUNCTION IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_auth_uid();
DROP FUNCTION IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_auth_role();
DROP FUNCTION IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_auth_email();
DROP FUNCTION IF EXISTS cof_qa_cyc_cofersa_sch_core.fn_auth_jwt();
-- 6. secuencias y tipos
DROP SEQUENCE IF EXISTS cof_qa_cyc_cofersa_sch_core.seq_cartera_id;
DROP SEQUENCE IF EXISTS cof_qa_cyc_cofersa_sch_core.seq_cuentas_bancarias_id;
DROP SEQUENCE IF EXISTS cof_qa_cyc_cofersa_sch_core.seq_facturas_id;
DROP SEQUENCE IF EXISTS cof_qa_cyc_cofersa_sch_core.seq_historico_bloqueados_id;
DROP SEQUENCE IF EXISTS cof_qa_cyc_cofersa_sch_core.seq_maestro_clientes_id;
DROP SEQUENCE IF EXISTS cof_qa_cyc_cofersa_sch_core.seq_presupuesto_cobro_id;
DROP SEQUENCE IF EXISTS cof_qa_cyc_cofersa_sch_core.seq_presupuesto_meta_vendedor_id;
DROP SEQUENCE IF EXISTS cof_qa_cyc_cofersa_sch_core.seq_solicitudes_actualizacion_id;
DROP SEQUENCE IF EXISTS cof_qa_cyc_cofersa_sch_core.seq_solicitudes_numero_consecutivo;
DROP SEQUENCE IF EXISTS cof_qa_cyc_cofersa_sch_core.seq_sync_log_id;
-- 7. extensiones
DROP EXTENSION IF EXISTS "uuid-ossp";
DROP EXTENSION IF EXISTS pgcrypto;
DROP EXTENSION IF EXISTS pg_stat_statements;
-- 8. esquemas (RESTRICT: falla si quedan objetos no generados por esta skill)
DROP SCHEMA IF EXISTS cof_qa_cyc_cofersa_sch_core;
-- 9. privilegios y default privileges de los roles en esta base
DROP OWNED BY ro_cyc_cofersa, rw_cyc_cofersa, ddl_cyc_cofersa, admin_cyc_cofersa;
COMMIT;

-- 10. Base de datos, usuarios y roles: requiere conexión a 'postgres' y CONFIRMACIÓN HUMANA.
--     Descomentar el bloque y ejecutarlo aparte.
-- >>> MANUAL_BEGIN <<<
-- \connect postgres
-- DROP DATABASE IF EXISTS cof_qa_cyc_cofersa_db;
-- DROP ROLE IF EXISTS usr_cyc_cofersa_dba;
-- DROP ROLE IF EXISTS usr_cyc_cofersa_deploy;
-- DROP ROLE IF EXISTS usr_cyc_cofersa_app;
-- DROP ROLE IF EXISTS usr_cyc_cofersa_report;
-- REVOKE admin_cyc_cofersa FROM CURRENT_USER;
-- DROP ROLE IF EXISTS admin_cyc_cofersa;
-- DROP ROLE IF EXISTS ddl_cyc_cofersa;
-- DROP ROLE IF EXISTS rw_cyc_cofersa;
-- DROP ROLE IF EXISTS ro_cyc_cofersa;
-- >>> MANUAL_END <<<

\echo 'Rollback de objetos completado.'
