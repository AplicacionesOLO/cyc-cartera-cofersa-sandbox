-- =============================================================================
-- cof_prd_cyc_cofersa — Aurora PostgreSQL — SCHEMA
-- Ambiente: prd | Base: cof_prd_cyc_cofersa_db
-- Ejecutar como: master o usr_cyc_cofersa_deploy conectado a cof_prd_cyc_cofersa_db
-- psql -v ON_ERROR_STOP=1 ... Generado por la skill aws-project-* (no editar a mano;
-- ajustar config.yaml y regenerar).
-- =============================================================================
\set ON_ERROR_STOP on
DO $do$
BEGIN
  IF current_database() <> 'cof_prd_cyc_cofersa_db' THEN
    RAISE EXCEPTION 'Base actual % distinta de la esperada cof_prd_cyc_cofersa_db', current_database();
  END IF;
  IF to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION 'Destino parece Supabase. Abortado.';
  END IF;
END
$do$;
BEGIN;
SET LOCAL ROLE ddl_cyc_cofersa;
SET LOCAL search_path = cof_prd_cyc_cofersa_sch_core;
SET LOCAL check_function_bodies = off;

-- ---------------------------------------------------------------- tipos

-- ---------------------------------------------------------------- secuencias
CREATE SEQUENCE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.seq_cartera_id AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.seq_cuentas_bancarias_id AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.seq_facturas_id AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.seq_historico_bloqueados_id AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.seq_maestro_clientes_id AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.seq_presupuesto_cobro_id AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.seq_presupuesto_meta_vendedor_id AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.seq_solicitudes_actualizacion_id AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.seq_solicitudes_numero_consecutivo AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.seq_sync_log_id AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

-- ---------------------------------------------------------------- auth: espejo de usuarios + contexto
-- Reemplaza auth.users (Cognito es el IdP). El backend vincula cognito_sub en el primer login.
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_app_users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cognito_sub text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_app_users PRIMARY KEY (id),
  CONSTRAINT uq_app_users_cognito_sub UNIQUE (cognito_sub)
);
CREATE INDEX IF NOT EXISTS idx_app_users_email_expr ON cof_prd_cyc_cofersa_sch_core.tbl_app_users (lower(email));
-- Contexto de sesión por transacción (set_config(..., true)) fijado por PostgresUnitOfWork.
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_auth_uid() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE AS $fn$SELECT nullif(current_setting('app.user_id', true), '')::uuid$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_auth_role() RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE AS $fn$SELECT coalesce(nullif(current_setting('app.role', true), ''), 'anon')$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_auth_email() RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE AS $fn$SELECT nullif(current_setting('app.email', true), '')$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_auth_jwt() RETURNS jsonb
  LANGUAGE sql STABLE PARALLEL SAFE AS $fn$SELECT coalesce(nullif(current_setting('app.jwt_claims', true), ''), '{}')::jsonb$fn$;

-- ---------------------------------------------------------------- funciones (previas a tablas)
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn__recalc_metas(p_anio integer, p_mes integer, p_email text)
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
BEGIN
  INSERT INTO tbl_presupuesto_meta_vendedor (anio,mes,vendedor_cod,vendedor_nombre,meta_sugerida,meta_ajustada,editada,updated_por)
  SELECT p_anio,p_mes,vendedor_cod,MAX(vendedor_nombre),ROUND(SUM(ppto_total)),ROUND(SUM(ppto_total)),false,p_email
  FROM tbl_presupuesto_cobro WHERE anio=p_anio AND mes=p_mes GROUP BY vendedor_cod
  ON CONFLICT (anio,mes,vendedor_cod) DO UPDATE SET
    meta_sugerida = EXCLUDED.meta_sugerida,
    vendedor_nombre = EXCLUDED.vendedor_nombre,
    meta_ajustada = CASE WHEN tbl_presupuesto_meta_vendedor.editada THEN tbl_presupuesto_meta_vendedor.meta_ajustada ELSE EXCLUDED.meta_sugerida END,
    updated_at = now();
  -- vendedores que quedaron sin clientes → meta 0
  UPDATE tbl_presupuesto_meta_vendedor SET meta_sugerida=0,
    meta_ajustada = CASE WHEN editada THEN meta_ajustada ELSE 0 END, updated_at=now()
  WHERE anio=p_anio AND mes=p_mes
    AND vendedor_cod NOT IN (SELECT DISTINCT vendedor_cod FROM tbl_presupuesto_cobro WHERE anio=p_anio AND mes=p_mes);
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_actualizar_contacto_cliente(p_cliente_cod text, p_nombre_cxp text DEFAULT NULL::text, p_telefono text DEFAULT NULL::text, p_telefono2 text DEFAULT NULL::text, p_correo text DEFAULT NULL::text)
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
BEGIN
  PERFORM set_config('app.contacto_manual', 'on', true);
  UPDATE tbl_maestro_clientes SET
    nombre_cxp = COALESCE(p_nombre_cxp, nombre_cxp),
    telefono   = COALESCE(p_telefono,   telefono),
    telefono2  = COALESCE(p_telefono2,  telefono2),
    correo     = COALESCE(p_correo,     correo),
    updated_at = now()
  WHERE cliente_cod = p_cliente_cod;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_actualizar_logistica_cliente(p_cliente_cod text, p_dia_visita text[] DEFAULT NULL::text[], p_dia_pago text[] DEFAULT NULL::text[], p_metodo_pago text[] DEFAULT NULL::text[], p_observaciones_logistica text DEFAULT NULL::text, p_persona_recibe text DEFAULT NULL::text, p_actualizar_horario boolean DEFAULT false, p_hora_recibo_inicio time without time zone DEFAULT NULL::time without time zone, p_hora_recibo_fin time without time zone DEFAULT NULL::time without time zone)
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
BEGIN
  PERFORM set_config('app.logistica_manual', 'on', true);
  UPDATE cof_prd_cyc_cofersa_sch_core.tbl_maestro_clientes SET
    dia_visita             = COALESCE(p_dia_visita,             dia_visita),
    dia_pago                = COALESCE(p_dia_pago,                dia_pago),
    metodo_pago             = COALESCE(p_metodo_pago,             metodo_pago),
    observaciones_logistica = COALESCE(p_observaciones_logistica, observaciones_logistica),
    persona_recibe          = COALESCE(p_persona_recibe,          persona_recibe),
    hora_recibo_inicio      = CASE WHEN p_actualizar_horario THEN p_hora_recibo_inicio ELSE hora_recibo_inicio END,
    hora_recibo_fin         = CASE WHEN p_actualizar_horario THEN p_hora_recibo_fin    ELSE hora_recibo_fin    END
  WHERE cliente_cod = p_cliente_cod;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_aging_por_dimension()
  RETURNS TABLE(dimension text, n_clientes bigint, no_vencido numeric, m1_30 numeric, m31_60 numeric, m61_90 numeric, m91_120 numeric, m120 numeric, mora_total numeric, total numeric, pct_mora numeric)
  LANGUAGE sql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
  SELECT
    COALESCE(mc.dimension, 'Sin dimensión')             AS dimension,
    COUNT(DISTINCT c.cliente_cod)::bigint               AS n_clientes,
    SUM(c.no_vencido)                                   AS no_vencido,
    SUM(c.mora_1_30)                                    AS m1_30,
    SUM(c.mora_31_60)                                   AS m31_60,
    SUM(c.mora_61_90)                                   AS m61_90,
    SUM(GREATEST(c.mora_91_120, 0))                     AS m91_120,
    SUM(c.mora_120_plus)                                AS m120,
    SUM(c.mora_1_30 + c.mora_31_60 + c.mora_61_90
        + GREATEST(c.mora_91_120, 0) + c.mora_120_plus) AS mora_total,
    SUM(c.total)                                        AS total,
    CASE WHEN SUM(c.total) > 0 THEN
      ROUND(
        SUM(c.mora_1_30 + c.mora_31_60 + c.mora_61_90
            + GREATEST(c.mora_91_120, 0) + c.mora_120_plus)
        / SUM(c.total) * 100, 1)
    ELSE 0 END                                          AS pct_mora
  FROM tbl_cartera c
  JOIN tbl_maestro_clientes mc ON mc.cliente_cod = c.cliente_cod
  GROUP BY COALESCE(mc.dimension, 'Sin dimensión')
  ORDER BY SUM(c.total) DESC;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_analisis_alertas_deterioro(p_email text DEFAULT NULL::text)
  RETURNS json
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  v_hoy_cr DATE := (NOW() AT TIME ZONE 'America/Costa_Rica')::DATE;
  v_result JSON;
BEGIN
  WITH
  mc AS (
    SELECT DISTINCT ON (cliente_cod)
      cliente_cod, cliente_nombre, vendedor_nombre, analista_nombre, analista_email
    FROM tbl_maestro_clientes
    ORDER BY cliente_cod, updated_at DESC NULLS LAST
  ),
  icp_actual AS (
    SELECT cliente_cod,
      GREATEST(0,100-LEAST(100,
        ROUND(AVG(GREATEST(0,COALESCE(dias_atraso,0))::NUMERIC)/90.0*100)
      ))                                                              AS score,
      ROUND(AVG(GREATEST(0,COALESCE(dias_atraso,0))::NUMERIC),1)    AS dias_prom,
      COUNT(*)                                                        AS n_pagos
    FROM tbl_pagos
    WHERE fecha_pago >= v_hoy_cr - INTERVAL '3 months'
      AND NOT EXISTS (SELECT 1 FROM tbl_pagos_anulados pa WHERE pa.no_recibo = tbl_pagos.no_recibo)
    GROUP BY cliente_cod
  ),
  icp_anterior AS (
    SELECT cliente_cod,
      GREATEST(0,100-LEAST(100,
        ROUND(AVG(GREATEST(0,COALESCE(dias_atraso,0))::NUMERIC)/90.0*100)
      ))                                                              AS score,
      ROUND(AVG(GREATEST(0,COALESCE(dias_atraso,0))::NUMERIC),1)    AS dias_prom,
      COUNT(*)                                                        AS n_pagos
    FROM tbl_pagos
    WHERE fecha_pago >= v_hoy_cr - INTERVAL '6 months'
      AND fecha_pago <  v_hoy_cr - INTERVAL '3 months'
      AND NOT EXISTS (SELECT 1 FROM tbl_pagos_anulados pa WHERE pa.no_recibo = tbl_pagos.no_recibo)
    GROUP BY cliente_cod
  ),
  mora_actual AS (
    SELECT cliente_cod,
      COALESCE(SUM(mora_1_30+mora_31_60+mora_61_90+mora_91_120+mora_120_plus),0) AS mora_total
    FROM tbl_cartera GROUP BY cliente_cod
  ),
  comparacion AS (
    SELECT
      mc.cliente_cod,
      mc.cliente_nombre,
      COALESCE(mc.vendedor_nombre,'—')  AS vendedor_nombre,
      COALESCE(mc.analista_nombre,'—')  AS analista_nombre,
      COALESCE(ma.mora_total,0)         AS cartera_actual,
      ia.score                          AS icp_actual,
      ian.score                         AS icp_anterior,
      (ia.score - ian.score)            AS variacion,
      ia.dias_prom                      AS dias_actual,
      ian.dias_prom                     AS dias_anterior
    FROM icp_actual ia
    JOIN icp_anterior ian ON ian.cliente_cod = ia.cliente_cod AND ian.n_pagos >= 3
    JOIN mc ON mc.cliente_cod = ia.cliente_cod
    LEFT JOIN mora_actual ma ON ma.cliente_cod = ia.cliente_cod
    WHERE ia.n_pagos >= 3
      AND (p_email IS NULL OR mc.analista_email = p_email)
  ),
  sin_historial AS (
    SELECT COUNT(DISTINCT p.cliente_cod) AS cnt
    FROM tbl_pagos p
    JOIN mc ON mc.cliente_cod = p.cliente_cod
    WHERE (p_email IS NULL OR mc.analista_email = p_email)
    GROUP BY p.cliente_cod
    HAVING COUNT(*) < 5
  ),
  kpis AS (
    SELECT
      COUNT(CASE WHEN variacion < -20 THEN 1 END)  AS deterioro_critico,
      COUNT(CASE WHEN variacion BETWEEN -20 AND -10 THEN 1 END) AS deterioro_moderado,
      COUNT(CASE WHEN variacion > 15  THEN 1 END)  AS recuperacion,
      (SELECT COUNT(*) FROM sin_historial)           AS sin_historial
    FROM comparacion
  )
  SELECT json_build_object(
    'kpis', (SELECT row_to_json(k) FROM kpis k),
    'deterioro_critico', COALESCE((
      SELECT json_agg(c ORDER BY c.variacion ASC)
      FROM (SELECT * FROM comparacion WHERE variacion < -20 ORDER BY variacion ASC LIMIT 50) c
    ), '[]'::JSON),
    'deterioro_moderado', COALESCE((
      SELECT json_agg(c ORDER BY c.variacion ASC)
      FROM (SELECT * FROM comparacion WHERE variacion BETWEEN -20 AND -10 ORDER BY variacion ASC LIMIT 50) c
    ), '[]'::JSON),
    'recuperacion', COALESCE((
      SELECT json_agg(c ORDER BY c.variacion DESC)
      FROM (SELECT * FROM comparacion WHERE variacion > 15 ORDER BY variacion DESC LIMIT 50) c
    ), '[]'::JSON)
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_analisis_concentracion()
  RETURNS json
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  v_result JSON;
BEGIN
  WITH
  mc AS (
    SELECT DISTINCT ON (cliente_cod)
      cliente_cod, cliente_nombre, vendedor_nombre, dimension
    FROM tbl_maestro_clientes
    ORDER BY cliente_cod, updated_at DESC NULLS LAST
  ),
  mora_total_global AS (
    SELECT SUM(mora_1_30+mora_31_60+mora_61_90+mora_91_120+mora_120_plus) AS total
    FROM tbl_cartera
  ),
  mora_por_cliente AS (
    SELECT
      c.cliente_cod,
      SUM(mora_1_30+mora_31_60+mora_61_90+mora_91_120+mora_120_plus) AS mora_total
    FROM tbl_cartera c GROUP BY c.cliente_cod
  ),
  icp_cli AS (
    SELECT cliente_cod,
      GREATEST(0,100-LEAST(100,
        ROUND(AVG(GREATEST(0,COALESCE(dias_atraso,0))::NUMERIC)/90.0*100)
      )) AS icp_score,
      CASE
        WHEN GREATEST(0,100-LEAST(100,ROUND(AVG(GREATEST(0,COALESCE(dias_atraso,0))::NUMERIC)/90.0*100))) >= 85 THEN 'EXCELENTE'
        WHEN GREATEST(0,100-LEAST(100,ROUND(AVG(GREATEST(0,COALESCE(dias_atraso,0))::NUMERIC)/90.0*100))) >= 70 THEN 'BUENO'
        WHEN GREATEST(0,100-LEAST(100,ROUND(AVG(GREATEST(0,COALESCE(dias_atraso,0))::NUMERIC)/90.0*100))) >= 50 THEN 'REGULAR'
        WHEN GREATEST(0,100-LEAST(100,ROUND(AVG(GREATEST(0,COALESCE(dias_atraso,0))::NUMERIC)/90.0*100))) >= 25 THEN 'MALO'
        ELSE 'MUY MALO'
      END AS clasificacion
    FROM tbl_pagos
    WHERE fecha_pago >= CURRENT_DATE - INTERVAL '6 months'
      AND NOT EXISTS (SELECT 1 FROM tbl_pagos_anulados pa WHERE pa.no_recibo = tbl_pagos.no_recibo)
    GROUP BY cliente_cod
  ),
  top10 AS (
    SELECT
      ROW_NUMBER() OVER (ORDER BY mpc.mora_total DESC) AS rank,
      mc.cliente_cod,
      mc.cliente_nombre,
      COALESCE(mc.vendedor_nombre,'—') AS vendedor_nombre,
      mpc.mora_total,
      ROUND(mpc.mora_total*100.0/NULLIF((SELECT total FROM mora_total_global),0),2) AS pct_mora,
      ROUND(SUM(mpc.mora_total) OVER (ORDER BY mpc.mora_total DESC ROWS UNBOUNDED PRECEDING)
        *100.0/NULLIF((SELECT total FROM mora_total_global),0),2) AS pct_acumulado,
      COALESCE(ic.icp_score,NULL)    AS icp_score,
      COALESCE(ic.clasificacion,NULL) AS clasificacion
    FROM mora_por_cliente mpc
    JOIN mc ON mc.cliente_cod = mpc.cliente_cod
    LEFT JOIN icp_cli ic ON ic.cliente_cod = mpc.cliente_cod
    WHERE mpc.mora_total > 0
    ORDER BY mpc.mora_total DESC
    LIMIT 10
  ),
  mora_por_vendedor AS (
    SELECT mc.vendedor_nombre,
      SUM(mpc.mora_total) AS mora_vend
    FROM mora_por_cliente mpc
    JOIN mc ON mc.cliente_cod = mpc.cliente_cod
    WHERE mc.vendedor_nombre IS NOT NULL
    GROUP BY mc.vendedor_nombre
    ORDER BY mora_vend DESC LIMIT 3
  ),
  kpis AS (
    SELECT
      (SELECT ROUND(SUM(mora_total)*100.0/NULLIF((SELECT total FROM mora_total_global),0),1)
       FROM top10)                                                           AS pct_top10,
      (SELECT ROUND(SUM(mora_vend)*100.0/NULLIF((SELECT total FROM mora_total_global),0),1)
       FROM mora_por_vendedor)                                               AS pct_top3_vendedores,
      (SELECT ROUND(SUM(mpc.mora_total)*100.0/NULLIF((SELECT total FROM mora_total_global),0),1)
       FROM mora_por_cliente mpc JOIN mc ON mc.cliente_cod=mpc.cliente_cod
       WHERE UPPER(COALESCE(mc.dimension,''))='GRANDES')                     AS pct_grandes,
      ROUND((
        SELECT SUM(POWER(mpc2.mora_total/NULLIF((SELECT total FROM mora_total_global),0),2))*10000
        FROM mora_por_cliente mpc2 WHERE mpc2.mora_total > 0
      )::NUMERIC,0)                                                          AS hhi_valor,
      CASE
        WHEN (SELECT SUM(POWER(mpc3.mora_total/NULLIF((SELECT total FROM mora_total_global),0),2))*10000
              FROM mora_por_cliente mpc3 WHERE mpc3.mora_total > 0) > 2500  THEN 'ALTO'
        WHEN (SELECT SUM(POWER(mpc3.mora_total/NULLIF((SELECT total FROM mora_total_global),0),2))*10000
              FROM mora_por_cliente mpc3 WHERE mpc3.mora_total > 0) > 1500  THEN 'MEDIO'
        ELSE 'BAJO'
      END                                                                    AS hhi_nivel
  )
  SELECT json_build_object(
    'kpis',       (SELECT row_to_json(k) FROM kpis k),
    'top10',      COALESCE((SELECT json_agg(t ORDER BY t.rank) FROM top10 t), '[]'::JSON),
    'total_mora', (SELECT total FROM mora_total_global)
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_analisis_perfil_vendedor(p_email text DEFAULT NULL::text, p_meses integer DEFAULT 6, p_orden text DEFAULT 'icp_asc'::text)
  RETURNS json
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  v_hoy_cr       DATE := (NOW() AT TIME ZONE 'America/Costa_Rica')::DATE;
  v_fecha_inicio DATE;
  v_result       JSON;
BEGIN
  v_fecha_inicio := v_hoy_cr - (p_meses || ' months')::INTERVAL;

  WITH
  mc AS (
    SELECT DISTINCT ON (cliente_cod)
      cliente_cod, vendedor_cod, vendedor_nombre, analista_email
    FROM tbl_maestro_clientes
    ORDER BY cliente_cod, updated_at DESC NULLS LAST
  ),
  icp_cli AS (
    SELECT
      p.cliente_cod,
      mc.vendedor_cod,
      mc.vendedor_nombre,
      GREATEST(0,100-LEAST(100,
        ROUND(AVG(GREATEST(0,COALESCE(p.dias_atraso,0))::NUMERIC)/90.0*100)
      ))                                                                       AS icp,
      ROUND(AVG(GREATEST(0,COALESCE(p.dias_atraso,0))::NUMERIC),1)           AS dias_prom,
      COUNT(CASE WHEN COALESCE(p.dias_atraso,0) <= 0 THEN 1 END)             AS n_puntual,
      COUNT(*)                                                                 AS n_pagos
    FROM tbl_pagos p
    JOIN mc ON mc.cliente_cod = p.cliente_cod
    WHERE p.fecha_pago >= v_fecha_inicio
      AND (p_email IS NULL OR mc.analista_email = p_email)
      AND NOT EXISTS (SELECT 1 FROM tbl_pagos_anulados pa WHERE pa.no_recibo = p.no_recibo)
    GROUP BY p.cliente_cod, mc.vendedor_cod, mc.vendedor_nombre
  ),
  vend AS (
    SELECT cod, supervisor_cod FROM tbl_vendedores
  ),
  por_vendedor AS (
    SELECT
      ic.vendedor_cod,
      ic.vendedor_nombre,
      COALESCE(v.supervisor_cod, '—')                AS supervisor_cod,
      COUNT(DISTINCT ic.cliente_cod)                 AS total_clientes,
      ROUND(AVG(ic.icp),1)                           AS icp_promedio,
      ROUND(SUM(ic.n_puntual)*100.0/NULLIF(SUM(ic.n_pagos),0),1) AS pct_a_tiempo,
      ROUND(AVG(ic.dias_prom),1)                     AS dias_atraso_prom,
      COUNT(CASE WHEN ic.icp < 50 THEN 1 END)        AS clientes_criticos
    FROM icp_cli ic
    LEFT JOIN vend v ON v.cod = ic.vendedor_cod
    GROUP BY ic.vendedor_cod, ic.vendedor_nombre, v.supervisor_cod
  ),
  kpis AS (
    SELECT
      (SELECT vendedor_nombre FROM por_vendedor ORDER BY icp_promedio DESC NULLS LAST LIMIT 1)  AS mejor_icp_vendedor,
      (SELECT ROUND(icp_promedio,1) FROM por_vendedor ORDER BY icp_promedio DESC NULLS LAST LIMIT 1) AS mejor_icp_valor,
      (SELECT vendedor_nombre FROM por_vendedor ORDER BY clientes_criticos::NUMERIC/NULLIF(total_clientes,0) DESC NULLS LAST LIMIT 1) AS mayor_riesgo_vendedor,
      ROUND(MAX(clientes_criticos::NUMERIC/NULLIF(total_clientes,0))*100,1)  AS mayor_riesgo_pct,
      (SELECT vendedor_nombre FROM por_vendedor ORDER BY pct_a_tiempo DESC NULLS LAST LIMIT 1) AS mejor_puntual_vendedor,
      (SELECT ROUND(pct_a_tiempo,1) FROM por_vendedor ORDER BY pct_a_tiempo DESC NULLS LAST LIMIT 1) AS mejor_puntual_pct,
      (SELECT vendedor_nombre FROM por_vendedor ORDER BY dias_atraso_prom DESC NULLS LAST LIMIT 1) AS peor_dias_vendedor,
      (SELECT ROUND(dias_atraso_prom,1) FROM por_vendedor ORDER BY dias_atraso_prom DESC NULLS LAST LIMIT 1) AS peor_dias_valor
    FROM por_vendedor
  )
  SELECT json_build_object(
    'kpis', (SELECT row_to_json(k) FROM kpis k),
    'rows', COALESCE((
      SELECT json_agg(r ORDER BY
        CASE WHEN p_orden='icp_asc'     THEN r.icp_promedio::TEXT     END ASC,
        CASE WHEN p_orden='icp_desc'    THEN r.icp_promedio::TEXT     END DESC,
        CASE WHEN p_orden='puntual'     THEN r.pct_a_tiempo::TEXT     END DESC,
        CASE WHEN p_orden='dias'        THEN r.dias_atraso_prom::TEXT END DESC,
        CASE WHEN p_orden='criticos'    THEN r.clientes_criticos::TEXT END DESC,
        r.icp_promedio ASC
      )
      FROM (SELECT * FROM por_vendedor
            ORDER BY
              CASE WHEN p_orden='icp_asc'  THEN icp_promedio     END ASC,
              CASE WHEN p_orden='icp_desc' THEN icp_promedio     END DESC,
              CASE WHEN p_orden='puntual'  THEN pct_a_tiempo     END DESC,
              CASE WHEN p_orden='dias'     THEN dias_atraso_prom END DESC,
              CASE WHEN p_orden='criticos' THEN clientes_criticos END DESC,
              icp_promedio ASC
      ) r
    ), '[]'::JSON)
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_analisis_ranking_clientes(p_email text DEFAULT NULL::text, p_meses integer DEFAULT 6, p_offset integer DEFAULT 0, p_limit integer DEFAULT 25, p_clasificacion text DEFAULT NULL::text, p_dimension text DEFAULT NULL::text, p_vendedor_cod text DEFAULT NULL::text, p_busqueda text DEFAULT NULL::text, p_orden text DEFAULT 'icp_asc'::text)
  RETURNS json
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  v_hoy_cr        DATE := (NOW() AT TIME ZONE 'America/Costa_Rica')::DATE;
  v_fecha_inicio  DATE;
  v_latest_sync   TEXT;
  v_result        JSON;
BEGIN
  v_fecha_inicio := v_hoy_cr - (p_meses || ' months')::INTERVAL;
  SELECT sync_id INTO v_latest_sync FROM tbl_cartera ORDER BY updated_at DESC LIMIT 1;

  WITH
  mc AS (
    SELECT DISTINCT ON (cliente_cod)
      cliente_cod, cliente_nombre, vendedor_nombre, vendedor_cod, analista_nombre, analista_email, dimension
    FROM tbl_maestro_clientes ORDER BY cliente_cod, updated_at DESC NULLS LAST
  ),
  icp_periodo AS (
    SELECT p.cliente_cod, COUNT(CASE WHEN COALESCE(p.dias_atraso,0) <= 0 THEN 1 END) AS pagos_puntual
    FROM tbl_pagos p
    WHERE p.fecha_pago >= v_fecha_inicio
      AND NOT EXISTS (SELECT 1 FROM tbl_pagos_anulados pa WHERE pa.no_recibo = p.no_recibo)
    GROUP BY p.cliente_cod
  ),
  mora_actual AS (
    SELECT c.cliente_cod, COALESCE(SUM(c.mora_1_30+c.mora_31_60+c.mora_61_90+c.mora_91_120+c.mora_120_plus),0) AS mora_total
    FROM tbl_cartera c WHERE (v_latest_sync IS NULL OR c.sync_id = v_latest_sync) GROUP BY c.cliente_cod
  ),
  resultado AS (
    SELECT
      mc.cliente_cod, mc.cliente_nombre,
      COALESCE(mc.vendedor_nombre,'—')  AS vendedor_nombre,
      COALESCE(mc.vendedor_cod,'')      AS vendedor_cod,
      COALESCE(mc.analista_nombre,'—')  AS analista_nombre,
      COALESCE(mc.dimension,'—')        AS dimension,
      COALESCE(v.icp_score, 0)                          AS icp_score,
      COALESCE(v.n_pagos, 0)                            AS n_pagos,
      ROUND(COALESCE(v.dias_prom_ponderado, 0), 1)     AS dias_atraso_prom,
      ip.pagos_puntual,
      COALESCE(v.clasificacion,'MUY MALO')             AS clasificacion,
      COALESCE(v.tendencia, 0)                          AS tendencia_3m,
      COALESCE(ma.mora_total,0)                         AS cartera_actual
    FROM icp_periodo ip
    JOIN mc ON mc.cliente_cod = ip.cliente_cod
    LEFT JOIN vw_icp_por_cliente v ON v.cliente_cod = ip.cliente_cod
    LEFT JOIN mora_actual ma ON ma.cliente_cod = ip.cliente_cod
    WHERE (p_email IS NULL OR mc.analista_email = p_email)
      AND (p_vendedor_cod IS NULL OR mc.vendedor_cod = p_vendedor_cod)
      AND (p_dimension IS NULL OR UPPER(COALESCE(mc.dimension,'')) = UPPER(p_dimension))
      AND (p_busqueda IS NULL OR mc.cliente_nombre ILIKE '%'||p_busqueda||'%')
      AND (p_clasificacion IS NULL OR COALESCE(v.clasificacion,'MUY MALO') = p_clasificacion)
  ),
  kpis AS (
    SELECT
      COALESCE(ROUND(AVG(icp_score),1),0) AS icp_promedio,
      COUNT(CASE WHEN dias_atraso_prom <= 5 THEN 1 END) AS cnt_puntual,
      COALESCE(ROUND(COUNT(CASE WHEN dias_atraso_prom <= 5 THEN 1 END)*100.0/NULLIF(COUNT(*),0),1),0) AS pct_puntual,
      COUNT(CASE WHEN dias_atraso_prom > 5 AND dias_atraso_prom <= 30 THEN 1 END) AS cnt_moderado,
      COALESCE(ROUND(COUNT(CASE WHEN dias_atraso_prom > 5 AND dias_atraso_prom <= 30 THEN 1 END)*100.0/NULLIF(COUNT(*),0),1),0) AS pct_moderado,
      COUNT(CASE WHEN dias_atraso_prom > 30 THEN 1 END) AS cnt_grave,
      COALESCE(ROUND(COUNT(CASE WHEN dias_atraso_prom > 30 THEN 1 END)*100.0/NULLIF(COUNT(*),0),1),0) AS pct_grave,
      COALESCE(ROUND(AVG(dias_atraso_prom),1),0) AS dias_atraso_promedio,
      COUNT(*) AS total_clientes
    FROM resultado
  )
  SELECT json_build_object(
    'kpis',  (SELECT row_to_json(k) FROM kpis k),
    'total', (SELECT total_clientes FROM kpis),
    'rows',  COALESCE((
      SELECT json_agg(r2) FROM (SELECT * FROM resultado
        ORDER BY
          CASE WHEN p_orden='icp_asc'      THEN icp_score        END ASC,
          CASE WHEN p_orden='icp_desc'     THEN icp_score        END DESC,
          CASE WHEN p_orden='dias_asc'     THEN dias_atraso_prom END ASC,
          CASE WHEN p_orden='cartera_desc' THEN cartera_actual   END DESC,
          icp_score ASC,
          cliente_cod ASC
        LIMIT p_limit OFFSET p_offset) r2
    ), '[]'::JSON)
  ) INTO v_result;
  RETURN v_result;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_asignar_analista_por_vendedor()
  RETURNS trigger
  LANGUAGE plpgsql
  VOLATILE
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
BEGIN
  IF (NEW.asignacion_manual = FALSE OR NEW.asignacion_manual IS NULL) THEN
    IF (NEW.analista_email IS NULL OR NEW.analista_email = ''
        OR NEW.vendedor_cod IS DISTINCT FROM OLD.vendedor_cod) THEN
      SELECT analista_email
        INTO NEW.analista_email
        FROM cof_prd_cyc_cofersa_sch_core.tbl_vendedores
       WHERE cod = NEW.vendedor_cod
         AND activo = TRUE
       LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_automatizaciones_resumen()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
  SELECT COALESCE(jsonb_object_agg(regla_id, disparos), '{}'::jsonb)
  FROM (
    SELECT regla_id, COUNT(*) AS disparos
    FROM cof_prd_cyc_cofersa_sch_core.vw_v_automatizaciones_feed
    WHERE created_at >= now() - interval '7 days'
      AND regla_id IS NOT NULL
    GROUP BY regla_id
  ) x;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_buscar_contribuyentes(p_query text)
  RETURNS TABLE(contribuyente text, cliente_nombre text, n_codigos bigint)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
  select distinct on (mc.contribuyente)
    mc.contribuyente, mc.cliente_nombre,
    count(*) over (partition by mc.contribuyente) as n_codigos
  from tbl_maestro_clientes mc
  where mc.cliente_nombre ilike '%' || p_query || '%'
     or mc.contribuyente  ilike '%' || p_query || '%'
  order by mc.contribuyente, mc.cliente_nombre
  limit 8;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_cargar_pagos_stage()
  RETURNS TABLE(insertados integer, en_stage integer, omitidos integer, total_pagos bigint, ultimo_pago date)
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE v_stage int; v_ins int; v_tag text;
BEGIN
  SELECT count(*) INTO v_stage FROM tbl_pagos_stage;
  v_tag := 'manual_' || to_char((now() AT TIME ZONE 'America/Costa_Rica')::date, 'YYYY_MM');

  INSERT INTO tbl_pagos (contribuyente, cliente_cod, nombre_cliente, no_factura, monto_factura,
     fecha_vencimiento, no_recibo, tipo_pago, fecha_pago, monto_pago, dias_atraso, sync_id)
  SELECT trim(contribuyente), trim(cliente_cod), NULLIF(trim(nombre_cliente),''),
     trim(no_factura),
     replace(replace(trim(monto_factura), ',', ''), ' ', '')::numeric,
     trim(fecha_vencimiento)::date,
     NULLIF(trim(no_recibo),''), NULLIF(trim(tipo_pago),''),
     trim(fecha_pago)::date,
     replace(replace(trim(monto_pago), ',', ''), ' ', '')::numeric,
     CASE WHEN trim(dias_atraso) ~ '^-?[0-9]+$' THEN trim(dias_atraso)::int
          ELSE (trim(fecha_pago)::date - trim(fecha_vencimiento)::date) END,
     COALESCE(NULLIF(trim(sync_id),''), v_tag)
  FROM tbl_pagos_stage
  WHERE NULLIF(trim(no_recibo),'')        IS NOT NULL    -- recibo es la llave del dedupe
    AND NULLIF(trim(no_factura),'')       IS NOT NULL
    AND NULLIF(trim(cliente_cod),'')      IS NOT NULL
    AND NULLIF(trim(contribuyente),'')    IS NOT NULL
    AND NULLIF(trim(fecha_pago),'')       IS NOT NULL
    AND NULLIF(trim(fecha_vencimiento),'')IS NOT NULL
    AND NULLIF(trim(monto_pago),'')       IS NOT NULL
    AND NULLIF(trim(monto_factura),'')    IS NOT NULL
  ON CONFLICT (no_recibo, no_factura) DO NOTHING;
  GET DIAGNOSTICS v_ins = ROW_COUNT;

  TRUNCATE tbl_pagos_stage;

  RETURN QUERY SELECT v_ins, v_stage, (v_stage - v_ins),
    (SELECT count(*) FROM tbl_pagos), (SELECT max(fecha_pago) FROM tbl_pagos);
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_check_recibos_reversion()
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.no_recibo, p.cliente_cod,
           MIN(p.nombre_cliente) AS nombre_cliente,
           MIN(p.fecha_pago)     AS fecha_pago,
           SUM(p.monto_pago)     AS neto
    FROM tbl_pagos p
    WHERE p.monto_pago < 0
      AND p.fecha_pago >= CURRENT_DATE - INTERVAL '45 days'
      AND NOT EXISTS (SELECT 1 FROM tbl_pagos_anulados pa WHERE pa.no_recibo = p.no_recibo)
      AND NOT EXISTS (
        SELECT 1 FROM tbl_notificaciones n
        WHERE n.tipo = 'ALERTA' AND n.titulo = 'Recibo con reversión: ' || p.no_recibo
      )
    GROUP BY p.no_recibo, p.cliente_cod
  )
  LOOP
    INSERT INTO tbl_notificaciones(usuario_id, tipo, titulo, mensaje, leida, link)
    SELECT u.id, 'ALERTA',
           'Recibo con reversión: ' || r.no_recibo,
           'El recibo ' || r.no_recibo || ' de ' || COALESCE(NULLIF(r.nombre_cliente,''), r.cliente_cod) ||
             ' (' || r.cliente_cod || ', ' || to_char(r.fecha_pago,'DD/MM/YYYY') || ') trae líneas negativas ' ||
             '(neto ' || to_char(ROUND(r.neto), 'FM999G999G999') || ') y no está marcado como anulado. ' ||
             'Verificá en Softland si el recibo fue revertido/anulado y marcalo en Pagos Aplicados del Mes.',
           false, '/reportes/pagos-aplicados'
    FROM tbl_usuarios u WHERE u.rol = 'COORDINADOR' AND COALESCE(u.activo, true) = true;
  END LOOP;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_check_sync_salud()
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  fp_cartera text; fp_facturas text; fp_saldos text; fp_pagos text; fp_pedidos text;
  v_activa   text;
BEGIN
  SELECT valor INTO v_activa
  FROM tbl_config_sistema WHERE clave = 'automatizacion_sync_salud_activa';
  IF COALESCE(v_activa, 'true') = 'false' THEN
    RETURN;
  END IF;

  SELECT coalesce(max(updated_at)::text,'') || '|' || count(*) || '|' || round(coalesce(sum(total),0))
    INTO fp_cartera  FROM tbl_cartera;
  SELECT count(*) || '|' || round(coalesce(sum(saldo),0)) || '|' || round(coalesce(sum(monto),0))
    INTO fp_facturas FROM tbl_facturas;
  SELECT count(*) || '|' || round(coalesce(sum(monto),0))
    INTO fp_saldos   FROM tbl_saldos_favor;
  SELECT coalesce(max(created_at)::text,'') || '|' || count(*)
    INTO fp_pagos    FROM tbl_pagos;
  SELECT coalesce(max(updated_at)::text,'') || '|' || count(*) || '|' || round(coalesce(sum(total_mercaderia),0))
    INTO fp_pedidos  FROM tbl_pedidos_retenidos;

  PERFORM fn_sync_salud_eval('cartera',           fp_cartera);
  PERFORM fn_sync_salud_eval('facturas',          fp_facturas);
  PERFORM fn_sync_salud_eval('saldos_favor',      fp_saldos);
  PERFORM fn_sync_salud_eval('pagos',             fp_pagos);
  PERFORM fn_sync_salud_eval('pedidos_retenidos', fp_pedidos);
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_cierre_mensual_icp(p_reciente_ini date, p_reciente_fin date, p_previo_ini date, p_previo_fin date)
  RETURNS TABLE(cliente_cod text, atraso_previo numeric, n_previo integer, atraso_reciente numeric, n_reciente integer)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
  WITH reciente AS (
    SELECT p.cliente_cod, AVG(GREATEST(0, COALESCE(p.dias_atraso, 0))) AS atraso, COUNT(*) AS n
    FROM tbl_pagos p
    WHERE p.fecha_pago BETWEEN p_reciente_ini AND p_reciente_fin
      AND COALESCE(p.cliente_cod, '') <> ''
      AND NOT EXISTS (SELECT 1 FROM tbl_pagos_anulados pa WHERE pa.no_recibo = p.no_recibo)
    GROUP BY p.cliente_cod
  ),
  previo AS (
    SELECT p.cliente_cod, AVG(GREATEST(0, COALESCE(p.dias_atraso, 0))) AS atraso, COUNT(*) AS n
    FROM tbl_pagos p
    WHERE p.fecha_pago BETWEEN p_previo_ini AND p_previo_fin
      AND COALESCE(p.cliente_cod, '') <> ''
      AND NOT EXISTS (SELECT 1 FROM tbl_pagos_anulados pa WHERE pa.no_recibo = p.no_recibo)
    GROUP BY p.cliente_cod
  )
  SELECT r.cliente_cod,
         ROUND(pr.atraso, 1), pr.n::int,
         ROUND(r.atraso, 1),  r.n::int
  FROM reciente r
  JOIN previo pr ON pr.cliente_cod = r.cliente_cod
  WHERE r.n >= 3 AND pr.n >= 3;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_cierre_mensual_meses()
  RETURNS TABLE(anio integer, mes integer)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
  SELECT DISTINCT anio, mes
  FROM tbl_historico_aging_factura
  WHERE provisional = false
  ORDER BY anio DESC, mes DESC;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_cierre_mensual_mora(p_anio integer, p_mes integer, p_anio_ant integer, p_mes_ant integer)
  RETURNS TABLE(cliente_cod text, no_vencido numeric, mora_1_30 numeric, mora_31_60 numeric, mora_61_90 numeric, mora_91_120 numeric, mora_120_plus numeric, mora_actual numeric, mora_anterior numeric, total_actual numeric)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
  WITH actual AS (
    SELECT
      cliente_cod,
      SUM(CASE WHEN tramo = 'NO_VENCIDO'  THEN saldo ELSE 0 END) AS no_vencido,
      SUM(CASE WHEN tramo = '1_30'        THEN saldo ELSE 0 END) AS mora_1_30,
      SUM(CASE WHEN tramo = '31_60'       THEN saldo ELSE 0 END) AS mora_31_60,
      SUM(CASE WHEN tramo = '61_90'       THEN saldo ELSE 0 END) AS mora_61_90,
      SUM(CASE WHEN tramo = '91_120'      THEN saldo ELSE 0 END) AS mora_91_120,
      SUM(CASE WHEN tramo = '120_PLUS'    THEN saldo ELSE 0 END) AS mora_120_plus,
      SUM(CASE WHEN tramo <> 'NO_VENCIDO' THEN saldo ELSE 0 END) AS mora_total,
      SUM(saldo) AS total
    FROM tbl_historico_aging_factura
    WHERE anio = p_anio AND mes = p_mes
    GROUP BY cliente_cod
  ),
  anterior AS (
    SELECT cliente_cod, SUM(CASE WHEN tramo <> 'NO_VENCIDO' THEN saldo ELSE 0 END) AS mora_total
    FROM tbl_historico_aging_factura
    WHERE anio = p_anio_ant AND mes = p_mes_ant
    GROUP BY cliente_cod
  )
  SELECT
    COALESCE(a.cliente_cod, an.cliente_cod),
    COALESCE(a.no_vencido, 0), COALESCE(a.mora_1_30, 0), COALESCE(a.mora_31_60, 0),
    COALESCE(a.mora_61_90, 0), COALESCE(a.mora_91_120, 0), COALESCE(a.mora_120_plus, 0),
    COALESCE(a.mora_total, 0), COALESCE(an.mora_total, 0), COALESCE(a.total, 0)
  FROM actual a
  FULL OUTER JOIN anterior an ON an.cliente_cod = a.cliente_cod;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_cierre_mensual_pedidos_retenidos()
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  v_hoy_cr date := (now() AT TIME ZONE 'America/Costa_Rica')::date;
BEGIN
  IF v_hoy_cr <> (date_trunc('month', v_hoy_cr) + interval '1 month - 1 day')::date THEN
    RETURN;
  END IF;

  INSERT INTO tbl_historico_pedidos_retenidos (
    id_pedido, codigo_cliente, fecha_pedido, total_mercaderia, moneda, nivel_precio,
    vendedor, comentario_vendedor, anio_mes, estado_sic, comentario_analista,
    motivo_retencion, resuelto_por, resuelto_en, created_at, updated_at
  )
  SELECT
    id_pedido, codigo_cliente, fecha_pedido, total_mercaderia, moneda, nivel_precio,
    vendedor, comentario_vendedor, anio_mes, estado_sic, comentario_analista,
    motivo_retencion, resuelto_por, resuelto_en, created_at, updated_at
  FROM tbl_pedidos_retenidos
  ON CONFLICT (id_pedido, anio_mes) DO NOTHING;

  TRUNCATE TABLE tbl_pedidos_retenidos;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_cierre_mensual_riesgo_vendedor(p_anio integer, p_mes integer)
  RETURNS TABLE(vendedor_cod text, no_vencido numeric, mora_1_30 numeric, mora_31_60 numeric, mora_61_90 numeric, mora_91_120 numeric, mora_120_plus numeric)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
  SELECT
    vendedor_cod,
    SUM(CASE WHEN tramo = 'NO_VENCIDO'  THEN saldo ELSE 0 END),
    SUM(CASE WHEN tramo = '1_30'        THEN saldo ELSE 0 END),
    SUM(CASE WHEN tramo = '31_60'       THEN saldo ELSE 0 END),
    SUM(CASE WHEN tramo = '61_90'       THEN saldo ELSE 0 END),
    SUM(CASE WHEN tramo = '91_120'      THEN saldo ELSE 0 END),
    SUM(CASE WHEN tramo = '120_PLUS'    THEN saldo ELSE 0 END)
  FROM tbl_historico_aging_factura
  WHERE anio = p_anio AND mes = p_mes AND vendedor_cod IS NOT NULL
  GROUP BY vendedor_cod;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_clientes_lista(p_q text DEFAULT NULL::text, p_analista text DEFAULT NULL::text, p_vendedor text DEFAULT NULL::text, p_plazo text DEFAULT NULL::text, p_nivel_precio text DEFAULT NULL::text, p_dimension text DEFAULT NULL::text, p_sort text DEFAULT 'mora_total'::text, p_dir text DEFAULT 'desc'::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25, p_hoy date DEFAULT CURRENT_DATE)
  RETURNS json
  LANGUAGE plpgsql
  STABLE
  SET search_path TO cof_prd_cyc_cofersa_sch_core, pg_temp
AS $fn$
DECLARE
  v_sync_id text;
  v_result  json;
BEGIN
  SELECT sync_id INTO v_sync_id FROM tbl_cartera ORDER BY updated_at DESC NULLS LAST LIMIT 1;

  WITH base_raw AS (
    SELECT c.cliente_cod, c.cliente_nombre, c.contribuyente, c.vendedor_nombre,
           COALESCE(c.no_vencido,0)    AS no_vencido,
           COALESCE(c.mora_1_30,0)     AS mora_1_30,
           COALESCE(c.mora_31_60,0)    AS mora_31_60,
           COALESCE(c.mora_61_90,0)    AS mora_61_90,
           COALESCE(c.mora_91_120,0)   AS mora_91_120,
           COALESCE(c.mora_120_plus,0) AS mora_120_plus,
           COALESCE(c.total,0)         AS total,
           c.fecha_corte
    FROM tbl_cartera c
    WHERE (v_sync_id IS NULL OR v_sync_id = '' OR c.sync_id = v_sync_id)
  ),
  base_dedup AS (
    SELECT DISTINCT ON (cliente_cod) *
    FROM base_raw
    ORDER BY cliente_cod, fecha_corte DESC NULLS LAST
  ),
  base AS (
    SELECT
      b.cliente_cod, b.cliente_nombre, b.contribuyente,
      COALESCE(NULLIF(b.vendedor_nombre, ''), '—') AS vendedor_nombre,
      b.no_vencido, b.mora_1_30, b.mora_31_60, b.mora_61_90, b.mora_91_120, b.mora_120_plus,
      b.total,
      (b.mora_1_30 + b.mora_31_60 + b.mora_61_90 + b.mora_91_120 + b.mora_120_plus) AS mora_total,
      COALESCE(m.analista_email, '') AS analista_email,
      COALESCE(NULLIF(u.nombre, ''), NULLIF(split_part(COALESCE(m.analista_email,''), '@', 1), ''), '—') AS analista_nombre,
      COALESCE(m.condicion_pago, '') AS condicion_pago,
      COALESCE(m.dimension, '')      AS dimension,
      COALESCE(m.agrupacion, '')     AS agrupacion,
      NULLIF(m.nivel_precio, '')     AS nivel_precio,
      icp.icp_score,
      icp.clasificacion AS icp_clasificacion,
      g.ultima_gestion_fecha,
      CASE WHEN g.ultima_gestion_fecha IS NULL THEN 999
           ELSE GREATEST(0, (p_hoy - g.ultima_gestion_fecha))::int
      END AS dias_sin_gestion
    FROM base_dedup b
    LEFT JOIN tbl_maestro_clientes m ON m.cliente_cod = b.cliente_cod
    LEFT JOIN tbl_usuarios u ON u.email = m.analista_email
    LEFT JOIN vw_icp_por_cliente icp ON icp.cliente_cod = b.cliente_cod
    LEFT JOIN LATERAL (
      SELECT MAX(gg.fecha) AS ultima_gestion_fecha
      FROM tbl_gestiones gg WHERE gg.cliente_cod = b.cliente_cod
    ) g ON true
  ),
  filtrado AS (
    SELECT * FROM base bb
    WHERE
      (p_q IS NULL OR p_q = '' OR
        bb.cliente_nombre ILIKE '%'||p_q||'%' OR
        bb.cliente_cod    ILIKE '%'||p_q||'%' OR
        bb.contribuyente  ILIKE '%'||p_q||'%' OR
        bb.agrupacion     ILIKE '%'||p_q||'%')
      AND (p_analista IS NULL OR p_analista = '' OR bb.analista_email = p_analista)
      AND (p_vendedor IS NULL OR p_vendedor = '' OR bb.vendedor_nombre = p_vendedor)
      AND (p_plazo IS NULL OR p_plazo = '' OR bb.condicion_pago = p_plazo)
      AND (p_nivel_precio IS NULL OR p_nivel_precio = '' OR bb.nivel_precio = p_nivel_precio)
      AND (p_dimension IS NULL OR p_dimension = '' OR bb.dimension = p_dimension)
  ),
  agg AS (
    SELECT COUNT(*) AS total_rows, COALESCE(SUM(total),0) AS kpi_cartera, COALESCE(SUM(mora_total),0) AS kpi_mora
    FROM filtrado
  ),
  pagina AS (
    SELECT * FROM filtrado
    ORDER BY
      CASE WHEN p_sort = 'cliente_nombre' AND p_dir = 'asc'  THEN cliente_nombre END ASC,
      CASE WHEN p_sort = 'cliente_nombre' AND p_dir = 'desc' THEN cliente_nombre END DESC,
      CASE WHEN p_sort = 'total' AND p_dir = 'asc'  THEN total END ASC,
      CASE WHEN p_sort = 'total' AND p_dir = 'desc' THEN total END DESC,
      CASE WHEN p_sort = 'dias_sin_gestion' AND p_dir = 'asc'  THEN dias_sin_gestion END ASC,
      CASE WHEN p_sort = 'dias_sin_gestion' AND p_dir = 'desc' THEN dias_sin_gestion END DESC,
      CASE WHEN p_sort NOT IN ('cliente_nombre','total','dias_sin_gestion') AND p_dir = 'asc'  THEN mora_total END ASC,
      CASE WHEN p_sort NOT IN ('cliente_nombre','total','dias_sin_gestion') AND p_dir = 'desc' THEN mora_total END DESC
    LIMIT p_page_size OFFSET GREATEST(0, COALESCE(p_page,1) - 1) * COALESCE(p_page_size, 0)
  ),
  vendedores AS (
    SELECT DISTINCT vendedor_nombre FROM base
    WHERE vendedor_nombre IS NOT NULL AND vendedor_nombre <> '—'
      AND (p_analista IS NULL OR p_analista = '' OR analista_email = p_analista)
    ORDER BY vendedor_nombre
  ),
  analistas AS (
    SELECT email, nombre FROM tbl_usuarios WHERE rol = 'ANALISTA' AND activo = true ORDER BY nombre
  ),
  plazos AS (
    SELECT DISTINCT condicion_pago FROM base
    WHERE condicion_pago IS NOT NULL AND condicion_pago <> ''
    ORDER BY condicion_pago
  ),
  niveles_precio AS (
    SELECT nivel_precio, COUNT(*) AS n FROM base
    WHERE nivel_precio IS NOT NULL AND nivel_precio <> ''
    GROUP BY nivel_precio
    ORDER BY n DESC, nivel_precio
  ),
  dimensiones AS (
    SELECT DISTINCT dimension FROM base
    WHERE dimension IS NOT NULL AND dimension <> ''
    ORDER BY dimension
  )
  SELECT json_build_object(
    'rows',           COALESCE((SELECT json_agg(row_to_json(pagina)) FROM pagina), '[]'::json),
    'total_rows',     (SELECT total_rows FROM agg),
    'kpi_cartera',    (SELECT kpi_cartera FROM agg),
    'kpi_mora',       (SELECT kpi_mora FROM agg),
    'vendedores',     COALESCE((SELECT json_agg(vendedor_nombre) FROM vendedores), '[]'::json),
    'analistas',      COALESCE((SELECT json_agg(json_build_object('email', email, 'nombre', nombre)) FROM analistas), '[]'::json),
    'plazos',         COALESCE((SELECT json_agg(condicion_pago) FROM plazos), '[]'::json),
    'niveles_precio', COALESCE((SELECT json_agg(nivel_precio) FROM niveles_precio), '[]'::json),
    'dimensiones',    COALESCE((SELECT json_agg(dimension) FROM dimensiones), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_cola_del_dia(p_email text, p_limit integer DEFAULT 20)
  RETURNS TABLE(cliente_cod text, cliente_nombre text, vendedor_nombre text, mora_total numeric, mora_1_30 numeric, mora_31_60 numeric, mora_61_90 numeric, mora_91_120 numeric, mora_120_plus numeric, cartera_total numeric, prioridad text, ultima_gestion_fecha date, dias_sin_gestion integer, tiene_promesa_hoy boolean, promesa_vencida boolean, proxima_accion text, proxima_accion_fecha date)
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
BEGIN
  RETURN QUERY
  WITH clientes_cte AS (
    SELECT DISTINCT mc.cliente_cod, mc.cliente_nombre, mc.vendedor_nombre, mc.contribuyente
    FROM tbl_maestro_clientes mc
    WHERE mc.analista_email = p_email
  ),
  cartera_cte AS (
    SELECT
      c.cliente_cod,
      c.mora_1_30, c.mora_31_60, c.mora_61_90, c.mora_91_120, c.mora_120_plus,
      c.total,
      (c.mora_1_30 + c.mora_31_60 + c.mora_61_90 + c.mora_91_120 + c.mora_120_plus) AS mora_calc
    FROM tbl_cartera c
    INNER JOIN clientes_cte cc ON cc.cliente_cod = c.cliente_cod AND cc.contribuyente = c.contribuyente
  ),
  ultima_gestion_cte AS (
    SELECT
      g.cliente_cod,
      MAX(g.fecha)                                                         AS ultima_fecha,
      (array_agg(g.proxima_accion      ORDER BY g.created_at DESC))[1]    AS ult_proxima_accion,
      (array_agg(g.proxima_accion_fecha ORDER BY g.created_at DESC))[1]   AS ult_proxima_fecha
    FROM tbl_gestiones g
    WHERE g.analista_email = p_email
      AND (g.activo IS NULL OR g.activo = true)
      AND (g.archived IS NULL OR g.archived = false)
      AND (g.legacy IS NULL OR g.legacy = false)
    GROUP BY g.cliente_cod
  ),
  promesas_cte AS (
    SELECT
      p.cliente_cod,
      BOOL_OR(p.fecha_promesa = CURRENT_DATE AND p.estado = 'PENDIENTE')   AS tiene_hoy,
      BOOL_OR(p.estado = 'INCUMPLIDA')                                      AS tiene_vencida
    FROM tbl_promesas p
    WHERE p.analista_email = p_email
      AND p.estado IN ('PENDIENTE', 'INCUMPLIDA')
      AND (p.activo IS NULL OR p.activo = true)
    GROUP BY p.cliente_cod
  )
  SELECT
    cl.cliente_cod,
    cl.cliente_nombre,
    cl.vendedor_nombre,
    COALESCE(ca.mora_calc, 0),
    COALESCE(ca.mora_1_30, 0),
    COALESCE(ca.mora_31_60, 0),
    COALESCE(ca.mora_61_90, 0),
    COALESCE(ca.mora_91_120, 0),
    COALESCE(ca.mora_120_plus, 0),
    COALESCE(ca.total, 0),
    CASE
      WHEN COALESCE(pr.tiene_vencida, false)                                             THEN 'ROJO'
      WHEN (COALESCE(ca.mora_61_90,0) + COALESCE(ca.mora_91_120,0) + COALESCE(ca.mora_120_plus,0)) > 0 THEN 'ROJO'
      WHEN COALESCE(ca.mora_31_60, 0) > 0                                                THEN 'AMBAR'
      ELSE 'VERDE'
    END,
    ug.ultima_fecha,
    COALESCE((CURRENT_DATE - ug.ultima_fecha), 999)::INT,
    COALESCE(pr.tiene_hoy, false),
    COALESCE(pr.tiene_vencida, false),
    ug.ult_proxima_accion,
    ug.ult_proxima_fecha
  FROM clientes_cte cl
  LEFT JOIN cartera_cte ca ON ca.cliente_cod = cl.cliente_cod
  LEFT JOIN ultima_gestion_cte ug ON ug.cliente_cod = cl.cliente_cod
  LEFT JOIN promesas_cte pr ON pr.cliente_cod = cl.cliente_cod
  WHERE COALESCE(ca.mora_calc, 0) > 0
  ORDER BY
    CASE WHEN COALESCE(pr.tiene_vencida, false) THEN 0 ELSE 1 END,
    CASE
      WHEN (COALESCE(ca.mora_61_90,0) + COALESCE(ca.mora_91_120,0) + COALESCE(ca.mora_120_plus,0)) > 0 THEN 0
      WHEN COALESCE(ca.mora_31_60, 0) > 0 THEN 1
      ELSE 2
    END,
    COALESCE(ca.mora_calc, 0) DESC
  LIMIT p_limit;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_conciliar_promesas()
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  v_hoy          date    := (now() AT TIME ZONE 'America/Costa_Rica')::date;
  v_ventana      int     := 5;
  v_cur_client   text    := NULL;
  v_pool         numeric := 0;
  v_asignado     numeric;
  v_estado       text;
  v_tipo_ev      text;
  v_desc         text;
  v_uid          uuid;
  v_monto_str    text;
  v_cumplidas    int := 0;
  v_abonos       int := 0;
  v_incumplidas  int := 0;
  v_notis        int := 0;
  rec            record;
BEGIN
  FOR rec IN
    SELECT
      p.id, p.cliente_cod, p.cliente_nombre, p.analista_email,
      p.monto, p.monto_abono_parcial, p.fecha_promesa, p.fecha_creacion,
      p.estado, p.validado_por,
      (
        (p.estado = 'PENDIENTE' AND p.fecha_promesa < v_hoy)
        OR (
          p.estado IN ('INCUMPLIDA', 'ABONO_PARCIAL')
          AND p.validado_por = 'sistema'
          AND p.fecha_promesa >= (v_hoy - v_ventana)
          AND p.fecha_promesa < v_hoy
        )
      ) AS es_objetivo
    FROM tbl_promesas p
    WHERE p.activo IS NOT FALSE
      AND p.cliente_cod IN (
        SELECT DISTINCT cliente_cod FROM tbl_promesas
        WHERE activo IS NOT FALSE
          AND (
            (estado = 'PENDIENTE' AND fecha_promesa < v_hoy)
            OR (
              estado IN ('INCUMPLIDA', 'ABONO_PARCIAL')
              AND validado_por = 'sistema'
              AND fecha_promesa >= (v_hoy - v_ventana)
              AND fecha_promesa < v_hoy
            )
          )
      )
    ORDER BY p.cliente_cod, p.fecha_promesa ASC, p.fecha_creacion ASC
  LOOP
    IF rec.cliente_cod IS DISTINCT FROM v_cur_client THEN
      v_cur_client := rec.cliente_cod;
      SELECT COALESCE(SUM(pg.monto_pago), 0)
        INTO v_pool
        FROM tbl_pagos pg
       WHERE pg.cliente_cod = rec.cliente_cod
         AND pg.fecha_pago >= (
             SELECT MIN(p4.fecha_creacion) FROM tbl_promesas p4
             WHERE p4.cliente_cod = rec.cliente_cod AND p4.activo IS NOT FALSE
         )
         AND pg.fecha_pago <= v_hoy
         AND NOT EXISTS (SELECT 1 FROM tbl_pagos_anulados pa WHERE pa.no_recibo = pg.no_recibo);
    END IF;

    IF NOT rec.es_objetivo THEN
      IF rec.estado = 'CUMPLIDA' THEN
        v_pool := v_pool - rec.monto;
      ELSIF rec.estado = 'ABONO_PARCIAL' AND rec.validado_por IS DISTINCT FROM 'sistema' THEN
        v_pool := v_pool - COALESCE(rec.monto_abono_parcial, 0);
      END IF;
      IF v_pool < 0 THEN v_pool := 0; END IF;
      CONTINUE;
    END IF;

    IF v_pool >= rec.monto THEN
      v_asignado := rec.monto;  v_pool := v_pool - rec.monto;
      v_estado := 'CUMPLIDA';   v_tipo_ev := 'cumplida';
    ELSIF v_pool > 0 THEN
      v_asignado := v_pool;     v_pool := 0;
      v_estado := 'ABONO_PARCIAL'; v_tipo_ev := 'abono';
    ELSE
      v_asignado := 0;
      v_estado := 'INCUMPLIDA'; v_tipo_ev := 'incumplida';
    END IF;

    IF rec.estado = v_estado THEN
      CONTINUE;
    END IF;

    v_monto_str := '₡' || replace(to_char(round(v_asignado), 'FM999,999,999,990'), ',', '.');

    IF v_estado = 'CUMPLIDA' THEN
      v_desc := 'Conciliación automática: ' || v_monto_str || ' en pagos desde la promesa';
    ELSIF v_estado = 'ABONO_PARCIAL' THEN
      v_desc := 'Conciliación automática: abono de ' || v_monto_str || ' detectado (menor al monto prometido)';
    ELSE
      v_desc := 'Conciliación automática: sin pagos detectados desde la promesa';
    END IF;

    UPDATE tbl_promesas SET
      estado                = v_estado,
      fecha_validacion      = v_hoy,
      validado_por          = 'sistema',
      comentario_validacion = v_desc,
      monto_abono_parcial   = CASE WHEN v_estado = 'ABONO_PARCIAL' THEN v_asignado ELSE monto_abono_parcial END,
      eventos               = COALESCE(eventos, '[]'::jsonb) || jsonb_build_object(
                                'fecha', v_hoy::text, 'tipo', v_tipo_ev,
                                'descripcion', v_desc, 'por', 'sistema'),
      updated_at            = now()
    WHERE id = rec.id;

    IF    v_estado = 'CUMPLIDA'      THEN v_cumplidas   := v_cumplidas + 1;
    ELSIF v_estado = 'ABONO_PARCIAL' THEN v_abonos      := v_abonos + 1;
    ELSE                                  v_incumplidas := v_incumplidas + 1;
    END IF;

    SELECT id INTO v_uid FROM tbl_usuarios WHERE lower(email) = lower(rec.analista_email) LIMIT 1;
    IF v_uid IS NOT NULL THEN
      INSERT INTO tbl_notificaciones (usuario_id, tipo, titulo, mensaje, link, leida)
      VALUES (v_uid, 'ALERTA',
        CASE v_estado
          WHEN 'CUMPLIDA'      THEN 'Promesa cumplida automáticamente — ' || COALESCE(rec.cliente_nombre, rec.cliente_cod)
          WHEN 'ABONO_PARCIAL' THEN 'Abono parcial detectado — '          || COALESCE(rec.cliente_nombre, rec.cliente_cod)
          ELSE                      'Promesa incumplida — '                || COALESCE(rec.cliente_nombre, rec.cliente_cod)
        END,
        v_desc, '/clientes/' || rec.cliente_cod, false);
      v_notis := v_notis + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('fecha', v_hoy, 'cumplidas', v_cumplidas,
    'abonos', v_abonos, 'incumplidas', v_incumplidas, 'notificaciones', v_notis);
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_contar_garantias_en_carpeta(p_mueble text, p_gaveta text, p_carpeta integer, p_excluir_id integer DEFAULT NULL::integer)
  RETURNS integer
  LANGUAGE sql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
  SELECT COUNT(*)::integer
  FROM tbl_garantias
  WHERE ubicacion_archivero_mueble = p_mueble
    AND ubicacion_archivero_gaveta = p_gaveta
    AND ubicacion_archivero_carpeta = p_carpeta
    AND estado_custodia = 'EN_BOVEDA'
    AND activo = true
    AND (p_excluir_id IS NULL OR id != p_excluir_id);
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_cron_cierre_mensual()
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE v_hoy date := (now() AT TIME ZONE 'America/Costa_Rica')::date;
BEGIN
  IF EXTRACT(MONTH FROM v_hoy) <> EXTRACT(MONTH FROM (v_hoy + 1)) THEN
    PERFORM cof_prd_cyc_cofersa_sch_core.fn_snapshot_cierre_completo(
      EXTRACT(YEAR FROM v_hoy)::int, EXTRACT(MONTH FROM v_hoy)::int,
      false, 'cron_cierre_mensual');
  END IF;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_dashboard_analista_kpis(p_email text)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  v_hoy_cr              DATE;
  v_anio                INT;
  v_mes                 INT;
  v_total_clientes      INT;
  v_cartera_total       NUMERIC;
  v_mora_total          NUMERIC;
  v_no_vencido          NUMERIC;
  v_mora_1_30           NUMERIC;
  v_mora_31_60          NUMERIC;
  v_mora_61_90          NUMERIC;
  v_mora_91_120         NUMERIC;
  v_mora_120_plus       NUMERIC;
  v_gestiones_hoy       INT;
  v_promesas_activas    INT;
  v_promesas_vencen_hoy INT;
  v_clientes_urgentes   INT;
  v_meta_individual     NUMERIC;
  v_cobrado_mes         NUMERIC;
  v_meta_pct            NUMERIC;
BEGIN
  v_hoy_cr := (NOW() AT TIME ZONE 'America/Costa_Rica')::DATE;
  v_anio   := EXTRACT(YEAR  FROM v_hoy_cr)::INT;
  v_mes    := EXTRACT(MONTH FROM v_hoy_cr)::INT;

  SELECT
    COUNT(DISTINCT c.cliente_cod),
    COALESCE(SUM(c.total), 0),
    COALESCE(SUM(c.mora_1_30 + c.mora_31_60 + c.mora_61_90 + c.mora_91_120 + c.mora_120_plus), 0),
    COALESCE(SUM(c.no_vencido), 0),
    COALESCE(SUM(c.mora_1_30), 0),
    COALESCE(SUM(c.mora_31_60), 0),
    COALESCE(SUM(c.mora_61_90), 0),
    COALESCE(SUM(c.mora_91_120), 0),
    COALESCE(SUM(c.mora_120_plus), 0)
  INTO
    v_total_clientes,
    v_cartera_total, v_mora_total, v_no_vencido,
    v_mora_1_30, v_mora_31_60, v_mora_61_90, v_mora_91_120, v_mora_120_plus
  FROM tbl_cartera c
  INNER JOIN tbl_maestro_clientes mc
    ON mc.cliente_cod = c.cliente_cod AND mc.contribuyente = c.contribuyente
  WHERE mc.analista_email = p_email;

  SELECT COUNT(*) INTO v_gestiones_hoy
  FROM tbl_gestiones
  WHERE analista_email = p_email
    AND fecha = v_hoy_cr
    AND (activo   IS NULL OR activo   = true)
    AND (archived IS NULL OR archived = false)
    AND (legacy   IS NULL OR legacy   = false);

  SELECT COUNT(*) INTO v_promesas_activas
  FROM tbl_promesas
  WHERE analista_email = p_email
    AND estado = 'PENDIENTE'
    AND (activo IS NULL OR activo = true);

  SELECT COUNT(*) INTO v_promesas_vencen_hoy
  FROM tbl_promesas
  WHERE analista_email = p_email
    AND estado = 'PENDIENTE'
    AND fecha_promesa = v_hoy_cr
    AND (activo IS NULL OR activo = true);

  SELECT COUNT(DISTINCT c.cliente_cod) INTO v_clientes_urgentes
  FROM tbl_cartera c
  INNER JOIN tbl_maestro_clientes mc
    ON mc.cliente_cod = c.cliente_cod AND mc.contribuyente = c.contribuyente
  WHERE mc.analista_email = p_email
    AND (c.mora_61_90 + c.mora_91_120 + c.mora_120_plus) > 0;

  SELECT COALESCE(SUM(pm.meta_ajustada), 0) INTO v_meta_individual
  FROM tbl_vendedores v
  JOIN tbl_presupuesto_meta_vendedor pm
    ON pm.vendedor_cod = v.cod AND pm.anio = v_anio AND pm.mes = v_mes
  WHERE lower(v.analista_email) = lower(p_email)
    AND v.activo = true;

  -- Cobrado real del mes: suma de pagos cuyos clientes pertenecen al analista
  SELECT COALESCE(SUM(p.monto_pago), 0) INTO v_cobrado_mes
  FROM tbl_pagos p
  JOIN (
    SELECT DISTINCT ON (cliente_cod) cliente_cod, analista_email
    FROM tbl_maestro_clientes
    ORDER BY cliente_cod, id DESC
  ) mc ON mc.cliente_cod = p.cliente_cod
  WHERE mc.analista_email = p_email
    AND date_trunc('month', p.fecha_pago) = date_trunc('month', v_hoy_cr)
    AND NOT EXISTS (SELECT 1 FROM tbl_pagos_anulados pa WHERE pa.no_recibo = p.no_recibo);

  v_meta_pct := CASE
    WHEN v_meta_individual > 0
    THEN ROUND((v_cobrado_mes / v_meta_individual) * 100, 1)
    ELSE 0
  END;

  RETURN jsonb_build_object(
    'total_clientes',       v_total_clientes,
    'cartera_total',        v_cartera_total,
    'mora_total',           v_mora_total,
    'no_vencido',           v_no_vencido,
    'mora_1_30',            v_mora_1_30,
    'mora_31_60',           v_mora_31_60,
    'mora_61_90',           v_mora_61_90,
    'mora_91_120',          v_mora_91_120,
    'mora_120_plus',        v_mora_120_plus,
    'pct_mora',             CASE WHEN v_cartera_total > 0
                              THEN ROUND((v_mora_total / v_cartera_total) * 100, 1)
                              ELSE 0 END,
    'gestiones_hoy',        v_gestiones_hoy,
    'promesas_activas',     v_promesas_activas,
    'promesas_vencen_hoy',  v_promesas_vencen_hoy,
    'clientes_urgentes',    v_clientes_urgentes,
    'meta_individual',      v_meta_individual,
    'cobrado_mes_estimado', v_cobrado_mes,
    'meta_pct',             v_meta_pct
  );
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_dashboard_vendedores_analista(p_email text)
  RETURNS TABLE(vendedor_nombre text, vendedor_cod text, cartera_total numeric, no_vencido numeric, mora_total numeric, pct_mora numeric, mora_tramo_1_30 numeric, mora_tramo_31_60 numeric, mora_tramo_61_90 numeric, mora_tramo_91_120 numeric, mora_tramo_120_plus numeric)
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
BEGIN
  RETURN QUERY
  SELECT
    mc.vendedor_nombre, mc.vendedor_cod,
    COALESCE(SUM(c.total), 0)                                                                          AS cartera_total,
    COALESCE(SUM(c.no_vencido), 0)                                                                     AS no_vencido,
    COALESCE(SUM(c.mora_1_30 + c.mora_31_60 + c.mora_61_90 + c.mora_91_120 + c.mora_120_plus), 0)      AS mora_total,
    CASE WHEN COALESCE(SUM(c.total),0) > 0
      THEN ROUND(COALESCE(SUM(c.mora_1_30 + c.mora_31_60 + c.mora_61_90 + c.mora_91_120 + c.mora_120_plus),0) / SUM(c.total) * 100, 1)
      ELSE 0 END                                                                                       AS pct_mora,
    COALESCE(SUM(c.mora_1_30), 0)    AS mora_tramo_1_30,
    COALESCE(SUM(c.mora_31_60), 0)   AS mora_tramo_31_60,
    COALESCE(SUM(c.mora_61_90), 0)   AS mora_tramo_61_90,
    COALESCE(SUM(c.mora_91_120), 0)  AS mora_tramo_91_120,
    COALESCE(SUM(c.mora_120_plus), 0) AS mora_tramo_120_plus
  FROM tbl_maestro_clientes mc
  LEFT JOIN tbl_cartera c ON c.cliente_cod = mc.cliente_cod AND c.contribuyente = mc.contribuyente
  WHERE mc.analista_email = p_email
    AND mc.vendedor_nombre IS NOT NULL AND mc.vendedor_nombre <> ''
  GROUP BY mc.vendedor_nombre, mc.vendedor_cod
  ORDER BY mora_total DESC NULLS LAST;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_es_usuario_activo()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM cof_prd_cyc_cofersa_sch_core.tbl_usuarios u
    JOIN cof_prd_cyc_cofersa_sch_core.tbl_app_users au ON lower(u.email) = lower(au.email)
    WHERE au.id = cof_prd_cyc_cofersa_sch_core.fn_auth_uid() AND u.activo = true
  );
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_estados_cuenta(p_email text DEFAULT NULL::text)
  RETURNS json
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE v_sync text; v_result json;
BEGIN
  SELECT sync_id INTO v_sync FROM tbl_cartera ORDER BY updated_at DESC LIMIT 1;

  WITH dom AS (   -- por contribuyente: código dominante (más cartera) → nombre, analista, código representativo
    SELECT DISTINCT ON (m.contribuyente)
      m.contribuyente, m.cliente_cod AS rep_cod, m.cliente_nombre,
      m.analista_email,
      -- nombre del analista derivado de usuarios por email (evita nombre desactualizado tras cambios de vendedor)
      COALESCE(NULLIF(u.nombre,''), NULLIF(m.analista_nombre,''),'Sin analista') AS analista_nombre
    FROM tbl_maestro_clientes m
    LEFT JOIN tbl_cartera ca ON ca.cliente_cod=m.cliente_cod AND ca.contribuyente=m.contribuyente AND ca.sync_id=v_sync
    LEFT JOIN tbl_usuarios u ON lower(u.email)=lower(m.analista_email)
    ORDER BY m.contribuyente, COALESCE(ca.total,0) DESC, m.id DESC
  ),
  agg AS (
    SELECT contribuyente, COUNT(DISTINCT cliente_cod)::int AS n_codigos, MAX(NULLIF(correo,'')) AS correo
    FROM tbl_maestro_clientes GROUP BY contribuyente
  ),
  saldo AS (
    SELECT contribuyente, SUM(total) AS saldo FROM tbl_cartera WHERE sync_id=v_sync GROUP BY contribuyente
  ),
  env AS (
    SELECT contribuyente, MAX(fecha) AS ultimo FROM tbl_gestiones
    WHERE tipo ILIKE 'correo' AND nota ILIKE 'Estado de cuenta%' GROUP BY contribuyente
  )
  SELECT COALESCE(json_agg(json_build_object(
      'contribuyente', d.contribuyente, 'cliente_nombre', d.cliente_nombre, 'rep_cod', d.rep_cod,
      'n_codigos', a.n_codigos, 'correo', COALESCE(a.correo,''),
      'analista_email', d.analista_email, 'analista_nombre', d.analista_nombre,
      'saldo', ROUND(COALESCE(s.saldo,0)), 'ultimo_envio', e.ultimo
    ) ORDER BY COALESCE(s.saldo,0) DESC), '[]'::json)
  INTO v_result
  FROM dom d
  JOIN agg a ON a.contribuyente=d.contribuyente
  LEFT JOIN saldo s ON s.contribuyente=d.contribuyente
  LEFT JOIN env e ON e.contribuyente=d.contribuyente
  WHERE (p_email IS NULL OR EXISTS (SELECT 1 FROM tbl_maestro_clientes m2 WHERE m2.contribuyente=d.contribuyente AND m2.analista_email=p_email));

  RETURN v_result;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_expirar_solicitudes_actualizacion()
  RETURNS void
  LANGUAGE sql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
  update tbl_solicitudes_actualizacion
  set estado = 'EXPIRADA', updated_at = now()
  where estado in ('ENVIADA','DATOS_RECIBIDOS')
    and token_expira_en < now();
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_garantias_clientes_sin_garantia(p_email text DEFAULT NULL::text)
  RETURNS TABLE(contribuyente text, cliente_nombre text, saldo_consolidado numeric, n_codigos bigint, vendedor_cod text, vendedor_nombre text, analista_email text, riesgo text)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
  with sync_vigente as (
    select sync_id from tbl_cartera order by updated_at desc nulls last limit 1
  ),
  cartera_dedup as (
    select distinct on (cliente_cod) cliente_cod, contribuyente, total,
      mora_31_60, mora_61_90, mora_91_120, mora_120_plus
    from tbl_cartera
    where sync_id = (select sync_id from sync_vigente) or (select sync_id from sync_vigente) is null
    order by cliente_cod, fecha_corte desc nulls last
  ),
  saldo as (
    select
      contribuyente,
      sum(total) as saldo,
      count(distinct cliente_cod) as n_codigos,
      sum(coalesce(mora_31_60, 0))                                                         as mora_31_60,
      sum(coalesce(mora_61_90, 0) + greatest(coalesce(mora_91_120, 0), 0) + coalesce(mora_120_plus, 0)) as mora_severa
    from cartera_dedup
    group by contribuyente
    having sum(total) > 0
  ),
  -- Un representante por contribuyente (razón social + responsables) -- el
  -- mismo criterio de mayor saldo que ya usa fn_resolver_responsables_contribuyente,
  -- para que "el vendedor/analista de este contribuyente" coincida en toda la app.
  resp as (
    select distinct on (mc.contribuyente)
      mc.contribuyente, mc.cliente_nombre, mc.vendedor_cod, mc.analista_email
    from tbl_maestro_clientes mc
    left join cartera_dedup cd on cd.cliente_cod = mc.cliente_cod
    order by mc.contribuyente, coalesce(cd.total, 0) desc
  )
  select
    s.contribuyente, r.cliente_nombre, s.saldo, s.n_codigos,
    r.vendedor_cod, coalesce(v.nombre, r.vendedor_cod, '—') as vendedor_nombre, coalesce(r.analista_email, '') as analista_email,
    case
      when s.mora_severa > 0 then 'ROJO'
      when s.mora_31_60 > 0 then 'AMBAR'
      else 'VERDE'
    end as riesgo
  from saldo s
  join resp r on r.contribuyente = s.contribuyente
  left join tbl_vendedores v on v.cod = r.vendedor_cod
  where not exists (
    select 1 from tbl_garantias g where g.contribuyente = s.contribuyente and g.activo = true
  )
  and (p_email is null or r.analista_email = p_email)
  order by s.saldo desc;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_garantias_lista(p_email text DEFAULT NULL::text)
  RETURNS TABLE(id bigint, contribuyente text, cliente_nombre text, tipo_titulo text, monto_garantizado numeric, tiene_fiador boolean, fiador_nombre text, fiador_cedula text, fiador_telefono text, representante_legal text, fecha_emision date, fecha_vencimiento date, ubicacion_archivero text, estado_custodia text, documento_pdf_url text, analista_email text, vendedor_cod text, saldo_contribuyente numeric, monto_objetivo numeric, cobertura_pct numeric, semaforo text, vencido boolean, documento_pagare_generado_en timestamp with time zone, consecutivo text, origen_registro text, ubicacion_archivero_mueble text, ubicacion_archivero_gaveta text, ubicacion_archivero_carpeta integer)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
  with hoy_cr as (
    select (now() at time zone 'America/Costa_Rica')::date as d
  ),
  saldo as (
    select c.contribuyente, sum(c.total) as saldo_total
    from tbl_cartera c
    group by c.contribuyente
  ),
  holgura as (
    select coalesce((select valor::numeric from tbl_config_sistema where clave = 'HOLGURA_GARANTIA_PCT'), 0) as pct
  )
  select
    g.id, g.contribuyente, g.cliente_nombre, g.tipo_titulo, g.monto_garantizado,
    g.tiene_fiador, g.fiador_nombre, g.fiador_cedula, g.fiador_telefono, g.representante_legal,
    g.fecha_emision, g.fecha_vencimiento, g.ubicacion_archivero, g.estado_custodia,
    g.documento_pdf_url, g.analista_email, g.vendedor_cod,
    coalesce(s.saldo_total, 0) as saldo_contribuyente,
    coalesce(s.saldo_total, 0) * (1 + (select pct from holgura) / 100) as monto_objetivo,
    case when coalesce(s.saldo_total, 0) = 0 then 100
         else round(g.monto_garantizado / s.saldo_total * 100, 1)
    end as cobertura_pct,
    case
      when g.monto_garantizado < coalesce(s.saldo_total, 0) then 'ROJO'
      when g.monto_garantizado < coalesce(s.saldo_total, 0) * (1 + (select pct from holgura) / 100) then 'AMBAR'
      else 'VERDE'
    end as semaforo,
    (g.fecha_vencimiento < (select d from hoy_cr)) as vencido,
    g.documento_pagare_generado_en,
    g.consecutivo,
    g.origen_registro,
    g.ubicacion_archivero_mueble, g.ubicacion_archivero_gaveta, g.ubicacion_archivero_carpeta
  from tbl_garantias g
  left join saldo s on s.contribuyente = g.contribuyente
  where g.activo = true
    and (p_email is null or g.analista_email = p_email)
  order by
    case when g.fecha_vencimiento < (select d from hoy_cr) then 0 else 1 end,
    g.fecha_vencimiento asc;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_matching_saldos_favor(p_cliente_cod text DEFAULT NULL::text)
  RETURNS TABLE(cliente_cod text, cliente_nombre text, tipo_match text, saldo_id_1 uuid, saldo_doc_1 text, saldo_tipo_1 text, saldo_monto_1 numeric, saldo_id_2 uuid, saldo_doc_2 text, saldo_monto_2 numeric, factura_doc_1 text, factura_saldo_1 numeric, factura_vence_1 date, factura_doc_2 text, factura_saldo_2 numeric, factura_vence_2 date, monto_match numeric, descripcion text)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
#variable_conflict use_column
DECLARE
  v_famap jsonb;
  rec record;
  v_cod text; v_nombre text; v_faj jsonb;
  s_id uuid[]; s_doc text[]; s_tipo text[]; s_monto numeric[]; s_used boolean[];
  f_doc text[]; f_saldo numeric[]; f_vence date[]; f_bc boolean[]; f_used boolean[];
  n_s int; n_f int; i int; i2 int; j int; k int; found boolean;
BEGIN
  -- Mapa de facturas por cliente (un solo scan; bc = 20 más antiguas si >50)
  SELECT COALESCE(jsonb_object_agg(cliente_cod, arr), '{}'::jsonb) INTO v_famap
  FROM (
    SELECT cliente_cod,
      jsonb_agg(jsonb_build_object('doc',documento,'saldo',saldo,'vence',vence,'bc',bc) ORDER BY documento) AS arr
    FROM (
      SELECT fa.cliente_cod, fa.documento, fa.saldo,
        NULLIF(fa.fecha_vencimiento,'')::date AS vence,
        (count(*) OVER (PARTITION BY fa.cliente_cod) <= 50
         OR row_number() OVER (PARTITION BY fa.cliente_cod ORDER BY NULLIF(fa.fecha_vencimiento,'')::date ASC NULLS LAST) <= 20) AS bc
      FROM tbl_facturas fa
      WHERE fa.saldo > 0 AND (p_cliente_cod IS NULL OR fa.cliente_cod = p_cliente_cod)
    ) f GROUP BY cliente_cod
  ) z;

  FOR rec IN
    SELECT sf.cliente_cod AS cod, max(sf.cliente_nombre) AS nombre,
      jsonb_agg(jsonb_build_object('id',sf.id,'doc',sf.documento,'tipo',sf.tipo_documento,'monto',sf.monto) ORDER BY sf.documento) AS arr
    FROM tbl_saldos_favor sf
    WHERE sf.estado_manual='pendiente' AND sf.monto > 0 AND (p_cliente_cod IS NULL OR sf.cliente_cod = p_cliente_cod)
    GROUP BY sf.cliente_cod
  LOOP
    v_cod := rec.cod; v_nombre := rec.nombre;
    v_faj := v_famap -> v_cod;
    IF v_faj IS NULL OR jsonb_array_length(v_faj) = 0 THEN CONTINUE; END IF;

    SELECT array_agg((e.val->>'id')::uuid ORDER BY e.ord), array_agg(e.val->>'doc' ORDER BY e.ord),
           array_agg(e.val->>'tipo' ORDER BY e.ord), array_agg((e.val->>'monto')::numeric ORDER BY e.ord)
      INTO s_id, s_doc, s_tipo, s_monto
      FROM jsonb_array_elements(rec.arr) WITH ORDINALITY AS e(val, ord);

    SELECT array_agg(e.val->>'doc' ORDER BY e.ord), array_agg((e.val->>'saldo')::numeric ORDER BY e.ord),
           array_agg(NULLIF(e.val->>'vence','')::date ORDER BY e.ord), array_agg((e.val->>'bc')::boolean ORDER BY e.ord)
      INTO f_doc, f_saldo, f_vence, f_bc
      FROM jsonb_array_elements(v_faj) WITH ORDINALITY AS e(val, ord);

    n_s := array_length(s_id, 1); n_f := array_length(f_doc, 1);
    s_used := array_fill(false, ARRAY[n_s]);
    f_used := array_fill(false, ARRAY[n_f]);

    -- TIPO A — 1 saldo vs 1 factura
    FOR i IN 1..n_s LOOP
      IF s_used[i] THEN CONTINUE; END IF;
      FOR j IN 1..n_f LOOP
        IF NOT f_used[j] AND abs(s_monto[i] - f_saldo[j]) < 1 THEN
          s_used[i]:=true; f_used[j]:=true;
          cliente_cod:=v_cod; cliente_nombre:=v_nombre; tipo_match:='A';
          saldo_id_1:=s_id[i]; saldo_doc_1:=s_doc[i]; saldo_tipo_1:=s_tipo[i]; saldo_monto_1:=s_monto[i];
          saldo_id_2:=NULL; saldo_doc_2:=NULL; saldo_monto_2:=NULL;
          factura_doc_1:=f_doc[j]; factura_saldo_1:=f_saldo[j]; factura_vence_1:=f_vence[j];
          factura_doc_2:=NULL; factura_saldo_2:=NULL; factura_vence_2:=NULL;
          monto_match:=s_monto[i];
          descripcion:='Documento '||s_doc[i]||' ('||s_tipo[i]||' ₡'||to_char(s_monto[i],'FM999999990.00')||') aplica exactamente contra factura '||f_doc[j];
          RETURN NEXT; EXIT;
        END IF;
      END LOOP;
    END LOOP;

    -- TIPO B — 1 saldo vs 2 facturas (bc)
    FOR i IN 1..n_s LOOP
      IF s_used[i] THEN CONTINUE; END IF;
      found := false;
      FOR j IN 1..n_f LOOP
        IF f_used[j] OR NOT f_bc[j] THEN CONTINUE; END IF;
        FOR k IN j+1..n_f LOOP
          IF f_used[k] OR NOT f_bc[k] THEN CONTINUE; END IF;
          IF abs(s_monto[i] - (f_saldo[j] + f_saldo[k])) < 1 THEN
            s_used[i]:=true; f_used[j]:=true; f_used[k]:=true;
            cliente_cod:=v_cod; cliente_nombre:=v_nombre; tipo_match:='B';
            saldo_id_1:=s_id[i]; saldo_doc_1:=s_doc[i]; saldo_tipo_1:=s_tipo[i]; saldo_monto_1:=s_monto[i];
            saldo_id_2:=NULL; saldo_doc_2:=NULL; saldo_monto_2:=NULL;
            factura_doc_1:=f_doc[j]; factura_saldo_1:=f_saldo[j]; factura_vence_1:=f_vence[j];
            factura_doc_2:=f_doc[k]; factura_saldo_2:=f_saldo[k]; factura_vence_2:=f_vence[k];
            monto_match:=s_monto[i];
            descripcion:='Documento '||s_doc[i]||' ('||s_tipo[i]||' ₡'||to_char(s_monto[i],'FM999999990.00')||') aplica contra facturas '||f_doc[j]||' + '||f_doc[k];
            RETURN NEXT; found:=true; EXIT;
          END IF;
        END LOOP;
        IF found THEN EXIT; END IF;
      END LOOP;
    END LOOP;

    -- TIPO C — 2 saldos vs 1 factura (bc)
    FOR i IN 1..n_s LOOP
      IF s_used[i] THEN CONTINUE; END IF;
      found := false;
      FOR i2 IN i+1..n_s LOOP
        IF s_used[i2] THEN CONTINUE; END IF;
        FOR j IN 1..n_f LOOP
          IF f_used[j] OR NOT f_bc[j] THEN CONTINUE; END IF;
          IF abs((s_monto[i] + s_monto[i2]) - f_saldo[j]) < 1 THEN
            s_used[i]:=true; s_used[i2]:=true; f_used[j]:=true;
            cliente_cod:=v_cod; cliente_nombre:=v_nombre; tipo_match:='C';
            saldo_id_1:=s_id[i]; saldo_doc_1:=s_doc[i]; saldo_tipo_1:=s_tipo[i]; saldo_monto_1:=s_monto[i];
            saldo_id_2:=s_id[i2]; saldo_doc_2:=s_doc[i2]; saldo_monto_2:=s_monto[i2];
            factura_doc_1:=f_doc[j]; factura_saldo_1:=f_saldo[j]; factura_vence_1:=f_vence[j];
            factura_doc_2:=NULL; factura_saldo_2:=NULL; factura_vence_2:=NULL;
            monto_match:=s_monto[i] + s_monto[i2];
            descripcion:=s_tipo[i]||' '||s_doc[i]||' + '||s_tipo[i2]||' '||s_doc[i2]||' suman ₡'||to_char(s_monto[i]+s_monto[i2],'FM999999990.00')||' — coincide con saldo de factura '||f_doc[j];
            RETURN NEXT; found:=true; EXIT;
          END IF;
        END LOOP;
        IF found THEN EXIT; END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_meta_analista_mes(p_email text, p_anio integer DEFAULT NULL::integer, p_mes integer DEFAULT NULL::integer)
  RETURNS numeric
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
  SELECT COALESCE(SUM(pm.meta_ajustada), 0)
  FROM tbl_vendedores v
  JOIN tbl_presupuesto_meta_vendedor pm
    ON  pm.vendedor_cod = v.cod
    AND pm.anio = COALESCE(p_anio, EXTRACT(YEAR  FROM (NOW() AT TIME ZONE 'America/Costa_Rica'))::INT)
    AND pm.mes  = COALESCE(p_mes,  EXTRACT(MONTH FROM (NOW() AT TIME ZONE 'America/Costa_Rica'))::INT)
  WHERE lower(v.analista_email) = lower(p_email)
    AND v.activo = true;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_normalizar_analista_nombre()
  RETURNS trigger
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE v_nombre text;
BEGIN
  IF NULLIF(trim(NEW.analista_email),'') IS NOT NULL THEN
    SELECT u.nombre INTO v_nombre FROM tbl_usuarios u WHERE lower(u.email) = lower(NEW.analista_email);
    IF v_nombre IS NOT NULL THEN NEW.analista_nombre := v_nombre; END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_notificar_pedido_en_regla()
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  v_activa      text;
  v_hoy_cr      date := (now() AT TIME ZONE 'America/Costa_Rica')::date;
  v_latest_sync text;
  rec           RECORD;
  v_uid         uuid;
BEGIN
  SELECT valor INTO v_activa
  FROM tbl_config_sistema WHERE clave = 'automatizacion_pedido_en_regla_activa';
  IF COALESCE(v_activa, 'true') = 'false' THEN
    RETURN;
  END IF;

  SELECT sync_id INTO v_latest_sync FROM tbl_cartera ORDER BY updated_at DESC LIMIT 1;

  FOR rec IN
    SELECT
      p.id_pedido, p.codigo_cliente, p.estado_sic, p.motivo_retencion,
      COALESCE(NULLIF(mc.cliente_nombre,''), 'Cliente ' || p.codigo_cliente) AS cliente_nombre,
      NULLIF(mc.analista_email,'') AS analista_email
    FROM tbl_pedidos_retenidos p
    LEFT JOIN tbl_maestro_clientes mc ON mc.cliente_cod = p.codigo_cliente
    JOIN tbl_cartera c ON c.cliente_cod = p.codigo_cliente AND c.sync_id = v_latest_sync
    WHERE p.estado_sic IN ('Pendiente', 'Retenido')
      AND COALESCE(c.mora_31_60,0) + COALESCE(c.mora_61_90,0)
        + COALESCE(c.mora_91_120,0) + COALESCE(c.mora_120_plus,0) = 0
  LOOP
    v_uid := NULL;
    IF rec.analista_email IS NOT NULL THEN
      SELECT u.id INTO v_uid
      FROM tbl_usuarios u
      WHERE lower(u.email) = lower(rec.analista_email) AND COALESCE(u.activo, true) = true
      LIMIT 1;
    END IF;

    IF v_uid IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM tbl_notificaciones
        WHERE usuario_id = v_uid AND tipo = 'ALERTA'
          AND link = '/gestion-cartera/pedidos-retenidos?pedido=' || rec.id_pedido
          AND (created_at AT TIME ZONE 'America/Costa_Rica')::date = v_hoy_cr
      ) THEN
        INSERT INTO tbl_notificaciones (usuario_id, tipo, titulo, mensaje, leida, link)
        VALUES (
          v_uid, 'ALERTA',
          'Cliente en regla — ' || rec.cliente_nombre,
          'El pedido ' || rec.id_pedido || ' '
            || CASE WHEN rec.estado_sic = 'Retenido'
                 THEN 'está Retenido -- motivo: «' || COALESCE(rec.motivo_retencion, 'sin motivo registrado') || '»'
                 ELSE 'sigue Pendiente de decisión'
               END
            || '. La cartera de ' || rec.cliente_nombre
            || ' ya no tiene facturas vencidas a más de 30 días. Revisá si ya aplica aprobarlo en Softland.',
          false, '/gestion-cartera/pedidos-retenidos?pedido=' || rec.id_pedido
        );
      END IF;
    ELSE
      -- Sin analista asignado al cliente: avisar a coordinación
      INSERT INTO tbl_notificaciones (usuario_id, tipo, titulo, mensaje, leida, link)
      SELECT
        u.id, 'ALERTA',
        'Cliente en regla — ' || rec.cliente_nombre,
        'El pedido ' || rec.id_pedido || ' (' || rec.estado_sic || ') no tiene analista asignado.'
          || ' La cartera de ' || rec.cliente_nombre
          || ' ya no tiene facturas vencidas a más de 30 días. Revisá si ya aplica aprobarlo en Softland.',
        false, '/gestion-cartera/pedidos-retenidos?pedido=' || rec.id_pedido
      FROM tbl_usuarios u
      WHERE u.rol = 'COORDINADOR' AND COALESCE(u.activo, true) = true
        AND NOT EXISTS (
          SELECT 1 FROM tbl_notificaciones n
          WHERE n.usuario_id = u.id AND n.tipo = 'ALERTA'
            AND n.link = '/gestion-cartera/pedidos-retenidos?pedido=' || rec.id_pedido
            AND (n.created_at AT TIME ZONE 'America/Costa_Rica')::date = v_hoy_cr
        );
    END IF;
  END LOOP;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_notificar_pedido_retenido()
  RETURNS trigger
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  v_analista_email text;
  v_cliente_nombre text;
  v_usuario_id     uuid;
BEGIN
  SELECT analista_email, cliente_nombre INTO v_analista_email, v_cliente_nombre
  FROM tbl_maestro_clientes WHERE cliente_cod = NEW.codigo_cliente LIMIT 1;

  IF v_analista_email IS NOT NULL THEN
    SELECT id INTO v_usuario_id FROM tbl_usuarios
    WHERE lower(email) = lower(v_analista_email) AND activo LIMIT 1;

    IF v_usuario_id IS NOT NULL THEN
      INSERT INTO tbl_notificaciones (usuario_id, tipo, titulo, mensaje, link)
      VALUES (
        v_usuario_id, 'PEDIDO_RETENIDO', 'Nuevo pedido retenido',
        COALESCE(v_cliente_nombre, NEW.codigo_cliente) || ' — pedido ' || NEW.id_pedido,
        '/gestion-cartera/pedidos-retenidos'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_notificar_promesas_hoy()
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  rec         RECORD;
  v_uid       UUID;
  v_titulo    TEXT;
  v_mensaje   TEXT;
  v_hoy_cr    DATE;
  v_activa    TEXT;
BEGIN
  -- Guard clause: on/off desde config_sistema (módulo Automatizaciones)
  SELECT valor INTO v_activa
  FROM tbl_config_sistema WHERE clave = 'automatizacion_promesas_hoy_activa';
  IF COALESCE(v_activa, 'true') = 'false' THEN
    RETURN;
  END IF;

  -- Fecha de hoy en Costa Rica (UTC-6, sin DST)
  v_hoy_cr := (NOW() AT TIME ZONE 'America/Costa_Rica')::DATE;

  -- Para cada analista con promesas pendientes que vencen hoy
  FOR rec IN
    SELECT
      p.analista_email,
      COUNT(*)::INT                      AS n_promesas,
      SUM(p.monto)                       AS total_monto,
      MIN(p.cliente_nombre)              AS primer_cliente
    FROM tbl_promesas p
    WHERE p.fecha_promesa = v_hoy_cr
      AND p.estado        = 'PENDIENTE'
      AND (p.activo IS NULL OR p.activo = true)
      AND p.analista_email IS NOT NULL
    GROUP BY p.analista_email
  LOOP
    -- Resolver usuario_id desde el email
    SELECT id INTO v_uid
    FROM tbl_usuarios
    WHERE LOWER(email) = LOWER(rec.analista_email)
    LIMIT 1;

    IF v_uid IS NULL THEN CONTINUE; END IF;

    -- Evitar duplicado: si ya existe una notificación PROMESA de hoy para este usuario, saltar
    IF EXISTS (
      SELECT 1 FROM tbl_notificaciones
      WHERE usuario_id = v_uid
        AND tipo        = 'PROMESA'
        AND (created_at AT TIME ZONE 'America/Costa_Rica')::DATE = v_hoy_cr
    ) THEN
      CONTINUE;
    END IF;

    -- Construir título y mensaje
    IF rec.n_promesas = 1 THEN
      v_titulo  := 'Promesa de pago vence hoy';
      v_mensaje := COALESCE(rec.primer_cliente, '—')
                   || ' · ₡'
                   || REPLACE(TO_CHAR(ROUND(rec.total_monto), 'FM999,999,999,999'), ',', '.');
    ELSE
      v_titulo  := rec.n_promesas::TEXT || ' promesas vencen hoy';
      v_mensaje := 'Total comprometido: ₡'
                   || REPLACE(TO_CHAR(ROUND(rec.total_monto), 'FM999,999,999,999'), ',', '.');
    END IF;

    -- Insertar notificación
    INSERT INTO tbl_notificaciones (usuario_id, tipo, titulo, mensaje, leida, link)
    VALUES (v_uid, 'PROMESA', v_titulo, v_mensaje, false, '/promesas');

  END LOOP;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_notificar_sin_gestion()
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  rec        RECORD;
  v_uid      UUID;
  v_titulo   TEXT;
  v_mensaje  TEXT;
  v_link     TEXT;
  v_activa   TEXT;
  v_dias_txt TEXT;
  v_dias     INT;
  v_hoy_cr   DATE;
BEGIN
  SELECT valor INTO v_activa
  FROM tbl_config_sistema WHERE clave = 'automatizacion_sin_gestion_activa';
  IF COALESCE(v_activa, 'true') = 'false' THEN
    RETURN;
  END IF;

  v_hoy_cr := (NOW() AT TIME ZONE 'America/Costa_Rica')::DATE;

  SELECT valor INTO v_dias_txt FROM tbl_config_sistema WHERE clave = 'dias_sin_gestion_alerta';
  v_dias := CASE WHEN v_dias_txt ~ '^[0-9]+$' THEN v_dias_txt::int ELSE 15 END;

  FOR rec IN
    WITH mc AS (
      SELECT DISTINCT ON (cliente_cod)
        cliente_cod, contribuyente, cliente_nombre, analista_email
      FROM tbl_maestro_clientes
      WHERE analista_email IS NOT NULL AND TRIM(analista_email) <> ''
      ORDER BY cliente_cod, updated_at DESC NULLS LAST
    ),
    mora_cli AS (
      SELECT mc.cliente_cod,
             SUM(c.mora_1_30 + c.mora_31_60 + c.mora_61_90 + GREATEST(c.mora_91_120,0) + c.mora_120_plus) AS mora_total
      FROM mc
      JOIN tbl_cartera c ON c.cliente_cod = mc.cliente_cod AND c.contribuyente = mc.contribuyente
      GROUP BY mc.cliente_cod
      HAVING SUM(c.mora_1_30 + c.mora_31_60 + c.mora_61_90 + GREATEST(c.mora_91_120,0) + c.mora_120_plus) > 0
    ),
    ultima_gestion AS (
      SELECT g.cliente_cod, MAX(g.fecha) AS ultima_fecha
      FROM tbl_gestiones g
      JOIN mc ON mc.cliente_cod = g.cliente_cod AND lower(mc.analista_email) = lower(g.analista_email)
      WHERE (g.activo IS NULL OR g.activo = true)
        AND (g.archived IS NULL OR g.archived = false)
        AND (g.legacy IS NULL OR g.legacy = false)
        AND g.tipo <> 'SISTEMA'
      GROUP BY g.cliente_cod
    ),
    candidatos AS (
      SELECT
        mc.cliente_cod, mc.cliente_nombre, lower(mc.analista_email) AS analista_email,
        COALESCE((v_hoy_cr - ug.ultima_fecha), 999) AS dias_sin_gestion
      FROM mc
      JOIN mora_cli mcli ON mcli.cliente_cod = mc.cliente_cod
      LEFT JOIN ultima_gestion ug ON ug.cliente_cod = mc.cliente_cod
    ),
    priorizados AS (
      SELECT cliente_cod, cliente_nombre, analista_email, dias_sin_gestion,
             ROW_NUMBER() OVER (PARTITION BY analista_email ORDER BY dias_sin_gestion DESC) AS rn
      FROM candidatos
      WHERE dias_sin_gestion >= v_dias
    )
    SELECT cliente_cod, cliente_nombre, analista_email, dias_sin_gestion
    FROM priorizados
    WHERE rn <= 5
  LOOP
    SELECT id INTO v_uid FROM tbl_usuarios
    WHERE lower(email) = rec.analista_email AND COALESCE(activo, true) = true
    LIMIT 1;
    IF v_uid IS NULL THEN CONTINUE; END IF;

    v_link := '/clientes/' || rec.cliente_cod;

    IF EXISTS (
      SELECT 1 FROM tbl_notificaciones
      WHERE usuario_id = v_uid AND tipo = 'ALERTA' AND titulo LIKE 'Sin gestión ≥%'
        AND link = v_link AND leida = false
    ) THEN
      CONTINUE;
    END IF;

    v_titulo  := 'Sin gestión ≥ ' || v_dias::TEXT || ' días — ' || rec.cliente_nombre;
    IF rec.dias_sin_gestion >= 999 THEN
      v_mensaje := 'El cliente ' || rec.cliente_nombre || ' (' || rec.cliente_cod || ') nunca ha sido gestionado.';
    ELSE
      v_mensaje := 'El cliente ' || rec.cliente_nombre || ' (' || rec.cliente_cod || ') no tiene gestión registrada hace ' || rec.dias_sin_gestion::TEXT || ' días.';
    END IF;

    INSERT INTO tbl_notificaciones (usuario_id, tipo, titulo, mensaje, leida, link)
    VALUES (v_uid, 'ALERTA', v_titulo, v_mensaje, false, v_link);
  END LOOP;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_notificar_sla_vencido()
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  rec                  RECORD;
  v_uid                UUID;
  v_titulo             TEXT;
  v_mensaje            TEXT;
  v_hoy_cr             DATE;
  v_activa             TEXT;
  v_sin_responsable_n  INT := 0;
BEGIN
  SELECT valor INTO v_activa
  FROM tbl_config_sistema WHERE clave = 'automatizacion_sla_solicitudes_activa';
  IF COALESCE(v_activa, 'true') = 'false' THEN
    RETURN;
  END IF;

  v_hoy_cr := (NOW() AT TIME ZONE 'America/Costa_Rica')::DATE;

  FOR rec IN
    SELECT
      lower(NULLIF(TRIM(s.responsable_email), '')) AS responsable_email,
      COUNT(*)::INT                                                     AS n_vencidas,
      (array_agg(s.cliente_nombre     ORDER BY s.sla_vencimiento))[1]   AS primer_cliente,
      (array_agg(s.id                 ORDER BY s.sla_vencimiento))[1]   AS primer_id,
      (array_agg(s.numero_consecutivo ORDER BY s.sla_vencimiento))[1]   AS primer_consecutivo
    FROM tbl_solicitudes s
    WHERE s.sla_vencimiento IS NOT NULL
      AND s.sla_vencimiento < now()
      AND s.estado NOT IN ('Resuelta','Cerrada','Rechazada','APROBADA','RECHAZADA')
    GROUP BY lower(NULLIF(TRIM(s.responsable_email), ''))
  LOOP
    v_uid := NULL;
    IF rec.responsable_email IS NOT NULL THEN
      SELECT u.id INTO v_uid
      FROM tbl_usuarios u
      WHERE lower(u.email) = rec.responsable_email
        AND COALESCE(u.activo, true) = true
      LIMIT 1;
    END IF;

    IF v_uid IS NULL THEN
      v_sin_responsable_n := v_sin_responsable_n + rec.n_vencidas;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM tbl_notificaciones
      WHERE usuario_id = v_uid
        AND tipo        = 'SOLICITUD'
        AND titulo LIKE 'SLA vencido%'
        AND titulo <> 'SLA vencido — responsable no identificado'
        AND (created_at AT TIME ZONE 'America/Costa_Rica')::DATE = v_hoy_cr
    ) THEN
      CONTINUE;
    END IF;

    IF rec.n_vencidas = 1 THEN
      v_titulo  := 'SLA vencido — ' || COALESCE(rec.primer_cliente, 'SIC-' || LPAD(rec.primer_consecutivo::text, 5, '0'));
      v_mensaje := 'La solicitud SIC-' || LPAD(rec.primer_consecutivo::text, 5, '0') || ' superó su SLA sin resolverse.';
    ELSE
      v_titulo  := 'SLA vencido — ' || rec.n_vencidas::TEXT || ' solicitudes';
      v_mensaje := rec.n_vencidas::TEXT || ' solicitudes bajo tu responsabilidad superaron su SLA sin resolverse.';
    END IF;

    INSERT INTO tbl_notificaciones (usuario_id, tipo, titulo, mensaje, leida, link)
    VALUES (
      v_uid, 'SOLICITUD', v_titulo, v_mensaje, false,
      CASE WHEN rec.n_vencidas = 1 THEN '/solicitudes/' || rec.primer_id::text ELSE '/solicitudes' END
    );
  END LOOP;

  IF v_sin_responsable_n > 0 THEN
    INSERT INTO tbl_notificaciones (usuario_id, tipo, titulo, mensaje, leida, link)
    SELECT
      u.id, 'SOLICITUD',
      'SLA vencido — responsable no identificado',
      v_sin_responsable_n::TEXT || ' solicitud(es) superaron su SLA y su responsable_email no coincide con ningún usuario activo del sistema.',
      false, '/solicitudes'
    FROM tbl_usuarios u
    WHERE u.rol = 'COORDINADOR' AND COALESCE(u.activo, true) = true
      AND NOT EXISTS (
        SELECT 1 FROM tbl_notificaciones n
        WHERE n.usuario_id = u.id AND n.tipo = 'SOLICITUD'
          AND n.titulo = 'SLA vencido — responsable no identificado'
          AND (n.created_at AT TIME ZONE 'America/Costa_Rica')::DATE = v_hoy_cr
      );
  END IF;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_pagos_mes_resumen(p_anio integer, p_mes integer)
  RETURNS json
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
WITH rango AS (
  SELECT make_date(p_anio, p_mes, 1) AS d1,
         (make_date(p_anio, p_mes, 1) + INTERVAL '1 month - 1 day')::date AS d2
),
lineas AS (
  SELECT p.* FROM tbl_pagos p, rango r
  WHERE p.fecha_pago BETWEEN r.d1 AND r.d2
),
por_recibo AS (
  SELECT
    COALESCE(NULLIF(no_recibo,''), '—') AS no_recibo,
    MAX(fecha_pago)                     AS fecha_pago,
    MAX(tipo_pago)                      AS tipo_pago,
    MAX(nombre_cliente)                 AS cliente_nombre,
    MAX(cliente_cod)                    AS cliente_cod,
    COUNT(DISTINCT cliente_cod)         AS n_clientes,
    COUNT(*)                            AS n_facturas,
    ROUND(SUM(monto_pago))              AS monto_total
  FROM lineas
  GROUP BY COALESCE(NULLIF(no_recibo,''), '—')
),
enriquecido AS (
  SELECT
    pr.*,
    CASE WHEN pa.no_recibo IS NOT NULL THEN 'ANULADO' ELSE 'VALIDO' END AS estado,
    pa.motivo           AS anulado_motivo,
    pa.recibo_reemplazo AS anulado_reemplazo,
    pa.anulado_por,
    pa.anulado_en,
    (pd.no_recibo IS NOT NULL) AS duplicado_descartado
  FROM por_recibo pr
  LEFT JOIN tbl_pagos_anulados pa ON pa.no_recibo = pr.no_recibo
  LEFT JOIN tbl_pagos_duplicado_descartado pd ON pd.no_recibo = pr.no_recibo
),
-- "Posible duplicado" solo entre recibos VALIDOS y sin descartar en ninguno
-- de los dos lados -- un solo descarte silencia el par (si no hay más
-- candidatos), sin necesidad de descartar ambos números.
posibles_dup AS (
  SELECT a.no_recibo, EXISTS (
    SELECT 1 FROM enriquecido b
    WHERE b.no_recibo <> a.no_recibo
      AND b.estado = 'VALIDO' AND NOT b.duplicado_descartado
      AND b.n_clientes = 1 AND a.n_clientes = 1
      AND b.cliente_cod = a.cliente_cod
      AND b.monto_total  = a.monto_total
      AND ABS(b.fecha_pago - a.fecha_pago) <= 3
  ) AS posible_duplicado
  FROM enriquecido a WHERE a.estado = 'VALIDO' AND NOT a.duplicado_descartado
)
SELECT json_build_object(
  'kpis', json_build_object(
     'n_recibos',   (SELECT COUNT(*) FROM enriquecido WHERE estado = 'VALIDO'),
     'n_lineas',    (SELECT COUNT(*) FROM lineas l WHERE NOT EXISTS (SELECT 1 FROM tbl_pagos_anulados pa WHERE pa.no_recibo = l.no_recibo)),
     'monto_total', (SELECT ROUND(COALESCE(SUM(monto_pago),0)) FROM lineas l WHERE NOT EXISTS (SELECT 1 FROM tbl_pagos_anulados pa WHERE pa.no_recibo = l.no_recibo))
  ),
  'recibos', (SELECT COALESCE(json_agg(json_build_object(
       'no_recibo',            e.no_recibo,
       'fecha_pago',           e.fecha_pago,
       'tipo_pago',            e.tipo_pago,
       'cliente_nombre',       e.cliente_nombre,
       'cliente_cod',          e.cliente_cod,
       'n_clientes',           e.n_clientes,
       'n_facturas',           e.n_facturas,
       'monto_total',          e.monto_total,
       'estado',               e.estado,
       'anulado_motivo',       e.anulado_motivo,
       'anulado_reemplazo',    e.anulado_reemplazo,
       'anulado_por',          e.anulado_por,
       'anulado_en',           e.anulado_en,
       'posible_duplicado',    COALESCE(pd.posible_duplicado, false),
       'duplicado_descartado', e.duplicado_descartado
     ) ORDER BY e.fecha_pago DESC, e.no_recibo), '[]'::json)
     FROM enriquecido e LEFT JOIN posibles_dup pd ON pd.no_recibo = e.no_recibo)
);
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_pedidos_retenidos(p_email text DEFAULT NULL::text)
  RETURNS json
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  v_anio_mes    text := to_char((now() AT TIME ZONE 'America/Costa_Rica')::date, 'YYYY-MM');
  v_hoy         date := (now() AT TIME ZONE 'America/Costa_Rica')::date;
  v_latest_sync text;
  v_rows        json;
  v_kpis        json;
BEGIN
  SELECT sync_id INTO v_latest_sync FROM tbl_cartera ORDER BY updated_at DESC LIMIT 1;

  WITH facturas_agg AS (
    SELECT
      f.contribuyente,
      count(*) FILTER (WHERE (v_hoy - f.fecha_vencimiento::date) <= 0)                AS cant_no_vencido,
      count(*) FILTER (WHERE (v_hoy - f.fecha_vencimiento::date) BETWEEN 1   AND 30)   AS cant_mora_1_30,
      count(*) FILTER (WHERE (v_hoy - f.fecha_vencimiento::date) BETWEEN 31  AND 60)   AS cant_mora_31_60,
      count(*) FILTER (WHERE (v_hoy - f.fecha_vencimiento::date) BETWEEN 61  AND 90)   AS cant_mora_61_90,
      count(*) FILTER (WHERE (v_hoy - f.fecha_vencimiento::date) BETWEEN 91  AND 120)  AS cant_mora_91_120,
      count(*) FILTER (WHERE (v_hoy - f.fecha_vencimiento::date) > 120)               AS cant_mora_120_plus
    FROM tbl_facturas f
    WHERE f.saldo > 0
    GROUP BY f.contribuyente
  ),
  base AS (
    SELECT
      p.id_pedido, p.codigo_cliente, p.fecha_pedido, p.total_mercaderia, p.estado_sic,
      p.comentario_analista, p.motivo_retencion, p.resuelto_por, p.resuelto_en, p.created_at,
      COALESCE(NULLIF(p.vendedor,''), c.vendedor_nombre, mc.vendedor_nombre) AS vendedor,
      COALESCE(NULLIF(mc.cliente_nombre,''), 'Cliente ' || p.codigo_cliente) AS cliente_nombre,
      NULLIF(mc.analista_email,'')  AS analista_email,
      NULLIF(mc.analista_nombre,'') AS analista_nombre,
      icp.icp_score, icp.clasificacion AS icp_clasificacion,
      COALESCE(c.total,0)         AS cartera_total,
      COALESCE(c.no_vencido,0)    AS no_vencido,
      COALESCE(c.mora_1_30,0)     AS mora_1_30,
      COALESCE(c.mora_31_60,0)    AS mora_31_60,
      COALESCE(c.mora_61_90,0)    AS mora_61_90,
      COALESCE(c.mora_91_120,0)   AS mora_91_120,
      COALESCE(c.mora_120_plus,0) AS mora_120_plus,
      COALESCE(fa.cant_no_vencido,0)    AS cant_no_vencido,
      COALESCE(fa.cant_mora_1_30,0)     AS cant_mora_1_30,
      COALESCE(fa.cant_mora_31_60,0)    AS cant_mora_31_60,
      COALESCE(fa.cant_mora_61_90,0)    AS cant_mora_61_90,
      COALESCE(fa.cant_mora_91_120,0)   AS cant_mora_91_120,
      COALESCE(fa.cant_mora_120_plus,0) AS cant_mora_120_plus,
      EXISTS (
        SELECT 1 FROM tbl_historico_pedidos_retenidos h
        WHERE h.codigo_cliente = p.codigo_cliente AND h.anio_mes <> v_anio_mes
      ) AS es_cronico
    FROM tbl_pedidos_retenidos p
    LEFT JOIN tbl_maestro_clientes mc ON mc.cliente_cod = p.codigo_cliente
    LEFT JOIN vw_icp_por_cliente icp ON icp.cliente_cod = p.codigo_cliente
    LEFT JOIN tbl_cartera c ON c.cliente_cod = p.codigo_cliente AND c.sync_id = v_latest_sync
    LEFT JOIN facturas_agg fa ON fa.contribuyente = COALESCE(c.contribuyente, mc.contribuyente)
    WHERE p.anio_mes = v_anio_mes
      AND (p_email IS NULL OR lower(NULLIF(mc.analista_email,'')) = lower(p_email))
  ),
  clasificado AS (
    SELECT b.*,
      CASE
        WHEN (b.mora_61_90 + b.mora_91_120 + b.mora_120_plus) > 0 THEN 'RETENER'
        WHEN b.icp_score IS NULL                                  THEN 'SIN_HISTORIAL'
        WHEN b.icp_score < 50                                     THEN 'RETENER'
        WHEN b.icp_score < 70 OR b.mora_31_60 > 0                 THEN 'REVISAR'
        ELSE 'APROBAR'
      END AS recomendacion
    FROM base b
  )
  SELECT
    (SELECT json_agg(json_build_object(
        'id_pedido',           id_pedido,
        'codigo_cliente',      codigo_cliente,
        'cliente_nombre',      cliente_nombre,
        'fecha_pedido',        fecha_pedido,
        'total_mercaderia',    ROUND(total_mercaderia,2),
        'vendedor',            vendedor,
        'estado_sic',          estado_sic,
        'comentario_analista', comentario_analista,
        'motivo_retencion',    motivo_retencion,
        'resuelto_por',        resuelto_por,
        'resuelto_en',         resuelto_en,
        'created_at',          created_at,
        'analista_email',      analista_email,
        'analista_nombre',     analista_nombre,
        'icp_score',           icp_score,
        'icp_clasificacion',   icp_clasificacion,
        'cartera_total',       ROUND(cartera_total,2),
        'no_vencido',          ROUND(no_vencido,2),
        'mora_1_30',           ROUND(mora_1_30,2),
        'mora_31_60',          ROUND(mora_31_60,2),
        'mora_61_90',          ROUND(mora_61_90,2),
        'mora_91_120',         ROUND(mora_91_120,2),
        'mora_120_plus',       ROUND(mora_120_plus,2),
        'cant_no_vencido',     cant_no_vencido,
        'cant_mora_1_30',      cant_mora_1_30,
        'cant_mora_31_60',     cant_mora_31_60,
        'cant_mora_61_90',     cant_mora_61_90,
        'cant_mora_91_120',    cant_mora_91_120,
        'cant_mora_120_plus',  cant_mora_120_plus,
        'es_cronico',          es_cronico,
        'recomendacion',       recomendacion
      ) ORDER BY
        CASE estado_sic WHEN 'Pendiente' THEN 0 ELSE 1 END,
        CASE recomendacion WHEN 'RETENER' THEN 0 WHEN 'REVISAR' THEN 1 WHEN 'SIN_HISTORIAL' THEN 2 ELSE 3 END,
        fecha_pedido DESC
      ) FROM clasificado),
    json_build_object(
      'monto_total_retenido', COALESCE((SELECT ROUND(SUM(total_mercaderia),2) FROM base WHERE estado_sic IN ('Pendiente','Retenido')), 0),
      'pedidos_en_espera',     COALESCE((SELECT COUNT(*) FROM base WHERE estado_sic = 'Pendiente'), 0),
      'ticket_promedio',       COALESCE((SELECT ROUND(AVG(total_mercaderia),2) FROM base WHERE estado_sic = 'Pendiente'), 0),
      'casos_cronicos',        COALESCE((SELECT COUNT(DISTINCT codigo_cliente) FROM base WHERE es_cronico), 0),
      'anio_mes', v_anio_mes
    )
  INTO v_rows, v_kpis;

  RETURN json_build_object('kpis', v_kpis, 'rows', COALESCE(v_rows, '[]'::json));
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_portafolio_destinatarios()
  RETURNS json
  LANGUAGE sql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
  SELECT COALESCE(json_object_agg(q.principal_cod, q.emails), '{}'::json)
  FROM (
    SELECT pa.principal_cod,
      array_agg(DISTINCT ve.email ORDER BY ve.email) AS emails
    FROM tbl_portafolio_acotado pa
    JOIN tbl_vendedores ve ON ve.cod = pa.vendedor_cod
    JOIN tbl_portafolio_grupos pg ON pg.principal_cod = pa.principal_cod
    WHERE pa.activo AND ve.activo AND pg.activo
      AND ve.cod <> pa.principal_cod
      AND COALESCE(ve.email,'') <> ''
    GROUP BY pa.principal_cod
  ) q;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_presupuesto_calc(p_anio integer, p_mes integer)
  RETURNS TABLE(contribuyente text, cliente_cod text, cliente_nombre text, vendedor_cod text, vendedor_nombre text, dias_prom numeric, dias_prom_ajustado numeric, n_facturas integer, ppto_cartera numeric, ppto_nuevas_ventas numeric, ppto_total numeric)
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
#variable_conflict use_column
DECLARE
  v_fin_mes date; v_latest_sync text; v_sync_cartera text; v_meses_pagos numeric;
BEGIN
  v_fin_mes := (make_date(p_anio, p_mes, 1) + interval '1 month - 1 day')::date;
  SELECT sync_id INTO v_latest_sync  FROM tbl_facturas ORDER BY id DESC LIMIT 1;
  SELECT sync_id INTO v_sync_cartera FROM tbl_cartera  ORDER BY updated_at DESC LIMIT 1;
  SELECT GREATEST(COUNT(DISTINCT date_trunc('month', fecha_pago)), 1)::numeric INTO v_meses_pagos
  FROM tbl_pagos WHERE NOT EXISTS (SELECT 1 FROM tbl_pagos_anulados pa WHERE pa.no_recibo = tbl_pagos.no_recibo);

  RETURN QUERY
  WITH
  cart AS (
    SELECT ca.cliente_cod, ca.contribuyente, SUM(GREATEST(ca.total,0)) AS total_cod
    FROM tbl_cartera ca WHERE ca.sync_id = v_sync_cartera
    GROUP BY ca.cliente_cod, ca.contribuyente
  ),
  cod AS (
    SELECT DISTINCT ON (m.cliente_cod)
      m.cliente_cod, m.contribuyente, m.cliente_nombre,
      COALESCE(NULLIF(m.vendedor_cod,''), '—')               AS vendedor_cod,
      COALESCE(NULLIF(m.vendedor_nombre,''), 'Sin vendedor') AS vendedor_nombre,
      (regexp_match(m.condicion_pago, '(\d+)'))[1]::numeric  AS plazo_cliente
    FROM tbl_maestro_clientes m
    ORDER BY m.cliente_cod, m.id DESC
  ),
  comp_cod AS (
    SELECT p.cliente_cod, AVG(p.dias_atraso)::numeric AS atraso_prom,
           COUNT(*) AS n_pagos, SUM(p.monto_pago)::numeric AS pagado_total
    FROM tbl_pagos p
    WHERE COALESCE(p.cliente_cod,'')<>''
      AND NOT EXISTS (SELECT 1 FROM tbl_pagos_anulados pa WHERE pa.no_recibo = p.no_recibo)
    GROUP BY p.cliente_cod
  ),
  cli AS (
    SELECT cod.cliente_cod, cod.contribuyente, cod.cliente_nombre, cod.vendedor_cod, cod.vendedor_nombre,
      cod.plazo_cliente, cc.atraso_prom, COALESCE(cc.n_pagos,0) AS n_pagos,
      ROUND(COALESCE(cc.pagado_total,0)/v_meses_pagos,2) AS venta_mensual_prom,
      ROUND(COALESCE(cod.plazo_cliente,0)+COALESCE(cc.atraso_prom,0),1) AS dias_prom
    FROM cod LEFT JOIN comp_cod cc ON cc.cliente_cod = cod.cliente_cod
  ),
  cli2 AS (SELECT *, CASE WHEN dias_prom<=45 THEN 0 WHEN dias_prom<=75 THEN 2 ELSE 5 END AS castigo FROM cli),

  comp_contrib AS (
    SELECT p.contribuyente, AVG(p.dias_atraso)::numeric AS atraso_prom, COUNT(*) AS n_pagos
    FROM tbl_pagos p
    WHERE NOT EXISTS (SELECT 1 FROM tbl_pagos_anulados pa WHERE pa.no_recibo = p.no_recibo)
    GROUP BY p.contribuyente
  ),
  contrib_param AS (
    SELECT DISTINCT ON (m.contribuyente)
      m.contribuyente,
      (regexp_match(m.condicion_pago,'(\d+)'))[1]::numeric AS plazo_cliente,
      cc.atraso_prom, COALESCE(cc.n_pagos,0) AS n_pagos
    FROM tbl_maestro_clientes m
    LEFT JOIN tbl_cartera ca ON ca.cliente_cod=m.cliente_cod AND ca.contribuyente=m.contribuyente AND ca.sync_id=v_sync_cartera
    LEFT JOIN comp_contrib cc ON cc.contribuyente=m.contribuyente
    ORDER BY m.contribuyente, COALESCE(ca.total,0) DESC, m.id DESC
  ),
  cp AS (
    SELECT *, CASE WHEN (COALESCE(plazo_cliente,0)+COALESCE(atraso_prom,0))<=45 THEN 0
                   WHEN (COALESCE(plazo_cliente,0)+COALESCE(atraso_prom,0))<=75 THEN 2 ELSE 5 END AS castigo
    FROM contrib_param
  ),
  fact AS (
    SELECT f.contribuyente, NULLIF(f.cliente_cod,'') AS f_cod, f.saldo,
      f.fecha_vencimiento::date AS ven,
      (f.fecha_vencimiento::date - f.fecha_documento::date) AS plazo_factura
    FROM tbl_facturas f WHERE f.sync_id=v_latest_sync AND f.saldo>0
      AND f.fecha_documento ~ '^\d{4}-\d{2}-\d{2}' AND f.fecha_vencimiento ~ '^\d{4}-\d{2}-\d{2}'
  ),
  in_month AS (
    SELECT cp.contribuyente, fa.f_cod, fa.saldo
    FROM cp JOIN fact fa ON fa.contribuyente=cp.contribuyente
    WHERE (CASE WHEN cp.plazo_cliente IS NOT NULL AND fa.plazo_factura IS DISTINCT FROM cp.plazo_cliente THEN fa.ven
                WHEN cp.n_pagos>0 THEN (fa.ven + ((cp.atraso_prom-cp.castigo)*interval '1 day'))::date
                ELSE fa.ven END) <= v_fin_mes
  ),
  direct AS (
    SELECT im.f_cod AS cliente_cod, SUM(im.saldo) AS ppto, COUNT(*)::int AS nf
    FROM in_month im
    WHERE im.f_cod IS NOT NULL AND im.f_cod IN (SELECT cliente_cod FROM cod)
    GROUP BY im.f_cod
  ),
  pool AS (
    SELECT im.contribuyente, SUM(im.saldo) AS ppto
    FROM in_month im
    WHERE im.f_cod IS NULL OR im.f_cod NOT IN (SELECT cliente_cod FROM cod)
    GROUP BY im.contribuyente
  ),
  pesos AS (
    SELECT c.cliente_cod, c.contribuyente,
      COALESCE(ct.total_cod,0) AS peso,
      SUM(COALESCE(ct.total_cod,0)) OVER (PARTITION BY c.contribuyente) AS peso_contrib,
      COUNT(*)                      OVER (PARTITION BY c.contribuyente) AS n_cod_contrib
    FROM cli2 c LEFT JOIN cart ct ON ct.cliente_cod=c.cliente_cod AND ct.contribuyente=c.contribuyente
  ),
  pool_alloc AS (
    SELECT pe.cliente_cod,
      ROUND(COALESCE(po.ppto,0) * CASE WHEN pe.peso_contrib>0 THEN pe.peso/pe.peso_contrib ELSE 1.0/pe.n_cod_contrib END, 2) AS ppto
    FROM pesos pe LEFT JOIN pool po ON po.contribuyente=pe.contribuyente
  ),
  cartera_cod AS (
    SELECT c.cliente_cod,
      ROUND(COALESCE(d.ppto,0) + COALESCE(pa.ppto,0), 2) AS ppto_cartera,
      COALESCE(d.nf,0) AS n_facturas
    FROM cli2 c
    LEFT JOIN direct d     ON d.cliente_cod=c.cliente_cod
    LEFT JOIN pool_alloc pa ON pa.cliente_cod=c.cliente_cod
  )
  SELECT c.contribuyente, c.cliente_cod, c.cliente_nombre, c.vendedor_cod, c.vendedor_nombre,
    c.dias_prom, (c.dias_prom-c.castigo),
    COALESCE(cx.n_facturas,0)::int,
    ROUND(COALESCE(cx.ppto_cartera,0),2),
    CASE WHEN c.n_pagos>0 AND c.dias_prom<30 THEN ROUND(c.venta_mensual_prom*(30-c.dias_prom)/30.0,2) ELSE 0 END,
    ROUND(COALESCE(cx.ppto_cartera,0) + CASE WHEN c.n_pagos>0 AND c.dias_prom<30 THEN c.venta_mensual_prom*(30-c.dias_prom)/30.0 ELSE 0 END,2)
  FROM cli2 c LEFT JOIN cartera_cod cx ON cx.cliente_cod=c.cliente_cod
  WHERE (COALESCE(cx.ppto_cartera,0) + CASE WHEN c.n_pagos>0 AND c.dias_prom<30 THEN c.venta_mensual_prom*(30-c.dias_prom)/30.0 ELSE 0 END)>0;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_presupuesto_frozen(p_anio integer, p_mes integer)
  RETURNS json
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE v_existe boolean; v_result json;
BEGIN
  SELECT EXISTS(SELECT 1 FROM tbl_presupuesto_cobro WHERE anio=p_anio AND mes=p_mes) INTO v_existe;
  IF NOT v_existe THEN RETURN json_build_object('congelado', false); END IF;

  WITH vend AS (
    SELECT pc.vendedor_cod, MAX(pc.vendedor_nombre) AS vendedor_nombre,
      COUNT(*)::int AS n_clientes,
      SUM(pc.ppto_cartera) AS ppto_cartera, SUM(pc.ppto_nuevas_ventas) AS ppto_nuevas_ventas,
      SUM(pc.ppto_total) AS ppto_total,
      json_agg(json_build_object(
        'cliente_cod', pc.cliente_cod, 'cliente_nombre', pc.cliente_nombre,
        'dias_prom', pc.dias_prom, 'dias_prom_ajustado', pc.dias_prom_ajustado, 'n_facturas', 0,
        'ppto_cartera', ROUND(pc.ppto_cartera), 'ppto_nuevas_ventas', ROUND(pc.ppto_nuevas_ventas),
        'ppto_total', ROUND(pc.ppto_total)
      ) ORDER BY pc.ppto_total DESC) AS clientes
    FROM tbl_presupuesto_cobro pc WHERE pc.anio=p_anio AND pc.mes=p_mes
    GROUP BY pc.vendedor_cod
  ),
  m AS (
    SELECT vendedor_cod, meta_sugerida, meta_ajustada, editada
    FROM tbl_presupuesto_meta_vendedor WHERE anio=p_anio AND mes=p_mes
  ),
  vm AS (
    SELECT v.*, COALESCE(m.meta_ajustada, v.ppto_total) AS meta, m.meta_sugerida, m.meta_ajustada, COALESCE(m.editada,false) AS editada
    FROM vend v LEFT JOIN m ON m.vendedor_cod = v.vendedor_cod
  )
  SELECT json_build_object(
    'congelado', true,
    'kpis', json_build_object(
      'anio', p_anio, 'mes', p_mes,
      'ppto_total',         (SELECT ROUND(COALESCE(SUM(meta),0)) FROM vm),
      'ppto_cartera',       (SELECT ROUND(COALESCE(SUM(ppto_cartera),0)) FROM vm),
      'ppto_nuevas_ventas', (SELECT ROUND(COALESCE(SUM(ppto_nuevas_ventas),0)) FROM vm),
      'n_clientes',         (SELECT COALESCE(SUM(n_clientes),0) FROM vm),
      'n_vendedores',       (SELECT COUNT(*) FROM vm)
    ),
    'vendedores', (SELECT COALESCE(json_agg(json_build_object(
        'vendedor_cod', vendedor_cod, 'vendedor_nombre', vendedor_nombre, 'n_clientes', n_clientes,
        'ppto_cartera', ROUND(ppto_cartera), 'ppto_nuevas_ventas', ROUND(ppto_nuevas_ventas),
        'ppto_total', ROUND(ppto_total),
        'meta', ROUND(meta), 'meta_editada', editada, 'clientes', clientes
      ) ORDER BY meta DESC), '[]'::json) FROM vm)
  ) INTO v_result;
  RETURN v_result;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_presupuesto_guardar(p_anio integer, p_mes integer, p_email text)
  RETURNS json
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE v_n int; v_total numeric;
BEGIN
  DELETE FROM tbl_presupuesto_cobro         WHERE anio=p_anio AND mes=p_mes;
  DELETE FROM tbl_presupuesto_meta_vendedor WHERE anio=p_anio AND mes=p_mes;
  INSERT INTO tbl_presupuesto_cobro
    (anio,mes,contribuyente,cliente_cod,cliente_nombre,vendedor_cod,vendedor_nombre,dias_prom,dias_prom_ajustado,ppto_cartera,ppto_nuevas_ventas,ppto_total,generado_por)
  SELECT p_anio,p_mes,contribuyente,cliente_cod,cliente_nombre,vendedor_cod,vendedor_nombre,dias_prom,dias_prom_ajustado,ppto_cartera,ppto_nuevas_ventas,ppto_total,p_email
  FROM fn_presupuesto_calc(p_anio,p_mes);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO tbl_presupuesto_meta_vendedor (anio,mes,vendedor_cod,vendedor_nombre,meta_sugerida,meta_ajustada,editada,updated_por)
  SELECT p_anio,p_mes,vendedor_cod,MAX(vendedor_nombre),ROUND(SUM(ppto_total)),ROUND(SUM(ppto_total)),false,p_email
  FROM tbl_presupuesto_cobro WHERE anio=p_anio AND mes=p_mes GROUP BY vendedor_cod;
  SELECT ROUND(COALESCE(SUM(ppto_total),0)) INTO v_total FROM tbl_presupuesto_cobro WHERE anio=p_anio AND mes=p_mes;
  RETURN json_build_object('ok',true,'n_clientes',v_n,'ppto_total',v_total);
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_presupuesto_meta(p_anio integer, p_mes integer, p_vendedor_cod text, p_meta numeric, p_email text)
  RETURNS json
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
BEGIN
  UPDATE tbl_presupuesto_meta_vendedor
    SET meta_ajustada=p_meta, editada=true, updated_at=now(), updated_por=p_email
  WHERE anio=p_anio AND mes=p_mes AND vendedor_cod=p_vendedor_cod;
  RETURN json_build_object('ok', true);
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_presupuesto_preview(p_anio integer, p_mes integer)
  RETURNS json
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE v_result json;
BEGIN
  WITH base AS (SELECT * FROM fn_presupuesto_calc(p_anio, p_mes)),
  vend AS (
    SELECT vendedor_cod, vendedor_nombre,
      COUNT(*)::int AS n_clientes,
      SUM(ppto_cartera) AS ppto_cartera, SUM(ppto_nuevas_ventas) AS ppto_nuevas_ventas,
      SUM(ppto_total) AS ppto_total,
      json_agg(json_build_object(
        'cliente_cod', cliente_cod, 'cliente_nombre', cliente_nombre,
        'dias_prom', dias_prom, 'dias_prom_ajustado', dias_prom_ajustado, 'n_facturas', n_facturas,
        'ppto_cartera', ROUND(ppto_cartera), 'ppto_nuevas_ventas', ROUND(ppto_nuevas_ventas),
        'ppto_total', ROUND(ppto_total)
      ) ORDER BY ppto_total DESC) AS clientes
    FROM base GROUP BY vendedor_cod, vendedor_nombre
  )
  SELECT json_build_object(
    'kpis', json_build_object(
      'anio', p_anio, 'mes', p_mes,
      'ppto_total',         (SELECT ROUND(COALESCE(SUM(ppto_total),0))         FROM base),
      'ppto_cartera',       (SELECT ROUND(COALESCE(SUM(ppto_cartera),0))       FROM base),
      'ppto_nuevas_ventas', (SELECT ROUND(COALESCE(SUM(ppto_nuevas_ventas),0)) FROM base),
      'n_clientes',         (SELECT COUNT(*) FROM base),
      'n_vendedores',       (SELECT COUNT(*) FROM vend)
    ),
    'vendedores', (SELECT COALESCE(json_agg(json_build_object(
        'vendedor_cod', vendedor_cod, 'vendedor_nombre', vendedor_nombre, 'n_clientes', n_clientes,
        'ppto_cartera', ROUND(ppto_cartera), 'ppto_nuevas_ventas', ROUND(ppto_nuevas_ventas),
        'ppto_total', ROUND(ppto_total), 'clientes', clientes
      ) ORDER BY ppto_total DESC), '[]'::json) FROM vend)
  ) INTO v_result;
  RETURN v_result;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_presupuesto_reasignar(p_anio integer, p_mes integer, p_cliente_cod text, p_vendedor_cod text, p_email text)
  RETURNS json
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE v_nombre text;
BEGIN
  SELECT nombre INTO v_nombre FROM tbl_vendedores WHERE cod = p_vendedor_cod LIMIT 1;
  IF v_nombre IS NULL THEN
    SELECT vendedor_nombre INTO v_nombre FROM tbl_presupuesto_cobro WHERE anio=p_anio AND mes=p_mes AND vendedor_cod=p_vendedor_cod LIMIT 1;
  END IF;
  v_nombre := COALESCE(v_nombre, p_vendedor_cod);

  UPDATE tbl_presupuesto_cobro SET vendedor_cod=p_vendedor_cod, vendedor_nombre=v_nombre
  WHERE anio=p_anio AND mes=p_mes AND cliente_cod=p_cliente_cod;

  PERFORM fn__recalc_metas(p_anio, p_mes, p_email);
  RETURN json_build_object('ok', true);
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_propagar_analista_vendedor()
  RETURNS trigger
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
BEGIN
  IF NEW.analista_email IS DISTINCT FROM OLD.analista_email THEN
    UPDATE tbl_maestro_clientes m
    SET analista_email  = NEW.analista_email,
        analista_nombre = (SELECT u.nombre FROM tbl_usuarios u WHERE lower(u.email)=lower(NEW.analista_email)),
        updated_at      = now()
    WHERE m.vendedor_cod = NEW.cod
      AND COALESCE(m.asignacion_manual, false) = false;
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_proteger_contacto_manual()
  RETURNS trigger
  LANGUAGE plpgsql
  VOLATILE
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  es_manual boolean := COALESCE(current_setting('app.contacto_manual', true), 'off') = 'on';
BEGIN
  IF NOT es_manual THEN
    IF (NEW.nombre_cxp IS NULL OR btrim(NEW.nombre_cxp) = '')
       AND OLD.nombre_cxp IS NOT NULL AND btrim(OLD.nombre_cxp) <> '' THEN
      NEW.nombre_cxp := OLD.nombre_cxp;
    END IF;
    IF (NEW.telefono IS NULL OR btrim(NEW.telefono) = '')
       AND OLD.telefono IS NOT NULL AND btrim(OLD.telefono) <> '' THEN
      NEW.telefono := OLD.telefono;
    END IF;
    IF (NEW.telefono2 IS NULL OR btrim(NEW.telefono2) = '')
       AND OLD.telefono2 IS NOT NULL AND btrim(OLD.telefono2) <> '' THEN
      NEW.telefono2 := OLD.telefono2;
    END IF;
    IF (NEW.correo IS NULL OR btrim(NEW.correo) = '')
       AND OLD.correo IS NOT NULL AND btrim(OLD.correo) <> '' THEN
      NEW.correo := OLD.correo;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_proteger_logistica_manual()
  RETURNS trigger
  LANGUAGE plpgsql
  VOLATILE
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  es_manual boolean := COALESCE(current_setting('app.logistica_manual', true), 'off') = 'on';
BEGIN
  IF NOT es_manual THEN
    NEW.dia_visita             := OLD.dia_visita;
    NEW.dia_pago                := OLD.dia_pago;
    NEW.metodo_pago             := OLD.metodo_pago;
    NEW.observaciones_logistica := OLD.observaciones_logistica;
    NEW.hora_recibo_inicio      := OLD.hora_recibo_inicio;
    NEW.hora_recibo_fin         := OLD.hora_recibo_fin;
    NEW.persona_recibe          := OLD.persona_recibe;
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_proyeccion_cobro(p_semanas integer DEFAULT 8, p_ignore_snapshot boolean DEFAULT false, p_semanas_pasadas integer DEFAULT 1)
  RETURNS json
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  v_lunes       date;
  v_lunes_ant   date;
  v_pasadas     integer;
  v_latest_sync text;
  v_result      json;
BEGIN
  -- Auto-sanado del congelado semanal (no aplica cuando la llamada viene del
  -- propio snapshot con p_ignore_snapshot=true -- evita recursión).
  IF NOT p_ignore_snapshot THEN
    PERFORM cof_prd_cyc_cofersa_sch_core.fn_snapshot_proyeccion_semana();
  END IF;

  v_lunes     := date_trunc('week', (now() AT TIME ZONE 'America/Costa_Rica')::date)::date;
  v_lunes_ant := v_lunes - 7;
  v_pasadas   := LEAST(GREATEST(COALESCE(p_semanas_pasadas, 1), 1), 26);

  SELECT sync_id INTO v_latest_sync FROM tbl_facturas ORDER BY id DESC LIMIT 1;

  WITH semanas AS (
    SELECT gs AS idx,
      (v_lunes + gs * 7)::date AS inicio,
      (v_lunes + gs * 7 + 6)::date AS fin,
      CASE WHEN gs < 0 THEN 'pasada' WHEN gs = 0 THEN 'actual' ELSE 'futura' END AS tipo
    FROM generate_series(-v_pasadas, p_semanas - 1) gs
  ),
  mc AS (
    SELECT DISTINCT ON (contribuyente) contribuyente,
      (regexp_match(condicion_pago, '(\d+)'))[1]::numeric AS plazo_cliente
    FROM tbl_maestro_clientes ORDER BY contribuyente, id DESC
  ),
  comp AS (
    SELECT contribuyente, AVG(dias_atraso)::numeric AS atraso_prom, COUNT(*) AS n_pagos
    FROM tbl_pagos
    WHERE NOT EXISTS (SELECT 1 FROM tbl_pagos_anulados pa WHERE pa.no_recibo = tbl_pagos.no_recibo)
    GROUP BY contribuyente
  ),
  fact_exp AS (
    SELECT fa.saldo,
      CASE
        WHEN mc.plazo_cliente IS NOT NULL AND (fa.ven - fa.emi) IS DISTINCT FROM mc.plazo_cliente THEN fa.ven
        WHEN COALESCE(c.n_pagos, 0) > 0 THEN
          (fa.ven + ((c.atraso_prom - CASE
            WHEN (COALESCE(mc.plazo_cliente,0)+COALESCE(c.atraso_prom,0))<=45 THEN 0
            WHEN (COALESCE(mc.plazo_cliente,0)+COALESCE(c.atraso_prom,0))<=75 THEN 2
            ELSE 5 END) * interval '1 day'))::date
        ELSE fa.ven
      END AS expected_pago
    FROM (
      SELECT f.contribuyente, f.saldo, f.fecha_vencimiento::date AS ven, f.fecha_documento::date AS emi
      FROM tbl_facturas f
      WHERE f.sync_id = v_latest_sync AND f.saldo > 0
        AND f.fecha_documento ~ '^\d{4}-\d{2}-\d{2}'
        AND f.fecha_vencimiento ~ '^\d{4}-\d{2}-\d{2}'
    ) fa
    JOIN mc ON mc.contribuyente = fa.contribuyente
    LEFT JOIN comp c ON c.contribuyente = mc.contribuyente
  ),
  fact_sem_calc AS (
    SELECT s.idx, COALESCE(SUM(fe.saldo), 0) AS natural_esperado
    FROM semanas s
    LEFT JOIN fact_exp fe ON fe.expected_pago BETWEEN s.inicio AND s.fin
    GROUP BY s.idx
  ),
  overdue AS (
    SELECT fe.saldo,
      CASE
        WHEN (v_lunes - fe.expected_pago) <= 14 THEN 'A'
        WHEN (v_lunes - fe.expected_pago) <= 30 THEN 'B'
        WHEN (v_lunes - fe.expected_pago) <= 60 THEN 'C'
        WHEN (v_lunes - fe.expected_pago) <= 90 THEN 'D'
        ELSE 'E'
      END AS bucket
    FROM fact_exp fe
    WHERE fe.expected_pago < v_lunes_ant
  ),
  spread(bucket, rate, idx, weight) AS (
    VALUES
      ('A', 0.90::numeric, 0, 0.5::numeric),  ('A', 0.90, 1, 0.5),
      ('B', 0.75, 1, 0.3333),                 ('B', 0.75, 2, 0.3333), ('B', 0.75, 3, 0.3334),
      ('C', 0.55, 2, 0.25),  ('C', 0.55, 3, 0.25), ('C', 0.55, 4, 0.25), ('C', 0.55, 5, 0.25),
      ('D', 0.35, 3, 0.2),   ('D', 0.35, 4, 0.2),  ('D', 0.35, 5, 0.2),  ('D', 0.35, 6, 0.2),  ('D', 0.35, 7, 0.2),
      ('E', 0.15, 3, 0.2),   ('E', 0.15, 4, 0.2),  ('E', 0.15, 5, 0.2),  ('E', 0.15, 6, 0.2),  ('E', 0.15, 7, 0.2)
  ),
  overdue_week AS (
    SELECT sp.idx, SUM(o.saldo * sp.rate * sp.weight) AS recup
    FROM overdue o
    JOIN spread sp ON sp.bucket = o.bucket
    GROUP BY sp.idx
  ),
  live_esperado AS (
    SELECT s.idx, fc.natural_esperado + COALESCE(ow.recup, 0) AS esperado
    FROM semanas s
    JOIN fact_sem_calc fc ON fc.idx = s.idx
    LEFT JOIN overdue_week ow ON ow.idx = s.idx
  ),
  fact_sem_final AS (
    SELECT le.idx,
      ROUND(COALESCE(
        CASE WHEN p_ignore_snapshot THEN NULL::numeric ELSE sn.esperado_facturas END,
        -- Semanas pasadas SIN snapshot: NULL a propósito (el cálculo en vivo
        -- ya no ve las facturas pagadas y daría un esperado engañoso).
        CASE WHEN s.idx < 0 THEN NULL::numeric ELSE le.esperado END
      )) AS esperado_facturas
    FROM live_esperado le
    JOIN semanas s ON s.idx = le.idx
    LEFT JOIN tbl_proyeccion_semana_snapshot sn ON sn.semana_inicio = s.inicio
  ),
  cob_sem AS (
    SELECT s.idx, COALESCE(SUM(p.monto_pago), 0) AS cobrado
    FROM semanas s
    LEFT JOIN tbl_pagos p
      ON p.fecha_pago BETWEEN s.inicio AND s.fin
      AND NOT EXISTS (SELECT 1 FROM tbl_pagos_anulados pa WHERE pa.no_recibo = p.no_recibo)
    GROUP BY s.idx
  ),
  mora_vencida_cte AS (
    SELECT ROUND(COALESCE(SUM(saldo), 0)) AS total FROM overdue
  ),
  totales AS (
    SELECT
      ROUND(COALESCE(SUM(ff.esperado_facturas), 0)) AS tot_esp,
      ROUND(COALESCE(SUM(cs.cobrado), 0)) AS tot_cob
    FROM fact_sem_final ff
    JOIN cob_sem cs ON cs.idx = ff.idx
    WHERE ff.idx >= -1
  )
  SELECT json_build_object(
    'kpis', json_build_object(
      'horizonte_semanas', p_semanas,
      'total_esperado',    (SELECT tot_esp FROM totales),
      'total_cobrado',     (SELECT tot_cob FROM totales),
      'mora_vencida',      (SELECT total   FROM mora_vencida_cte)
    ),
    'semanas', (
      SELECT COALESCE(json_agg(json_build_object(
          'idx',               s.idx,
          'tipo',              s.tipo,
          'inicio',            s.inicio,
          'fin',               s.fin,
          'esperado_facturas', ff.esperado_facturas,
          'cobrado',           ROUND(cs.cobrado),
          'cumplimiento',      CASE WHEN ff.esperado_facturas > 0
                                    THEN ROUND(cs.cobrado / ff.esperado_facturas * 100, 1)
                                    ELSE NULL END
        ) ORDER BY s.idx), '[]'::json)
      FROM semanas s
      JOIN fact_sem_final ff ON ff.idx = s.idx
      JOIN cob_sem cs ON cs.idx = s.idx
    )
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_recuperacion(p_anio integer, p_mes integer)
  RETURNS json
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  v_ini date; v_fin date; v_hoy date; v_dias_mes int; v_dias_trans int; v_factor numeric; v_frozen boolean; v_result json;
BEGIN
  v_ini := make_date(p_anio,p_mes,1);
  v_fin := (v_ini + interval '1 month - 1 day')::date;
  v_hoy := (now() AT TIME ZONE 'America/Costa_Rica')::date;
  v_dias_mes := EXTRACT(DAY FROM v_fin)::int;
  v_dias_trans := CASE WHEN v_hoy>=v_fin THEN v_dias_mes WHEN v_hoy<v_ini THEN 0 ELSE (v_hoy-v_ini+1) END;
  v_factor := CASE WHEN v_dias_trans>0 THEN v_dias_mes::numeric/v_dias_trans ELSE 0 END;
  SELECT EXISTS(SELECT 1 FROM tbl_presupuesto_cobro WHERE anio=p_anio AND mes=p_mes) INTO v_frozen;

  WITH cob_cod AS (
    SELECT p.cliente_cod, SUM(p.monto_pago)::numeric AS cobrado
    FROM tbl_pagos p
    WHERE p.fecha_pago BETWEEN v_ini AND v_fin AND COALESCE(p.cliente_cod,'')<>''
      AND NOT EXISTS (SELECT 1 FROM tbl_pagos_anulados pa WHERE pa.no_recibo = p.no_recibo)
    GROUP BY p.cliente_cod
  ),
  ppto AS (
    SELECT pc.vendedor_cod, pc.vendedor_nombre, pc.cliente_cod, pc.cliente_nombre, pc.contribuyente, pc.ppto_total
    FROM tbl_presupuesto_cobro pc WHERE pc.anio=p_anio AND pc.mes=p_mes
  ),
  cli AS (
    SELECT p.vendedor_cod, p.cliente_cod, p.cliente_nombre, p.ppto_total AS meta, COALESCE(cc.cobrado,0) AS cobrado
    FROM ppto p LEFT JOIN cob_cod cc ON cc.cliente_cod=p.cliente_cod
  ),
  metas AS (
    SELECT vendedor_cod, vendedor_nombre, COALESCE(meta_ajustada, meta_sugerida) AS meta
    FROM tbl_presupuesto_meta_vendedor WHERE anio=p_anio AND mes=p_mes
  ),
  vend AS (
    SELECT m.vendedor_cod, m.vendedor_nombre, m.meta,
      COALESCE((SELECT SUM(cli.cobrado) FROM cli WHERE cli.vendedor_cod=m.vendedor_cod),0) AS cobrado,
      (SELECT COALESCE(json_agg(json_build_object(
          'cliente_cod', cli.cliente_cod, 'cliente_nombre', cli.cliente_nombre,
          'meta', ROUND(cli.meta), 'cobrado', ROUND(cli.cobrado),
          'pct', CASE WHEN cli.meta>0 THEN ROUND(cli.cobrado/cli.meta*100,1) ELSE NULL END
        ) ORDER BY cli.meta DESC), '[]'::json) FROM cli WHERE cli.vendedor_cod=m.vendedor_cod) AS clientes
    FROM metas m
  ),
  vend2 AS (
    SELECT v.*, ROUND(v.cobrado*v_factor) AS proyeccion,
           CASE WHEN ve.activo THEN ve.email END         AS vendedor_email,
           su.email         AS supervisor_email,
           ve.analista_email
    FROM vend v
    LEFT JOIN tbl_vendedores   ve ON ve.cod=v.vendedor_cod
    LEFT JOIN tbl_supervisores su ON su.cod=ve.supervisor_cod
  ),
  serie AS (
    SELECT p.fecha_pago AS dia, SUM(p.monto_pago)::numeric AS monto
    FROM tbl_pagos p
    WHERE p.fecha_pago BETWEEN v_ini AND v_fin
      AND (NOT v_frozen OR p.cliente_cod IN (SELECT cliente_cod FROM ppto))
      AND NOT EXISTS (SELECT 1 FROM tbl_pagos_anulados pa WHERE pa.no_recibo = p.no_recibo)
    GROUP BY p.fecha_pago
  )
  SELECT json_build_object(
    'kpis', json_build_object(
      'anio',p_anio,'mes',p_mes,'congelado',v_frozen,
      'meta_total',    (SELECT ROUND(COALESCE(SUM(meta),0)) FROM vend2),
      'cobrado_total', (SELECT ROUND(COALESCE(SUM(cobrado),0)) FROM vend2),
      'pct',           (SELECT CASE WHEN COALESCE(SUM(meta),0)>0 THEN ROUND(SUM(cobrado)/SUM(meta)*100,1) ELSE 0 END FROM vend2),
      'proyeccion_fin_mes', (SELECT ROUND(COALESCE(SUM(proyeccion),0)) FROM vend2),
      'pct_proyectado', (SELECT CASE WHEN COALESCE(SUM(meta),0)>0 THEN ROUND(SUM(proyeccion)/SUM(meta)*100,1) ELSE 0 END FROM vend2),
      'dias_mes',v_dias_mes,'dias_transcurridos',v_dias_trans
    ),
    'vendedores', (SELECT COALESCE(json_agg(json_build_object(
        'vendedor_cod',vendedor_cod,'vendedor_nombre',vendedor_nombre,
        'vendedor_email',vendedor_email,'supervisor_email',supervisor_email,
        'analista_email',analista_email,
        'meta',ROUND(meta),'cobrado',ROUND(cobrado),'proyeccion',proyeccion,
        'pct', CASE WHEN meta>0 THEN ROUND(cobrado/meta*100,1) ELSE NULL END,
        'pct_proyectado', CASE WHEN meta>0 THEN ROUND(proyeccion/meta*100,1) ELSE NULL END,
        'clientes', clientes
      ) ORDER BY meta DESC), '[]'::json) FROM vend2),
    'serie', (SELECT COALESCE(json_agg(json_build_object('dia',dia,'monto',ROUND(monto)) ORDER BY dia), '[]'::json) FROM serie)
  ) INTO v_result;
  RETURN v_result;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_recuperacion_mom(p_meses integer DEFAULT 13, p_email text DEFAULT NULL::text)
  RETURNS json
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  v_result   json;
  v_cr_now   date := (now() AT TIME ZONE 'America/Costa_Rica')::date;
  v_cur_month date := date_trunc('month', v_cr_now)::date;
BEGIN
  WITH months AS (
    SELECT
      (v_cur_month - (n * INTERVAL '1 month'))::date AS mes_ini
    FROM generate_series(0, p_meses - 1) AS gs(n)
    ORDER BY mes_ini ASC
  ),
  mc_cod AS (
    SELECT DISTINCT ON (m.cliente_cod)
      m.cliente_cod,
      NULLIF(m.analista_email,'') AS analista_email
    FROM tbl_maestro_clientes m
    ORDER BY m.cliente_cod, m.id DESC
  ),
  monthly AS (
    SELECT
      m.mes_ini,
      EXTRACT(YEAR  FROM m.mes_ini)::int AS anio,
      EXTRACT(MONTH FROM m.mes_ini)::int AS mes,
      ((m.mes_ini + INTERVAL '1 month')::date - m.mes_ini)::int AS dias_mes,
      COALESCE(SUM(p.monto_pago), 0)::numeric AS total,
      COUNT(p.id)::int AS n_pagos,
      COUNT(DISTINCT p.cliente_cod)::int AS n_clientes
    FROM months m
    LEFT JOIN tbl_pagos p
      ON  p.fecha_pago >= m.mes_ini
      AND p.fecha_pago <  (m.mes_ini + INTERVAL '1 month')::date
      AND NOT EXISTS (SELECT 1 FROM tbl_pagos_anulados pa WHERE pa.no_recibo = p.no_recibo)
      AND (
        p_email IS NULL
        OR EXISTS (
          SELECT 1 FROM mc_cod mc
          WHERE mc.cliente_cod    = p.cliente_cod
            AND mc.analista_email = p_email
        )
      )
    GROUP BY m.mes_ini
    ORDER BY m.mes_ini
  )
  SELECT json_agg(
    json_build_object(
      'mes_ini',        mes_ini,
      'anio',           anio,
      'mes',            mes,
      'dias_mes',       dias_mes,
      'total',          ROUND(total)::bigint,
      'n_pagos',        n_pagos,
      'n_clientes',     n_clientes,
      'promedio_diario',
        CASE WHEN dias_mes > 0 THEN ROUND(total / dias_mes)::bigint ELSE 0 END
    )
    ORDER BY mes_ini
  )
  INTO v_result
  FROM monthly;

  RETURN COALESCE(v_result, '[]'::json);
END; $fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_recuperacion_periodo(p_ini date, p_fin date, p_email text DEFAULT NULL::text, p_group text DEFAULT 'analista'::text)
  RETURNS json
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE v_result json;
BEGIN
  WITH mc_cod AS (
    SELECT DISTINCT ON (m.cliente_cod)
      m.cliente_cod,
      NULLIF(m.analista_email,'')                                                       AS analista_email,
      COALESCE(NULLIF(u.nombre,''), NULLIF(m.analista_nombre,''), 'Sin analista')        AS analista,
      COALESCE(NULLIF(m.vendedor_nombre,''), 'Sin vendedor')                             AS vendedor
    FROM tbl_maestro_clientes m
    LEFT JOIN tbl_usuarios u ON lower(u.email) = lower(m.analista_email)
    ORDER BY m.cliente_cod, m.id DESC
  ),
  pg AS (
    SELECT p.contribuyente, p.cliente_cod, p.nombre_cliente, p.monto_pago, p.fecha_pago
    FROM tbl_pagos p
    WHERE p.fecha_pago BETWEEN p_ini AND p_fin
      AND NOT EXISTS (SELECT 1 FROM tbl_pagos_anulados pa WHERE pa.no_recibo = p.no_recibo)
  ),
  j AS (
    SELECT pg.*, mc.analista_email,
      COALESCE(mc.analista,'Sin analista') AS analista,
      COALESCE(mc.vendedor,'Sin vendedor') AS vendedor
    FROM pg LEFT JOIN mc_cod mc ON mc.cliente_cod = pg.cliente_cod
    WHERE (p_email IS NULL OR mc.analista_email = p_email)
  ),
  grp AS (
    SELECT CASE WHEN p_group='vendedor' THEN vendedor ELSE analista END AS nombre,
      SUM(monto_pago)::numeric AS cobrado, COUNT(*)::int AS n_pagos, COUNT(DISTINCT cliente_cod)::int AS n_clientes
    FROM j GROUP BY 1
  ),
  serie AS (
    SELECT fecha_pago AS dia, SUM(monto_pago)::numeric AS monto FROM j GROUP BY fecha_pago
  ),
  topc AS (
    SELECT cliente_cod, MAX(nombre_cliente) AS cliente_nombre, MAX(analista) AS analista, MAX(vendedor) AS vendedor,
      SUM(monto_pago)::numeric AS cobrado
    FROM j GROUP BY cliente_cod ORDER BY SUM(monto_pago) DESC LIMIT 20
  )
  SELECT json_build_object(
    'kpis', json_build_object(
      'ini', p_ini, 'fin', p_fin,
      'total',      (SELECT ROUND(COALESCE(SUM(monto_pago),0)) FROM j),
      'n_pagos',    (SELECT COUNT(*) FROM j),
      'n_clientes', (SELECT COUNT(DISTINCT cliente_cod) FROM j),
      'dias',       (p_fin - p_ini + 1)
    ),
    'grupos', (SELECT COALESCE(json_agg(json_build_object('nombre',nombre,'cobrado',ROUND(cobrado),'n_pagos',n_pagos,'n_clientes',n_clientes) ORDER BY cobrado DESC),'[]'::json) FROM grp),
    'serie',  (SELECT COALESCE(json_agg(json_build_object('dia',dia,'monto',ROUND(monto)) ORDER BY dia),'[]'::json) FROM serie),
    'top_clientes', (SELECT COALESCE(json_agg(json_build_object('cliente_cod',cliente_cod,'cliente_nombre',cliente_nombre,'analista',analista,'vendedor',vendedor,'cobrado',ROUND(cobrado))),'[]'::json) FROM topc)
  ) INTO v_result;
  RETURN v_result;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_recuperacion_tramos(p_ini date, p_fin date, p_email text DEFAULT NULL::text, p_group text DEFAULT 'analista'::text)
  RETURNS json
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE v_result json;
BEGIN
  WITH mc_cod AS (
    SELECT DISTINCT ON (m.cliente_cod)
      m.cliente_cod,
      NULLIF(m.analista_email,'') AS analista_email,
      COALESCE(NULLIF(u.nombre,''), NULLIF(m.analista_nombre,''), 'Sin analista') AS analista,
      COALESCE(NULLIF(m.vendedor_nombre,''), 'Sin vendedor') AS vendedor
    FROM tbl_maestro_clientes m
    LEFT JOIN tbl_usuarios u ON lower(u.email) = lower(m.analista_email)
    ORDER BY m.cliente_cod, m.id DESC
  ),
  pg AS (
    SELECT p.cliente_cod, p.nombre_cliente, p.monto_pago,
           COALESCE(p.dias_atraso, 0) AS dias_atraso
    FROM tbl_pagos p
    WHERE p.fecha_pago BETWEEN p_ini AND p_fin
      AND NOT EXISTS (SELECT 1 FROM tbl_pagos_anulados pa WHERE pa.no_recibo = p.no_recibo)
  ),
  j AS (
    SELECT pg.*, mc.analista_email,
      COALESCE(mc.analista,'Sin analista') AS analista,
      COALESCE(mc.vendedor,'Sin vendedor') AS vendedor,
      CASE
        WHEN pg.dias_atraso <= 0  THEN 'no_vencido'
        WHEN pg.dias_atraso <= 30 THEN 'mora_1_30'
        WHEN pg.dias_atraso <= 60 THEN 'mora_31_60'
        WHEN pg.dias_atraso <= 90 THEN 'mora_61_90'
        WHEN pg.dias_atraso <= 120 THEN 'mora_91_120'
        ELSE 'mora_120_plus'
      END AS tramo
    FROM pg
    LEFT JOIN mc_cod mc ON mc.cliente_cod = pg.cliente_cod
    WHERE (p_email IS NULL OR mc.analista_email = p_email)
  ),
  grp AS (
    SELECT
      CASE WHEN p_group = 'vendedor' THEN vendedor ELSE analista END AS nombre,
      ROUND(SUM(monto_pago))::bigint AS total,
      ROUND(SUM(CASE WHEN tramo='no_vencido'   THEN monto_pago ELSE 0 END))::bigint AS no_vencido,
      ROUND(SUM(CASE WHEN tramo='mora_1_30'    THEN monto_pago ELSE 0 END))::bigint AS mora_1_30,
      ROUND(SUM(CASE WHEN tramo='mora_31_60'   THEN monto_pago ELSE 0 END))::bigint AS mora_31_60,
      ROUND(SUM(CASE WHEN tramo='mora_61_90'   THEN monto_pago ELSE 0 END))::bigint AS mora_61_90,
      ROUND(SUM(CASE WHEN tramo='mora_91_120'  THEN monto_pago ELSE 0 END))::bigint AS mora_91_120,
      ROUND(SUM(CASE WHEN tramo='mora_120_plus' THEN monto_pago ELSE 0 END))::bigint AS mora_120_plus
    FROM j
    GROUP BY 1
    ORDER BY total DESC
  ),
  kpi AS (
    SELECT
      ROUND(COALESCE(SUM(monto_pago),0))::bigint AS total,
      COUNT(*)::int AS n_pagos,
      COUNT(DISTINCT cliente_cod)::int AS n_clientes,
      ROUND(COALESCE(SUM(CASE WHEN tramo='no_vencido'    THEN monto_pago ELSE 0 END),0))::bigint AS no_vencido,
      ROUND(COALESCE(SUM(CASE WHEN tramo='mora_1_30'     THEN monto_pago ELSE 0 END),0))::bigint AS mora_1_30,
      ROUND(COALESCE(SUM(CASE WHEN tramo='mora_31_60'    THEN monto_pago ELSE 0 END),0))::bigint AS mora_31_60,
      ROUND(COALESCE(SUM(CASE WHEN tramo='mora_61_90'    THEN monto_pago ELSE 0 END),0))::bigint AS mora_61_90,
      ROUND(COALESCE(SUM(CASE WHEN tramo='mora_91_120'   THEN monto_pago ELSE 0 END),0))::bigint AS mora_91_120,
      ROUND(COALESCE(SUM(CASE WHEN tramo='mora_120_plus' THEN monto_pago ELSE 0 END),0))::bigint AS mora_120_plus
    FROM j
  )
  SELECT json_build_object(
    'kpis', (
      SELECT json_build_object(
        'ini', p_ini, 'fin', p_fin,
        'total', total, 'n_pagos', n_pagos, 'n_clientes', n_clientes,
        'dias', (p_fin - p_ini + 1),
        'no_vencido', no_vencido, 'mora_1_30', mora_1_30,
        'mora_31_60', mora_31_60, 'mora_61_90', mora_61_90,
        'mora_91_120', mora_91_120, 'mora_120_plus', mora_120_plus
      ) FROM kpi
    ),
    'grupos', (
      SELECT COALESCE(
        json_agg(json_build_object(
          'nombre', nombre, 'total', total,
          'no_vencido', no_vencido, 'mora_1_30', mora_1_30,
          'mora_31_60', mora_31_60, 'mora_61_90', mora_61_90,
          'mora_91_120', mora_91_120, 'mora_120_plus', mora_120_plus
        ) ORDER BY total DESC),
        '[]'::json
      ) FROM grp
    )
  ) INTO v_result;
  RETURN v_result;
END; $fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_registrar_historico_cartera(p_fecha date DEFAULT CURRENT_DATE)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  v_cartera_total numeric;
  v_mora_total    numeric;
  v_mora_31_plus  numeric;
  v_pct_mora      numeric;
  v_pct_mora_31   numeric;
  v_n_en_mora     bigint;
BEGIN
  SELECT
    COALESCE(SUM(total), 0),
    COALESCE(SUM(
      mora_1_30 + mora_31_60 + mora_61_90 +
      GREATEST(0, mora_91_120) + mora_120_plus
    ), 0),
    COALESCE(SUM(
      mora_31_60 + mora_61_90 +
      GREATEST(0, mora_91_120) + mora_120_plus
    ), 0),
    COUNT(*) FILTER (WHERE
      (mora_1_30 + mora_31_60 + mora_61_90 +
       GREATEST(0, mora_91_120) + mora_120_plus) > 0
    )
  INTO v_cartera_total, v_mora_total, v_mora_31_plus, v_n_en_mora
  FROM cof_prd_cyc_cofersa_sch_core.tbl_cartera;

  v_pct_mora    = CASE WHEN v_cartera_total > 0
                    THEN ROUND((v_mora_total / v_cartera_total * 100)::numeric, 2)
                    ELSE 0 END;
  v_pct_mora_31 = CASE WHEN v_cartera_total > 0
                    THEN ROUND((v_mora_31_plus / v_cartera_total * 100)::numeric, 2)
                    ELSE 0 END;

  INSERT INTO cof_prd_cyc_cofersa_sch_core.tbl_historico_cartera
    (fecha, cartera_total, mora_total, mora_31_plus, pct_mora, pct_mora_31, n_en_mora)
  VALUES
    (p_fecha, v_cartera_total, v_mora_total, v_mora_31_plus,
     v_pct_mora, v_pct_mora_31, v_n_en_mora)
  ON CONFLICT (fecha) DO UPDATE SET
    cartera_total = EXCLUDED.cartera_total,
    mora_total    = EXCLUDED.mora_total,
    mora_31_plus  = EXCLUDED.mora_31_plus,
    pct_mora      = EXCLUDED.pct_mora,
    pct_mora_31   = EXCLUDED.pct_mora_31,
    n_en_mora     = EXCLUDED.n_en_mora;

  RETURN jsonb_build_object(
    'fecha',         p_fecha,
    'cartera_total', v_cartera_total,
    'mora_total',    v_mora_total,
    'mora_31_plus',  v_mora_31_plus,
    'pct_mora',      v_pct_mora,
    'pct_mora_31',   v_pct_mora_31,
    'n_en_mora',     v_n_en_mora
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_reporte_aging()
  RETURNS json
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE v_sync text; v_result json;
BEGIN
  SELECT sync_id INTO v_sync FROM tbl_cartera ORDER BY updated_at DESC LIMIT 1;

  WITH base AS (
    SELECT
      c.cliente_cod,
      COALESCE(NULLIF(mc.analista_nombre,''), 'Sin analista')                                AS analista,
      COALESCE(NULLIF(mc.vendedor_nombre,''), NULLIF(c.vendedor_nombre,''), 'Sin vendedor')  AS vendedor,
      c.no_vencido AS nv, c.mora_1_30 AS m1, c.mora_31_60 AS m2, c.mora_61_90 AS m3,
      c.mora_91_120 AS m4, c.mora_120_plus AS m5, c.total AS tot
    FROM tbl_cartera c
    LEFT JOIN tbl_maestro_clientes mc ON mc.cliente_cod=c.cliente_cod AND mc.contribuyente=c.contribuyente
    WHERE c.sync_id = v_sync
  ),
  grp AS (
    SELECT 'analista'::text AS dim, analista AS nombre,
      COUNT(*)::int n_clientes, SUM(nv) nv, SUM(m1) m1, SUM(m2) m2, SUM(m3) m3, SUM(m4) m4, SUM(m5) m5, SUM(tot) tot
    FROM base GROUP BY analista
    UNION ALL
    SELECT 'vendedor', vendedor,
      COUNT(*)::int, SUM(nv), SUM(m1), SUM(m2), SUM(m3), SUM(m4), SUM(m5), SUM(tot)
    FROM base GROUP BY vendedor
  ),
  filas AS (
    SELECT dim, nombre, n_clientes, nv, m1, m2, m3, m4, m5, tot,
      (m1+m2+m3+m4+m5) AS mora_total,
      CASE WHEN tot>0 THEN ROUND((m1+m2+m3+m4+m5)/tot*100,1) ELSE 0 END AS pct_mora
    FROM grp
  )
  SELECT json_build_object(
    'consolidado', (SELECT json_build_object(
        'n_clientes', COUNT(*), 'no_vencido', ROUND(SUM(nv)), 'm1_30', ROUND(SUM(m1)),
        'm31_60', ROUND(SUM(m2)), 'm61_90', ROUND(SUM(m3)), 'm91_120', ROUND(SUM(m4)),
        'm120', ROUND(SUM(m5)), 'mora_total', ROUND(SUM(m1+m2+m3+m4+m5)), 'total', ROUND(SUM(tot)),
        'pct_mora', CASE WHEN SUM(tot)>0 THEN ROUND(SUM(m1+m2+m3+m4+m5)/SUM(tot)*100,1) ELSE 0 END
      ) FROM base),
    'por_analista', (SELECT COALESCE(json_agg(json_build_object(
        'nombre',nombre,'n_clientes',n_clientes,'no_vencido',ROUND(nv),'m1_30',ROUND(m1),'m31_60',ROUND(m2),
        'm61_90',ROUND(m3),'m91_120',ROUND(m4),'m120',ROUND(m5),'mora_total',ROUND(mora_total),'total',ROUND(tot),'pct_mora',pct_mora
      ) ORDER BY tot DESC),'[]'::json) FROM filas WHERE dim='analista'),
    'por_vendedor', (SELECT COALESCE(json_agg(json_build_object(
        'nombre',nombre,'n_clientes',n_clientes,'no_vencido',ROUND(nv),'m1_30',ROUND(m1),'m31_60',ROUND(m2),
        'm61_90',ROUND(m3),'m91_120',ROUND(m4),'m120',ROUND(m5),'mora_total',ROUND(mora_total),'total',ROUND(tot),'pct_mora',pct_mora
      ) ORDER BY tot DESC),'[]'::json) FROM filas WHERE dim='vendedor')
  ) INTO v_result;
  RETURN v_result;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_reporte_bloqueados(p_email text DEFAULT NULL::text)
  RETURNS json
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  v_lunes       date;
  v_latest_sync text;
  v_result      json;
BEGIN
  v_lunes := date_trunc('week', (now() AT TIME ZONE 'America/Costa_Rica')::date)::date;
  SELECT sync_id INTO v_latest_sync FROM tbl_cartera ORDER BY updated_at DESC LIMIT 1;

  WITH base AS (
    SELECT
      c.cliente_cod, c.cliente_nombre,
      COALESCE(NULLIF(mc.vendedor_cod,''), '—')                                            AS vendedor_cod,
      COALESCE(NULLIF(mc.vendedor_nombre,''), NULLIF(c.vendedor_nombre,''), 'Sin vendedor') AS vendedor_nombre,
      NULLIF(mc.analista_email,'')                                                          AS analista_email,
      GREATEST(c.no_vencido,0)    AS no_vencido,
      GREATEST(c.mora_1_30,0)     AS m1_30,
      GREATEST(c.mora_31_60,0)    AS m31_60,
      GREATEST(c.mora_61_90,0)    AS m61_90,
      GREATEST(c.mora_91_120,0)   AS m91_120,
      GREATEST(c.mora_120_plus,0) AS m120,
      GREATEST(c.total,0)         AS total,
      (GREATEST(c.mora_31_60,0)+GREATEST(c.mora_61_90,0)+GREATEST(c.mora_91_120,0)+GREATEST(c.mora_120_plus,0)) AS saldo_vencido
    FROM tbl_cartera c
    LEFT JOIN tbl_maestro_clientes mc ON mc.cliente_cod = c.cliente_cod AND mc.contribuyente = c.contribuyente
    WHERE c.sync_id = v_latest_sync
      AND (GREATEST(c.mora_31_60,0)+GREATEST(c.mora_61_90,0)+GREATEST(c.mora_91_120,0)+GREATEST(c.mora_120_plus,0)) >= 1000
      -- Filtro por analista: si se pasa email, solo sus clientes
      AND (p_email IS NULL OR lower(NULLIF(mc.analista_email,'')) = lower(p_email))
  ),
  weeks AS (
    SELECT fecha_semana, row_number() OVER (ORDER BY fecha_semana DESC) AS rn
    FROM (SELECT DISTINCT fecha_semana FROM tbl_historico_bloqueados WHERE fecha_semana < v_lunes) d
  ),
  nweeks AS (SELECT COUNT(*)::int AS n FROM weeks),
  present AS (
    SELECT h.cliente_cod, w.rn
    FROM tbl_historico_bloqueados h JOIN weeks w ON h.fecha_semana = w.fecha_semana
  ),
  firstgap AS (
    SELECT b.cliente_cod, MIN(w.rn) AS gap_rn
    FROM base b CROSS JOIN weeks w
    LEFT JOIN present p ON p.cliente_cod = b.cliente_cod AND p.rn = w.rn
    WHERE p.rn IS NULL
    GROUP BY b.cliente_cod
  ),
  semanas AS (
    SELECT b.cliente_cod,
      NOT EXISTS (SELECT 1 FROM present p WHERE p.cliente_cod = b.cliente_cod) AS es_nuevo,
      1 + CASE WHEN fg.gap_rn IS NULL THEN (SELECT n FROM nweeks) ELSE fg.gap_rn - 1 END AS semanas
    FROM base b LEFT JOIN firstgap fg ON fg.cliente_cod = b.cliente_cod
  ),
  clientes AS (
    SELECT b.*, s.semanas, s.es_nuevo
    FROM base b JOIN semanas s ON s.cliente_cod = b.cliente_cod
  ),
  vend_agg AS (
    SELECT
      cl.vendedor_cod, cl.vendedor_nombre,
      MAX(v.supervisor_cod)                                                                          AS supervisor_cod,
      MAX(v.email) FILTER (WHERE v.activo)                                                                                   AS vendedor_email,
      MAX(sup.email)                                                                                 AS supervisor_email,
      COUNT(*)::int                                                                                  AS n_clientes,
      SUM(cl.saldo_vencido)                                                                          AS saldo_vencido,
      COUNT(*) FILTER (WHERE cl.m120 > 0)::int                                                       AS criticos_120,
      COALESCE(to_json(ARRAY_AGG(DISTINCT cl.analista_email) FILTER (WHERE cl.analista_email IS NOT NULL)), '[]'::json) AS analistas_email,
      json_agg(json_build_object(
        'cliente_cod', cl.cliente_cod, 'cliente_nombre', cl.cliente_nombre,
        'no_vencido', ROUND(cl.no_vencido), 'm1_30', ROUND(cl.m1_30), 'm31_60', ROUND(cl.m31_60),
        'm61_90', ROUND(cl.m61_90), 'm91_120', ROUND(cl.m91_120), 'm120', ROUND(cl.m120),
        'total', ROUND(cl.total), 'saldo_vencido', ROUND(cl.saldo_vencido),
        'semanas', cl.semanas, 'es_nuevo', cl.es_nuevo
      ) ORDER BY cl.saldo_vencido DESC) AS clientes
    FROM clientes cl
    LEFT JOIN tbl_vendedores v   ON v.cod = cl.vendedor_cod
    LEFT JOIN tbl_supervisores sup ON sup.cod = v.supervisor_cod
    GROUP BY cl.vendedor_cod, cl.vendedor_nombre
  )
  SELECT json_build_object(
    'kpis', json_build_object(
      'total_bloqueados',    (SELECT COUNT(*) FROM clientes),
      'saldo_vencido_total', (SELECT ROUND(COALESCE(SUM(saldo_vencido),0)) FROM clientes),
      'criticos_120',        (SELECT COUNT(*) FROM clientes WHERE m120 > 0),
      'total_vendedores',    (SELECT COUNT(*) FROM vend_agg),
      'fecha_semana',        v_lunes
    ),
    'vendedores', (SELECT COALESCE(json_agg(json_build_object(
        'vendedor_cod', vendedor_cod, 'vendedor_nombre', vendedor_nombre,
        'supervisor_cod', supervisor_cod, 'vendedor_email', vendedor_email,
        'supervisor_email', supervisor_email, 'analistas_email', analistas_email,
        'n_clientes', n_clientes, 'saldo_vencido', ROUND(saldo_vencido),
        'criticos_120', criticos_120, 'clientes', clientes
      ) ORDER BY saldo_vencido DESC), '[]'::json) FROM vend_agg),
    'gerencial', (SELECT COALESCE(json_agg(json_build_object(
        'vendedor_nombre', vendedor_nombre, 'n_clientes', n_clientes,
        'saldo_vencido', ROUND(saldo_vencido), 'criticos_120', criticos_120
      ) ORDER BY saldo_vencido DESC), '[]'::json) FROM vend_agg),
    'escalacion', (SELECT COALESCE(json_agg(json_build_object(
        'cliente_cod', cliente_cod, 'cliente_nombre', cliente_nombre,
        'vendedor_nombre', vendedor_nombre, 'semanas', semanas, 'saldo_vencido', ROUND(saldo_vencido)
      ) ORDER BY semanas DESC, saldo_vencido DESC), '[]'::json)
      FROM clientes WHERE semanas >= 3)
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_reporte_cei(p_anio integer, p_mes integer)
  RETURNS json
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  v_ini date; v_fin date;
  v_open date; v_open_anio int; v_open_mes int;
  v_provisional boolean; v_result json;
BEGIN
  v_ini := make_date(p_anio, p_mes, 1);
  v_fin := (v_ini + interval '1 month - 1 day')::date;
  v_open      := (v_ini - interval '1 month')::date;
  v_open_anio := EXTRACT(YEAR  FROM v_open)::int;
  v_open_mes  := EXTRACT(MONTH FROM v_open)::int;

  SELECT bool_or(provisional) INTO v_provisional
  FROM tbl_historico_cierres_cartera WHERE anio=v_open_anio AND mes=v_open_mes;

  WITH cod_vend AS (
    SELECT DISTINCT ON (m.cliente_cod)
      m.cliente_cod,
      COALESCE(NULLIF(m.vendedor_cod,''),'—')               AS vendedor_cod,
      COALESCE(NULLIF(m.vendedor_nombre,''),'Sin vendedor') AS vendedor_nombre
    FROM tbl_maestro_clientes m
    ORDER BY m.cliente_cod, m.id DESC
  ),
  venc AS (
    SELECT h.vendedor_cod, h.saldo_vencido_cierre AS vencido
    FROM tbl_historico_cierres_cartera h
    WHERE h.anio=v_open_anio AND h.mes=v_open_mes
  ),
  cob AS (
    SELECT cv.vendedor_cod, SUM(p.monto_pago) AS cobrado
    FROM tbl_pagos p JOIN cod_vend cv ON cv.cliente_cod=p.cliente_cod
    WHERE p.fecha_pago BETWEEN v_ini AND v_fin
      AND NOT EXISTS (SELECT 1 FROM tbl_pagos_anulados pa WHERE pa.no_recibo = p.no_recibo)
    GROUP BY cv.vendedor_cod
  ),
  spine AS (
    SELECT cod AS vendedor_cod FROM tbl_vendedores WHERE activo=true
    UNION SELECT vendedor_cod FROM venc
    UNION SELECT vendedor_cod FROM cob
  ),
  base AS (
    SELECT sp.vendedor_cod,
      COALESCE(NULLIF(v.nombre,''), MAX(cvn.vendedor_nombre), sp.vendedor_cod) AS vendedor_nombre,
      v.supervisor_cod,
      COALESCE(NULLIF(s.nombre,''), 'Sin supervisor') AS supervisor_nombre,
      NULLIF(v.analista_email,'') AS analista_email,
      COALESCE(NULLIF(u.nombre,''), 'Sin analista') AS analista_nombre,
      COALESCE(vc.vencido,0) AS vencido,
      COALESCE(cb.cobrado,0) AS cobrado
    FROM spine sp
    LEFT JOIN tbl_vendedores v   ON v.cod=sp.vendedor_cod
    LEFT JOIN tbl_supervisores s ON s.cod=v.supervisor_cod
    LEFT JOIN tbl_usuarios u     ON lower(u.email)=lower(v.analista_email)
    LEFT JOIN venc vc ON vc.vendedor_cod=sp.vendedor_cod
    LEFT JOIN cob  cb ON cb.vendedor_cod=sp.vendedor_cod
    LEFT JOIN cod_vend cvn ON cvn.vendedor_cod=sp.vendedor_cod
    WHERE sp.vendedor_cod <> '—'
    GROUP BY sp.vendedor_cod, v.nombre, v.supervisor_cod, s.nombre, v.analista_email, u.nombre, vc.vencido, cb.cobrado
  )
  SELECT COALESCE(json_agg(json_build_object(
    'vendedor_cod', vendedor_cod, 'vendedor_nombre', vendedor_nombre,
    'supervisor_cod', supervisor_cod, 'supervisor_nombre', supervisor_nombre,
    'analista_email', analista_email, 'analista_nombre', analista_nombre,
    'cobrado', ROUND(cobrado), 'vencido', ROUND(vencido),
    'cei', CASE WHEN vencido > 0 THEN ROUND(cobrado/vencido*100, 1) ELSE NULL END,
    'provisional', COALESCE(v_provisional, false),
    'apertura_anio', v_open_anio, 'apertura_mes', v_open_mes
  ) ORDER BY (CASE WHEN vencido>0 THEN cobrado/vencido ELSE -1 END) DESC), '[]'::json)
  INTO v_result FROM base;

  RETURN v_result;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_reporte_efectividad(p_ini date DEFAULT (date_trunc('month'::text, (now() AT TIME ZONE 'America/Costa_Rica'::text)))::date, p_fin date DEFAULT ((now() AT TIME ZONE 'America/Costa_Rica'::text))::date, p_email text DEFAULT NULL::text)
  RETURNS json
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE v_result json;
BEGIN
  WITH gest AS (
    SELECT
      g.cliente_cod,
      g.analista_email,
      COALESCE(NULLIF(TRIM(u.nombre), ''), g.analista_email) AS analista_nombre,
      g.fecha,
      UPPER(TRIM(g.tipo)) AS tipo,
      g.resultado,
      CASE WHEN g.resultado IN (
        -- Nombres actuales
        'Compromiso de pago confirmado',
        'Solicitud de convenio',
        'Pago Reportado (Por Verificar)',
        -- Nombres históricos (legacy — gestiones anteriores al renombrado)
        'Cliente indica pago realizado',
        'Pagó',
        'Aceptó convenio',
        'Promesa OK'
      ) THEN 1 ELSE 0 END AS es_compromiso,
      CASE WHEN g.resultado IN (
        -- Sin contacto — nombres actuales
        'No contestó',
        'Número ocupado',
        'Sin respuesta',
        'No localizado',
        'Local cerrado',
        'Contacto inválido',
        'Correo inválido',
        -- Sin contacto — nombres históricos (legacy)
        'No ubicado',
        'Pendiente'
      ) THEN 0 ELSE 1 END AS hubo_contacto
    FROM tbl_gestiones g
    LEFT JOIN tbl_usuarios u ON lower(u.email) = lower(g.analista_email)
    WHERE g.fecha BETWEEN p_ini AND p_fin
      AND g.activo IS NOT FALSE
      AND g.archived IS NOT TRUE
      AND (p_email IS NULL OR lower(g.analista_email) = lower(p_email))
  ),
  kpis_agg AS (
    SELECT
      COUNT(*)::int                         AS total,
      SUM(es_compromiso)::int               AS compromisos,
      SUM(hubo_contacto)::int               AS contactadas,
      COUNT(DISTINCT analista_email)::int   AS analistas_activos,
      COUNT(DISTINCT cliente_cod)::int      AS clientes_gestionados
    FROM gest
  ),
  por_analista AS (
    SELECT
      analista_email,
      analista_nombre,
      COUNT(*)::int                        AS total,
      SUM(es_compromiso)::int              AS compromisos,
      SUM(hubo_contacto)::int              AS contactadas,
      COUNT(DISTINCT fecha)::int           AS dias_activos,
      SUM(CASE WHEN tipo = 'WHATSAPP' THEN 1 ELSE 0 END)::int AS whatsapps,
      SUM(CASE WHEN tipo = 'CORREO'   THEN 1 ELSE 0 END)::int AS correos,
      SUM(CASE WHEN tipo = 'LLAMADA'  THEN 1 ELSE 0 END)::int AS llamadas,
      SUM(CASE WHEN tipo = 'VISITA'   THEN 1 ELSE 0 END)::int AS visitas,
      SUM(CASE WHEN tipo = 'INTERNA'  THEN 1 ELSE 0 END)::int AS internas,
      COUNT(DISTINCT cliente_cod)::int     AS clientes_gestionados
    FROM gest
    GROUP BY analista_email, analista_nombre
    ORDER BY total DESC
  ),
  por_tipo AS (
    SELECT tipo, COUNT(*)::int AS total
    FROM gest
    GROUP BY tipo
    ORDER BY total DESC
  ),
  por_resultado AS (
    SELECT resultado, COUNT(*)::int AS total
    FROM gest
    GROUP BY resultado
    ORDER BY total DESC
    LIMIT 20
  ),
  serie_diaria AS (
    SELECT
      fecha::text                AS dia,
      COUNT(*)::int              AS total,
      SUM(es_compromiso)::int    AS compromisos
    FROM gest
    GROUP BY fecha
    ORDER BY fecha
  )
  SELECT json_build_object(
    'kpis',          (SELECT row_to_json(k) FROM kpis_agg k),
    'por_analista',  COALESCE((SELECT json_agg(row_to_json(a)) FROM por_analista a), '[]'::json),
    'por_tipo',      COALESCE((SELECT json_agg(row_to_json(t)) FROM por_tipo t), '[]'::json),
    'por_resultado', COALESCE((SELECT json_agg(row_to_json(r)) FROM por_resultado r), '[]'::json),
    'serie_diaria',  COALESCE((SELECT json_agg(row_to_json(s)) FROM serie_diaria s), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_reporte_migracion_mora(p_anio integer, p_mes integer, p_supervisor_cod text DEFAULT NULL::text, p_vendedor_cod text DEFAULT NULL::text)
  RETURNS json
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  v_open date := (make_date(p_anio,p_mes,1) - interval '1 month')::date;
  v_oanio int := EXTRACT(YEAR  FROM v_open);
  v_omes  int := EXTRACT(MONTH FROM v_open);
  v_np int; v_nc int; v_prov boolean;
  v_matriz json;
  o_nv numeric; o_1 numeric; o_2 numeric; o_3 numeric; o_4 numeric;
  m0 numeric; m1 numeric; m2 numeric; m3 numeric; m4 numeric;
  r0 numeric; r1 numeric; r2 numeric; r3 numeric; r4 numeric;
  b_nv numeric; b_1 numeric; b_2 numeric; b_3 numeric; b_4 numeric; b_5 numeric;
  p0 numeric; p1 numeric; p2 numeric; p3 numeric; p4 numeric;
  v_el numeric; v_venc_actual numeric;
  v_mesnom text[] := ARRAY['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
BEGIN
  SELECT count(*) INTO v_np FROM tbl_historico_aging_factura WHERE anio=v_oanio AND mes=v_omes;
  SELECT count(*) INTO v_nc FROM tbl_historico_aging_factura WHERE anio=p_anio  AND mes=p_mes;

  IF v_np = 0 OR v_nc = 0 THEN
    RETURN json_build_object(
      'disponible', false,
      'mensaje', 'La matriz de migración necesita dos cierres mensuales consecutivos ('
                 || v_mesnom[v_omes] || ' ' || v_oanio || ' y ' || v_mesnom[p_mes] || ' ' || p_anio
                 || '). Aún no están ambos cierres.',
      'periodo',  json_build_object('anio',p_anio,'mes',p_mes,'label',v_mesnom[p_mes]||' '||p_anio),
      'anterior', json_build_object('anio',v_oanio,'mes',v_omes,'label',v_mesnom[v_omes]||' '||v_oanio)
    );
  END IF;

  SELECT bool_or(provisional) INTO v_prov FROM tbl_historico_aging_factura WHERE anio=v_oanio AND mes=v_omes;

  CREATE TEMP TABLE _flows ON COMMIT DROP AS
  WITH prev AS (
    SELECT h.cliente_cod, h.documento, h.tramo, h.saldo
    FROM tbl_historico_aging_factura h
    LEFT JOIN tbl_vendedores v ON v.cod=h.vendedor_cod
    WHERE h.anio=v_oanio AND h.mes=v_omes
      AND (p_vendedor_cod   IS NULL OR h.vendedor_cod=p_vendedor_cod)
      AND (p_supervisor_cod IS NULL OR v.supervisor_cod=p_supervisor_cod)
  ),
  cur AS (
    SELECT h.cliente_cod, h.documento, h.tramo, h.saldo
    FROM tbl_historico_aging_factura h WHERE h.anio=p_anio AND h.mes=p_mes
  ),
  joined AS (
    SELECT p.tramo AS t_from, p.saldo AS s_prev, COALESCE(c.saldo,0) AS s_now,
      CASE WHEN COALESCE(c.saldo,0) > 0 THEN c.tramo ELSE 'PAGADO' END AS t_to
    FROM prev p LEFT JOIN cur c ON c.cliente_cod=p.cliente_cod AND c.documento=p.documento
  ),
  fl AS (
    SELECT t_from, t_to, LEAST(s_now,s_prev) AS monto FROM joined WHERE s_now > 0
    UNION ALL
    SELECT t_from, 'PAGADO', GREATEST(0, s_prev - s_now) FROM joined
  )
  SELECT t_from, t_to, sum(monto) AS monto FROM fl GROUP BY t_from, t_to;

  CREATE TEMP TABLE _curbk ON COMMIT DROP AS
  SELECT h.tramo, sum(h.saldo) AS saldo
  FROM tbl_historico_aging_factura h
  LEFT JOIN tbl_vendedores v ON v.cod=h.vendedor_cod
  WHERE h.anio=p_anio AND h.mes=p_mes
    AND (p_vendedor_cod   IS NULL OR h.vendedor_cod=p_vendedor_cod)
    AND (p_supervisor_cod IS NULL OR v.supervisor_cod=p_supervisor_cod)
  GROUP BY h.tramo;

  SELECT json_agg(r ORDER BY ord) INTO v_matriz FROM (
    SELECT
      CASE t_from WHEN 'NO_VENCIDO' THEN 0 WHEN '1_30' THEN 1 WHEN '31_60' THEN 2
                  WHEN '61_90' THEN 3 WHEN '91_120' THEN 4 WHEN '120_PLUS' THEN 5 ELSE 9 END AS ord,
      json_build_object(
        'tramo', t_from,
        'saldo_origen', round(sum(monto)),
        'destinos', (SELECT json_object_agg(t_to, round(monto2))
                     FROM (SELECT t_to, sum(monto) monto2 FROM _flows f2 WHERE f2.t_from=f.t_from GROUP BY t_to) d)
      ) AS r
    FROM _flows f GROUP BY t_from
  ) q;

  SELECT COALESCE(sum(monto),0) INTO o_nv FROM _flows WHERE t_from='NO_VENCIDO';
  SELECT COALESCE(sum(monto),0) INTO o_1  FROM _flows WHERE t_from='1_30';
  SELECT COALESCE(sum(monto),0) INTO o_2  FROM _flows WHERE t_from='31_60';
  SELECT COALESCE(sum(monto),0) INTO o_3  FROM _flows WHERE t_from='61_90';
  SELECT COALESCE(sum(monto),0) INTO o_4  FROM _flows WHERE t_from='91_120';
  SELECT COALESCE(sum(monto),0) INTO m0 FROM _flows WHERE t_from='NO_VENCIDO' AND t_to='1_30';
  SELECT COALESCE(sum(monto),0) INTO m1 FROM _flows WHERE t_from='1_30'       AND t_to='31_60';
  SELECT COALESCE(sum(monto),0) INTO m2 FROM _flows WHERE t_from='31_60'      AND t_to='61_90';
  SELECT COALESCE(sum(monto),0) INTO m3 FROM _flows WHERE t_from='61_90'      AND t_to='91_120';
  SELECT COALESCE(sum(monto),0) INTO m4 FROM _flows WHERE t_from='91_120'     AND t_to='120_PLUS';

  r0 := CASE WHEN o_nv>0 THEN m0/o_nv ELSE 0 END;
  r1 := CASE WHEN o_1 >0 THEN m1/o_1  ELSE 0 END;
  r2 := CASE WHEN o_2 >0 THEN m2/o_2  ELSE 0 END;
  r3 := CASE WHEN o_3 >0 THEN m3/o_3  ELSE 0 END;
  r4 := CASE WHEN o_4 >0 THEN m4/o_4  ELSE 0 END;

  p4 := r4; p3 := r3*p4; p2 := r2*p3; p1 := r1*p2; p0 := r0*p1;

  SELECT COALESCE(sum(saldo) FILTER (WHERE tramo='NO_VENCIDO'),0),
         COALESCE(sum(saldo) FILTER (WHERE tramo='1_30'),0),
         COALESCE(sum(saldo) FILTER (WHERE tramo='31_60'),0),
         COALESCE(sum(saldo) FILTER (WHERE tramo='61_90'),0),
         COALESCE(sum(saldo) FILTER (WHERE tramo='91_120'),0),
         COALESCE(sum(saldo) FILTER (WHERE tramo='120_PLUS'),0)
    INTO b_nv,b_1,b_2,b_3,b_4,b_5 FROM _curbk;

  v_el          := b_nv*p0 + b_1*p1 + b_2*p2 + b_3*p3 + b_4*p4 + b_5*1;
  v_venc_actual := b_1+b_2+b_3+b_4+b_5;

  RETURN json_build_object(
    'disponible', true,
    'provisional', COALESCE(v_prov,false),
    'periodo',  json_build_object('anio',p_anio,'mes',p_mes,'label',v_mesnom[p_mes]||' '||p_anio),
    'anterior', json_build_object('anio',v_oanio,'mes',v_omes,'label',v_mesnom[v_omes]||' '||v_oanio),
    'matriz', COALESCE(v_matriz,'[]'::json),
    'balances_actual', json_build_object(
       'NO_VENCIDO',round(b_nv),'1_30',round(b_1),'31_60',round(b_2),
       '61_90',round(b_3),'91_120',round(b_4),'120_PLUS',round(b_5)),
    'kpis', json_build_object(
       'roll_critico_pct', round(r4*100,1),
       'perdida_esperada', round(v_el),
       'vencido_actual',   round(v_venc_actual))
  );
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_reporte_mora_vendedor(p_email text DEFAULT NULL::text)
  RETURNS json
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE v_latest_sync text; v_rows json; v_kpis json;
BEGIN
  SELECT sync_id INTO v_latest_sync FROM tbl_cartera ORDER BY updated_at DESC LIMIT 1;

  WITH base AS (
    SELECT
      COALESCE(NULLIF(mc.vendedor_cod,''), '—')                                            AS vendedor_cod,
      COALESCE(NULLIF(mc.vendedor_nombre,''), NULLIF(c.vendedor_nombre,''), 'Sin vendedor') AS vendedor_nombre,
      NULLIF(mc.analista_email,'')                                                          AS analista_email,
      c.cliente_cod, c.cliente_nombre, c.total, c.no_vencido AS nv,
      c.mora_1_30 AS m1, c.mora_31_60 AS m2, c.mora_61_90 AS m3, c.mora_91_120 AS m4, c.mora_120_plus AS m5
    FROM tbl_cartera c
    LEFT JOIN tbl_maestro_clientes mc ON mc.cliente_cod = c.cliente_cod AND mc.contribuyente = c.contribuyente
    WHERE c.sync_id = v_latest_sync
      -- Filtro por analista: si se pasa email, solo sus clientes (mismo patrón que fn_reporte_bloqueados)
      AND (p_email IS NULL OR lower(NULLIF(mc.analista_email,'')) = lower(p_email))
  ),
  agg AS (
    SELECT vendedor_cod, vendedor_nombre,
      COUNT(DISTINCT cliente_cod)::int AS total_clientes,
      SUM(total) AS cartera_total, SUM(nv) AS no_vencido,
      SUM(m1) AS mora_1_30, SUM(m2) AS mora_31_60, SUM(m3) AS mora_61_90, SUM(m4) AS mora_91_120, SUM(m5) AS mora_120_plus,
      SUM(m1+m2+m3+m4+m5) AS mora_total
    FROM base GROUP BY vendedor_cod, vendedor_nombre
  ),
  -- Dedup por cliente dentro de cada vendedor (el LEFT JOIN a maestro_clientes
  -- puede repetir filas de cartera si hubiera más de un match).
  cliente_agg AS (
    SELECT vendedor_cod, vendedor_nombre, cliente_cod, MAX(cliente_nombre) AS cliente_nombre,
      SUM(total) AS total, SUM(nv) AS nv,
      SUM(m1) AS m1, SUM(m2) AS m2, SUM(m3) AS m3, SUM(m4) AS m4, SUM(m5) AS m5
    FROM base
    GROUP BY vendedor_cod, vendedor_nombre, cliente_cod
  ),
  clientes_por_vendedor AS (
    SELECT vendedor_cod, vendedor_nombre,
      json_agg(json_build_object(
        'cliente_cod',    cliente_cod,
        'cliente_nombre', cliente_nombre,
        'cartera_total',  ROUND(total,2),
        'no_vencido',     ROUND(nv,2),
        'mora_1_30',      ROUND(m1,2),
        'mora_31_60',     ROUND(m2,2),
        'mora_61_90',     ROUND(m3,2),
        'mora_91_120',    ROUND(m4,2),
        'mora_120_plus',  ROUND(m5,2),
        'mora_total',     ROUND(m1+m2+m3+m4+m5,2),
        'pct_mora',       CASE WHEN total > 0 THEN ROUND((m1+m2+m3+m4+m5)/total*100,1) ELSE 0 END
      ) ORDER BY (m1+m2+m3+m4+m5) DESC) AS clientes
    FROM cliente_agg
    GROUP BY vendedor_cod, vendedor_nombre
  ),
  -- Datos de contacto por vendedor (para el envío de correo, mismo patrón que fn_reporte_bloqueados)
  vend_meta AS (
    SELECT b.vendedor_cod, b.vendedor_nombre,
      MAX(v.email) FILTER (WHERE v.activo) AS vendedor_email,
      MAX(sup.email)                       AS supervisor_email,
      COALESCE(to_json(ARRAY_AGG(DISTINCT b.analista_email) FILTER (WHERE b.analista_email IS NOT NULL)), '[]'::json) AS analistas_email
    FROM base b
    LEFT JOIN tbl_vendedores v     ON v.cod = b.vendedor_cod
    LEFT JOIN tbl_supervisores sup ON sup.cod = v.supervisor_cod
    GROUP BY b.vendedor_cod, b.vendedor_nombre
  )
  SELECT json_agg(t ORDER BY t.mora_total DESC NULLS LAST) INTO v_rows FROM (
    SELECT a.vendedor_cod, a.vendedor_nombre, COALESCE(MAX(v.supervisor_cod),'—') AS supervisor_cod,
      a.total_clientes, ROUND(a.cartera_total,2) AS cartera_total, ROUND(a.no_vencido,2) AS no_vencido,
      ROUND(a.mora_1_30,2) AS mora_1_30, ROUND(a.mora_31_60,2) AS mora_31_60, ROUND(a.mora_61_90,2) AS mora_61_90,
      ROUND(a.mora_91_120,2) AS mora_91_120, ROUND(a.mora_120_plus,2) AS mora_120_plus,
      ROUND(a.mora_total,2) AS mora_total,
      CASE WHEN a.cartera_total>0 THEN ROUND(a.mora_total/a.cartera_total*100,1) ELSE 0 END AS pct_mora,
      -- Subconsultas correlacionadas (no join) -- json no tiene operador de
      -- igualdad, así que no pueden entrar en el GROUP BY de esta consulta.
      COALESCE((
        SELECT cpv.clientes FROM clientes_por_vendedor cpv
        WHERE cpv.vendedor_cod = a.vendedor_cod AND cpv.vendedor_nombre = a.vendedor_nombre
      ), '[]'::json) AS clientes,
      (SELECT vm.vendedor_email FROM vend_meta vm WHERE vm.vendedor_cod = a.vendedor_cod AND vm.vendedor_nombre = a.vendedor_nombre) AS vendedor_email,
      (SELECT vm.supervisor_email FROM vend_meta vm WHERE vm.vendedor_cod = a.vendedor_cod AND vm.vendedor_nombre = a.vendedor_nombre) AS supervisor_email,
      COALESCE((
        SELECT vm.analistas_email FROM vend_meta vm WHERE vm.vendedor_cod = a.vendedor_cod AND vm.vendedor_nombre = a.vendedor_nombre
      ), '[]'::json) AS analistas_email
    FROM agg a
    LEFT JOIN tbl_vendedores v ON v.cod = a.vendedor_cod
    GROUP BY a.vendedor_cod, a.vendedor_nombre, a.total_clientes, a.cartera_total, a.no_vencido,
             a.mora_1_30, a.mora_31_60, a.mora_61_90, a.mora_91_120, a.mora_120_plus, a.mora_total
  ) t;

  -- KPIs con el mismo filtro por analista que la lista de vendedores
  SELECT json_build_object(
    'cartera_total', ROUND(COALESCE(SUM(c.total),0),2),
    'mora_total',    ROUND(COALESCE(SUM(c.mora_1_30+c.mora_31_60+c.mora_61_90+c.mora_91_120+c.mora_120_plus),0),2),
    'pct_mora',      CASE WHEN COALESCE(SUM(c.total),0)>0
                       THEN ROUND(SUM(c.mora_1_30+c.mora_31_60+c.mora_61_90+c.mora_91_120+c.mora_120_plus)/SUM(c.total)*100,1) ELSE 0 END,
    'total_vendedores', COALESCE(json_array_length(v_rows),0)
  ) INTO v_kpis
  FROM tbl_cartera c
  LEFT JOIN tbl_maestro_clientes mc ON mc.cliente_cod = c.cliente_cod AND mc.contribuyente = c.contribuyente
  WHERE c.sync_id = v_latest_sync
    AND (p_email IS NULL OR lower(NULLIF(mc.analista_email,'')) = lower(p_email));

  RETURN json_build_object('kpis', v_kpis, 'rows', COALESCE(v_rows,'[]'::json));
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_reporte_plazo_especial(p_email text DEFAULT NULL::text)
  RETURNS json
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  v_latest_sync text;
  v_hoy         date;
  v_result      json;
BEGIN
  v_hoy := (now() AT TIME ZONE 'America/Costa_Rica')::date;
  SELECT sync_id INTO v_latest_sync FROM tbl_facturas ORDER BY id DESC LIMIT 1;

  WITH mc AS (   -- maestro deduplicado por contribuyente
    SELECT DISTINCT ON (contribuyente)
      contribuyente, cliente_cod, vendedor_cod, vendedor_nombre, analista_email, condicion_pago
    FROM tbl_maestro_clientes
    ORDER BY contribuyente, id DESC
  ),
  base AS (
    SELECT
      f.documento, f.cliente_nombre, f.contribuyente,
      COALESCE(NULLIF(mc.cliente_cod,''), '—')                        AS cliente_cod,
      f.fecha_documento::date AS f_emi,
      f.fecha_vencimiento::date AS f_ven,
      GREATEST(f.monto,0) AS monto,
      GREATEST(f.saldo,0) AS saldo,
      (f.fecha_vencimiento::date - f.fecha_documento::date)            AS plazo_factura,
      (regexp_match(mc.condicion_pago, '(\d+)'))[1]::int               AS plazo_cliente,
      COALESCE(NULLIF(mc.vendedor_cod,''), '—')                        AS vendedor_cod,
      COALESCE(NULLIF(mc.vendedor_nombre,''), 'Sin vendedor')          AS vendedor_nombre,
      NULLIF(mc.analista_email,'')                                     AS analista_email,
      (f.fecha_vencimiento::date - v_hoy)                             AS dias_a_vencer
    FROM tbl_facturas f
    JOIN mc ON mc.contribuyente = f.contribuyente
    WHERE f.sync_id = v_latest_sync
      AND f.saldo >= 1000
      AND f.fecha_documento  ~ '^\d{4}-\d{2}-\d{2}'
      AND f.fecha_vencimiento ~ '^\d{4}-\d{2}-\d{2}'
      AND mc.condicion_pago ~ '\d'
      -- Filtro por analista: si se pasa email, solo sus vendedores
      AND (p_email IS NULL OR lower(NULLIF(mc.analista_email,'')) = lower(p_email))
  ),
  especiales AS (
    SELECT *, (dias_a_vencer < 0) AS vencida
    FROM base
    WHERE plazo_factura IS DISTINCT FROM plazo_cliente
  ),
  vend_agg AS (
    SELECT
      e.vendedor_cod, e.vendedor_nombre,
      MAX(v.supervisor_cod)                                   AS supervisor_cod,
      MAX(v.email) FILTER (WHERE v.activo)                                            AS vendedor_email,
      MAX(sup.email)                                          AS supervisor_email,
      COUNT(*)::int                                           AS n_facturas,
      COUNT(*) FILTER (WHERE e.vencida)::int                  AS vencidas,
      SUM(e.saldo)                                            AS saldo_total,
      COALESCE(to_json(ARRAY_AGG(DISTINCT e.analista_email) FILTER (WHERE e.analista_email IS NOT NULL)), '[]'::json) AS analistas_email,
      json_agg(json_build_object(
        'documento', e.documento, 'cliente_nombre', e.cliente_nombre, 'contribuyente', e.contribuyente,
        'cliente_cod', e.cliente_cod,
        'fecha_emision', e.f_emi, 'fecha_vencimiento', e.f_ven,
        'plazo_factura', e.plazo_factura, 'plazo_cliente', e.plazo_cliente,
        'monto', ROUND(e.monto), 'saldo', ROUND(e.saldo),
        'dias_a_vencer', e.dias_a_vencer, 'vencida', e.vencida
      ) ORDER BY e.dias_a_vencer ASC) AS facturas
    FROM especiales e
    LEFT JOIN tbl_vendedores v   ON v.cod = e.vendedor_cod
    LEFT JOIN tbl_supervisores sup ON sup.cod = v.supervisor_cod
    GROUP BY e.vendedor_cod, e.vendedor_nombre
  )
  SELECT json_build_object(
    'kpis', json_build_object(
      'total_facturas',   (SELECT COUNT(*) FROM especiales),
      'saldo_total',      (SELECT ROUND(COALESCE(SUM(saldo),0)) FROM especiales),
      'vencidas',         (SELECT COUNT(*) FROM especiales WHERE vencida),
      'total_vendedores', (SELECT COUNT(*) FROM vend_agg)
    ),
    'vendedores', (SELECT COALESCE(json_agg(json_build_object(
        'vendedor_cod', vendedor_cod, 'vendedor_nombre', vendedor_nombre,
        'supervisor_cod', supervisor_cod, 'vendedor_email', vendedor_email,
        'supervisor_email', supervisor_email, 'analistas_email', analistas_email,
        'n_facturas', n_facturas, 'vencidas', vencidas, 'saldo_total', ROUND(saldo_total),
        'facturas', facturas
      ) ORDER BY saldo_total DESC), '[]'::json) FROM vend_agg)
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_resolver_responsables_contribuyente(p_contribuyente text)
  RETURNS TABLE(analista_email text, vendedor_cod text, hay_conflicto_analista boolean)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
  with candidatos as (
    select mc.analista_email, mc.vendedor_cod, coalesce(c.total, 0) as saldo
    from tbl_maestro_clientes mc
    left join tbl_cartera c on c.cliente_cod = mc.cliente_cod
    where mc.contribuyente = p_contribuyente
  )
  select
    (select analista_email from candidatos order by saldo desc nulls last limit 1),
    (select vendedor_cod   from candidatos order by saldo desc nulls last limit 1),
    (select count(distinct analista_email) from candidatos) > 1;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_saldo_contribuyente(p_contribuyente text)
  RETURNS TABLE(saldo_actual numeric, monto_objetivo numeric)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
  with s as (
    select coalesce(sum(total), 0) as saldo from tbl_cartera where contribuyente = p_contribuyente
  ),
  h as (
    select coalesce((select valor::numeric from tbl_config_sistema where clave = 'HOLGURA_GARANTIA_PCT'), 0) as pct
  )
  select s.saldo, s.saldo * (1 + h.pct / 100) from s, h;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_saldos_favor(p_email text DEFAULT NULL::text)
  RETURNS TABLE(id uuid, contribuyente text, cliente_cod text, cliente_nombre text, documento text, tipo_documento text, fecha_documento timestamp with time zone, fecha_vencimiento timestamp with time zone, monto numeric, estado_manual text, aplicado_por text, aplicado_en timestamp with time zone, sync_id text, analista_email text, analista_nombre text, vendedor_cod text, vendedor_nombre text, dias_pendiente integer)
  LANGUAGE sql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
  WITH mc AS (
    SELECT DISTINCT ON (m.cliente_cod) m.cliente_cod,
      NULLIF(m.analista_email,'') AS analista_email,
      COALESCE(NULLIF(m.analista_nombre,''),'Sin analista') AS analista_nombre,
      NULLIF(m.vendedor_cod,'')   AS vendedor_cod,
      COALESCE(NULLIF(m.vendedor_nombre,''),'Sin vendedor') AS vendedor_nombre
    FROM tbl_maestro_clientes m ORDER BY m.cliente_cod
  )
  SELECT sf.id, sf.contribuyente, sf.cliente_cod, sf.cliente_nombre,
         sf.documento, sf.tipo_documento, sf.fecha_documento, sf.fecha_vencimiento,
         sf.monto, sf.estado_manual, sf.aplicado_por, sf.aplicado_en, sf.sync_id,
         mc.analista_email, COALESCE(mc.analista_nombre,'Sin analista') AS analista_nombre,
         mc.vendedor_cod,   COALESCE(mc.vendedor_nombre,'Sin vendedor') AS vendedor_nombre,
         (CURRENT_DATE - sf.fecha_documento::date)::int AS dias_pendiente
  FROM tbl_saldos_favor sf
  LEFT JOIN mc ON mc.cliente_cod = sf.cliente_cod
  WHERE p_email IS NULL OR mc.analista_email = p_email
  ORDER BY sf.fecha_documento ASC;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_siguiente_carpeta_disponible(p_mueble text, p_gaveta text, p_carpeta_desde integer DEFAULT 1)
  RETURNS integer
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  v_carpeta integer := GREATEST(1, p_carpeta_desde);
  v_conteo integer;
BEGIN
  LOOP
    v_conteo := cof_prd_cyc_cofersa_sch_core.fn_contar_garantias_en_carpeta(p_mueble, p_gaveta, v_carpeta);
    EXIT WHEN v_conteo < 25;
    v_carpeta := v_carpeta + 1;
  END LOOP;
  RETURN v_carpeta;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_siguiente_consecutivo_garantia()
  RETURNS text
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
declare
  v_anio integer := extract(year from (now() at time zone 'America/Costa_Rica'))::integer;
  v_ultimo integer;
begin
  insert into tbl_garantias_consecutivo_anual (anio, ultimo)
  values (v_anio, 1)
  on conflict (anio) do update set ultimo = tbl_garantias_consecutivo_anual.ultimo + 1
  returning ultimo into v_ultimo;

  return 'PAG-' || v_anio || '-' || lpad(v_ultimo::text, 4, '0');
end;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_sin_pago_cliente(p_anio integer, p_mes integer)
  RETURNS TABLE(cliente_cod text, cliente_nombre text, vendedor_nombre text, analista_nombre text, dimension text, agrupacion text, ppto_mes numeric, cobrado numeric)
  LANGUAGE sql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
  WITH v_ini AS (SELECT make_date(p_anio, p_mes, 1) AS d),
  v_fin AS (SELECT (make_date(p_anio, p_mes, 1) + interval '1 month - 1 day')::date AS d),
  cob AS (
    SELECT p.cliente_cod, SUM(p.monto_pago)::numeric AS cobrado
    FROM tbl_pagos p, v_ini, v_fin
    WHERE p.fecha_pago BETWEEN v_ini.d AND v_fin.d
      AND COALESCE(p.cliente_cod, '') <> ''
    GROUP BY p.cliente_cod
  )
  SELECT
    pc.cliente_cod,
    pc.cliente_nombre,
    COALESCE(mc.vendedor_nombre, pc.vendedor_nombre, '—') AS vendedor_nombre,
    COALESCE(mc.analista_nombre, '—')                      AS analista_nombre,
    COALESCE(mc.dimension,   'Sin dimensión')               AS dimension,
    COALESCE(mc.agrupacion,  'Sin agrupación')              AS agrupacion,
    pc.ppto_cartera                                          AS ppto_mes,
    COALESCE(cob.cobrado, 0)                                 AS cobrado
  FROM tbl_presupuesto_cobro pc
  LEFT JOIN tbl_maestro_clientes mc ON mc.cliente_cod = pc.cliente_cod
  LEFT JOIN cob                 ON cob.cliente_cod = pc.cliente_cod
  WHERE pc.anio = p_anio
    AND pc.mes  = p_mes
    AND pc.ppto_cartera > 0
    AND COALESCE(cob.cobrado, 0) = 0
  ORDER BY pc.ppto_cartera DESC;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_sincronizar_analista_nombre()
  RETURNS trigger
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
BEGIN
  IF NEW.analista_email IS NOT NULL AND NEW.analista_email <> '' THEN
    NEW.analista_nombre := COALESCE(
      (SELECT nombre FROM tbl_usuarios WHERE lower(email) = lower(NEW.analista_email) LIMIT 1),
      NEW.analista_nombre
    );
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_snapshot_aging_factura(p_anio integer, p_mes integer, p_provisional boolean DEFAULT false, p_generado_por text DEFAULT NULL::text)
  RETURNS json
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE v_sync text; v_corte date; v_filas int;
BEGIN
  SELECT sync_id, fecha_corte INTO v_sync, v_corte FROM tbl_cartera ORDER BY updated_at DESC LIMIT 1;

  WITH cod_vend AS (
    SELECT DISTINCT ON (m.cliente_cod) m.cliente_cod,
      COALESCE(NULLIF(m.vendedor_cod,''),'—') AS vendedor_cod
    FROM tbl_maestro_clientes m ORDER BY m.cliente_cod, m.id DESC
  ),
  base AS (
    SELECT f.documento, f.cliente_cod, f.contribuyente,
      COALESCE(cv.vendedor_cod,'—') AS vendedor_cod,
      f.saldo,
      NULLIF(f.fecha_vencimiento,'')::date AS fvenc
    FROM tbl_facturas f
    LEFT JOIN cod_vend cv ON cv.cliente_cod = f.cliente_cod
    WHERE f.sync_id = v_sync AND COALESCE(f.saldo,0) > 0
  )
  INSERT INTO tbl_historico_aging_factura
    (anio, mes, documento, cliente_cod, contribuyente, vendedor_cod, saldo,
     fecha_vencimiento, dias_venc, tramo, fecha_cierre, provisional)
  SELECT p_anio, p_mes, b.documento, b.cliente_cod, b.contribuyente, b.vendedor_cod,
     b.saldo, b.fvenc, (v_corte - b.fvenc),
     CASE
       WHEN b.fvenc IS NULL OR (v_corte - b.fvenc) <= 0 THEN 'NO_VENCIDO'
       WHEN (v_corte - b.fvenc) <= 30  THEN '1_30'
       WHEN (v_corte - b.fvenc) <= 60  THEN '31_60'
       WHEN (v_corte - b.fvenc) <= 90  THEN '61_90'
       WHEN (v_corte - b.fvenc) <= 120 THEN '91_120'
       ELSE '120_PLUS'
     END,
     v_corte, p_provisional
  FROM base b
  ON CONFLICT (anio, mes, cliente_cod, documento) DO UPDATE SET
     saldo = EXCLUDED.saldo, fecha_vencimiento = EXCLUDED.fecha_vencimiento,
     dias_venc = EXCLUDED.dias_venc, tramo = EXCLUDED.tramo,
     vendedor_cod = EXCLUDED.vendedor_cod, contribuyente = EXCLUDED.contribuyente,
     fecha_cierre = EXCLUDED.fecha_cierre, provisional = EXCLUDED.provisional,
     created_at = now();

  GET DIAGNOSTICS v_filas = ROW_COUNT;
  RETURN json_build_object('ok', true, 'anio', p_anio, 'mes', p_mes,
    'facturas', v_filas, 'fecha_corte', v_corte, 'provisional', p_provisional);
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_snapshot_bloqueados_semana()
  RETURNS integer
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  v_lunes date;
  v_latest_sync text;
  v_insertados integer;
BEGIN
  v_lunes := date_trunc('week', (now() AT TIME ZONE 'America/Costa_Rica')::date)::date;
  SELECT sync_id INTO v_latest_sync FROM tbl_cartera ORDER BY updated_at DESC LIMIT 1;

  INSERT INTO tbl_historico_bloqueados (fecha_semana, cliente_cod, cliente_nombre, vendedor_cod, vendedor_nombre, saldo_vencido)
  SELECT
    v_lunes,
    c.cliente_cod,
    c.cliente_nombre,
    mc.vendedor_cod,
    COALESCE(NULLIF(mc.vendedor_nombre,''), NULLIF(c.vendedor_nombre,''), 'Sin vendedor'),
    (GREATEST(c.mora_31_60,0) + GREATEST(c.mora_61_90,0) + GREATEST(c.mora_91_120,0) + GREATEST(c.mora_120_plus,0))
  FROM tbl_cartera c
  LEFT JOIN tbl_maestro_clientes mc
    ON mc.cliente_cod = c.cliente_cod AND mc.contribuyente = c.contribuyente
  WHERE c.sync_id = v_latest_sync
    AND (GREATEST(c.mora_31_60,0) + GREATEST(c.mora_61_90,0) + GREATEST(c.mora_91_120,0) + GREATEST(c.mora_120_plus,0)) >= 1000
  ON CONFLICT (fecha_semana, cliente_cod) DO NOTHING;

  GET DIAGNOSTICS v_insertados = ROW_COUNT;
  RETURN v_insertados;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_snapshot_cierre_cartera(p_anio integer, p_mes integer, p_provisional boolean DEFAULT false, p_generado_por text DEFAULT NULL::text)
  RETURNS json
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  v_sync text; v_corte date; v_filas int;
BEGIN
  SELECT sync_id, fecha_corte INTO v_sync, v_corte
  FROM tbl_cartera ORDER BY updated_at DESC LIMIT 1;

  WITH cod_vend AS (
    SELECT DISTINCT ON (m.cliente_cod)
      m.cliente_cod,
      COALESCE(NULLIF(m.vendedor_cod,''),'—') AS vendedor_cod
    FROM tbl_maestro_clientes m
    ORDER BY m.cliente_cod, m.id DESC
  ),
  agg AS (
    SELECT cv.vendedor_cod,
      SUM(c.mora_1_30)     AS m1,
      SUM(c.mora_31_60)    AS m2,
      SUM(c.mora_61_90)    AS m3,
      SUM(c.mora_91_120)   AS m4,
      SUM(c.mora_120_plus) AS m5,
      COUNT(*) FILTER (WHERE (c.mora_1_30+c.mora_31_60+c.mora_61_90+c.mora_91_120+c.mora_120_plus) > 0) AS n_cli
    FROM tbl_cartera c
    JOIN cod_vend cv ON cv.cliente_cod = c.cliente_cod
    WHERE c.sync_id = v_sync AND cv.vendedor_cod <> '—'
    GROUP BY cv.vendedor_cod
  )
  INSERT INTO tbl_historico_cierres_cartera
    (anio, mes, vendedor_cod, mora_1_30, mora_31_60, mora_61_90, mora_91_120, mora_120_plus,
     saldo_vencido_cierre, n_clientes, fecha_cierre, provisional, generado_por)
  SELECT p_anio, p_mes, a.vendedor_cod, a.m1, a.m2, a.m3, a.m4, a.m5,
         (a.m1+a.m2+a.m3+a.m4+a.m5), a.n_cli, v_corte, p_provisional, p_generado_por
  FROM agg a
  ON CONFLICT (anio, mes, vendedor_cod) DO UPDATE SET
     mora_1_30 = EXCLUDED.mora_1_30, mora_31_60 = EXCLUDED.mora_31_60,
     mora_61_90 = EXCLUDED.mora_61_90, mora_91_120 = EXCLUDED.mora_91_120,
     mora_120_plus = EXCLUDED.mora_120_plus,
     saldo_vencido_cierre = EXCLUDED.saldo_vencido_cierre,
     n_clientes = EXCLUDED.n_clientes, fecha_cierre = EXCLUDED.fecha_cierre,
     provisional = EXCLUDED.provisional, generado_por = EXCLUDED.generado_por,
     created_at = now();

  GET DIAGNOSTICS v_filas = ROW_COUNT;
  RETURN json_build_object(
    'ok', true, 'anio', p_anio, 'mes', p_mes,
    'vendedores', v_filas, 'fecha_corte', v_corte,
    'provisional', p_provisional
  );
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_snapshot_cierre_completo(p_anio integer, p_mes integer, p_provisional boolean DEFAULT false, p_generado_por text DEFAULT NULL::text)
  RETURNS json
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE v_vend json; v_fact json;
BEGIN
  v_vend := cof_prd_cyc_cofersa_sch_core.fn_snapshot_cierre_cartera(p_anio, p_mes, p_provisional, p_generado_por);
  v_fact := cof_prd_cyc_cofersa_sch_core.fn_snapshot_aging_factura(p_anio, p_mes, p_provisional, p_generado_por);
  RETURN json_build_object('cierre_vendedor', v_vend, 'aging_factura', v_fact);
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_snapshot_proyeccion_semana()
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  v_lunes date;
BEGIN
  v_lunes := date_trunc('week', (now() AT TIME ZONE 'America/Costa_Rica')::date)::date;

  -- Freeze: si la fila de ESTA semana ya fue generada esta semana, no repetir.
  -- (Si existe pero es herencia de un lunes anterior -- cuando era "futura" --
  -- hay que proceder y refrescar todo el horizonte.)
  IF EXISTS (
    SELECT 1 FROM tbl_proyeccion_semana_snapshot
    WHERE semana_inicio = v_lunes
      AND (generado_en AT TIME ZONE 'America/Costa_Rica')::date >= v_lunes
  ) THEN
    RETURN;
  END IF;

  -- Congela el esperado COMPLETO (facturas en plazo + recuperación de mora) de
  -- S1..S8, calculado en vivo (ignorando el snapshot). SP ya quedó congelada la
  -- semana pasada (cuando era S1). Semanas futuras se refrescan cada lunes.
  INSERT INTO tbl_proyeccion_semana_snapshot(semana_inicio, esperado_facturas)
  SELECT (sem->>'inicio')::date, (sem->>'esperado_facturas')::numeric
  FROM json_array_elements((cof_prd_cyc_cofersa_sch_core.fn_proyeccion_cobro(8, true))->'semanas') AS sem
  WHERE (sem->>'tipo') IN ('actual', 'futura')
  ON CONFLICT (semana_inicio) DO UPDATE
    SET esperado_facturas = EXCLUDED.esperado_facturas,
        generado_en = now();
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_sync_cartera(p_ejecutado_por text DEFAULT 'pg_cron'::text)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  v_total  bigint;
  v_ultimo date;
BEGIN
  SELECT COUNT(*), MAX(fecha_corte::date)
  INTO v_total, v_ultimo
  FROM cof_prd_cyc_cofersa_sch_core.tbl_cartera;

  INSERT INTO cof_prd_cyc_cofersa_sch_core.tbl_sync_log(tipo, ejecutado_por, insertados, en_stage, omitidos, total_tabla, ultimo_registro)
  VALUES ('cartera', p_ejecutado_por, 0, 0, 0, v_total, v_ultimo);

  RETURN jsonb_build_object('total_tabla', v_total, 'ultimo_registro', v_ultimo);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO cof_prd_cyc_cofersa_sch_core.tbl_sync_log(tipo, ejecutado_por, insertados, en_stage, omitidos, total_tabla, error)
  VALUES ('cartera', p_ejecutado_por, 0, 0, 0, 0, SQLERRM);
  RETURN jsonb_build_object('error', SQLERRM);
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_sync_facturas(p_ejecutado_por text DEFAULT 'pg_cron'::text)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  v_total  bigint;
  v_ultimo date;
BEGIN
  SELECT COUNT(*),
         MAX(CASE
               WHEN fecha_documento ~ '^\d{4}-\d{2}-\d{2}'
               THEN fecha_documento::date
               ELSE NULL
             END)
  INTO v_total, v_ultimo
  FROM cof_prd_cyc_cofersa_sch_core.tbl_facturas;

  INSERT INTO cof_prd_cyc_cofersa_sch_core.tbl_sync_log(tipo, ejecutado_por, insertados, en_stage, omitidos, total_tabla, ultimo_registro)
  VALUES ('facturas', p_ejecutado_por, 0, 0, 0, v_total, v_ultimo);

  RETURN jsonb_build_object('total_tabla', v_total, 'ultimo_registro', v_ultimo);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO cof_prd_cyc_cofersa_sch_core.tbl_sync_log(tipo, ejecutado_por, insertados, en_stage, omitidos, total_tabla, error)
  VALUES ('facturas', p_ejecutado_por, 0, 0, 0, 0, SQLERRM);
  RETURN jsonb_build_object('error', SQLERRM);
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_sync_pagos(p_ejecutado_por text DEFAULT 'pg_cron'::text)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  v_row    record;
  v_result jsonb;
BEGIN
  SELECT * INTO v_row FROM cof_prd_cyc_cofersa_sch_core.fn_cargar_pagos_stage();

  v_result := jsonb_build_object(
    'insertados',  v_row.insertados,
    'en_stage',    v_row.en_stage,
    'omitidos',    v_row.omitidos,
    'total_pagos', v_row.total_pagos,
    'ultimo_pago', v_row.ultimo_pago
  );

  INSERT INTO cof_prd_cyc_cofersa_sch_core.tbl_sync_log(tipo, ejecutado_por, insertados, en_stage, omitidos, total_tabla, ultimo_registro)
  VALUES ('pagos', p_ejecutado_por, v_row.insertados, v_row.en_stage, v_row.omitidos, v_row.total_pagos, v_row.ultimo_pago);

  -- Limpiar stage después de procesar correctamente
  TRUNCATE TABLE cof_prd_cyc_cofersa_sch_core.tbl_pagos_stage;

  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO cof_prd_cyc_cofersa_sch_core.tbl_sync_log(tipo, ejecutado_por, insertados, en_stage, omitidos, total_tabla, error)
  VALUES ('pagos', p_ejecutado_por, 0, 0, 0, 0, SQLERRM);
  RETURN jsonb_build_object('error', SQLERRM);
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_sync_pedidos_retenidos(p_ejecutado_por text DEFAULT 'pg_cron'::text)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  v_stage int; v_ins int; v_upd int; v_total bigint; v_ultimo timestamptz; v_archivados int;
BEGIN
  SELECT count(*) INTO v_stage FROM tbl_pedidos_retenidos_stage;

  WITH stage_dedup AS (
    SELECT DISTINCT ON (trim(id_pedido))
      trim(id_pedido)                      AS id_pedido,
      trim(codigo_cliente)                 AS codigo_cliente,
      NULLIF(trim(fecha_pedido),'')        AS fecha_pedido_raw,
      trim(total_mercaderia)               AS total_mercaderia_raw,
      NULLIF(trim(vendedor),'')            AS vendedor
    FROM tbl_pedidos_retenidos_stage
    WHERE NULLIF(trim(id_pedido),'')      IS NOT NULL
      AND NULLIF(trim(codigo_cliente),'') IS NOT NULL
    ORDER BY trim(id_pedido)
  ),
  upsert AS (
    INSERT INTO tbl_pedidos_retenidos (
      id_pedido, codigo_cliente, fecha_pedido, total_mercaderia, vendedor, anio_mes
    )
    SELECT
      id_pedido, codigo_cliente,
      fecha_pedido_raw::timestamptz,
      COALESCE(replace(replace(total_mercaderia_raw, ',', ''), ' ', '')::numeric, 0),
      vendedor,
      to_char(COALESCE(fecha_pedido_raw::timestamptz, now()), 'YYYY-MM')
    FROM stage_dedup
    ON CONFLICT (id_pedido) DO UPDATE SET
      codigo_cliente      = EXCLUDED.codigo_cliente,
      fecha_pedido        = EXCLUDED.fecha_pedido,
      total_mercaderia    = EXCLUDED.total_mercaderia,
      vendedor            = EXCLUDED.vendedor,
      ciclos_ausente      = 0,
      updated_at          = now()
      -- NO se toca estado_sic / comentario_analista / motivo_retencion / resuelto_por / resuelto_en
    RETURNING (xmax = 0) AS es_nuevo
  )
  SELECT count(*) FILTER (WHERE es_nuevo), count(*) FILTER (WHERE NOT es_nuevo)
    INTO v_ins, v_upd FROM upsert;

  -- Pedidos que NO vinieron en esta carga -- posible señal de que ya se
  -- resolvieron directo en el ERP. Requiere 2 ciclos seguidos de ausencia (no
  -- solo uno) antes de archivar, por si un ciclo de N8N llega incompleto. Corre
  -- sobre toda la tabla, sin filtrar por mes (fix 2026-08-04: antes filtraba por
  -- anio_mes = mes en curso, lo que dejaba pedidos de meses anteriores atascados
  -- para siempre en cuanto cruzaba un fin de mes).
  UPDATE tbl_pedidos_retenidos
     SET ciclos_ausente = ciclos_ausente + 1
   WHERE NOT EXISTS (
       SELECT 1 FROM tbl_pedidos_retenidos_stage s
       WHERE NULLIF(trim(s.id_pedido),'') = tbl_pedidos_retenidos.id_pedido
     );

  WITH a_archivar AS (
    SELECT * FROM tbl_pedidos_retenidos
    WHERE ciclos_ausente >= 2
  ),
  ins_historico AS (
    INSERT INTO tbl_historico_pedidos_retenidos (
      id_pedido, codigo_cliente, fecha_pedido, total_mercaderia,
      vendedor, anio_mes, estado_sic, comentario_analista,
      motivo_retencion, resuelto_por, resuelto_en, created_at, updated_at
    )
    SELECT
      id_pedido, codigo_cliente, fecha_pedido, total_mercaderia,
      vendedor, anio_mes,
      CASE WHEN estado_sic = 'Pendiente' THEN 'Aprobado' ELSE estado_sic END,
      comentario_analista,
      COALESCE(motivo_retencion, CASE WHEN estado_sic = 'Pendiente' THEN 'Liberado automáticamente -- ya no aparece en el ERP' END),
      CASE WHEN estado_sic = 'Pendiente' THEN 'sistema (liberado en ERP)' ELSE resuelto_por END,
      CASE WHEN estado_sic = 'Pendiente' THEN now() ELSE resuelto_en END,
      created_at, updated_at
    FROM a_archivar
    ON CONFLICT (id_pedido, anio_mes) DO NOTHING
  )
  DELETE FROM tbl_pedidos_retenidos
  WHERE id_pedido IN (SELECT id_pedido FROM a_archivar);

  GET DIAGNOSTICS v_archivados = ROW_COUNT;

  SELECT count(*), max(fecha_pedido) INTO v_total, v_ultimo FROM tbl_pedidos_retenidos;

  INSERT INTO tbl_sync_log(tipo, ejecutado_por, insertados, en_stage, omitidos, total_tabla, ultimo_registro)
  VALUES ('pedidos_retenidos', p_ejecutado_por, v_ins, v_stage, GREATEST(v_stage - v_ins - v_upd, 0), v_total, v_ultimo::date);

  TRUNCATE tbl_pedidos_retenidos_stage;

  RETURN jsonb_build_object('insertados', v_ins, 'actualizados', v_upd, 'archivados_por_erp', v_archivados, 'en_stage', v_stage, 'total_tabla', v_total, 'ultimo_registro', v_ultimo);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO tbl_sync_log(tipo, ejecutado_por, insertados, en_stage, omitidos, total_tabla, error)
  VALUES ('pedidos_retenidos', p_ejecutado_por, 0, 0, 0, 0, SQLERRM);
  RETURN jsonb_build_object('error', SQLERRM);
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_sync_saldos_favor(p_ejecutado_por text DEFAULT 'pg_cron'::text)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  v_total  bigint;
  v_ultimo date;
BEGIN
  SELECT COUNT(*), MAX(fecha_documento::date)
  INTO v_total, v_ultimo
  FROM cof_prd_cyc_cofersa_sch_core.tbl_saldos_favor;

  INSERT INTO cof_prd_cyc_cofersa_sch_core.tbl_sync_log(tipo, ejecutado_por, insertados, en_stage, omitidos, total_tabla, ultimo_registro)
  VALUES ('saldos_favor', p_ejecutado_por, 0, 0, 0, v_total, v_ultimo);

  RETURN jsonb_build_object('total_tabla', v_total, 'ultimo_registro', v_ultimo);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO cof_prd_cyc_cofersa_sch_core.tbl_sync_log(tipo, ejecutado_por, insertados, en_stage, omitidos, total_tabla, error)
  VALUES ('saldos_favor', p_ejecutado_por, 0, 0, 0, 0, SQLERRM);
  RETURN jsonb_build_object('error', SQLERRM);
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_sync_salud_eval(p_tabla text, p_fingerprint text, p_umbral integer DEFAULT 3)
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
DECLARE
  v_prev     text;
  v_cnt      int;
  v_alertado timestamptz;
  v_changed  timestamptz;
BEGIN
  SELECT fingerprint, ciclos_sin_cambio, alertado_en, last_changed_at
    INTO v_prev, v_cnt, v_alertado, v_changed
  FROM tbl_sync_salud WHERE tabla = p_tabla;

  IF NOT FOUND THEN
    INSERT INTO tbl_sync_salud(tabla, fingerprint, ciclos_sin_cambio, last_changed_at, last_check_at)
    VALUES (p_tabla, p_fingerprint, 0, now(), now());
    RETURN;
  END IF;

  -- llegó data nueva → reset
  IF p_fingerprint IS DISTINCT FROM v_prev THEN
    UPDATE tbl_sync_salud
       SET fingerprint = p_fingerprint, ciclos_sin_cambio = 0,
           last_changed_at = now(), last_check_at = now(), alertado_en = NULL
     WHERE tabla = p_tabla;
    RETURN;
  END IF;

  -- sin cambio
  v_cnt := COALESCE(v_cnt, 0) + 1;
  UPDATE tbl_sync_salud SET ciclos_sin_cambio = v_cnt, last_check_at = now() WHERE tabla = p_tabla;

  IF v_cnt >= p_umbral AND (v_alertado IS NULL OR v_alertado < now() - interval '6 hours') THEN
    INSERT INTO tbl_notificaciones(usuario_id, tipo, titulo, mensaje, leida, link)
    SELECT u.id, 'SYNC',
           'Sincronización detenida: ' || p_tabla,
           'La tabla "' || p_tabla || '" no recibe datos nuevos desde ' ||
             to_char(v_changed AT TIME ZONE 'America/Costa_Rica', 'DD/MM HH24:MI') ||
             ' CR (' || v_cnt || ' ciclos sin cambio). Revisá el flujo de N8N.',
           false, '/configuracion'
    FROM tbl_usuarios u WHERE u.rol = 'COORDINADOR' AND COALESCE(u.activo, true) = true;

    UPDATE tbl_sync_salud SET alertado_en = now() WHERE tabla = p_tabla;
  END IF;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_tendencia_pago_cliente(p_cliente_cod text, p_meses integer DEFAULT 6)
  RETURNS json
  LANGUAGE sql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
  SELECT COALESCE(json_agg(t ORDER BY t.anio, t.mes), '[]'::json)
  FROM (
    SELECT
      EXTRACT(YEAR  FROM p.fecha_pago)::int AS anio,
      EXTRACT(MONTH FROM p.fecha_pago)::int AS mes,
      ROUND(AVG(GREATEST(0,COALESCE(p.dias_atraso,0))::numeric),1) AS dias_atraso_prom,
      GREATEST(0,100-LEAST(100,
        ROUND(AVG(GREATEST(0,COALESCE(p.dias_atraso,0))::numeric)/90.0*100)
      )) AS icp_mes,
      ROUND(SUM(p.monto_pago),2) AS monto_pagado,
      COUNT(*) AS n_pagos,
      ROUND(100.0*COUNT(CASE WHEN COALESCE(p.dias_atraso,0)<=0 THEN 1 END)/NULLIF(COUNT(*),0),1) AS pct_a_tiempo
    FROM tbl_pagos p
    WHERE p.cliente_cod = p_cliente_cod
      AND p.fecha_pago >= date_trunc('month', (NOW() AT TIME ZONE 'America/Costa_Rica')::date)
                          - (p_meses || ' months')::interval
      AND NOT EXISTS (SELECT 1 FROM tbl_pagos_anulados pa WHERE pa.no_recibo = p.no_recibo)
    GROUP BY 1,2
  ) t;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_vendedores_por_contribuyente(p_contribuyente text)
  RETURNS TABLE(vendedor_cod text, vendedor_nombre text, saldo numeric)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
  with sync_vigente as (
    select sync_id from tbl_cartera order by updated_at desc nulls last limit 1
  ),
  cartera_dedup as (
    select distinct on (cliente_cod) cliente_cod, total
    from tbl_cartera
    where sync_id = (select sync_id from sync_vigente) or (select sync_id from sync_vigente) is null
    order by cliente_cod, fecha_corte desc nulls last
  )
  select
    mc.vendedor_cod,
    coalesce(v.nombre, mc.vendedor_cod) as vendedor_nombre,
    coalesce(sum(cd.total), 0) as saldo
  from tbl_maestro_clientes mc
  left join cartera_dedup cd on cd.cliente_cod = mc.cliente_cod
  left join tbl_vendedores v on v.cod = mc.vendedor_cod
  where mc.contribuyente = p_contribuyente and mc.vendedor_cod is not null
  group by mc.vendedor_cod, v.nombre
  order by saldo desc;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_get_kpis_cartera()
  RETURNS TABLE(total_cartera numeric, total_no_vencido numeric, total_mora_1_30 numeric, total_mora_31_60 numeric, total_mora_61_90 numeric, total_mora_91_120 numeric, total_mora_120_plus numeric, total_mora numeric, n_clientes bigint, n_en_mora bigint, fecha_corte text)
  LANGUAGE sql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
  SELECT
    COALESCE(SUM(total), 0)           AS total_cartera,
    COALESCE(SUM(no_vencido), 0)      AS total_no_vencido,
    COALESCE(SUM(mora_1_30), 0)       AS total_mora_1_30,
    COALESCE(SUM(mora_31_60), 0)      AS total_mora_31_60,
    COALESCE(SUM(mora_61_90), 0)      AS total_mora_61_90,
    COALESCE(SUM(mora_91_120), 0)     AS total_mora_91_120,
    COALESCE(SUM(mora_120_plus), 0)   AS total_mora_120_plus,
    COALESCE(SUM(mora_1_30 + mora_31_60 + mora_61_90 + mora_91_120 + mora_120_plus), 0) AS total_mora,
    COUNT(*)                           AS n_clientes,
    COUNT(*) FILTER (WHERE COALESCE(mora_1_30,0) + COALESCE(mora_31_60,0) + COALESCE(mora_61_90,0) + COALESCE(mora_91_120,0) + COALESCE(mora_120_plus,0) > 0) AS n_en_mora,
    MAX(fecha_corte)                   AS fecha_corte
  FROM tbl_cartera;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_get_kpis_saldos_favor(analista_email text DEFAULT NULL::text)
  RETURNS json
  LANGUAGE sql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
  WITH mc AS (
    SELECT DISTINCT ON (m.cliente_cod) m.cliente_cod, NULLIF(m.analista_email,'') AS analista_email
    FROM tbl_maestro_clientes m ORDER BY m.cliente_cod
  ),
  base AS (
    SELECT sf.monto, (CURRENT_DATE - sf.fecha_documento::date) AS dias
    FROM tbl_saldos_favor sf
    LEFT JOIN mc ON mc.cliente_cod = sf.cliente_cod
    WHERE get_kpis_saldos_favor.analista_email IS NULL
       OR mc.analista_email = get_kpis_saldos_favor.analista_email
  )
  SELECT json_build_object(
    'total_documentos', count(*),
    'monto_total',      COALESCE(sum(monto),0),
    'criticos_30d',     count(*) FILTER (WHERE dias > 30)
  ) FROM base;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_get_mi_rol()
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
  SELECT u.rol
  FROM cof_prd_cyc_cofersa_sch_core.tbl_usuarios u
  JOIN cof_prd_cyc_cofersa_sch_core.tbl_app_users au ON lower(u.email) = lower(au.email)
  WHERE au.id = cof_prd_cyc_cofersa_sch_core.fn_auth_uid() AND u.activo = true
  LIMIT 1;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_get_usuario_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
  SELECT u.id
  FROM cof_prd_cyc_cofersa_sch_core.tbl_usuarios u
  JOIN cof_prd_cyc_cofersa_sch_core.tbl_app_users au ON lower(u.email) = lower(au.email)
  WHERE au.id = cof_prd_cyc_cofersa_sch_core.fn_auth_uid() AND u.activo = true
  LIMIT 1;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_set_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  VOLATILE
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$fn$;
CREATE OR REPLACE FUNCTION cof_prd_cyc_cofersa_sch_core.fn_update_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  VOLATILE
  SET search_path TO cof_prd_cyc_cofersa_sch_core
AS $fn$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$fn$;
-- ---------------------------------------------------------------- tablas
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_cartera (
  id bigint DEFAULT nextval('cof_prd_cyc_cofersa_sch_core.seq_cartera_id'::regclass) NOT NULL,
  contribuyente text NOT NULL,
  cliente_cod text NOT NULL,
  cliente_nombre text NOT NULL,
  vendedor_nombre text,
  no_vencido numeric DEFAULT 0 NOT NULL,
  mora_1_30 numeric DEFAULT 0 NOT NULL,
  mora_31_60 numeric DEFAULT 0 NOT NULL,
  mora_61_90 numeric DEFAULT 0 NOT NULL,
  mora_91_120 numeric DEFAULT 0 NOT NULL,
  mora_120_plus numeric DEFAULT 0 NOT NULL,
  total numeric DEFAULT 0 NOT NULL,
  sync_id text,
  fecha_corte text,
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_centro_recursos_aplicaciones (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  url text NOT NULL,
  icono text DEFAULT 'Layers'::text NOT NULL,
  estado text DEFAULT 'Operativa'::text NOT NULL,
  orden integer DEFAULT 0 NOT NULL,
  activo boolean DEFAULT true NOT NULL,
  creado_por text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_centro_recursos_documentos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  titulo text NOT NULL,
  descripcion text,
  categoria text NOT NULL,
  tipo_archivo text NOT NULL,
  url text NOT NULL,
  subido_por text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_config_audit_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tabla text NOT NULL,
  accion text NOT NULL,
  descripcion text,
  valor_anterior jsonb,
  valor_nuevo jsonb,
  realizado_por text NOT NULL,
  realizado_en timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_config_sistema (
  clave text NOT NULL,
  valor text NOT NULL,
  descripcion text
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_cuentas_bancarias (
  id integer DEFAULT nextval('cof_prd_cyc_cofersa_sch_core.seq_cuentas_bancarias_id'::regclass) NOT NULL,
  banco text NOT NULL,
  moneda text NOT NULL,
  tipo text DEFAULT 'cuenta'::text NOT NULL,
  numero text NOT NULL,
  iban text,
  activo boolean DEFAULT true NOT NULL,
  orden integer DEFAULT 0 NOT NULL
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_directorio_empresa (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nombre text NOT NULL,
  email text NOT NULL,
  cargo text,
  area text,
  activo boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  es_comprador boolean DEFAULT false NOT NULL,
  telefono text
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_facturas (
  id bigint DEFAULT nextval('cof_prd_cyc_cofersa_sch_core.seq_facturas_id'::regclass) NOT NULL,
  contribuyente text NOT NULL,
  cliente_nombre text,
  documento text NOT NULL,
  fecha_documento text,
  fecha_vencimiento text,
  monto numeric DEFAULT 0 NOT NULL,
  saldo numeric DEFAULT 0 NOT NULL,
  sync_id text,
  cliente_cod text
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_garantias_consecutivo_anual (
  anio integer NOT NULL,
  ultimo integer DEFAULT 0 NOT NULL
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_gestiones (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  cliente_cod text NOT NULL,
  contribuyente text,
  analista_email text NOT NULL,
  fecha date DEFAULT CURRENT_DATE NOT NULL,
  hora text DEFAULT '00:00'::text NOT NULL,
  tipo text NOT NULL,
  resultado text NOT NULL,
  nota text,
  promesa_fecha date,
  promesa_monto numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  activo boolean DEFAULT true,
  proxima_accion text,
  proxima_accion_fecha date,
  promesa_id uuid,
  metadata jsonb,
  archived boolean DEFAULT false,
  legacy boolean DEFAULT false
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_historico_aging_factura (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  anio integer NOT NULL,
  mes integer NOT NULL,
  documento text NOT NULL,
  cliente_cod text,
  contribuyente text,
  vendedor_cod text,
  saldo numeric DEFAULT 0 NOT NULL,
  fecha_vencimiento date,
  dias_venc integer,
  tramo text NOT NULL,
  fecha_cierre date,
  provisional boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_historico_cartera (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  fecha date NOT NULL,
  cartera_total numeric,
  mora_total numeric,
  mora_31_plus numeric,
  pct_mora numeric(5,1),
  pct_mora_31 numeric(5,1),
  n_en_mora integer,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_historico_pedidos_retenidos (
  id_pedido text NOT NULL,
  codigo_cliente text NOT NULL,
  fecha_pedido timestamp with time zone,
  total_mercaderia numeric,
  vendedor text,
  anio_mes text NOT NULL,
  estado_sic text,
  comentario_analista text,
  motivo_retencion text,
  resuelto_por text,
  resuelto_en timestamp with time zone,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  archivado_en timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_pagos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  contribuyente text NOT NULL,
  cliente_cod text NOT NULL,
  nombre_cliente text,
  no_factura text NOT NULL,
  monto_factura numeric NOT NULL,
  fecha_vencimiento date NOT NULL,
  no_recibo text,
  tipo_pago text,
  fecha_pago date NOT NULL,
  monto_pago numeric NOT NULL,
  dias_atraso integer,
  sync_id text,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_pagos_anulados (
  no_recibo text NOT NULL,
  motivo text NOT NULL,
  recibo_reemplazo text,
  anulado_por text NOT NULL,
  anulado_en timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_pagos_duplicado_descartado (
  no_recibo text NOT NULL,
  nota text,
  descartado_por text NOT NULL,
  descartado_en timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_pagos_stage (
  contribuyente text,
  cliente_cod text,
  nombre_cliente text,
  no_factura text,
  monto_factura text,
  fecha_vencimiento text,
  no_recibo text,
  tipo_pago text,
  fecha_pago text,
  monto_pago text,
  dias_atraso text,
  sync_id text
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_pedidos_retenidos (
  id_pedido text NOT NULL,
  codigo_cliente text NOT NULL,
  fecha_pedido timestamp with time zone,
  total_mercaderia numeric DEFAULT 0 NOT NULL,
  vendedor text,
  anio_mes text NOT NULL,
  estado_sic text DEFAULT 'Pendiente'::text NOT NULL,
  comentario_analista text,
  motivo_retencion text,
  resuelto_por text,
  resuelto_en timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  ciclos_ausente integer DEFAULT 0 NOT NULL
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_pedidos_retenidos_stage (
  id_pedido text,
  codigo_cliente text,
  fecha_pedido text,
  total_mercaderia text,
  vendedor text
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_personas_legales (
  cedula text NOT NULL,
  nombre text NOT NULL,
  estado_civil text,
  profesion text,
  domicilio text,
  telefono text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_portafolio_grupos (
  principal_cod text NOT NULL,
  nombre_ruta text NOT NULL,
  rol_funcional text,
  activo boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_promesas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  cliente_cod text NOT NULL,
  contribuyente text,
  analista_email text NOT NULL,
  fecha_creacion date DEFAULT CURRENT_DATE NOT NULL,
  monto numeric DEFAULT 0 NOT NULL,
  fecha_promesa date NOT NULL,
  estado text DEFAULT 'PENDIENTE'::text NOT NULL,
  notas text,
  updated_at timestamp with time zone DEFAULT now(),
  activo boolean DEFAULT true,
  gestion_id uuid,
  reprogramada_de_id uuid,
  fecha_validacion date,
  validado_por text,
  comentario_validacion text,
  monto_abono_parcial numeric(15,2),
  cliente_nombre text,
  eventos jsonb DEFAULT '[]'::jsonb
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_proyeccion_semana_snapshot (
  semana_inicio date NOT NULL,
  esperado_facturas numeric DEFAULT 0 NOT NULL,
  generado_en timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_reportes_pago (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  cliente_cod text NOT NULL,
  contribuyente text NOT NULL,
  analista_email text NOT NULL,
  banco_origen text NOT NULL,
  referencia text NOT NULL,
  monto_transferido numeric(15,2) NOT NULL,
  fecha_transferencia date NOT NULL,
  url_comprobante text,
  estado text DEFAULT 'pendiente'::text NOT NULL,
  notas text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_saldos_favor (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sync_id text,
  contribuyente text,
  cliente_cod text NOT NULL,
  cliente_nombre text,
  documento text NOT NULL,
  tipo_documento text NOT NULL,
  fecha_documento timestamp with time zone,
  fecha_vencimiento timestamp with time zone,
  monto numeric NOT NULL,
  estado_manual text DEFAULT 'pendiente'::text,
  aplicado_por text,
  aplicado_en timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_supervisores (
  cod character varying(10) NOT NULL,
  nombre text NOT NULL,
  email text NOT NULL,
  activo boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  es_jefe_regional boolean DEFAULT false NOT NULL,
  jefe_regional_cod text,
  cargo_jerarquia text
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_sync_log (
  id bigint DEFAULT nextval('cof_prd_cyc_cofersa_sch_core.seq_sync_log_id'::regclass) NOT NULL,
  tipo text DEFAULT 'pagos'::text NOT NULL,
  ejecutado_en timestamp with time zone DEFAULT now() NOT NULL,
  ejecutado_por text DEFAULT 'pg_cron'::text NOT NULL,
  insertados integer DEFAULT 0 NOT NULL,
  en_stage integer DEFAULT 0 NOT NULL,
  omitidos integer DEFAULT 0 NOT NULL,
  total_tabla bigint DEFAULT 0 NOT NULL,
  ultimo_registro date,
  error text
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_sync_salud (
  tabla text NOT NULL,
  fingerprint text,
  ciclos_sin_cambio integer DEFAULT 0 NOT NULL,
  last_changed_at timestamp with time zone DEFAULT now() NOT NULL,
  last_check_at timestamp with time zone DEFAULT now() NOT NULL,
  alertado_en timestamp with time zone
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_usuarios (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  nombre text NOT NULL,
  rol text NOT NULL,
  iniciales text NOT NULL,
  color text DEFAULT '#009ee3'::text NOT NULL,
  activo boolean DEFAULT true NOT NULL,
  meta_individual numeric DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  telefono text,
  whatsapp text,
  google_refresh_token text,
  tiene_cartera_asignada boolean DEFAULT false NOT NULL
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_ventas_mensuales (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  anio integer NOT NULL,
  mes integer NOT NULL,
  total_ventas_sin_iva numeric NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  cartera_total_mes numeric
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_garantias (
  id bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  contribuyente text NOT NULL,
  cliente_nombre text NOT NULL,
  tipo_titulo text NOT NULL,
  monto_garantizado numeric NOT NULL,
  tiene_fiador boolean DEFAULT false NOT NULL,
  fiador_nombre text,
  fiador_cedula text,
  fiador_telefono text,
  representante_legal text,
  fecha_emision date NOT NULL,
  fecha_vencimiento date NOT NULL,
  ubicacion_archivero text NOT NULL,
  estado_custodia text DEFAULT 'EN_BOVEDA'::text NOT NULL,
  documento_pdf_url text,
  activo boolean DEFAULT true NOT NULL,
  reemplazada_por_id bigint,
  registrado_por uuid NOT NULL,
  analista_email text NOT NULL,
  vendedor_cod text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deudor_estado_civil text,
  deudor_profesion text,
  deudor_domicilio text,
  representante_cedula text,
  representante_estado_civil text,
  representante_profesion text,
  representante_domicilio text,
  fiador_estado_civil text,
  fiador_profesion text,
  fiador_domicilio text,
  tasa_interes_moratorio numeric,
  lugar_emision text,
  documento_pagare_generado_en timestamp with time zone,
  consecutivo text,
  origen_registro text DEFAULT 'EMITIDO_SISTEMA'::text NOT NULL,
  ubicacion_archivero_mueble text,
  ubicacion_archivero_gaveta text,
  ubicacion_archivero_carpeta integer
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_marcas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nombre text NOT NULL,
  proveedor text,
  comprador_id uuid,
  notas text,
  activo boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_notas_rapidas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  usuario_id uuid NOT NULL,
  fecha date NOT NULL,
  contenido text,
  sincronizado_google boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_notificaciones (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  usuario_id uuid NOT NULL,
  tipo text NOT NULL,
  titulo text NOT NULL,
  mensaje text,
  leida boolean DEFAULT false NOT NULL,
  link text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_reporte_pago_detalles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  reporte_id uuid NOT NULL,
  factura_id integer NOT NULL,
  documento text NOT NULL,
  monto_aplicado numeric(15,2) NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_vendedores (
  cod character varying(10) NOT NULL,
  nombre text NOT NULL,
  email text,
  zona text,
  supervisor_cod character varying(10),
  analista_email text,
  activo boolean DEFAULT true NOT NULL,
  asignado_por text,
  asignado_en timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  telefono text,
  tipo_canal text DEFAULT 'Venta Regular'::text NOT NULL
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_garantia_eventos (
  id bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  garantia_id bigint NOT NULL,
  tipo_evento text NOT NULL,
  usuario_id uuid NOT NULL,
  nota text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_historico_bloqueados (
  id bigint DEFAULT nextval('cof_prd_cyc_cofersa_sch_core.seq_historico_bloqueados_id'::regclass) NOT NULL,
  fecha_semana date NOT NULL,
  cliente_cod text NOT NULL,
  cliente_nombre text,
  vendedor_cod text,
  vendedor_nombre text,
  saldo_vencido numeric,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_historico_cierres_cartera (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  anio integer NOT NULL,
  mes integer NOT NULL,
  vendedor_cod text NOT NULL,
  mora_1_30 numeric DEFAULT 0 NOT NULL,
  mora_31_60 numeric DEFAULT 0 NOT NULL,
  mora_61_90 numeric DEFAULT 0 NOT NULL,
  mora_91_120 numeric DEFAULT 0 NOT NULL,
  mora_120_plus numeric DEFAULT 0 NOT NULL,
  saldo_vencido_cierre numeric DEFAULT 0 NOT NULL,
  n_clientes integer DEFAULT 0 NOT NULL,
  fecha_cierre date,
  provisional boolean DEFAULT false NOT NULL,
  generado_por text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_maestro_clientes (
  id bigint DEFAULT nextval('cof_prd_cyc_cofersa_sch_core.seq_maestro_clientes_id'::regclass) NOT NULL,
  contribuyente text NOT NULL,
  cliente_cod text NOT NULL,
  cliente_nombre text NOT NULL,
  vendedor_nombre text,
  analista_email text,
  telefono text,
  correo text,
  limite_credito numeric DEFAULT 0,
  condicion_pago text,
  estado_manual text,
  agrupacion text,
  updated_at timestamp with time zone DEFAULT now(),
  vendedor_cod text,
  analista_nombre text,
  dimension text,
  nombre_cxp text DEFAULT ''::text,
  telefono2 text DEFAULT ''::text,
  asignacion_manual boolean DEFAULT false NOT NULL,
  latitud numeric(9,6),
  longitud numeric(9,6),
  cantidad_impresiones integer DEFAULT 2 NOT NULL,
  cliente_tramita text DEFAULT 'N'::text NOT NULL,
  dia_visita text[],
  dia_pago text[],
  metodo_pago text[],
  observaciones_logistica text,
  hora_recibo_inicio time without time zone,
  hora_recibo_fin time without time zone,
  persona_recibe text,
  nivel_precio text
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_portafolio_acotado (
  id bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  principal_cod text NOT NULL,
  vendedor_cod text NOT NULL,
  activo boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_presupuesto_cobro (
  id bigint DEFAULT nextval('cof_prd_cyc_cofersa_sch_core.seq_presupuesto_cobro_id'::regclass) NOT NULL,
  anio integer NOT NULL,
  mes integer NOT NULL,
  cliente_cod text NOT NULL,
  cliente_nombre text,
  vendedor_cod text,
  vendedor_nombre text,
  dias_prom numeric,
  dias_prom_ajustado numeric,
  ppto_cartera numeric,
  ppto_nuevas_ventas numeric,
  ppto_total numeric,
  generado_en timestamp with time zone DEFAULT now(),
  generado_por text,
  contribuyente text
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_presupuesto_meta_vendedor (
  id bigint DEFAULT nextval('cof_prd_cyc_cofersa_sch_core.seq_presupuesto_meta_vendedor_id'::regclass) NOT NULL,
  anio integer NOT NULL,
  mes integer NOT NULL,
  vendedor_cod text NOT NULL,
  vendedor_nombre text,
  meta_sugerida numeric,
  meta_ajustada numeric,
  updated_at timestamp with time zone DEFAULT now(),
  updated_por text,
  editada boolean DEFAULT false
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion (
  id bigint DEFAULT nextval('cof_prd_cyc_cofersa_sch_core.seq_solicitudes_actualizacion_id'::regclass) NOT NULL,
  contribuyente text NOT NULL,
  cliente_nombre text NOT NULL,
  tipo_persona text NOT NULL,
  token_hash text NOT NULL,
  token_expira_en timestamp with time zone NOT NULL,
  estado text DEFAULT 'ENVIADA'::text NOT NULL,
  datos_temporales jsonb,
  url_cedula text,
  url_personeria text,
  enviada_por uuid NOT NULL,
  enviada_en timestamp with time zone DEFAULT now() NOT NULL,
  respondida_en timestamp with time zone,
  aprobada_por uuid,
  aprobada_en timestamp with time zone,
  garantia_id bigint,
  nota_revision text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  correo_destino text
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_solicitudes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tipo text NOT NULL,
  cliente_id bigint,
  cliente_cod text,
  cliente_nombre text,
  solicitante_id uuid,
  revisor_id uuid,
  monto_actual numeric(15,2),
  monto_solicitado numeric(15,2),
  monto numeric(15,2),
  justificacion text NOT NULL,
  comentario_revisor text,
  motivo_nota text,
  documento_ref text,
  fecha_limite date,
  estado text DEFAULT 'PENDIENTE'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  para_email text,
  cc_emails text[],
  destinatario text,
  datos jsonb,
  gestion_id uuid,
  area text,
  prioridad text,
  sla_horas integer,
  sla_vencimiento timestamp with time zone,
  responsable_nombre text,
  responsable_email text,
  descripcion text,
  observaciones_internas text,
  numero_consecutivo integer DEFAULT nextval('cof_prd_cyc_cofersa_sch_core.seq_solicitudes_numero_consecutivo'::regclass) NOT NULL
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_solicitud_comentarios (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  solicitud_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  contenido text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cof_prd_cyc_cofersa_sch_core.tbl_solicitud_historial_estados (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  solicitud_id uuid NOT NULL,
  estado_anterior text,
  estado_nuevo text NOT NULL,
  usuario_id uuid NOT NULL,
  nota text,
  created_at timestamp with time zone DEFAULT now()
);
ALTER SEQUENCE cof_prd_cyc_cofersa_sch_core.seq_cartera_id OWNED BY cof_prd_cyc_cofersa_sch_core.tbl_cartera.id;
ALTER SEQUENCE cof_prd_cyc_cofersa_sch_core.seq_cuentas_bancarias_id OWNED BY cof_prd_cyc_cofersa_sch_core.tbl_cuentas_bancarias.id;
ALTER SEQUENCE cof_prd_cyc_cofersa_sch_core.seq_facturas_id OWNED BY cof_prd_cyc_cofersa_sch_core.tbl_facturas.id;
ALTER SEQUENCE cof_prd_cyc_cofersa_sch_core.seq_historico_bloqueados_id OWNED BY cof_prd_cyc_cofersa_sch_core.tbl_historico_bloqueados.id;
ALTER SEQUENCE cof_prd_cyc_cofersa_sch_core.seq_maestro_clientes_id OWNED BY cof_prd_cyc_cofersa_sch_core.tbl_maestro_clientes.id;
ALTER SEQUENCE cof_prd_cyc_cofersa_sch_core.seq_presupuesto_cobro_id OWNED BY cof_prd_cyc_cofersa_sch_core.tbl_presupuesto_cobro.id;
ALTER SEQUENCE cof_prd_cyc_cofersa_sch_core.seq_presupuesto_meta_vendedor_id OWNED BY cof_prd_cyc_cofersa_sch_core.tbl_presupuesto_meta_vendedor.id;
ALTER SEQUENCE cof_prd_cyc_cofersa_sch_core.seq_solicitudes_actualizacion_id OWNED BY cof_prd_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion.id;
ALTER SEQUENCE cof_prd_cyc_cofersa_sch_core.seq_solicitudes_numero_consecutivo OWNED BY cof_prd_cyc_cofersa_sch_core.tbl_solicitudes.numero_consecutivo;
ALTER SEQUENCE cof_prd_cyc_cofersa_sch_core.seq_sync_log_id OWNED BY cof_prd_cyc_cofersa_sch_core.tbl_sync_log.id;

-- ---------------------------------------------------------------- constraints (PK/UQ/CK/EX → FK)
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_cartera'::regclass
                 AND conname = 'pk_cartera') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_cartera ADD CONSTRAINT pk_cartera PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_centro_recursos_aplicaciones'::regclass
                 AND conname = 'pk_centro_recursos_aplicaciones') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_centro_recursos_aplicaciones ADD CONSTRAINT pk_centro_recursos_aplicaciones PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_centro_recursos_documentos'::regclass
                 AND conname = 'pk_centro_recursos_documentos') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_centro_recursos_documentos ADD CONSTRAINT pk_centro_recursos_documentos PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_config_audit_log'::regclass
                 AND conname = 'pk_config_audit_log') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_config_audit_log ADD CONSTRAINT pk_config_audit_log PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_config_sistema'::regclass
                 AND conname = 'pk_config_sistema') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_config_sistema ADD CONSTRAINT pk_config_sistema PRIMARY KEY (clave);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_cuentas_bancarias'::regclass
                 AND conname = 'pk_cuentas_bancarias') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_cuentas_bancarias ADD CONSTRAINT pk_cuentas_bancarias PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_directorio_empresa'::regclass
                 AND conname = 'pk_directorio_empresa') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_directorio_empresa ADD CONSTRAINT pk_directorio_empresa PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_facturas'::regclass
                 AND conname = 'pk_facturas') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_facturas ADD CONSTRAINT pk_facturas PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_garantia_eventos'::regclass
                 AND conname = 'pk_garantia_eventos') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_garantia_eventos ADD CONSTRAINT pk_garantia_eventos PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_garantias'::regclass
                 AND conname = 'pk_garantias') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_garantias ADD CONSTRAINT pk_garantias PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_garantias_consecutivo_anual'::regclass
                 AND conname = 'pk_garantias_consecutivo_anual') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_garantias_consecutivo_anual ADD CONSTRAINT pk_garantias_consecutivo_anual PRIMARY KEY (anio);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_gestiones'::regclass
                 AND conname = 'pk_gestiones') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_gestiones ADD CONSTRAINT pk_gestiones PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_historico_aging_factura'::regclass
                 AND conname = 'pk_historico_aging_factura') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_historico_aging_factura ADD CONSTRAINT pk_historico_aging_factura PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_historico_bloqueados'::regclass
                 AND conname = 'pk_historico_bloqueados') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_historico_bloqueados ADD CONSTRAINT pk_historico_bloqueados PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_historico_cartera'::regclass
                 AND conname = 'pk_historico_cartera') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_historico_cartera ADD CONSTRAINT pk_historico_cartera PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_historico_cierres_cartera'::regclass
                 AND conname = 'pk_historico_cierres_cartera') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_historico_cierres_cartera ADD CONSTRAINT pk_historico_cierres_cartera PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_historico_pedidos_retenidos'::regclass
                 AND conname = 'pk_historico_pedidos_retenidos') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_historico_pedidos_retenidos ADD CONSTRAINT pk_historico_pedidos_retenidos PRIMARY KEY (id_pedido, anio_mes);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_maestro_clientes'::regclass
                 AND conname = 'pk_maestro_clientes') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_maestro_clientes ADD CONSTRAINT pk_maestro_clientes PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_marcas'::regclass
                 AND conname = 'pk_marcas') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_marcas ADD CONSTRAINT pk_marcas PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_notas_rapidas'::regclass
                 AND conname = 'pk_notas_rapidas') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_notas_rapidas ADD CONSTRAINT pk_notas_rapidas PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_notificaciones'::regclass
                 AND conname = 'pk_notificaciones') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_notificaciones ADD CONSTRAINT pk_notificaciones PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_pagos'::regclass
                 AND conname = 'pk_pagos') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_pagos ADD CONSTRAINT pk_pagos PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_pagos_anulados'::regclass
                 AND conname = 'pk_pagos_anulados') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_pagos_anulados ADD CONSTRAINT pk_pagos_anulados PRIMARY KEY (no_recibo);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_pagos_duplicado_descartado'::regclass
                 AND conname = 'pk_pagos_duplicado_descartado') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_pagos_duplicado_descartado ADD CONSTRAINT pk_pagos_duplicado_descartado PRIMARY KEY (no_recibo);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_pedidos_retenidos'::regclass
                 AND conname = 'pk_pedidos_retenidos') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_pedidos_retenidos ADD CONSTRAINT pk_pedidos_retenidos PRIMARY KEY (id_pedido);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_personas_legales'::regclass
                 AND conname = 'pk_personas_legales') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_personas_legales ADD CONSTRAINT pk_personas_legales PRIMARY KEY (cedula);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_portafolio_acotado'::regclass
                 AND conname = 'pk_portafolio_acotado') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_portafolio_acotado ADD CONSTRAINT pk_portafolio_acotado PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_portafolio_grupos'::regclass
                 AND conname = 'pk_portafolio_grupos') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_portafolio_grupos ADD CONSTRAINT pk_portafolio_grupos PRIMARY KEY (principal_cod);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_presupuesto_cobro'::regclass
                 AND conname = 'pk_presupuesto_cobro') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_presupuesto_cobro ADD CONSTRAINT pk_presupuesto_cobro PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_presupuesto_meta_vendedor'::regclass
                 AND conname = 'pk_presupuesto_meta_vendedor') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_presupuesto_meta_vendedor ADD CONSTRAINT pk_presupuesto_meta_vendedor PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_promesas'::regclass
                 AND conname = 'pk_promesas') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_promesas ADD CONSTRAINT pk_promesas PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_proyeccion_semana_snapshot'::regclass
                 AND conname = 'pk_proyeccion_semana_snapshot') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_proyeccion_semana_snapshot ADD CONSTRAINT pk_proyeccion_semana_snapshot PRIMARY KEY (semana_inicio);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_reporte_pago_detalles'::regclass
                 AND conname = 'pk_reporte_pago_detalles') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_reporte_pago_detalles ADD CONSTRAINT pk_reporte_pago_detalles PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_reportes_pago'::regclass
                 AND conname = 'pk_reportes_pago') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_reportes_pago ADD CONSTRAINT pk_reportes_pago PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_saldos_favor'::regclass
                 AND conname = 'pk_saldos_favor') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_saldos_favor ADD CONSTRAINT pk_saldos_favor PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_solicitud_comentarios'::regclass
                 AND conname = 'pk_solicitud_comentarios') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_solicitud_comentarios ADD CONSTRAINT pk_solicitud_comentarios PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_solicitud_historial_estados'::regclass
                 AND conname = 'pk_solicitud_historial_estados') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_solicitud_historial_estados ADD CONSTRAINT pk_solicitud_historial_estados PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_solicitudes'::regclass
                 AND conname = 'pk_solicitudes') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_solicitudes ADD CONSTRAINT pk_solicitudes PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion'::regclass
                 AND conname = 'pk_solicitudes_actualizacion') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion ADD CONSTRAINT pk_solicitudes_actualizacion PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_supervisores'::regclass
                 AND conname = 'pk_supervisores') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_supervisores ADD CONSTRAINT pk_supervisores PRIMARY KEY (cod);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_sync_log'::regclass
                 AND conname = 'pk_sync_log') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_sync_log ADD CONSTRAINT pk_sync_log PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_sync_salud'::regclass
                 AND conname = 'pk_sync_salud') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_sync_salud ADD CONSTRAINT pk_sync_salud PRIMARY KEY (tabla);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_usuarios'::regclass
                 AND conname = 'pk_usuarios') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_usuarios ADD CONSTRAINT pk_usuarios PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_vendedores'::regclass
                 AND conname = 'pk_vendedores') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_vendedores ADD CONSTRAINT pk_vendedores PRIMARY KEY (cod);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_ventas_mensuales'::regclass
                 AND conname = 'pk_ventas_mensuales') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_ventas_mensuales ADD CONSTRAINT pk_ventas_mensuales PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_cartera'::regclass
                 AND conname = 'uq_cartera_contribuyente_cliente_cod') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_cartera ADD CONSTRAINT uq_cartera_contribuyente_cliente_cod UNIQUE (contribuyente, cliente_cod);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_directorio_empresa'::regclass
                 AND conname = 'uq_directorio_empresa_email') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_directorio_empresa ADD CONSTRAINT uq_directorio_empresa_email UNIQUE (email);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_facturas'::regclass
                 AND conname = 'uq_facturas_contribuyente_documento') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_facturas ADD CONSTRAINT uq_facturas_contribuyente_documento UNIQUE (contribuyente, documento);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_garantias'::regclass
                 AND conname = 'uq_garantias_consecutivo') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_garantias ADD CONSTRAINT uq_garantias_consecutivo UNIQUE (consecutivo);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_historico_aging_factura'::regclass
                 AND conname = 'uq_historico_aging_factura_anio_mes_cliente_cod_documento') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_historico_aging_factura ADD CONSTRAINT uq_historico_aging_factura_anio_mes_cliente_cod_documento UNIQUE (anio, mes, cliente_cod, documento);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_historico_bloqueados'::regclass
                 AND conname = 'uq_historico_bloqueados_fecha_semana_cliente_cod') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_historico_bloqueados ADD CONSTRAINT uq_historico_bloqueados_fecha_semana_cliente_cod UNIQUE (fecha_semana, cliente_cod);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_historico_cartera'::regclass
                 AND conname = 'uq_historico_cartera_fecha') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_historico_cartera ADD CONSTRAINT uq_historico_cartera_fecha UNIQUE (fecha);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_historico_cierres_cartera'::regclass
                 AND conname = 'uq_historico_cierres_cartera_anio_mes_vendedor_cod') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_historico_cierres_cartera ADD CONSTRAINT uq_historico_cierres_cartera_anio_mes_vendedor_cod UNIQUE (anio, mes, vendedor_cod);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_maestro_clientes'::regclass
                 AND conname = 'uq_maestro_clientes_cliente_cod') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_maestro_clientes ADD CONSTRAINT uq_maestro_clientes_cliente_cod UNIQUE (cliente_cod);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_notas_rapidas'::regclass
                 AND conname = 'uq_notas_rapidas_usuario_id_fecha') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_notas_rapidas ADD CONSTRAINT uq_notas_rapidas_usuario_id_fecha UNIQUE (usuario_id, fecha);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_pagos'::regclass
                 AND conname = 'uq_pagos_no_factura_no_recibo') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_pagos ADD CONSTRAINT uq_pagos_no_factura_no_recibo UNIQUE (no_factura, no_recibo);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_portafolio_acotado'::regclass
                 AND conname = 'uq_portafolio_acotado_principal_cod_vendedor_cod') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_portafolio_acotado ADD CONSTRAINT uq_portafolio_acotado_principal_cod_vendedor_cod UNIQUE (principal_cod, vendedor_cod);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_presupuesto_cobro'::regclass
                 AND conname = 'uq_presupuesto_cobro_anio_mes_cliente_cod') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_presupuesto_cobro ADD CONSTRAINT uq_presupuesto_cobro_anio_mes_cliente_cod UNIQUE (anio, mes, cliente_cod);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_presupuesto_meta_vendedor'::regclass
                 AND conname = 'uq_presupuesto_meta_vendedor_anio_mes_vendedor_cod') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_presupuesto_meta_vendedor ADD CONSTRAINT uq_presupuesto_meta_vendedor_anio_mes_vendedor_cod UNIQUE (anio, mes, vendedor_cod);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_reportes_pago'::regclass
                 AND conname = 'uq_reportes_pago_referencia') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_reportes_pago ADD CONSTRAINT uq_reportes_pago_referencia UNIQUE (referencia);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_saldos_favor'::regclass
                 AND conname = 'uq_saldos_favor_documento') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_saldos_favor ADD CONSTRAINT uq_saldos_favor_documento UNIQUE (documento);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion'::regclass
                 AND conname = 'uq_solicitudes_actualizacion_token_hash') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion ADD CONSTRAINT uq_solicitudes_actualizacion_token_hash UNIQUE (token_hash);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_supervisores'::regclass
                 AND conname = 'uq_supervisores_email') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_supervisores ADD CONSTRAINT uq_supervisores_email UNIQUE (email);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_usuarios'::regclass
                 AND conname = 'uq_usuarios_email') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_usuarios ADD CONSTRAINT uq_usuarios_email UNIQUE (email);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_ventas_mensuales'::regclass
                 AND conname = 'uq_ventas_mensuales_anio_mes') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_ventas_mensuales ADD CONSTRAINT uq_ventas_mensuales_anio_mes UNIQUE (anio, mes);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_cuentas_bancarias'::regclass
                 AND conname = 'ck_cuentas_bancarias_moneda') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_cuentas_bancarias ADD CONSTRAINT ck_cuentas_bancarias_moneda CHECK ((moneda = ANY (ARRAY['CRC'::text, 'USD'::text])));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_cuentas_bancarias'::regclass
                 AND conname = 'ck_cuentas_bancarias_tipo') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_cuentas_bancarias ADD CONSTRAINT ck_cuentas_bancarias_tipo CHECK ((tipo = ANY (ARRAY['cuenta'::text, 'sinpe'::text])));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_garantia_eventos'::regclass
                 AND conname = 'ck_garantia_eventos_tipo_evento') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_garantia_eventos ADD CONSTRAINT ck_garantia_eventos_tipo_evento CHECK ((tipo_evento = ANY (ARRAY['APERTURA_EXPEDIENTE'::text, 'ENTREGA_A_VENDEDOR'::text, 'TRAMITE_DE_FIRMA'::text, 'REINGRESO_A_CUSTODIA'::text, 'SUSTITUCION_DE_TITULO'::text, 'ADJUNTO_DOCUMENTO'::text, 'CORRECCION_DATOS'::text, 'GENERACION_PAGARE'::text])));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_garantias'::regclass
                 AND conname = 'ck_garantias_deudor_estado_civil') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_garantias ADD CONSTRAINT ck_garantias_deudor_estado_civil CHECK (((deudor_estado_civil IS NULL) OR (deudor_estado_civil = ANY (ARRAY['Soltero'::text, 'Casado'::text, 'Divorciado'::text, 'Unión Libre'::text]))));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_garantias'::regclass
                 AND conname = 'ck_garantias_estado_custodia') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_garantias ADD CONSTRAINT ck_garantias_estado_custodia CHECK ((estado_custodia = ANY (ARRAY['EN_BOVEDA'::text, 'ENVIADO_VENDEDOR'::text, 'EN_FIRMA'::text])));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_garantias'::regclass
                 AND conname = 'ck_garantias_fiador_estado_civil') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_garantias ADD CONSTRAINT ck_garantias_fiador_estado_civil CHECK (((fiador_estado_civil IS NULL) OR (fiador_estado_civil = ANY (ARRAY['Soltero'::text, 'Casado'::text, 'Divorciado'::text, 'Unión Libre'::text]))));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_garantias'::regclass
                 AND conname = 'ck_garantias_monto_garantizado') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_garantias ADD CONSTRAINT ck_garantias_monto_garantizado CHECK ((monto_garantizado > (0)::numeric));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_garantias'::regclass
                 AND conname = 'ck_garantias_origen_registro') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_garantias ADD CONSTRAINT ck_garantias_origen_registro CHECK ((origen_registro = ANY (ARRAY['EMITIDO_SISTEMA'::text, 'EXISTENTE_FISICA'::text])));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_garantias'::regclass
                 AND conname = 'ck_garantias_representante_estado_civil') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_garantias ADD CONSTRAINT ck_garantias_representante_estado_civil CHECK (((representante_estado_civil IS NULL) OR (representante_estado_civil = ANY (ARRAY['Soltero'::text, 'Casado'::text, 'Divorciado'::text, 'Unión Libre'::text]))));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_garantias'::regclass
                 AND conname = 'ck_garantias_tasa_interes_moratorio') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_garantias ADD CONSTRAINT ck_garantias_tasa_interes_moratorio CHECK (((tasa_interes_moratorio IS NULL) OR ((tasa_interes_moratorio > (0)::numeric) AND (tasa_interes_moratorio <= (100)::numeric))));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_garantias'::regclass
                 AND conname = 'ck_garantias_tipo_titulo') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_garantias ADD CONSTRAINT ck_garantias_tipo_titulo CHECK ((tipo_titulo = ANY (ARRAY['Pagaré'::text, 'Letra de Cambio'::text])));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_garantias'::regclass
                 AND conname = 'ck_garantias_vencimiento_posterior') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_garantias ADD CONSTRAINT ck_garantias_vencimiento_posterior CHECK ((fecha_vencimiento > fecha_emision));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_historico_aging_factura'::regclass
                 AND conname = 'ck_historico_aging_factura_mes') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_historico_aging_factura ADD CONSTRAINT ck_historico_aging_factura_mes CHECK (((mes >= 1) AND (mes <= 12)));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_historico_cierres_cartera'::regclass
                 AND conname = 'ck_historico_cierres_cartera_mes') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_historico_cierres_cartera ADD CONSTRAINT ck_historico_cierres_cartera_mes CHECK (((mes >= 1) AND (mes <= 12)));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_notificaciones'::regclass
                 AND conname = 'ck_notificaciones_tipo') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_notificaciones ADD CONSTRAINT ck_notificaciones_tipo CHECK ((tipo = ANY (ARRAY['SOLICITUD'::text, 'PROMESA'::text, 'ALERTA'::text, 'SYNC'::text, 'PEDIDO_RETENIDO'::text, 'GARANTIA'::text])));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_pedidos_retenidos'::regclass
                 AND conname = 'ck_pedidos_retenidos_estado_sic') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_pedidos_retenidos ADD CONSTRAINT ck_pedidos_retenidos_estado_sic CHECK ((estado_sic = ANY (ARRAY['Pendiente'::text, 'Aprobado'::text, 'Retenido'::text])));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_personas_legales'::regclass
                 AND conname = 'ck_personas_legales_estado_civil') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_personas_legales ADD CONSTRAINT ck_personas_legales_estado_civil CHECK (((estado_civil IS NULL) OR (estado_civil = ANY (ARRAY['Soltero'::text, 'Casado'::text, 'Divorciado'::text, 'Unión Libre'::text]))));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_promesas'::regclass
                 AND conname = 'ck_promesas_estado') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_promesas ADD CONSTRAINT ck_promesas_estado CHECK ((estado = ANY (ARRAY['PENDIENTE'::text, 'CUMPLIDA'::text, 'INCUMPLIDA'::text, 'ABONO_PARCIAL'::text, 'REPROGRAMADA'::text])));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_saldos_favor'::regclass
                 AND conname = 'ck_saldos_favor_estado_manual') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_saldos_favor ADD CONSTRAINT ck_saldos_favor_estado_manual CHECK ((estado_manual = ANY (ARRAY['pendiente'::text, 'aplicado'::text])));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_solicitudes'::regclass
                 AND conname = 'ck_solicitudes_prioridad') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_solicitudes ADD CONSTRAINT ck_solicitudes_prioridad CHECK (((prioridad IS NULL) OR (prioridad = ANY (ARRAY['Alta'::text, 'Media'::text, 'Baja'::text]))));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion'::regclass
                 AND conname = 'ck_solicitudes_actualizacion_estado') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion ADD CONSTRAINT ck_solicitudes_actualizacion_estado CHECK ((estado = ANY (ARRAY['ENVIADA'::text, 'DATOS_RECIBIDOS'::text, 'APROBADA'::text, 'EXPIRADA'::text, 'CANCELADA'::text])));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion'::regclass
                 AND conname = 'ck_solicitudes_actualizacion_tipo_persona') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion ADD CONSTRAINT ck_solicitudes_actualizacion_tipo_persona CHECK ((tipo_persona = ANY (ARRAY['FISICA'::text, 'JURIDICA'::text])));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_usuarios'::regclass
                 AND conname = 'ck_usuarios_rol') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_usuarios ADD CONSTRAINT ck_usuarios_rol CHECK ((rol = ANY (ARRAY['COORDINADOR'::text, 'ANALISTA'::text, 'ANALISTA_RIESGO'::text, 'GERENCIA'::text])));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_garantia_eventos'::regclass
                 AND conname = 'fk_garantia_eventos_garantias') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_garantia_eventos ADD CONSTRAINT fk_garantia_eventos_garantias FOREIGN KEY (garantia_id) REFERENCES tbl_garantias(id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_garantia_eventos'::regclass
                 AND conname = 'fk_garantia_eventos_usuarios') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_garantia_eventos ADD CONSTRAINT fk_garantia_eventos_usuarios FOREIGN KEY (usuario_id) REFERENCES tbl_usuarios(id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_garantias'::regclass
                 AND conname = 'fk_garantias_garantias') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_garantias ADD CONSTRAINT fk_garantias_garantias FOREIGN KEY (reemplazada_por_id) REFERENCES tbl_garantias(id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_garantias'::regclass
                 AND conname = 'fk_garantias_usuarios') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_garantias ADD CONSTRAINT fk_garantias_usuarios FOREIGN KEY (registrado_por) REFERENCES tbl_usuarios(id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_historico_bloqueados'::regclass
                 AND conname = 'fk_historico_bloqueados_vendedores') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_historico_bloqueados ADD CONSTRAINT fk_historico_bloqueados_vendedores FOREIGN KEY (vendedor_cod) REFERENCES tbl_vendedores(cod) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_historico_cierres_cartera'::regclass
                 AND conname = 'fk_historico_cierres_cartera_vendedores') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_historico_cierres_cartera ADD CONSTRAINT fk_historico_cierres_cartera_vendedores FOREIGN KEY (vendedor_cod) REFERENCES tbl_vendedores(cod) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_maestro_clientes'::regclass
                 AND conname = 'fk_maestro_clientes_usuarios') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_maestro_clientes ADD CONSTRAINT fk_maestro_clientes_usuarios FOREIGN KEY (analista_email) REFERENCES tbl_usuarios(email) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_maestro_clientes'::regclass
                 AND conname = 'fk_maestro_clientes_vendedores') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_maestro_clientes ADD CONSTRAINT fk_maestro_clientes_vendedores FOREIGN KEY (vendedor_cod) REFERENCES tbl_vendedores(cod) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_marcas'::regclass
                 AND conname = 'fk_marcas_directorio_empresa') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_marcas ADD CONSTRAINT fk_marcas_directorio_empresa FOREIGN KEY (comprador_id) REFERENCES tbl_directorio_empresa(id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_notas_rapidas'::regclass
                 AND conname = 'fk_notas_rapidas_usuarios') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_notas_rapidas ADD CONSTRAINT fk_notas_rapidas_usuarios FOREIGN KEY (usuario_id) REFERENCES tbl_usuarios(id) ON DELETE CASCADE;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_notificaciones'::regclass
                 AND conname = 'fk_notificaciones_usuarios') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_notificaciones ADD CONSTRAINT fk_notificaciones_usuarios FOREIGN KEY (usuario_id) REFERENCES tbl_usuarios(id) ON DELETE CASCADE;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_portafolio_acotado'::regclass
                 AND conname = 'fk_portafolio_acotado_portafolio_grupos') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_portafolio_acotado ADD CONSTRAINT fk_portafolio_acotado_portafolio_grupos FOREIGN KEY (principal_cod) REFERENCES tbl_portafolio_grupos(principal_cod) ON DELETE RESTRICT;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_portafolio_acotado'::regclass
                 AND conname = 'fk_portafolio_acotado_vendedores') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_portafolio_acotado ADD CONSTRAINT fk_portafolio_acotado_vendedores FOREIGN KEY (vendedor_cod) REFERENCES tbl_vendedores(cod) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_presupuesto_cobro'::regclass
                 AND conname = 'fk_presupuesto_cobro_vendedores') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_presupuesto_cobro ADD CONSTRAINT fk_presupuesto_cobro_vendedores FOREIGN KEY (vendedor_cod) REFERENCES tbl_vendedores(cod) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_presupuesto_meta_vendedor'::regclass
                 AND conname = 'fk_presupuesto_meta_vendedor_vendedores') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_presupuesto_meta_vendedor ADD CONSTRAINT fk_presupuesto_meta_vendedor_vendedores FOREIGN KEY (vendedor_cod) REFERENCES tbl_vendedores(cod) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_promesas'::regclass
                 AND conname = 'fk_promesas_promesas') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_promesas ADD CONSTRAINT fk_promesas_promesas FOREIGN KEY (reprogramada_de_id) REFERENCES tbl_promesas(id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_reporte_pago_detalles'::regclass
                 AND conname = 'fk_reporte_pago_detalles_reportes_pago') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_reporte_pago_detalles ADD CONSTRAINT fk_reporte_pago_detalles_reportes_pago FOREIGN KEY (reporte_id) REFERENCES tbl_reportes_pago(id) ON DELETE CASCADE;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_solicitud_comentarios'::regclass
                 AND conname = 'fk_solicitud_comentarios_solicitudes') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_solicitud_comentarios ADD CONSTRAINT fk_solicitud_comentarios_solicitudes FOREIGN KEY (solicitud_id) REFERENCES tbl_solicitudes(id) ON DELETE CASCADE;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_solicitud_comentarios'::regclass
                 AND conname = 'fk_solicitud_comentarios_usuarios') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_solicitud_comentarios ADD CONSTRAINT fk_solicitud_comentarios_usuarios FOREIGN KEY (usuario_id) REFERENCES tbl_usuarios(id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_solicitud_historial_estados'::regclass
                 AND conname = 'fk_solicitud_historial_estados_solicitudes') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_solicitud_historial_estados ADD CONSTRAINT fk_solicitud_historial_estados_solicitudes FOREIGN KEY (solicitud_id) REFERENCES tbl_solicitudes(id) ON DELETE CASCADE;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_solicitud_historial_estados'::regclass
                 AND conname = 'fk_solicitud_historial_estados_usuarios') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_solicitud_historial_estados ADD CONSTRAINT fk_solicitud_historial_estados_usuarios FOREIGN KEY (usuario_id) REFERENCES tbl_usuarios(id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_solicitudes'::regclass
                 AND conname = 'fk_solicitudes_maestro_clientes') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_solicitudes ADD CONSTRAINT fk_solicitudes_maestro_clientes FOREIGN KEY (cliente_id) REFERENCES tbl_maestro_clientes(id) ON DELETE SET NULL;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_solicitudes'::regclass
                 AND conname = 'fk_solicitudes_gestiones') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_solicitudes ADD CONSTRAINT fk_solicitudes_gestiones FOREIGN KEY (gestion_id) REFERENCES tbl_gestiones(id) ON DELETE SET NULL;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_solicitudes'::regclass
                 AND conname = 'fk_solicitudes_usuarios_revisor_id') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_solicitudes ADD CONSTRAINT fk_solicitudes_usuarios_revisor_id FOREIGN KEY (revisor_id) REFERENCES tbl_usuarios(id) ON DELETE SET NULL;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_solicitudes'::regclass
                 AND conname = 'fk_solicitudes_usuarios_solicitante_id') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_solicitudes ADD CONSTRAINT fk_solicitudes_usuarios_solicitante_id FOREIGN KEY (solicitante_id) REFERENCES tbl_usuarios(id) ON DELETE SET NULL;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion'::regclass
                 AND conname = 'fk_solicitudes_actualizacion_usuarios_aprobada_por') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion ADD CONSTRAINT fk_solicitudes_actualizacion_usuarios_aprobada_por FOREIGN KEY (aprobada_por) REFERENCES tbl_usuarios(id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion'::regclass
                 AND conname = 'fk_solicitudes_actualizacion_usuarios_enviada_por') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion ADD CONSTRAINT fk_solicitudes_actualizacion_usuarios_enviada_por FOREIGN KEY (enviada_por) REFERENCES tbl_usuarios(id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion'::regclass
                 AND conname = 'fk_solicitudes_actualizacion_garantias') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion ADD CONSTRAINT fk_solicitudes_actualizacion_garantias FOREIGN KEY (garantia_id) REFERENCES tbl_garantias(id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_supervisores'::regclass
                 AND conname = 'fk_supervisores_supervisores') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_supervisores ADD CONSTRAINT fk_supervisores_supervisores FOREIGN KEY (jefe_regional_cod) REFERENCES tbl_supervisores(cod);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_vendedores'::regclass
                 AND conname = 'fk_vendedores_usuarios') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_vendedores ADD CONSTRAINT fk_vendedores_usuarios FOREIGN KEY (analista_email) REFERENCES tbl_usuarios(email) ON UPDATE CASCADE;
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cof_prd_cyc_cofersa_sch_core.tbl_vendedores'::regclass
                 AND conname = 'fk_vendedores_supervisores') THEN
    ALTER TABLE cof_prd_cyc_cofersa_sch_core.tbl_vendedores ADD CONSTRAINT fk_vendedores_supervisores FOREIGN KEY (supervisor_cod) REFERENCES tbl_supervisores(cod) ON UPDATE CASCADE;
  END IF;
END
$do$;

-- ---------------------------------------------------------------- índices
CREATE INDEX IF NOT EXISTS idx_cartera_cliente_cod ON cof_prd_cyc_cofersa_sch_core.tbl_cartera USING btree (cliente_cod);
CREATE INDEX IF NOT EXISTS idx_cartera_contribuyente ON cof_prd_cyc_cofersa_sch_core.tbl_cartera USING btree (contribuyente);
CREATE INDEX IF NOT EXISTS idx_cartera_sync_id ON cof_prd_cyc_cofersa_sch_core.tbl_cartera USING btree (sync_id);
CREATE INDEX IF NOT EXISTS idx_config_audit_log_realizado_en ON cof_prd_cyc_cofersa_sch_core.tbl_config_audit_log USING btree (realizado_en DESC);
CREATE INDEX IF NOT EXISTS idx_config_audit_log_tabla ON cof_prd_cyc_cofersa_sch_core.tbl_config_audit_log USING btree (tabla);
CREATE INDEX IF NOT EXISTS idx_facturas_cliente_cod ON cof_prd_cyc_cofersa_sch_core.tbl_facturas USING btree (cliente_cod);
CREATE INDEX IF NOT EXISTS idx_facturas_contribuyente ON cof_prd_cyc_cofersa_sch_core.tbl_facturas USING btree (contribuyente);
CREATE INDEX IF NOT EXISTS idx_garantia_eventos_garantia_id ON cof_prd_cyc_cofersa_sch_core.tbl_garantia_eventos USING btree (garantia_id);
CREATE INDEX IF NOT EXISTS idx_garantia_eventos_usuario_id ON cof_prd_cyc_cofersa_sch_core.tbl_garantia_eventos USING btree (usuario_id);
CREATE INDEX IF NOT EXISTS idx_garantias_analista_email ON cof_prd_cyc_cofersa_sch_core.tbl_garantias USING btree (analista_email);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_garantias_contribuyente_partial ON cof_prd_cyc_cofersa_sch_core.tbl_garantias USING btree (contribuyente) WHERE (activo = true);
CREATE INDEX IF NOT EXISTS idx_garantias_reemplazada_por_id ON cof_prd_cyc_cofersa_sch_core.tbl_garantias USING btree (reemplazada_por_id);
CREATE INDEX IF NOT EXISTS idx_garantias_registrado_por ON cof_prd_cyc_cofersa_sch_core.tbl_garantias USING btree (registrado_por);
CREATE INDEX IF NOT EXISTS idx_gestiones_analista_email ON cof_prd_cyc_cofersa_sch_core.tbl_gestiones USING btree (analista_email);
CREATE INDEX IF NOT EXISTS idx_gestiones_cliente_cod ON cof_prd_cyc_cofersa_sch_core.tbl_gestiones USING btree (cliente_cod);
CREATE INDEX IF NOT EXISTS idx_gestiones_fecha ON cof_prd_cyc_cofersa_sch_core.tbl_gestiones USING btree (fecha);
CREATE INDEX IF NOT EXISTS idx_historico_aging_factura_cliente_cod_documento ON cof_prd_cyc_cofersa_sch_core.tbl_historico_aging_factura USING btree (cliente_cod, documento);
CREATE INDEX IF NOT EXISTS idx_historico_aging_factura_anio_mes ON cof_prd_cyc_cofersa_sch_core.tbl_historico_aging_factura USING btree (anio, mes);
CREATE INDEX IF NOT EXISTS idx_historico_bloqueados_cliente_cod ON cof_prd_cyc_cofersa_sch_core.tbl_historico_bloqueados USING btree (cliente_cod);
CREATE INDEX IF NOT EXISTS idx_historico_bloqueados_fecha_semana ON cof_prd_cyc_cofersa_sch_core.tbl_historico_bloqueados USING btree (fecha_semana);
CREATE INDEX IF NOT EXISTS idx_historico_cartera_fecha ON cof_prd_cyc_cofersa_sch_core.tbl_historico_cartera USING btree (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_historico_cierres_cartera_anio_mes ON cof_prd_cyc_cofersa_sch_core.tbl_historico_cierres_cartera USING btree (anio, mes);
CREATE INDEX IF NOT EXISTS idx_historico_pedidos_retenidos_anio_mes ON cof_prd_cyc_cofersa_sch_core.tbl_historico_pedidos_retenidos USING btree (anio_mes);
CREATE INDEX IF NOT EXISTS idx_historico_pedidos_retenidos_codigo_cliente ON cof_prd_cyc_cofersa_sch_core.tbl_historico_pedidos_retenidos USING btree (codigo_cliente);
CREATE INDEX IF NOT EXISTS idx_maestro_clientes_analista_email ON cof_prd_cyc_cofersa_sch_core.tbl_maestro_clientes USING btree (analista_email);
CREATE INDEX IF NOT EXISTS idx_notas_rapidas_usuario_id_fecha ON cof_prd_cyc_cofersa_sch_core.tbl_notas_rapidas USING btree (usuario_id, fecha);
CREATE INDEX IF NOT EXISTS idx_notificaciones_created_at ON cof_prd_cyc_cofersa_sch_core.tbl_notificaciones USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notificaciones_leida_partial ON cof_prd_cyc_cofersa_sch_core.tbl_notificaciones USING btree (leida) WHERE (leida = false);
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_id ON cof_prd_cyc_cofersa_sch_core.tbl_notificaciones USING btree (usuario_id);
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_id_leida ON cof_prd_cyc_cofersa_sch_core.tbl_notificaciones USING btree (usuario_id, leida);
CREATE INDEX IF NOT EXISTS idx_pagos_cliente_cod ON cof_prd_cyc_cofersa_sch_core.tbl_pagos USING btree (cliente_cod);
CREATE INDEX IF NOT EXISTS idx_pagos_contribuyente ON cof_prd_cyc_cofersa_sch_core.tbl_pagos USING btree (contribuyente);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha_pago ON cof_prd_cyc_cofersa_sch_core.tbl_pagos USING btree (fecha_pago DESC);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha_vencimiento ON cof_prd_cyc_cofersa_sch_core.tbl_pagos USING btree (fecha_vencimiento DESC);
CREATE INDEX IF NOT EXISTS idx_pagos_no_factura ON cof_prd_cyc_cofersa_sch_core.tbl_pagos USING btree (no_factura);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_pagos_no_recibo_no_factura ON cof_prd_cyc_cofersa_sch_core.tbl_pagos USING btree (no_recibo, no_factura);
CREATE INDEX IF NOT EXISTS idx_pedidos_retenidos_codigo_cliente ON cof_prd_cyc_cofersa_sch_core.tbl_pedidos_retenidos USING btree (codigo_cliente);
CREATE INDEX IF NOT EXISTS idx_pedidos_retenidos_estado_sic ON cof_prd_cyc_cofersa_sch_core.tbl_pedidos_retenidos USING btree (estado_sic);
CREATE INDEX IF NOT EXISTS idx_pedidos_retenidos_vendedor ON cof_prd_cyc_cofersa_sch_core.tbl_pedidos_retenidos USING btree (vendedor);
CREATE INDEX IF NOT EXISTS idx_presupuesto_cobro_anio_mes ON cof_prd_cyc_cofersa_sch_core.tbl_presupuesto_cobro USING btree (anio, mes);
CREATE INDEX IF NOT EXISTS idx_presupuesto_meta_vendedor_anio_mes ON cof_prd_cyc_cofersa_sch_core.tbl_presupuesto_meta_vendedor USING btree (anio, mes);
CREATE INDEX IF NOT EXISTS idx_promesas_cliente_cod ON cof_prd_cyc_cofersa_sch_core.tbl_promesas USING btree (cliente_cod);
CREATE INDEX IF NOT EXISTS idx_promesas_estado ON cof_prd_cyc_cofersa_sch_core.tbl_promesas USING btree (estado);
CREATE INDEX IF NOT EXISTS idx_promesas_estado_fecha_promesa ON cof_prd_cyc_cofersa_sch_core.tbl_promesas USING btree (estado, fecha_promesa);
CREATE INDEX IF NOT EXISTS idx_promesas_fecha_promesa ON cof_prd_cyc_cofersa_sch_core.tbl_promesas USING btree (fecha_promesa);
CREATE INDEX IF NOT EXISTS idx_promesas_gestion_id ON cof_prd_cyc_cofersa_sch_core.tbl_promesas USING btree (gestion_id);
CREATE INDEX IF NOT EXISTS idx_promesas_reprogramada_de_id ON cof_prd_cyc_cofersa_sch_core.tbl_promesas USING btree (reprogramada_de_id);
CREATE INDEX IF NOT EXISTS idx_reporte_pago_detalles_reporte_id ON cof_prd_cyc_cofersa_sch_core.tbl_reporte_pago_detalles USING btree (reporte_id);
CREATE INDEX IF NOT EXISTS idx_reportes_pago_analista_email ON cof_prd_cyc_cofersa_sch_core.tbl_reportes_pago USING btree (analista_email);
CREATE INDEX IF NOT EXISTS idx_reportes_pago_cliente_cod_contribuyente ON cof_prd_cyc_cofersa_sch_core.tbl_reportes_pago USING btree (cliente_cod, contribuyente);
CREATE INDEX IF NOT EXISTS idx_saldos_favor_cliente_cod ON cof_prd_cyc_cofersa_sch_core.tbl_saldos_favor USING btree (cliente_cod);
CREATE INDEX IF NOT EXISTS idx_saldos_favor_contribuyente ON cof_prd_cyc_cofersa_sch_core.tbl_saldos_favor USING btree (contribuyente);
CREATE INDEX IF NOT EXISTS idx_saldos_favor_estado_manual ON cof_prd_cyc_cofersa_sch_core.tbl_saldos_favor USING btree (estado_manual);
CREATE INDEX IF NOT EXISTS idx_saldos_favor_tipo_documento ON cof_prd_cyc_cofersa_sch_core.tbl_saldos_favor USING btree (tipo_documento);
CREATE INDEX IF NOT EXISTS idx_solicitud_comentarios_solicitud_id ON cof_prd_cyc_cofersa_sch_core.tbl_solicitud_comentarios USING btree (solicitud_id);
CREATE INDEX IF NOT EXISTS idx_solicitud_historial_estados_solicitud_id ON cof_prd_cyc_cofersa_sch_core.tbl_solicitud_historial_estados USING btree (solicitud_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_area ON cof_prd_cyc_cofersa_sch_core.tbl_solicitudes USING btree (area);
CREATE INDEX IF NOT EXISTS idx_solicitudes_estado ON cof_prd_cyc_cofersa_sch_core.tbl_solicitudes USING btree (estado);
CREATE INDEX IF NOT EXISTS idx_solicitudes_gestion_id ON cof_prd_cyc_cofersa_sch_core.tbl_solicitudes USING btree (gestion_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_sla_vencimiento ON cof_prd_cyc_cofersa_sch_core.tbl_solicitudes USING btree (sla_vencimiento);
CREATE INDEX IF NOT EXISTS idx_solicitudes_cliente_id ON cof_prd_cyc_cofersa_sch_core.tbl_solicitudes USING btree (cliente_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_created_at ON cof_prd_cyc_cofersa_sch_core.tbl_solicitudes USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_solicitudes_estado_2 ON cof_prd_cyc_cofersa_sch_core.tbl_solicitudes USING btree (estado);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_solicitudes_numero_consecutivo ON cof_prd_cyc_cofersa_sch_core.tbl_solicitudes USING btree (numero_consecutivo);
CREATE INDEX IF NOT EXISTS idx_solicitudes_solicitante_id ON cof_prd_cyc_cofersa_sch_core.tbl_solicitudes USING btree (solicitante_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_actualizacion_aprobada_por ON cof_prd_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion USING btree (aprobada_por);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_solicitudes_actualizacion_contribuyente_partial ON cof_prd_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion USING btree (contribuyente) WHERE (estado = ANY (ARRAY['ENVIADA'::text, 'DATOS_RECIBIDOS'::text]));
CREATE INDEX IF NOT EXISTS idx_solicitudes_actualizacion_enviada_por ON cof_prd_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion USING btree (enviada_por);
CREATE INDEX IF NOT EXISTS idx_solicitudes_actualizacion_garantia_id ON cof_prd_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion USING btree (garantia_id);
CREATE INDEX IF NOT EXISTS idx_vendedores_analista_email ON cof_prd_cyc_cofersa_sch_core.tbl_vendedores USING btree (analista_email);
CREATE INDEX IF NOT EXISTS idx_vendedores_supervisor_cod ON cof_prd_cyc_cofersa_sch_core.tbl_vendedores USING btree (supervisor_cod);
CREATE INDEX IF NOT EXISTS idx_ventas_mensuales_anio_mes ON cof_prd_cyc_cofersa_sch_core.tbl_ventas_mensuales USING btree (anio DESC, mes DESC);

-- ---------------------------------------------------------------- funciones (usan tipos de tabla)
-- ---------------------------------------------------------------- vistas y vistas materializadas
CREATE OR REPLACE VIEW cof_prd_cyc_cofersa_sch_core.vw_icp_por_cliente WITH (security_invoker=true) AS
WITH h AS (
         SELECT (now() AT TIME ZONE 'America/Costa_Rica'::text)::date AS d
        ), p9 AS (
         SELECT tbl_pagos.cliente_cod,
            tbl_pagos.contribuyente,
            tbl_pagos.nombre_cliente,
            tbl_pagos.monto_pago,
            tbl_pagos.no_factura,
            tbl_pagos.fecha_pago,
            tbl_pagos.dias_atraso,
            GREATEST(0, COALESCE(tbl_pagos.dias_atraso, 0))::numeric AS atraso
           FROM tbl_pagos,
            h
          WHERE tbl_pagos.dias_atraso IS NOT NULL AND tbl_pagos.fecha_pago >= (h.d - '9 mons'::interval) AND NOT (EXISTS ( SELECT 1
                   FROM tbl_pagos_anulados pa
                  WHERE pa.no_recibo = tbl_pagos.no_recibo))
        ), agg AS (
         SELECT p.cliente_cod,
            max(p.contribuyente) AS contribuyente,
            max(p.nombre_cliente) AS nombre_cliente,
            avg(p.atraso) FILTER (WHERE p.fecha_pago >= (h.d - '3 mons'::interval)) AS d3,
            avg(p.atraso) FILTER (WHERE p.fecha_pago >= (h.d - '6 mons'::interval) AND p.fecha_pago < (h.d - '3 mons'::interval)) AS d6,
            avg(p.atraso) FILTER (WHERE p.fecha_pago >= (h.d - '9 mons'::interval) AND p.fecha_pago < (h.d - '6 mons'::interval)) AS d9,
            count(*) AS n_pagos,
            count(DISTINCT p.no_factura) AS n_facturas,
            sum(p.monto_pago) AS monto_total_pagado,
            min(p.fecha_pago) AS primer_pago,
            max(p.fecha_pago) AS ultimo_pago,
            round(100.0 * sum(
                CASE
                    WHEN p.dias_atraso > 0 THEN 1
                    ELSE 0
                END)::numeric / NULLIF(count(*), 0)::numeric, 1) AS pct_pagos_tarde
           FROM p9 p
             CROSS JOIN h
          GROUP BY p.cliente_cod
        ), calc AS (
         SELECT agg.cliente_cod,
            agg.contribuyente,
            agg.nombre_cliente,
            agg.d3,
            agg.d6,
            agg.d9,
            agg.n_pagos,
            agg.n_facturas,
            agg.monto_total_pagado,
            agg.primer_pago,
            agg.ultimo_pago,
            agg.pct_pagos_tarde,
            (COALESCE(agg.d3 * 0.5, 0::numeric) + COALESCE(agg.d6 * 0.3, 0::numeric) + COALESCE(agg.d9 * 0.2, 0::numeric)) / NULLIF(
                CASE
                    WHEN agg.d3 IS NOT NULL THEN 0.5
                    ELSE 0::numeric
                END +
                CASE
                    WHEN agg.d6 IS NOT NULL THEN 0.3
                    ELSE 0::numeric
                END +
                CASE
                    WHEN agg.d9 IS NOT NULL THEN 0.2
                    ELSE 0::numeric
                END, 0::numeric) AS dias_pond
           FROM agg
        )
 SELECT cliente_cod,
    contribuyente,
    nombre_cliente,
    round(dias_pond, 1) AS dias_prom_ponderado,
    GREATEST(0::numeric, LEAST(100::numeric, round(100::numeric - dias_pond / 90.0 * 100::numeric, 1))) AS icp_score,
        CASE
            WHEN GREATEST(0::numeric, LEAST(100::numeric, 100::numeric - dias_pond / 90.0 * 100::numeric)) >= 85::numeric THEN 'EXCELENTE'::text
            WHEN GREATEST(0::numeric, LEAST(100::numeric, 100::numeric - dias_pond / 90.0 * 100::numeric)) >= 70::numeric THEN 'BUENO'::text
            WHEN GREATEST(0::numeric, LEAST(100::numeric, 100::numeric - dias_pond / 90.0 * 100::numeric)) >= 50::numeric THEN 'REGULAR'::text
            WHEN GREATEST(0::numeric, LEAST(100::numeric, 100::numeric - dias_pond / 90.0 * 100::numeric)) >= 25::numeric THEN 'MALO'::text
            ELSE 'MUY MALO'::text
        END AS clasificacion,
    n_pagos,
    n_facturas,
    monto_total_pagado,
    primer_pago,
    ultimo_pago,
    pct_pagos_tarde,
        CASE
            WHEN d3 IS NOT NULL AND d6 IS NOT NULL THEN round(GREATEST(0::numeric, LEAST(100::numeric, 100::numeric - d3 / 90.0 * 100::numeric)) - GREATEST(0::numeric, LEAST(100::numeric, 100::numeric - d6 / 90.0 * 100::numeric)))
            ELSE NULL::numeric
        END AS tendencia
   FROM calc;
COMMENT ON VIEW cof_prd_cyc_cofersa_sch_core.vw_icp_por_cliente IS 'ICP (Índice de Comportamiento de Pago) por cliente. Score 0-100, 100=puntual.';
CREATE OR REPLACE VIEW cof_prd_cyc_cofersa_sch_core.vw_v_automatizaciones_feed AS
SELECT id,
    usuario_id,
    tipo,
    titulo,
    mensaje,
    leida,
    link,
    created_at,
        CASE
            WHEN tipo = 'PROMESA'::text THEN 'promesas_hoy'::text
            WHEN tipo = 'SYNC'::text THEN 'sync_salud'::text
            WHEN tipo = 'ALERTA'::text AND (titulo ~~ 'Promesa cumplida automáticamente%'::text OR titulo ~~ 'Abono parcial detectado%'::text OR titulo ~~ 'Promesa incumplida%'::text) THEN 'conciliacion_promesas'::text
            WHEN tipo = 'ALERTA'::text AND titulo ~~ 'Sin gestión ≥%'::text THEN 'sin_gestion'::text
            WHEN tipo = 'ALERTA'::text AND titulo ~~ 'Cliente en regla —%'::text THEN 'pedido_retenido_en_regla'::text
            WHEN tipo = 'SOLICITUD'::text AND titulo ~~ 'SLA vencido%'::text THEN 'sla_solicitudes'::text
            ELSE NULL::text
        END AS regla_id
   FROM tbl_notificaciones n
  WHERE tipo = 'PROMESA'::text OR tipo = 'SYNC'::text OR tipo = 'ALERTA'::text AND (titulo ~~ 'Promesa cumplida automáticamente%'::text OR titulo ~~ 'Abono parcial detectado%'::text OR titulo ~~ 'Promesa incumplida%'::text OR titulo ~~ 'Sin gestión ≥%'::text OR titulo ~~ 'Cliente en regla —%'::text) OR tipo = 'SOLICITUD'::text AND titulo ~~ 'SLA vencido%'::text;

-- ---------------------------------------------------------------- índices de vistas materializadas

-- ---------------------------------------------------------------- triggers
DROP TRIGGER IF EXISTS trg_garantias_updated_at ON cof_prd_cyc_cofersa_sch_core.tbl_garantias;
CREATE TRIGGER trg_garantias_updated_at BEFORE UPDATE ON cof_prd_cyc_cofersa_sch_core.tbl_garantias FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
DROP TRIGGER IF EXISTS trg_maestro_clientes_trg_asignar_analista ON cof_prd_cyc_cofersa_sch_core.tbl_maestro_clientes;
CREATE TRIGGER trg_maestro_clientes_trg_asignar_analista BEFORE INSERT OR UPDATE OF vendedor_cod ON cof_prd_cyc_cofersa_sch_core.tbl_maestro_clientes FOR EACH ROW EXECUTE FUNCTION fn_asignar_analista_por_vendedor();
DROP TRIGGER IF EXISTS trg_maestro_clientes_trg_normalizar_analista_nombre ON cof_prd_cyc_cofersa_sch_core.tbl_maestro_clientes;
CREATE TRIGGER trg_maestro_clientes_trg_normalizar_analista_nombre BEFORE INSERT OR UPDATE OF analista_email, analista_nombre ON cof_prd_cyc_cofersa_sch_core.tbl_maestro_clientes FOR EACH ROW EXECUTE FUNCTION fn_normalizar_analista_nombre();
DROP TRIGGER IF EXISTS trg_maestro_clientes_trg_proteger_contacto_manual ON cof_prd_cyc_cofersa_sch_core.tbl_maestro_clientes;
CREATE TRIGGER trg_maestro_clientes_trg_proteger_contacto_manual BEFORE UPDATE ON cof_prd_cyc_cofersa_sch_core.tbl_maestro_clientes FOR EACH ROW EXECUTE FUNCTION fn_proteger_contacto_manual();
DROP TRIGGER IF EXISTS trg_maestro_clientes_trg_proteger_logistica_manual ON cof_prd_cyc_cofersa_sch_core.tbl_maestro_clientes;
CREATE TRIGGER trg_maestro_clientes_trg_proteger_logistica_manual BEFORE UPDATE ON cof_prd_cyc_cofersa_sch_core.tbl_maestro_clientes FOR EACH ROW EXECUTE FUNCTION fn_proteger_logistica_manual();
DROP TRIGGER IF EXISTS trg_maestro_clientes_trg_sincronizar_analista_nombre ON cof_prd_cyc_cofersa_sch_core.tbl_maestro_clientes;
CREATE TRIGGER trg_maestro_clientes_trg_sincronizar_analista_nombre BEFORE INSERT OR UPDATE ON cof_prd_cyc_cofersa_sch_core.tbl_maestro_clientes FOR EACH ROW EXECUTE FUNCTION fn_sincronizar_analista_nombre();
DROP TRIGGER IF EXISTS trg_notas_rapidas_updated_at ON cof_prd_cyc_cofersa_sch_core.tbl_notas_rapidas;
CREATE TRIGGER trg_notas_rapidas_updated_at BEFORE UPDATE ON cof_prd_cyc_cofersa_sch_core.tbl_notas_rapidas FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
DROP TRIGGER IF EXISTS trg_pedidos_retenidos_trg_notificar_pedido_retenido ON cof_prd_cyc_cofersa_sch_core.tbl_pedidos_retenidos;
CREATE TRIGGER trg_pedidos_retenidos_trg_notificar_pedido_retenido AFTER INSERT ON cof_prd_cyc_cofersa_sch_core.tbl_pedidos_retenidos FOR EACH ROW EXECUTE FUNCTION fn_notificar_pedido_retenido();
DROP TRIGGER IF EXISTS trg_personas_legales_updated_at ON cof_prd_cyc_cofersa_sch_core.tbl_personas_legales;
CREATE TRIGGER trg_personas_legales_updated_at BEFORE UPDATE ON cof_prd_cyc_cofersa_sch_core.tbl_personas_legales FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
DROP TRIGGER IF EXISTS trg_solicitudes_updated_at ON cof_prd_cyc_cofersa_sch_core.tbl_solicitudes;
CREATE TRIGGER trg_solicitudes_updated_at BEFORE UPDATE ON cof_prd_cyc_cofersa_sch_core.tbl_solicitudes FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
DROP TRIGGER IF EXISTS trg_solicitudes_actualizacion_updated_at ON cof_prd_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion;
CREATE TRIGGER trg_solicitudes_actualizacion_updated_at BEFORE UPDATE ON cof_prd_cyc_cofersa_sch_core.tbl_solicitudes_actualizacion FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
DROP TRIGGER IF EXISTS trg_vendedores_trg_propagar_analista_vendedor ON cof_prd_cyc_cofersa_sch_core.tbl_vendedores;
CREATE TRIGGER trg_vendedores_trg_propagar_analista_vendedor AFTER UPDATE OF analista_email ON cof_prd_cyc_cofersa_sch_core.tbl_vendedores FOR EACH ROW EXECUTE FUNCTION fn_propagar_analista_vendedor();

-- RLS: rls_mode=backend → la autorización vive en los use cases (ver generation-report.json).

-- ---------------------------------------------------------------- comentarios
COMMENT ON TABLE cof_prd_cyc_cofersa_sch_core.tbl_historico_aging_factura IS 'Snapshot del aging por factura al cierre de cada mes. Permite el roll rate real: rastrear cada documento migrando de tramo (o pagándose) entre meses consecutivos.';
COMMENT ON TABLE cof_prd_cyc_cofersa_sch_core.tbl_historico_cierres_cartera IS 'Snapshot del saldo vencido por vendedor al cierre de cada mes. El cierre del mes M es la APERTURA del mes M+1 para el CEI.';
COMMENT ON COLUMN cof_prd_cyc_cofersa_sch_core.tbl_maestro_clientes.asignacion_manual IS 'TRUE = analista asignado directamente al cliente (excepción). El GAS no sobreescribe analista_email cuando es TRUE.';
COMMENT ON TABLE cof_prd_cyc_cofersa_sch_core.tbl_pagos IS 'Historial de pagos por factura. Una fila = un abono. monto_factura es referencia; monto_pago es el monto de este abono.';
COMMENT ON TABLE cof_prd_cyc_cofersa_sch_core.tbl_pagos_stage IS 'Tabla de paso para la carga diaria/manual de pagos. Importar el CSV acá y correr fn_cargar_pagos_stage().';
COMMENT ON TABLE cof_prd_cyc_cofersa_sch_core.tbl_portafolio_acotado IS 'Grupos de portafolio acotado: un vendedor principal (con cartera) y los vendedores que atienden la misma ruta/clientes. Relacion N:N (un vendedor puede ser principal de su grupo y miembro de otro).';
COMMENT ON TABLE cof_prd_cyc_cofersa_sch_core.tbl_saldos_favor IS 'Saldos a favor del cliente (N/C, O/C, REC, TEF) pendientes de aplicar. Poblada por el GAS desde CYC_DETALLE_FACTURAS; monto en positivo. El GAS no toca estado_manual/aplicado_por/aplicado_en.';
COMMENT ON COLUMN cof_prd_cyc_cofersa_sch_core.tbl_ventas_mensuales.cartera_total_mes IS 'Saldo de cartera al cierre del mes. Si es NULL se usa la cartera actual para estimar DSO.';

COMMIT;

\echo 'Esquema creado/actualizado.'
