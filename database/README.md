# Base de datos — Aurora PostgreSQL (cof / cyc_cofersa)

Generado por la skill desde el esquema fuente introspeccionado (no inferido). Ambientes: `dev` (raíz), `qa` (`environments/qa/`), `prd` (`environments/prd/`).
Para cambiar algo, editar `config.yaml` y regenerar (no editar los `.sql` a mano).

| Archivo | Ejecutar como | Propósito |
|---|---|---|
| `aurora_postgresql_provisioning.sql` | master, base `postgres` | roles, usuarios, base, esquemas, grants, search_path, extensiones |
| `aurora_postgresql_schema.sql` | master o `usr_cyc_cofersa_deploy` en `cof_dev_cyc_cofersa_db` | objetos en una transacción (SET ROLE ddl) |
| `aurora_postgresql_validation.sql` | lectura de catálogo | una fila OK/FALTA por objeto + `TOTAL_FALTA` |
| `aurora_postgresql_rollback.sql` | master, base `cof_dev_cyc_cofersa_db` | drop ordenado; bloque MANUAL para base/usuarios/roles |
| `aurora_postgresql_migration.sql` | master, base `postgres` | maestro: provisioning → schema → validation |
| `data_migration.sh` | operador | copia de datos Supabase (solo lectura) → Aurora + conteos |
| `naming-map.json` | — | nombres origen → destino (lo usan los repositories) |
| `generation-report.json` | — | RLS a traducir, objetos movidos al backend, extensiones, revisiones |

## Ejecución (dev)

```bash
export PGHOST=<endpoint-cluster-writer> PGUSER=<master> PGSSLMODE=require
get() { aws secretsmanager get-secret-value --secret-id "$1" --query SecretString --output text | jq -r .password; }
psql -d postgres -v ON_ERROR_STOP=1 \
  -v pass_ro="$(get /dev/cyc_cofersa/db/report)" -v pass_rw="$(get /dev/cyc_cofersa/db/app)" \
  -v pass_ddl="$(get /dev/cyc_cofersa/db/deploy)" -v pass_admin="$(get /dev/cyc_cofersa/db/dba)" \
  -f aurora_postgresql_migration.sql
psql -d cof_dev_cyc_cofersa_db -f aurora_postgresql_validation.sql   # todas las filas OK y TOTAL_FALTA = 0
```

Los nombres de secretos son un ejemplo de convención; usar los definidos para el ambiente. La Lambda se
conecta como `usr_cyc_cofersa_app` (secreto registrado en RDS Proxy, leído por `DB_SECRET_NAME`).
Todos los scripts son idempotentes: se pueden re-ejecutar.

## Rollback

`psql -d cof_dev_cyc_cofersa_db -f aurora_postgresql_rollback.sql` elimina los objetos en orden descendente (aborta si la
base no es `cof_dev_cyc_cofersa_db` o si detecta esquemas de Supabase). Base, usuarios y roles quedan en un bloque
comentado `MANUAL` que requiere confirmación humana.

## Revisar antes de producción

`generation-report.json` → `rls_policies` (reglas a implementar en use cases), `moved_to_backend`
(triggers sobre `auth.users`), `webhooks`, `review` (SQL dinámico / Supabase-specific), `extensions`.
