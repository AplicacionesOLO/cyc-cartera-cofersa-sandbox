-- =============================================================================
-- cof_prd_cyc_cofersa — Aurora PostgreSQL — MIGRATION (maestro)
-- Ambiente: prd | Base: cof_prd_cyc_cofersa_db
-- Ejecutar como: master conectado a 'postgres'
-- psql -v ON_ERROR_STOP=1 ... Generado por la skill aws-project-* (no editar a mano;
-- ajustar config.yaml y regenerar).
-- =============================================================================
\set ON_ERROR_STOP on
-- Requiere las mismas variables que provisioning: -v pass_ro=... -v pass_rw=... -v pass_ddl=... -v pass_admin=...
\ir aurora_postgresql_provisioning.sql
\ir aurora_postgresql_schema.sql
\ir aurora_postgresql_validation.sql
