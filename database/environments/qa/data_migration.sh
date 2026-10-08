#!/usr/bin/env bash
# data_migration.sh — copia de datos Supabase → Aurora (qa). Generado por aws-project-migrator.
# La ORIGEN se abre en modo solo lectura (default_transaction_read_only=on): nunca se modifica Supabase.
#   SOURCE_DATABASE_URL  conexión directa (no pooler) al Postgres de Supabase
#   TARGET_DATABASE_URL  Aurora cof_qa_cyc_cofersa_db como master o usr_cyc_cofersa_deploy
#   DISABLE_TRIGGERS=1   (por defecto) usa session_replication_role=replica en destino (requiere rds_superuser)
#   ALLOW_NON_EMPTY=1    permite continuar si el destino ya tiene filas (por defecto aborta)
set -euo pipefail
: "${SOURCE_DATABASE_URL:?Defina SOURCE_DATABASE_URL}"
: "${TARGET_DATABASE_URL:?Defina TARGET_DATABASE_URL}"
DISABLE_TRIGGERS="${DISABLE_TRIGGERS:-1}"
SRC_OPTS="-c default_transaction_read_only=on"
DST_OPTS="-c role=ddl_cyc_cofersa"
if [ "$DISABLE_TRIGGERS" = "1" ]; then DST_OPTS="$DST_OPTS -c session_replication_role=replica"; fi

src() { PGOPTIONS="$SRC_OPTS" psql "$SOURCE_DATABASE_URL" -v ON_ERROR_STOP=1 -X -q -At "$@"; }
dst() { PGOPTIONS="$DST_OPTS" psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -X -q -At "$@"; }

# Guardas
[ "$(dst -c "SELECT current_database()")" = "cof_qa_cyc_cofersa_db" ] || { echo "Destino no es cof_qa_cyc_cofersa_db"; exit 1; }
[ "$(dst -c "SELECT to_regclass('auth.users') IS NULL")" = "t" ] || { echo "Destino parece Supabase"; exit 1; }
[ "$(src -c "SELECT to_regclass('auth.users') IS NOT NULL")" = "t" ] || echo "AVISO: origen sin auth.users"

copy_table() {  # $1 origen, $2 destino, $3 columnas
  if [ "${ALLOW_NON_EMPTY:-0}" != "1" ] && [ "$(dst -c "SELECT EXISTS (SELECT 1 FROM $2)")" = "t" ]; then
    echo "Destino $2 no está vacío (ALLOW_NON_EMPTY=1 para continuar)"; exit 1
  fi
  echo "Copiando $1 → $2"
  src -c "\\copy (SELECT $3 FROM $1) TO STDOUT" | dst -c "\\copy $2 ($3) FROM STDIN"
}

compare_count() {
  local a b; a="$(src -c "SELECT count(*) FROM $1")"; b="$(dst -c "SELECT count(*) FROM $2")"
  if [ "$a" = "$b" ]; then echo "OK      $2 $b"; else echo "DIFERENCIA $2 origen=$a destino=$b"; FAILED=1; fi
}

# 1. Usuarios: auth.users → cof_qa_cyc_cofersa_sch_core.tbl_app_users (cognito_sub se vincula en el primer login por email verificado)
copy_table "auth.users" "cof_qa_cyc_cofersa_sch_core.tbl_app_users" "id, email, created_at, updated_at"

# 2. Tablas en orden topológico de FK
copy_table "public.cartera" "cof_qa_cyc_cofersa_sch_core.tbl_cartera" "id, contribuyente, cliente_cod, cliente_nombre, vendedor_nombre, no_vencido, mora_1_30, mora_31_60, mora_61_90, mora_91_120, mora_120_plus, total, sync_id, fecha_corte, updated_at"
copy_table "public.centro_recursos_aplicaciones" "cof_qa_cyc_cofersa_sch_core.tbl_centro_recursos_aplicaciones" "id, nombre, descripcion, url, icono, estado, orden, activo, creado_por, created_at"
copy_table "public.centro_recursos_documentos" "cof_qa_cyc_cofersa_sch_core.tbl_centro_recursos_documentos" "id, titulo, descripcion, categoria, tipo_archivo, url, subido_por, created_at"
copy_table "public.config_audit_log" "cof_qa_cyc_cofersa_sch_core.tbl_config_audit_log" "id, tabla, accion, descripcion, valor_anterior, valor_nuevo, realizado_por, realizado_en"
copy_table "public.config_sistema" "cof_qa_cyc_cofersa_sch_core.tbl_config_sistema" "clave, valor, descripcion"
copy_table "public.cuentas_bancarias" "cof_qa_cyc_cofersa_sch_core.tbl_cuentas_bancarias" "id, banco, moneda, tipo, numero, iban, activo, orden"
copy_table "public.directorio_empresa" "cof_qa_cyc_cofersa_sch_core.tbl_directorio_empresa" "id, nombre, email, cargo, area, activo, created_at, es_comprador, telefono"
copy_table "public.facturas" "cof_qa_cyc_cofersa_sch_core.tbl_facturas" "id, contribuyente, cliente_nombre, documento, fecha_documento, fecha_vencimiento, monto, saldo, sync_id, cliente_cod"
copy_table "public.garantias_consecutivo_anual" "cof_qa_cyc_cofersa_sch_core.tbl_garantias_consecutivo_anual" "anio, ultimo"
copy_table "public.gestiones" "cof_qa_cyc_cofersa_sch_core.tbl_gestiones" "id, cliente_cod, contribuyente, analista_email, fecha, hora, tipo, resultado, nota, promesa_fecha, promesa_monto, created_at, activo, proxima_accion, proxima_accion_fecha, promesa_id, metadata, archived, legacy"
copy_table "public.historico_aging_factura" "cof_qa_cyc_cofersa_sch_core.tbl_historico_aging_factura" "id, anio, mes, documento, cliente_cod, contribuyente, vendedor_cod, saldo, fecha_vencimiento, dias_venc, tramo, fecha_cierre, provisional, created_at"
copy_table "public.historico_cartera" "cof_qa_cyc_cofersa_sch_core.tbl_historico_cartera" "id, fecha, cartera_total, mora_total, mora_31_plus, pct_mora, pct_mora_31, n_en_mora, created_at"
copy_table "public.historico_pedidos_retenidos" "cof_qa_cyc_cofersa_sch_core.tbl_historico_pedidos_retenidos" "id_pedido, codigo_cliente, fecha_pedido, total_mercaderia, vendedor, anio_mes, estado_sic, comentario_analista, motivo_retencion, resuelto_por, resuelto_en, created_at, updated_at, archivado_en"
copy_table "public.pagos" "cof_qa_cyc_cofersa_sch_core.tbl_pagos" "id, contribuyente, cliente_cod, nombre_cliente, no_factura, monto_factura, fecha_vencimiento, no_recibo, tipo_pago, fecha_pago, monto_pago, dias_atraso, sync_id, created_at"
copy_table "public.pagos_anulados" "cof_qa_cyc_cofersa_sch_core.tbl_pagos_anulados" "no_recibo, motivo, recibo_reemplazo, anulado_por, anulado_en"
copy_table "public.pagos_duplicado_descartado" "cof_qa_cyc_cofersa_sch_core.tbl_pagos_duplicado_descartado" "no_recibo, nota, descartado_por, descartado_en"
copy_table "public.pagos_stage" "cof_qa_cyc_cofersa_sch_core.tbl_pagos_stage" "contribuyente, cliente_cod, nombre_cliente, no_factura, monto_factura, fecha_vencimiento, no_recibo, tipo_pago, fecha_pago, monto_pago, dias_atraso, sync_id"
copy_table "public.pedidos_retenidos" "cof_qa_cyc_cofersa_sch_core.tbl_pedidos_retenidos" "id_pedido, codigo_cliente, fecha_pedido, total_mercaderia, vendedor, anio_mes, estado_sic, comentario_analista, motivo_retencion, resuelto_por, resuelto_en, created_at, updated_at, ciclos_ausente"
copy_table "public.pedidos_retenidos_stage" "cof_qa_cyc_cofersa_sch_core.tbl_pedidos_retenidos_stage" "id_pedido, codigo_cliente, fecha_pedido, total_mercaderia, vendedor"
copy_table "public.personas_legales" "cof_qa_cyc_cofersa_sch_core.tbl_personas_legales" "cedula, nombre, estado_civil, profesion, domicilio, telefono, created_at, updated_at"
copy_table "public.portafolio_grupos" "cof_qa_cyc_cofersa_sch_core.tbl_portafolio_grupos" "principal_cod, nombre_ruta, rol_funcional, activo, created_at, updated_at"
copy_table "public.promesas" "cof_qa_cyc_cofersa_sch_core.tbl_promesas" "id, cliente_cod, contribuyente, analista_email, fecha_creacion, monto, fecha_promesa, estado, notas, updated_at, activo, gestion_id, reprogramada_de_id, fecha_validacion, validado_por, comentario_validacion, monto_abono_parcial, cliente_nombre, eventos"
copy_table "public.proyeccion_semana_snapshot" "cof_qa_cyc_cofersa_sch_core.tbl_proyeccion_semana_snapshot" "semana_inicio, esperado_facturas, generado_en"
copy_table "public.reportes_pago" "cof_qa_cyc_cofersa_sch_core.tbl_reportes_pago" "id, cliente_cod, contribuyente, analista_email, banco_origen, referencia, monto_transferido, fecha_transferencia, url_comprobante, estado, notas, created_at, updated_at"
copy_table "public.saldos_favor" "cof_qa_cyc_cofersa_sch_core.tbl_saldos_favor" "id, sync_id, contribuyente, cliente_cod, cliente_nombre, documento, tipo_documento, fecha_documento, fecha_vencimiento, monto, estado_manual, aplicado_por, aplicado_en, created_at, updated_at"
copy_table "public.supervisores" "cof_qa_cyc_cofersa_sch_core.tbl_supervisores" "cod, nombre, email, activo, created_at, es_jefe_regional, jefe_regional_cod, cargo_jerarquia"
copy_table "public.sync_log" "cof_qa_cyc_cofersa_sch_core.tbl_sync_log" "id, tipo, ejecutado_en, ejecutado_por, insertados, en_stage, omitidos, total_tabla, ultimo_registro, error"
copy_table "public.sync_salud" "cof_qa_cyc_cofersa_sch_core.tbl_sync_salud" "tabla, fingerprint, ciclos_sin_cambio, last_changed_at, last_check_at, alertado_en"
copy_table "public.usuarios" "cof_qa_cyc_cofersa_sch_core.tbl_usuarios" "id, email, nombre, rol, iniciales, color, activo, meta_individual, created_at, telefono, whatsapp, google_refresh_token, tiene_cartera_asignada"
copy_table "public.ventas_mensuales" "cof_qa_cyc_cofersa_sch_core.tbl_ventas_mensuales" "id, anio, mes, total_ventas_sin_iva, created_at, cartera_total_mes"
copy_table "public.garantias" "cof_qa_cyc_cofersa_sch_core.tbl_garantias" "id, contribuyente, cliente_nombre, tipo_titulo, monto_garantizado, tiene_fiador, fiador_nombre, fiador_cedula, fiador_telefono, representante_legal, fecha_emision, fecha_vencimiento, ubicacion_archivero, estado_custodia, documento_pdf_url, activo, reemplazada_por_id, registrado_por, analista_email, vendedor_cod, created_at, updated_at, deudor_estado_civil, deudor_profesion, deudor_domicilio, representante_cedula, representante_estado_civil, representante_profesion, representante_domicilio, fiador_estado_civil, fiador_profesion, fiador_domicilio, tasa_interes_moratorio, lugar_emision, documento_pagare_generado_en, consecutivo, origen_registro, ubicacion_archivero_mueble, ubicacion_archivero_gaveta, ubicacion_archivero_carpeta"
copy_table "public.marcas" "cof_qa_cyc_cofersa_sch_core.tbl_marcas" "id, nombre, proveedor, comprador_id, notas, activo, created_at"
copy_table "public.notas_rapidas" "cof_qa_cyc_cofersa_sch_core.tbl_notas_rapidas" "id, usuario_id, fecha, contenido, sincronizado_google, created_at, updated_at"
copy_table "public.notificaciones" "cof_qa_cyc_cofersa_sch_core.tbl_notificaciones" "id, usuario_id, tipo, titulo, mensaje, leida, link, created_at"
copy_table "public.reporte_pago_detalles" "cof_qa_cyc_cofersa_sch_core.tbl_reporte_pago_detalles" "id, reporte_id, factura_id, documento, monto_aplicado, created_at"
copy_table "public.vendedores" "cof_qa_cyc_cofersa_sch_core.tbl_vendedores" "cod, nombre, email, zona, supervisor_cod, analista_email, activo, asignado_por, asignado_en, created_at, telefono, tipo_canal"
copy_table "public.garantia_eventos" "cof_qa_cyc_cofersa_sch_core.tbl_garantia_eventos" "id, garantia_id, tipo_evento, usuario_id, nota, created_at"
copy_table "public.historico_bloqueados" "cof_qa_cyc_cofersa_sch_core.tbl_historico_bloqueados" "id, fecha_semana, cliente_cod, cliente_nombre, vendedor_cod, vendedor_nombre, saldo_vencido, created_at"
copy_table "public.historico_cierres_cartera" "cof_qa_cyc_cofersa_sch_core.tbl_historico_cierres_cartera" "id, anio, mes, vendedor_cod, mora_1_30, mora_31_60, mora_61_90, mora_91_120, mora_120_plus, saldo_vencido_cierre, n_clientes, fecha_cierre, provisional, generado_por, created_at"
copy_table "public.maestro_clientes" "cof_qa_cyc_cofersa_sch_core.tbl_maestro_clientes" "id, contribuyente, cliente_cod, cliente_nombre, vendedor_nombre, analista_email, telefono, correo, limite_credito, condicion_pago, estado_manual, agrupacion, updated_at, vendedor_cod, analista_nombre, dimension, nombre_cxp, telefono2, asignacion_manual, latitud, longitud, cantidad_impresiones, cliente_tramita, dia_visita, dia_pago, metodo_pago, observaciones_logistica, hora_recibo_inicio, hora_recibo_fin, persona_recibe, nivel_precio"
copy_table "public.portafolio_acotado" "cof_qa_cyc_cofersa_sch_core.tbl_portafolio_acotado" "id, principal_cod, vendedor_cod, activo, created_at"
copy_table "public.presupuesto_cobro" "cof_qa_cyc_cofersa_sch_core.tbl_presupuesto_cobro" "id, anio, mes, cliente_cod, cliente_nombre, vendedor_cod, vendedor_nombre, dias_prom, dias_prom_ajustado, ppto_cartera, ppto_nuevas_ventas, ppto_total, generado_en, generado_por, contribuyente"
copy_table "public.presupuesto_meta_vendedor" "cof_qa_cyc_cofersa_sch_core.tbl_presupuesto_meta_vendedor" "id, anio, mes, vendedor_cod, vendedor_nombre, meta_sugerida, meta_ajustada, updated_at, updated_por, editada"
copy_table "public.solicitudes_actualizacion" "cof_qa_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion" "id, contribuyente, cliente_nombre, tipo_persona, token_hash, token_expira_en, estado, datos_temporales, url_cedula, url_personeria, enviada_por, enviada_en, respondida_en, aprobada_por, aprobada_en, garantia_id, nota_revision, created_at, updated_at, correo_destino"
copy_table "public.solicitudes" "cof_qa_cyc_cofersa_sch_core.tbl_solicitudes" "id, tipo, cliente_id, cliente_cod, cliente_nombre, solicitante_id, revisor_id, monto_actual, monto_solicitado, monto, justificacion, comentario_revisor, motivo_nota, documento_ref, fecha_limite, estado, created_at, updated_at, para_email, cc_emails, destinatario, datos, gestion_id, area, prioridad, sla_horas, sla_vencimiento, responsable_nombre, responsable_email, descripcion, observaciones_internas, numero_consecutivo"
copy_table "public.solicitud_comentarios" "cof_qa_cyc_cofersa_sch_core.tbl_solicitud_comentarios" "id, solicitud_id, usuario_id, contenido, created_at"
copy_table "public.solicitud_historial_estados" "cof_qa_cyc_cofersa_sch_core.tbl_solicitud_historial_estados" "id, solicitud_id, estado_anterior, estado_nuevo, usuario_id, nota, created_at"

# 3. Secuencias / identity
dst <<'SQL'
SELECT setval(pg_get_serial_sequence('cof_qa_cyc_cofersa_sch_core.tbl_cartera', 'id'), coalesce(max(id), 0) + 1, false) FROM cof_qa_cyc_cofersa_sch_core.tbl_cartera;
SELECT setval(pg_get_serial_sequence('cof_qa_cyc_cofersa_sch_core.tbl_cuentas_bancarias', 'id'), coalesce(max(id), 0) + 1, false) FROM cof_qa_cyc_cofersa_sch_core.tbl_cuentas_bancarias;
SELECT setval(pg_get_serial_sequence('cof_qa_cyc_cofersa_sch_core.tbl_facturas', 'id'), coalesce(max(id), 0) + 1, false) FROM cof_qa_cyc_cofersa_sch_core.tbl_facturas;
SELECT setval(pg_get_serial_sequence('cof_qa_cyc_cofersa_sch_core.tbl_sync_log', 'id'), coalesce(max(id), 0) + 1, false) FROM cof_qa_cyc_cofersa_sch_core.tbl_sync_log;
SELECT setval(pg_get_serial_sequence('cof_qa_cyc_cofersa_sch_core.tbl_garantias', 'id'), coalesce(max(id), 0) + 1, false) FROM cof_qa_cyc_cofersa_sch_core.tbl_garantias;
SELECT setval(pg_get_serial_sequence('cof_qa_cyc_cofersa_sch_core.tbl_garantia_eventos', 'id'), coalesce(max(id), 0) + 1, false) FROM cof_qa_cyc_cofersa_sch_core.tbl_garantia_eventos;
SELECT setval(pg_get_serial_sequence('cof_qa_cyc_cofersa_sch_core.tbl_historico_bloqueados', 'id'), coalesce(max(id), 0) + 1, false) FROM cof_qa_cyc_cofersa_sch_core.tbl_historico_bloqueados;
SELECT setval(pg_get_serial_sequence('cof_qa_cyc_cofersa_sch_core.tbl_maestro_clientes', 'id'), coalesce(max(id), 0) + 1, false) FROM cof_qa_cyc_cofersa_sch_core.tbl_maestro_clientes;
SELECT setval(pg_get_serial_sequence('cof_qa_cyc_cofersa_sch_core.tbl_portafolio_acotado', 'id'), coalesce(max(id), 0) + 1, false) FROM cof_qa_cyc_cofersa_sch_core.tbl_portafolio_acotado;
SELECT setval(pg_get_serial_sequence('cof_qa_cyc_cofersa_sch_core.tbl_presupuesto_cobro', 'id'), coalesce(max(id), 0) + 1, false) FROM cof_qa_cyc_cofersa_sch_core.tbl_presupuesto_cobro;
SELECT setval(pg_get_serial_sequence('cof_qa_cyc_cofersa_sch_core.tbl_presupuesto_meta_vendedor', 'id'), coalesce(max(id), 0) + 1, false) FROM cof_qa_cyc_cofersa_sch_core.tbl_presupuesto_meta_vendedor;
SELECT setval(pg_get_serial_sequence('cof_qa_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion', 'id'), coalesce(max(id), 0) + 1, false) FROM cof_qa_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion;
SELECT setval(pg_get_serial_sequence('cof_qa_cyc_cofersa_sch_core.tbl_solicitudes', 'numero_consecutivo'), coalesce(max(numero_consecutivo), 0) + 1, false) FROM cof_qa_cyc_cofersa_sch_core.tbl_solicitudes;

SQL

# 4. Conteos origen vs destino
FAILED=0
compare_count "auth.users" "cof_qa_cyc_cofersa_sch_core.tbl_app_users"
compare_count "public.cartera" "cof_qa_cyc_cofersa_sch_core.tbl_cartera"
compare_count "public.centro_recursos_aplicaciones" "cof_qa_cyc_cofersa_sch_core.tbl_centro_recursos_aplicaciones"
compare_count "public.centro_recursos_documentos" "cof_qa_cyc_cofersa_sch_core.tbl_centro_recursos_documentos"
compare_count "public.config_audit_log" "cof_qa_cyc_cofersa_sch_core.tbl_config_audit_log"
compare_count "public.config_sistema" "cof_qa_cyc_cofersa_sch_core.tbl_config_sistema"
compare_count "public.cuentas_bancarias" "cof_qa_cyc_cofersa_sch_core.tbl_cuentas_bancarias"
compare_count "public.directorio_empresa" "cof_qa_cyc_cofersa_sch_core.tbl_directorio_empresa"
compare_count "public.facturas" "cof_qa_cyc_cofersa_sch_core.tbl_facturas"
compare_count "public.garantias_consecutivo_anual" "cof_qa_cyc_cofersa_sch_core.tbl_garantias_consecutivo_anual"
compare_count "public.gestiones" "cof_qa_cyc_cofersa_sch_core.tbl_gestiones"
compare_count "public.historico_aging_factura" "cof_qa_cyc_cofersa_sch_core.tbl_historico_aging_factura"
compare_count "public.historico_cartera" "cof_qa_cyc_cofersa_sch_core.tbl_historico_cartera"
compare_count "public.historico_pedidos_retenidos" "cof_qa_cyc_cofersa_sch_core.tbl_historico_pedidos_retenidos"
compare_count "public.pagos" "cof_qa_cyc_cofersa_sch_core.tbl_pagos"
compare_count "public.pagos_anulados" "cof_qa_cyc_cofersa_sch_core.tbl_pagos_anulados"
compare_count "public.pagos_duplicado_descartado" "cof_qa_cyc_cofersa_sch_core.tbl_pagos_duplicado_descartado"
compare_count "public.pagos_stage" "cof_qa_cyc_cofersa_sch_core.tbl_pagos_stage"
compare_count "public.pedidos_retenidos" "cof_qa_cyc_cofersa_sch_core.tbl_pedidos_retenidos"
compare_count "public.pedidos_retenidos_stage" "cof_qa_cyc_cofersa_sch_core.tbl_pedidos_retenidos_stage"
compare_count "public.personas_legales" "cof_qa_cyc_cofersa_sch_core.tbl_personas_legales"
compare_count "public.portafolio_grupos" "cof_qa_cyc_cofersa_sch_core.tbl_portafolio_grupos"
compare_count "public.promesas" "cof_qa_cyc_cofersa_sch_core.tbl_promesas"
compare_count "public.proyeccion_semana_snapshot" "cof_qa_cyc_cofersa_sch_core.tbl_proyeccion_semana_snapshot"
compare_count "public.reportes_pago" "cof_qa_cyc_cofersa_sch_core.tbl_reportes_pago"
compare_count "public.saldos_favor" "cof_qa_cyc_cofersa_sch_core.tbl_saldos_favor"
compare_count "public.supervisores" "cof_qa_cyc_cofersa_sch_core.tbl_supervisores"
compare_count "public.sync_log" "cof_qa_cyc_cofersa_sch_core.tbl_sync_log"
compare_count "public.sync_salud" "cof_qa_cyc_cofersa_sch_core.tbl_sync_salud"
compare_count "public.usuarios" "cof_qa_cyc_cofersa_sch_core.tbl_usuarios"
compare_count "public.ventas_mensuales" "cof_qa_cyc_cofersa_sch_core.tbl_ventas_mensuales"
compare_count "public.garantias" "cof_qa_cyc_cofersa_sch_core.tbl_garantias"
compare_count "public.marcas" "cof_qa_cyc_cofersa_sch_core.tbl_marcas"
compare_count "public.notas_rapidas" "cof_qa_cyc_cofersa_sch_core.tbl_notas_rapidas"
compare_count "public.notificaciones" "cof_qa_cyc_cofersa_sch_core.tbl_notificaciones"
compare_count "public.reporte_pago_detalles" "cof_qa_cyc_cofersa_sch_core.tbl_reporte_pago_detalles"
compare_count "public.vendedores" "cof_qa_cyc_cofersa_sch_core.tbl_vendedores"
compare_count "public.garantia_eventos" "cof_qa_cyc_cofersa_sch_core.tbl_garantia_eventos"
compare_count "public.historico_bloqueados" "cof_qa_cyc_cofersa_sch_core.tbl_historico_bloqueados"
compare_count "public.historico_cierres_cartera" "cof_qa_cyc_cofersa_sch_core.tbl_historico_cierres_cartera"
compare_count "public.maestro_clientes" "cof_qa_cyc_cofersa_sch_core.tbl_maestro_clientes"
compare_count "public.portafolio_acotado" "cof_qa_cyc_cofersa_sch_core.tbl_portafolio_acotado"
compare_count "public.presupuesto_cobro" "cof_qa_cyc_cofersa_sch_core.tbl_presupuesto_cobro"
compare_count "public.presupuesto_meta_vendedor" "cof_qa_cyc_cofersa_sch_core.tbl_presupuesto_meta_vendedor"
compare_count "public.solicitudes_actualizacion" "cof_qa_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion"
compare_count "public.solicitudes" "cof_qa_cyc_cofersa_sch_core.tbl_solicitudes"
compare_count "public.solicitud_comentarios" "cof_qa_cyc_cofersa_sch_core.tbl_solicitud_comentarios"
compare_count "public.solicitud_historial_estados" "cof_qa_cyc_cofersa_sch_core.tbl_solicitud_historial_estados"
[ "$FAILED" = "0" ] && echo "Migración de datos verificada." || { echo "Hay diferencias de conteo"; exit 1; }
