#!/usr/bin/env python3
"""Despliega un proyecto con el formato de la organización en la cuenta AWS de .env.aws.

    python scripts/deploy.py init                        # deploy/config.yaml (ambientes, red, horario de servicio)
    python scripts/deploy.py plan     --env dev          # qué existe y qué falta (solo lectura)
    python scripts/deploy.py all      --env dev          # plataforma → base de datos → backend → frontend → horario
    python scripts/deploy.py platform --env dev          # red, RDS, secretos, SSM, Lambda+CloudFront, runner BD, horario
    python scripts/deploy.py database --env dev [--no-data]
    python scripts/deploy.py backend  --env dev
    python scripts/deploy.py frontend --env dev
    python scripts/deploy.py hours    --env dev --action status|start|stop|enforce
    python scripts/deploy.py user-add --env dev --email ana@empresa.com --group admin
    python scripts/deploy.py all --env dev --dry-run     # genera template, bundles y zip sin tocar AWS

prod exige --approve (el agente solo lo pasa con confirmación explícita del usuario). Antes de desplegar se exige
que la validación del proyecto haya terminado en COMPLETE (--allow-unvalidated solo para dev).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import time
import urllib.request
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _aws import (  # noqa: E402
    CREDENTIALS_FILE,
    NeedsApproval,
    deploy_stack,
    load_credentials,
    session,
    stack_outputs,
    stack_status,
    subprocess_env,
    upload,
)
from _changes import env_context, list_changes, wrapper_sql  # noqa: E402
from _common import fail, manifest_path, read_config, read_json, write_json, write_yaml  # noqa: E402
from package_backend import package, packaged_template  # noqa: E402
from platform_template import project_info, render, to_yaml  # noqa: E402
from validate_migration import load_toml  # noqa: E402

ENVS = ("dev", "qa", "prod")
DB_ENV = {"dev": "dev", "qa": "qa", "prod": "prd"}
DIST = {"vite": "dist", "static-html": "dist", "cra": "build", "next": "out"}
PREFIX = {"vite": "VITE_", "static-html": "VITE_", "cra": "REACT_APP_", "next": "NEXT_PUBLIC_"}
DEFAULT_CONFIG = {
    "region": "",
    "service_hours": {"enabled": True, "timezone": "America/Costa_Rica", "warmup": "04:45", "start": "05:00",
                      "stop": "18:00", "days": "*"},
    "environments": {
        "dev": {"create_network": True, "vpc_cidr": "10.40.0.0/16", "use_rds_proxy": False,
                "db_instance_class": "db.t4g.micro", "db_allocated_storage": 20},
        "qa": {"create_network": True, "vpc_cidr": "10.41.0.0/16", "use_rds_proxy": False,
               "db_instance_class": "db.t4g.micro", "db_allocated_storage": 20},
        "prod": {"create_network": True, "vpc_cidr": "10.42.0.0/16", "use_rds_proxy": True,
                 "db_instance_class": "db.t4g.small", "db_allocated_storage": 50},
    },
}


def log(message: str) -> None:
    print(message, flush=True)


def cron(hhmm: str, days: str) -> str:
    match = re.fullmatch(r"([01]?\d|2[0-3]):([0-5]\d)", hhmm)
    if not match:
        fail(f"Hora inválida '{hhmm}' (formato HH:MM)")
    return f"cron({int(match.group(2))} {int(match.group(1))} ? * {days or '*'} *)"


def now_in(tz_name: str) -> datetime:
    try:
        from zoneinfo import ZoneInfo

        return datetime.now(ZoneInfo(tz_name))
    except Exception:  # noqa: BLE001 - sin base tz (Windows sin tzdata): Costa Rica es UTC-6 todo el año
        if tz_name != "America/Costa_Rica":
            fail(f"No se pudo cargar la zona horaria {tz_name}: python -m pip install tzdata")
        return datetime.now(timezone(timedelta(hours=-6)))


class Deployer:
    def __init__(self, root: Path, env: str, args: argparse.Namespace) -> None:
        self.root = root.resolve()
        self.env = env
        self.args = args
        self.dry = bool(getattr(args, "dry_run", False))
        self.build = self.root / "deploy" / "build" / env
        self.build.mkdir(parents=True, exist_ok=True)
        self.config = self._config()
        self.manifest = read_config(manifest_path(self.root)) or {}
        self.info = project_info(self.root)
        self.slug = self.info["slug"]
        self.label = self.info["label"]
        self.platform_stack = f"{env}-{self.slug}-platform"
        sam = load_toml(self.root / "backend" / "samconfig.toml")
        self.sam = ((sam.get(env) or {}).get("deploy") or {}).get("parameters") or {}
        if not self.sam:
            fail(f"backend/samconfig.toml no tiene [{env}.deploy.parameters]: ejecute generate_sam.py.")
        self.api_stack = str(self.sam["stack_name"])
        self.region = str(self.config.get("region") or self.sam.get("region") or self.info["region"])
        db_cfg = read_config(self.root / "database" / "config.yaml") or {}
        default_env = str(db_cfg.get("ambiente_default") or "dev")
        db_env = DB_ENV[env]
        self.db_dir = self.root / "database" if db_env == default_env else self.root / "database" / "environments" / db_env
        if not (self.db_dir / "naming-map.json").exists():
            fail(f"No hay scripts Aurora para {db_env} en {self.db_dir}")
        self.db_ctx = env_context(self.db_dir)
        self.project_json = read_json(self.root / ".discovery" / "project.json") \
            if (self.root / ".discovery" / "project.json").exists() else {}
        self._clients: dict[str, Any] = {}
        self.report: dict[str, Any] = {"env": env, "started_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                                       "steps": []}

    # ------------------------------------------------------------------ infraestructura
    def _config(self) -> dict[str, Any]:
        path = self.root / "deploy" / "config.yaml"
        data = read_config(path) if path.exists() else {}
        merged = json.loads(json.dumps(DEFAULT_CONFIG))
        merged["service_hours"].update((data or {}).get("service_hours") or {})
        merged["region"] = str((data or {}).get("region") or "")
        for env, values in ((data or {}).get("environments") or {}).items():
            merged["environments"].setdefault(env, {}).update(values or {})
        return merged

    def client(self, name: str):
        if self.dry:
            fail("--dry-run no usa AWS (error interno: se pidió un cliente).")
        if name not in self._clients:
            if "session" not in self._clients:
                cred_file = self.root / CREDENTIALS_FILE
                if not cred_file.exists() and (self.root.parent / CREDENTIALS_FILE).exists():
                    cred_file = self.root.parent / CREDENTIALS_FILE  # .env.aws en la raíz del repo
                creds = load_credentials(cred_file)
                if creds["AWS_REGION"] != self.region:
                    log(f"AVISO: .env.aws usa {creds['AWS_REGION']} pero el proyecto usa {self.region}: se usa {self.region}")
                    creds = {**creds, "AWS_REGION": self.region}
                self._clients["session"] = session(creds)
                self._clients["creds"] = creds
            self._clients[name] = self._clients["session"].client(name)
        return self._clients[name]

    def step(self, name: str, status: str, detail: str = "") -> None:
        self.report["steps"].append({"step": name, "status": status, "detail": detail})
        log(f"[{status}] {name}" + (f" — {detail}" if detail else ""))

    def approve(self) -> bool:
        return self.env != "prod" or bool(getattr(self.args, "approve", False))

    def platform_outputs(self) -> dict[str, str]:
        outputs = stack_outputs(self.client("cloudformation"), self.platform_stack)
        if not outputs:
            fail(f"No existe {self.platform_stack}: ejecute 'deploy.py platform --env {self.env}' primero.")
        return outputs

    # ------------------------------------------------------------------ verificación previa
    def gate(self) -> None:
        status_file = self.root / ".discovery" / "final-status.json"
        status = read_json(status_file).get("status") if status_file.exists() else "sin validar"
        if status in ("MIGRATION COMPLETE", "PROJECT COMPLETE"):
            self.step("verificación del proyecto", "OK", status)
            return
        if getattr(self.args, "allow_unvalidated", False) and self.env == "dev":
            self.step("verificación del proyecto", "WARN", f"{status}: se despliega en dev con --allow-unvalidated")
            return
        fail(f"El proyecto está {status}: ejecute validate_migration.py --run y build_report.py hasta COMPLETE "
             "(o --allow-unvalidated solo en dev).", 1)

    # ------------------------------------------------------------------ plataforma
    def platform(self) -> dict[str, str]:
        env_cfg = self.config["environments"].get(self.env) or {}
        hours = self.config["service_hours"]
        template = to_yaml(render(self.info))
        path = self.build / "platform.yaml"
        path.write_text(template, encoding="utf-8")
        params = {
            "Environment": self.env, "EnvironmentTag": self.env.upper(), "ProjectSlug": self.slug,
            "ProjectLabel": self.label, "DbName": self.db_ctx["database"],
            "CreateNetwork": "true" if env_cfg.get("create_network", True) else "false",
            "VpcCidr": str(env_cfg.get("vpc_cidr") or "10.40.0.0/16"),
            "ExistingVpcId": str(env_cfg.get("existing_vpc_id") or ""),
            "ExistingPrivateSubnetIds": ",".join(env_cfg.get("existing_private_subnet_ids") or []),
            "UseRdsProxy": "true" if env_cfg.get("use_rds_proxy") else "false",
            "DbInstanceClass": str(env_cfg.get("db_instance_class") or "db.t4g.micro"),
            "DbAllocatedStorage": str(env_cfg.get("db_allocated_storage", 20)),
            "DbAvailabilityZone": str(env_cfg.get("db_availability_zone") or ""),
            "DbIdentifierSuffix": str(env_cfg.get("db_identifier_suffix") or ""),
            "ServiceHoursEnabled": "true" if hours.get("enabled", True) else "false",
            "ServiceTimezone": str(hours.get("timezone") or "America/Costa_Rica"),
            "ServiceWarmupCron": cron(str(hours.get("warmup", "04:45")), str(hours.get("days", "*"))),
            "ServiceStartCron": cron(str(hours.get("start", "05:00")), str(hours.get("days", "*"))),
            "ServiceStopCron": cron(str(hours.get("stop", "17:00")), str(hours.get("days", "*"))),
            # cada 15 min dentro del horario se repite "start" (idempotente): recupera un arranque fallido
            "ServiceEnsureCron": (f"cron(0/15 {int(str(hours.get('start', '05:00')).split(':')[0])}-"
                                  f"{int(str(hours.get('stop', '17:00')).split(':')[0]) - 1} ? * "
                                  f"{str(hours.get('days', '*')) or '*'} *)"),
        }
        if env_cfg.get("db_engine_version"):
            params["DbEngineVersion"] = str(env_cfg["db_engine_version"])
        if params["CreateNetwork"] == "false" and (not params["ExistingVpcId"] or not params["ExistingPrivateSubnetIds"]):
            fail("create_network: false exige existing_vpc_id y existing_private_subnet_ids en deploy/config.yaml")
        write_json(self.build / "platform-parameters.json", params)
        if self.dry:
            self.step("plataforma", "DRY-RUN", f"{path.relative_to(self.root)} ({len(render(self.info)['Resources'])} recursos)")
            return {}
        tags = {"Project": self.label, "Environment": self.env.upper(), "Name": self.platform_stack}
        if len(template.encode("utf-8")) > 51200:  # límite de TemplateBody: se envía en JSON compacto
            template = json.dumps(render(self.info), separators=(",", ":"), ensure_ascii=False)
        outputs = deploy_stack(self.client("cloudformation"), self.platform_stack, template_body=template,
                               parameters=params, tags=tags, approve=self.approve(), log=log)
        self.step("plataforma", "OK", f"{self.platform_stack} · RDS {outputs.get('DbInstanceId')} · "
                                      f"frontend {outputs.get('FrontendUrl')}")
        return outputs


    def ensure_cluster(self, outputs: dict[str, str]) -> None:
        rds = self.client("rds")
        db = outputs["DbInstanceId"]
        for _ in range(120):
            status = rds.describe_db_instances(DBInstanceIdentifier=db)["DBInstances"][0]["DBInstanceStatus"]
            if status == "available":
                return
            if status == "stopped":
                log(f"RDS {db} detenida (fuera de horario): se arranca para desplegar")
                rds.start_db_instance(DBInstanceIdentifier=db)
            log(f"esperando RDS ({status})…")
            time.sleep(20)
        fail(f"RDS {db} no quedó disponible a tiempo.", 1)

    # ------------------------------------------------------------------ base de datos
    def database_bundle(self) -> Path:
        names = ["aurora_postgresql_provisioning.sql", "aurora_postgresql_schema.sql", "aurora_postgresql_validation.sql"]
        load_data = not getattr(self.args, "no_data", False)
        if load_data and (self.db_dir / "aurora_postgresql_data.sql").exists():
            names.append("aurora_postgresql_data.sql")
        bundle = self.build / "database.zip"
        with zipfile.ZipFile(bundle, "w", zipfile.ZIP_DEFLATED) as zf:
            for name in names:
                zf.write(self.db_dir / name, name)
            for change in list_changes(self.root / "database"):
                zf.writestr(f"changes_run/{change.stem}.sql", wrapper_sql(change, self.db_ctx))
        return bundle

    def database(self) -> None:
        bundle = self.database_bundle()
        with zipfile.ZipFile(bundle) as zf:
            content = sorted(zf.namelist())
        if self.dry:
            self.step("base de datos", "DRY-RUN", f"{bundle.relative_to(self.root)}: {', '.join(content)}")
            return
        outputs = self.platform_outputs()
        self.ensure_cluster(outputs)
        self.snapshot_if_destructive(outputs["DbInstanceId"])
        digest = hashlib.sha256(bundle.read_bytes()).hexdigest()[:16]
        uri = upload(self.client("s3"), outputs["ArtifactsBucket"], f"db/{self.env}/{digest}.zip", bundle)
        load = "true" if "aurora_postgresql_data.sql" in content else "false"
        cb = self.client("codebuild")
        build_id = cb.start_build(projectName=outputs["DbRunnerProject"], environmentVariablesOverride=[
            {"name": "BUNDLE_S3", "value": uri, "type": "PLAINTEXT"},
            {"name": "ENV_DIR", "value": ".", "type": "PLAINTEXT"},
            {"name": "LOAD_DATA", "value": load, "type": "PLAINTEXT"}])["build"]["id"]
        log(f"runner de BD iniciado ({build_id}); scripts: {', '.join(content)}")
        while True:
            build = cb.batch_get_builds(ids=[build_id])["builds"][0]
            if build["buildStatus"] != "IN_PROGRESS":
                break
            log(f"  fase {build.get('currentPhase')}…")
            time.sleep(15)
        tail = self._build_logs(build)
        if build["buildStatus"] != "SUCCEEDED":
            fail(f"El runner de BD terminó {build['buildStatus']}:\n" + "\n".join(tail[-60:]), 1)
        self.step("base de datos", "OK", f"{self.db_ctx['database']}: provisioning, schema, {len(list_changes(self.root / 'database'))} "
                                         f"cambios{', datos' if load == 'true' else ''}, validación TOTAL_FALTA=0")

    def snapshot_if_destructive(self, cluster: str) -> None:
        """Antes de un cambio destructivo aprobado: snapshot manual del cluster (punto de restauración)."""
        from _changes import APPROVED

        risky = [c.stem for c in list_changes(self.root / "database") if APPROVED.search(c.read_text(encoding="utf-8"))]
        if not risky:
            return
        rds = self.client("rds")
        snap = f"{cluster}-pre-{risky[-1].replace('_', '-')}-{int(time.time())}"[:63]
        rds.create_db_snapshot(DBSnapshotIdentifier=snap, DBInstanceIdentifier=cluster,
                               Tags=[{"Key": "Project", "Value": self.label}, {"Key": "Reason", "Value": "pre-change"}])
        log(f"snapshot {snap} (cambios destructivos aprobados: {', '.join(risky)}); esperando…")
        rds.get_waiter("db_snapshot_available").wait(DBSnapshotIdentifier=snap,
                                                     WaiterConfig={"Delay": 20, "MaxAttempts": 180})
        self.step("snapshot previo", "OK", snap)

    def _build_logs(self, build: dict[str, Any]) -> list[str]:
        logs = build.get("logs") or {}
        if not logs.get("groupName") or not logs.get("streamName"):
            return []
        events = self.client("logs").get_log_events(logGroupName=logs["groupName"], logStreamName=logs["streamName"],
                                                    limit=200, startFromHead=False)["events"]
        return [e["message"].rstrip() for e in events]

    # ------------------------------------------------------------------ backend
    def backend(self) -> dict[str, str]:
        arch = str(((self.manifest.get("target") or {}).get("lambda") or {}).get("architecture") or "x86_64")
        zip_path, code_hash = package(self.root / "backend", self.build, arch)
        template_text = (self.root / "backend" / "template.yaml").read_text(encoding="utf-8")
        overrides = dict(str(item).split("=", 1) for item in self.sam.get("parameter_overrides") or [])
        tags = dict(str(item).split("=", 1) for item in self.sam.get("tags") or [])
        if self.dry:
            packaged = packaged_template(template_text, f"s3://<bucket-de-artefactos>/backend/{zip_path.name}")
            (self.build / "backend-packaged.yaml").write_text(packaged, encoding="utf-8")
            self.step("backend", "DRY-RUN", f"{zip_path.name} ({zip_path.stat().st_size // 1024} KB) · stack {self.api_stack} · "
                                            f"{len(overrides)} parámetros")
            return {}
        outputs = self.platform_outputs()
        bucket = outputs["ArtifactsBucket"]
        s3 = self.client("s3")
        code_uri = upload(s3, bucket, f"backend/{self.env}/{zip_path.name}", zip_path)
        packaged = packaged_template(template_text, code_uri)
        tpl_path = self.build / "backend-packaged.yaml"
        tpl_path.write_text(packaged, encoding="utf-8")
        key = f"templates/{self.env}/backend-{hashlib.sha256(packaged.encode()).hexdigest()[:16]}.yaml"
        upload(s3, bucket, key, tpl_path)
        url = f"https://{bucket}.s3.{self.region}.amazonaws.com/{key}"
        api = deploy_stack(self.client("cloudformation"), self.api_stack, template_url=url, parameters=overrides,
                           tags=tags, approve=self.approve(), log=log)
        self.step("backend", "OK", f"{self.api_stack} · código {code_hash} · API {api.get('ApiUrl')}")
        return api

    # ------------------------------------------------------------------ frontend (Next.js SSR en Lambda)
    def frontend(self) -> str:
        """Código fuente → S3 → CodeBuild (docker build con NEXT_PUBLIC_*) → ECR → la Lambda del frontend toma la imagen nueva."""
        front = self.root / "frontend"
        skip = {"node_modules", ".next", "out", "dist", ".turbo", "coverage"}
        archive = self.build / "frontend-src.zip"
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zf:
            for path in sorted(front.rglob("*")):
                rel = path.relative_to(front)
                if path.is_file() and not (set(rel.parts) & skip) and not rel.name.startswith(".env"):
                    zf.write(path, str(rel).replace("\\", "/"))
        digest = hashlib.sha256(archive.read_bytes()).hexdigest()[:16]
        if self.dry:
            self.step("frontend", "DRY-RUN", f"{archive.name} ({archive.stat().st_size // 1024} KB) → CodeBuild → ECR → Lambda")
            return ""
        platform = self.platform_outputs()
        api = stack_outputs(self.client("cloudformation"), self.api_stack)
        if not api.get("ApiUrl"):
            fail(f"{self.api_stack} no tiene la salida ApiUrl: despliegue el backend primero.", 1)
        realtime = bool((self.manifest.get("realtime") or {}).get("enabled"))
        build_args = {
            "NEXT_PUBLIC_API_BASE_URL": api["ApiUrl"], "NEXT_PUBLIC_COGNITO_USER_POOL_ID": api.get("UserPoolId", ""),
            "NEXT_PUBLIC_COGNITO_CLIENT_ID": api.get("UserPoolClientId", ""),
            "NEXT_PUBLIC_COGNITO_DOMAIN": api.get("UserPoolDomain", ""),
            "NEXT_PUBLIC_APP_URL": platform["FrontendUrl"],
            "NEXT_PUBLIC_APP_EXPOSURE": str((self.manifest.get("project") or {}).get("exposure") or "internal"),
            "NEXT_PUBLIC_REALTIME_ENABLED": "true" if realtime else "false"}
        uri = upload(self.client("s3"), platform["ArtifactsBucket"], f"web/{self.env}/{digest}.zip", archive)
        cb = self.client("codebuild")
        overrides = [{"name": "SOURCE_S3", "value": uri, "type": "PLAINTEXT"},
                     {"name": "IMAGE_TAG", "value": digest, "type": "PLAINTEXT"}]
        overrides += [{"name": k, "value": v, "type": "PLAINTEXT"} for k, v in build_args.items()]
        build_id = cb.start_build(projectName=platform["WebBuilderProject"],
                                  environmentVariablesOverride=overrides)["build"]["id"]
        log(f"construcción de la imagen del frontend iniciada ({build_id})")
        while True:
            build = cb.batch_get_builds(ids=[build_id])["builds"][0]
            if build["buildStatus"] != "IN_PROGRESS":
                break
            log(f"  fase {build.get('currentPhase')}…")
            time.sleep(20)
        if build["buildStatus"] != "SUCCEEDED":
            fail(f"La construcción del frontend terminó {build['buildStatus']}:\n" + "\n".join(self._build_logs(build)[-60:]), 1)
        checks = []
        if platform.get("WebFunctionName"):
            lam = self.client("lambda")
            lam.update_function_code(FunctionName=platform["WebFunctionName"],
                                     ImageUri=f"{platform['WebRepositoryUri']}:{digest}")
            lam.get_waiter("function_updated_v2").wait(FunctionName=platform["WebFunctionName"])
            log(f"Lambda {platform['WebFunctionName']} actualizada a la imagen {digest}")
            checks.append(platform["WebFunctionUrl"].rstrip("/"))
        url = platform["FrontendUrl"]
        for target in checks + [url]:
            for _ in range(30):
                try:
                    with urllib.request.urlopen(target + "/login", timeout=20) as response:  # noqa: S310 - URL propia
                        if response.status < 500:
                            break
                except Exception:  # noqa: BLE001 - el contenedor puede tardar en levantar
                    pass
                time.sleep(20)
            else:
                fail(f"El frontend no respondió en {target}", 1)
        self.step("frontend", "OK", f"{url} · imagen {digest}")
        return url


    def hours(self, action: str) -> dict[str, Any]:
        cfg = self.config["service_hours"]
        if action == "enforce":
            if not cfg.get("enabled", True) or getattr(self.args, "keep_running", False):
                self.step("horario de servicio", "OK", "sin aplicar (deshabilitado o --keep-running)")
                return {}
            now = now_in(str(cfg.get("timezone")))
            start, stop = (datetime.strptime(str(cfg[k]), "%H:%M").time() for k in ("start", "stop"))
            action = "start" if start <= now.time() < stop else "stop"
            log(f"{now:%H:%M} en {cfg.get('timezone')}: horario {cfg['start']}-{cfg['stop']} → {action}")
        if self.dry:
            self.step("horario de servicio", "DRY-RUN", f"{action} · warmup {cfg['warmup']} · start {cfg['start']} · "
                                                        f"stop {cfg['stop']} ({cfg['timezone']})")
            return {}
        fn = self.platform_outputs()["ServiceHoursFunction"]
        response = self.client("lambda").invoke(FunctionName=fn, Payload=json.dumps({"action": action}).encode())
        result = json.loads(response["Payload"].read() or b"{}")
        if response.get("FunctionError"):
            fail(f"service-hours falló: {result}", 1)
        self.step("horario de servicio", "OK", json.dumps(result, ensure_ascii=False))
        return result

    # ------------------------------------------------------------------ usuarios y plan
    def user_add(self, email: str, group: str | None) -> None:
        pool = stack_outputs(self.client("cloudformation"), self.api_stack).get("UserPoolId")
        if not pool:
            fail("El backend no tiene UserPoolId (¿Cognito externo o backend sin desplegar?).", 1)
        idp = self.client("cognito-idp")
        try:
            idp.admin_create_user(UserPoolId=pool, Username=email, DesiredDeliveryMediums=["EMAIL"],
                                  UserAttributes=[{"Name": "email", "Value": email},
                                                  {"Name": "email_verified", "Value": "true"}])
            log(f"usuario {email} creado: Cognito envía la contraseña temporal por correo")
        except idp.exceptions.UsernameExistsException:
            log(f"usuario {email} ya existe")
        if group:
            idp.admin_add_user_to_group(UserPoolId=pool, Username=email, GroupName=group)
            log(f"{email} agregado al grupo {group}")

    def plan(self) -> None:
        cfn = self.client("cloudformation")
        log(f"Cuenta {self.client('sts').get_caller_identity()['Account']} · región {self.region} · ambiente {self.env}")
        for name in (self.platform_stack, self.api_stack):
            log(f"  stack {name}: {stack_status(cfn, name) or 'NO EXISTE (se creará)'}")
        outputs = stack_outputs(cfn, self.platform_stack)
        if outputs:
            status = self.client("rds").describe_db_instances(
                DBInstanceIdentifier=outputs["DbInstanceId"])["DBInstances"][0]["DBInstanceStatus"]
            log(f"  RDS {outputs['DbInstanceId']}: {status}")
            log(f"  frontend: {outputs.get('FrontendUrl')}")
        ssm = self.client("ssm")
        for item in self.sam.get("parameter_overrides") or []:
            key, value = str(item).split("=", 1)
            if value.startswith("/") and key != "DbSecretName":
                try:
                    ssm.get_parameter(Name=value)
                    log(f"  SSM {value}: OK")
                except ssm.exceptions.ParameterNotFound:
                    log(f"  SSM {value}: falta (lo crea la plataforma)")

    def write_report(self) -> None:
        self.report["finished_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        write_json(self.root / "deploy" / f"deploy-{self.env}.json", self.report)
        lines = [f"# Despliegue {self.env} — {self.label}", "", f"Inicio: {self.report['started_at']} · "
                 f"fin: {self.report['finished_at']}", "", "| Paso | Estado | Detalle |", "|---|---|---|"]
        lines += [f"| {s['step']} | {s['status']} | {s['detail'].replace('|', '/')} |" for s in self.report["steps"]]
        hours = self.config["service_hours"]
        lines += ["", f"Horario de servicio: {hours['start']}–{hours['stop']} ({hours['timezone']}), arranque de la base "
                      f"{hours['warmup']}. Fuera de ese horario las Lambdas quedan en concurrencia 0 y RDS detenido."]
        (self.root / "deploy" / f"DEPLOY_{self.env}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def cmd_init(root: Path) -> int:
    path = root / "deploy" / "config.yaml"
    if path.exists():
        log(f"{path} ya existe")
        return 0
    write_yaml(path, DEFAULT_CONFIG)
    path.write_text("# Configuración de despliegue (aws-project-deployer). Horario en la zona indicada; days: * o MON-FRI.\n"
                    "# Para usar una VPC existente: create_network: false + existing_vpc_id + existing_private_subnet_ids\n"
                    "# (subredes privadas con salida a Internet por NAT).\n" + path.read_text(encoding="utf-8"),
                    encoding="utf-8")
    log(f"Creado {path}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=("init", "plan", "all", "platform", "database", "backend", "frontend", "hours",
                                            "user-add"))
    parser.add_argument("--project", type=Path, default=Path("."))
    parser.add_argument("--env", choices=ENVS, default="dev")
    parser.add_argument("--approve", action="store_true", help="obligatorio para prod (confirmación del usuario)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--no-data", action="store_true", help="no cargar aurora_postgresql_data.sql")
    parser.add_argument("--keep-running", action="store_true", help="no aplicar el horario al terminar")
    parser.add_argument("--allow-unvalidated", action="store_true", help="solo dev: desplegar sin COMPLETE")
    parser.add_argument("--action", choices=("status", "start", "stop", "warmup", "enforce"), default="status")
    parser.add_argument("--email")
    parser.add_argument("--group")
    args = parser.parse_args(argv)
    if args.command == "init":
        return cmd_init(args.project.resolve())
    d = Deployer(args.project, args.env, args)
    try:
        if args.command == "plan":
            d.plan()
            return 0
        if args.command == "user-add":
            if not args.email:
                fail("--email es obligatorio")
            d.user_add(args.email, args.group)
            return 0
        if args.command == "hours":
            d.hours(args.action)
            return 0
        if args.command in ("all", "platform", "database", "backend", "frontend") and not args.dry_run:
            d.gate()
        if args.command in ("all", "platform"):
            d.platform()
        if args.command in ("all", "database"):
            d.database()
        if args.command in ("all", "backend"):
            d.backend()
        if args.command in ("all", "frontend"):
            d.frontend()
        if args.command == "all":
            d.hours("enforce")
    except NeedsApproval as pending:
        log(f"PENDIENTE DE APROBACIÓN: {pending}. Revise los cambios listados y repita con --approve.")
        d.write_report()
        return 3
    d.write_report()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
