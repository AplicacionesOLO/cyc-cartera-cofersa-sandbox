"""Sesión AWS desde .env.aws y despliegue de stacks CloudFormation con change sets (compartido)."""

from __future__ import annotations

import os
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from _common import fail

CREDENTIALS_FILE = ".env.aws"
REQUIRED = ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION")
CAPABILITIES = ["CAPABILITY_IAM", "CAPABILITY_NAMED_IAM", "CAPABILITY_AUTO_EXPAND"]
TEMPLATE = """# Credenciales del usuario IAM de despliegue (aws-project-deployer / aws-project-maintainer).
# NO se versiona (.gitignore) ni se copia a otras carpetas. Rotar la access key al terminar.
#
#   AWS_IAM_USER           nombre del usuario IAM (informativo; se verifica con STS)
#   AWS_ACCESS_KEY_ID      IAM → Users → <usuario> → Security credentials → Create access key (AKIA...)
#   AWS_SECRET_ACCESS_KEY  se muestra una sola vez al crear la access key
#   AWS_REGION             región del proyecto (p. ej. us-east-1)
#   AWS_SESSION_TOKEN      solo si son credenciales temporales (STS/SSO)
# Permisos mínimos del usuario: references/iam-deploy-policy.json

AWS_IAM_USER=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
AWS_SESSION_TOKEN=
"""


def load_credentials(path: Path) -> dict[str, str]:
    if not path.exists():
        fail(f"No existe {path}. Ejecute: python scripts/aws_connect.py init  y complete los valores.", 4)
    data: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip().strip('"').strip("'")
        if value:
            data[key.strip().removeprefix("export ").strip()] = value
    missing = [k for k in REQUIRED if not data.get(k)]
    if missing:
        fail(f"{path}: faltan {', '.join(missing)}", 4)
    return data


def session(creds: dict[str, str]):
    try:
        import boto3
    except ImportError:
        fail("Falta boto3: python -m pip install boto3", 4)
    return boto3.Session(aws_access_key_id=creds["AWS_ACCESS_KEY_ID"], aws_secret_access_key=creds["AWS_SECRET_ACCESS_KEY"],
                         aws_session_token=creds.get("AWS_SESSION_TOKEN") or None, region_name=creds["AWS_REGION"])


def subprocess_env(creds: dict[str, str]) -> dict[str, str]:
    """Entorno para herramientas externas (aws/sam/npm) sin escribir las claves en disco ni en la línea de comandos."""
    env = {**os.environ, "AWS_ACCESS_KEY_ID": creds["AWS_ACCESS_KEY_ID"],
           "AWS_SECRET_ACCESS_KEY": creds["AWS_SECRET_ACCESS_KEY"], "AWS_REGION": creds["AWS_REGION"],
           "AWS_DEFAULT_REGION": creds["AWS_REGION"]}
    if creds.get("AWS_SESSION_TOKEN"):
        env["AWS_SESSION_TOKEN"] = creds["AWS_SESSION_TOKEN"]
    return env


class NeedsApproval(Exception):
    """El change set está listo pero el ambiente exige aprobación explícita (--approve)."""


def stack_status(cfn, name: str) -> str | None:
    try:
        return cfn.describe_stacks(StackName=name)["Stacks"][0]["StackStatus"]
    except cfn.exceptions.ClientError as error:
        if "does not exist" in str(error):
            return None
        raise


def stack_outputs(cfn, name: str) -> dict[str, str]:
    try:
        stack = cfn.describe_stacks(StackName=name)["Stacks"][0]
    except cfn.exceptions.ClientError:
        return {}
    return {o["OutputKey"]: o["OutputValue"] for o in stack.get("Outputs") or []}


def _failure_events(cfn, name: str, limit: int = 15) -> list[str]:
    events = cfn.describe_stack_events(StackName=name)["StackEvents"]
    bad = [e for e in events if e["ResourceStatus"].endswith("_FAILED")]
    return [f"{e['LogicalResourceId']} ({e['ResourceType']}): {e.get('ResourceStatusReason', '')}" for e in bad[:limit]]


def deploy_stack(cfn, name: str, *, template_url: str | None = None, template_body: str | None = None,
                 parameters: dict[str, str], tags: dict[str, str], approve: bool, log: Callable[[str], None]) -> dict:
    """Crea o actualiza el stack con un change set. Sin cambios → no hace nada. Devuelve las salidas."""
    status = stack_status(cfn, name)
    if status == "ROLLBACK_COMPLETE":
        log(f"{name}: quedó en ROLLBACK_COMPLETE tras una creación fallida; se elimina para recrearlo")
        cfn.delete_stack(StackName=name)
        cfn.get_waiter("stack_delete_complete").wait(StackName=name, WaiterConfig={"Delay": 10, "MaxAttempts": 180})
        status = None
    if status and status.endswith("_IN_PROGRESS"):
        fail(f"{name} está en {status}: espere a que termine y reintente.", 1)
    kind = "UPDATE" if status else "CREATE"
    change_set = f"deploy-{int(time.time())}"
    args: dict[str, Any] = {
        "StackName": name, "ChangeSetName": change_set, "ChangeSetType": kind, "Capabilities": CAPABILITIES,
        "Parameters": [{"ParameterKey": k, "ParameterValue": v} for k, v in parameters.items()],
        "Tags": [{"Key": k, "Value": v} for k, v in tags.items()],
    }
    args["TemplateURL" if template_url else "TemplateBody"] = template_url or template_body
    cfn.create_change_set(**args)
    try:
        cfn.get_waiter("change_set_create_complete").wait(StackName=name, ChangeSetName=change_set,
                                                          WaiterConfig={"Delay": 5, "MaxAttempts": 120})
    except Exception:  # noqa: BLE001 - se inspecciona el motivo
        desc = cfn.describe_change_set(StackName=name, ChangeSetName=change_set)
        reason = desc.get("StatusReason", "")
        if "didn't contain changes" in reason or "No updates are to be performed" in reason:
            cfn.delete_change_set(StackName=name, ChangeSetName=change_set)
            log(f"{name}: sin cambios")
            return stack_outputs(cfn, name)
        fail(f"{name}: el change set falló: {reason}", 1)
    changes = cfn.describe_change_set(StackName=name, ChangeSetName=change_set)["Changes"]
    for change in changes[:60]:
        rc = change["ResourceChange"]
        replace = " (REEMPLAZO)" if rc.get("Replacement") == "True" else ""
        log(f"  {rc['Action']:<7} {rc['LogicalResourceId']} [{rc['ResourceType']}]{replace}")
    if len(changes) > 60:
        log(f"  … y {len(changes) - 60} cambios más")
    if not approve:
        raise NeedsApproval(f"{name}: change set {change_set} listo ({len(changes)} cambios); requiere --approve")
    cfn.execute_change_set(StackName=name, ChangeSetName=change_set)
    waiter = cfn.get_waiter("stack_create_complete" if kind == "CREATE" else "stack_update_complete")
    try:
        waiter.wait(StackName=name, WaiterConfig={"Delay": 15, "MaxAttempts": 360})
    except Exception:  # noqa: BLE001
        fail(f"{name}: el despliegue falló:\n  " + "\n  ".join(_failure_events(cfn, name)), 1)
    log(f"{name}: {'creado' if kind == 'CREATE' else 'actualizado'}")
    return stack_outputs(cfn, name)


def upload(s3, bucket: str, key: str, path: Path) -> str:
    s3.upload_file(str(path), bucket, key, ExtraArgs={"ServerSideEncryption": "AES256"})
    return f"s3://{bucket}/{key}"
