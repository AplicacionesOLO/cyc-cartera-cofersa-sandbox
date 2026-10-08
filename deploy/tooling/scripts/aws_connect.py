#!/usr/bin/env python3
"""Credenciales AWS del usuario IAM de despliegue en un único archivo (.env.aws).

    python scripts/aws_connect.py init      # crea .env.aws (plantilla) y lo agrega a .gitignore
    python scripts/aws_connect.py check     # identidad (STS), región y permisos clave, sin mostrar secretos

Nunca imprime la secret key; las herramientas externas reciben las credenciales por variables de entorno.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _aws import CREDENTIALS_FILE, TEMPLATE, load_credentials, session  # noqa: E402

KEY_ACTIONS = ["cloudformation:CreateChangeSet", "iam:CreateRole", "iam:PassRole", "lambda:CreateFunction",
               "rds:CreateDBCluster", "ec2:CreateVpc", "secretsmanager:CreateSecret", "ssm:PutParameter",
               "s3:CreateBucket", "amplify:CreateApp", "codebuild:CreateProject", "scheduler:CreateSchedule",
               "apigateway:POST", "cognito-idp:CreateUserPool", "sqs:CreateQueue", "dynamodb:CreateTable"]


def cmd_init(args: argparse.Namespace) -> int:
    path = Path(args.file)
    if path.exists():
        print(f"{path} ya existe: complete los valores y ejecute 'check'.")
    else:
        path.write_text(TEMPLATE, encoding="utf-8")
        os.chmod(path, 0o600)
        print(f"Creado {path}: complete AWS_IAM_USER, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY y AWS_REGION.")
    gitignore = path.resolve().parent / ".gitignore"
    lines = gitignore.read_text(encoding="utf-8").splitlines() if gitignore.exists() else []
    if path.name not in lines:
        gitignore.write_text("\n".join([*lines, path.name]) + "\n", encoding="utf-8")
        print(f"Agregado {path.name} a .gitignore")
    return 0


def cmd_check(args: argparse.Namespace) -> int:
    creds = load_credentials(Path(args.file))
    sess = session(creds)
    try:
        identity = sess.client("sts").get_caller_identity()
    except Exception as error:  # noqa: BLE001 - se informa la causa
        print(f"Credenciales inválidas o sin red a AWS: {error}")
        return 1
    print(f"Cuenta: {identity['Account']}  Región: {creds['AWS_REGION']}")
    print(f"Identidad: {identity['Arn']}")
    expected = creds.get("AWS_IAM_USER")
    if expected and not identity["Arn"].endswith(f":user/{expected}") and f"/{expected}" not in identity["Arn"]:
        print(f"AVISO: la access key no pertenece a AWS_IAM_USER={expected}")
    print(f"Access key: {creds['AWS_ACCESS_KEY_ID'][:4]}… (secret configurada, {len(creds['AWS_SECRET_ACCESS_KEY'])} car.)")
    if ":user/" in identity["Arn"]:
        try:
            result = sess.client("iam").simulate_principal_policy(PolicySourceArn=identity["Arn"], ActionNames=KEY_ACTIONS)
            denied = [r["EvalActionName"] for r in result["EvaluationResults"] if r["EvalDecision"] != "allowed"]
            print("Permisos clave: " + ("OK" if not denied else "FALTAN " + ", ".join(denied)))
            if denied:
                print("Aplique references/iam-deploy-policy.json al usuario.")
                return 1
        except Exception as error:  # noqa: BLE001
            print(f"No se pudieron simular permisos ({type(error).__name__}): se verificarán al desplegar.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--file", default=CREDENTIALS_FILE)
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("init")
    sub.add_parser("check")
    args = parser.parse_args(argv)
    return {"init": cmd_init, "check": cmd_check}[args.cmd](args)


if __name__ == "__main__":
    raise SystemExit(main())
