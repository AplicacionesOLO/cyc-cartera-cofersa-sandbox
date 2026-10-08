"""Horario de servicio: enciende y apaga los servicios del proyecto (EventBridge Scheduler -> esta Lambda).

warmup: arranca RDS y el EC2 del frontend · start: habilita las Lambdas · stop: Lambdas a concurrencia 0,
detiene el EC2 y RDS · status: estado actual. Solo toca la instancia RDS, el EC2 y las funciones del proyecto.
"""
import json
import os

import boto3
from botocore.exceptions import ClientError

rds = boto3.client("rds")
ec2 = boto3.client("ec2")
lam = boto3.client("lambda")
cfn = boto3.client("cloudformation")


def functions():
    names = []
    for stack in filter(None, os.environ.get("APP_STACKS", "").split(",")):
        try:
            for page in cfn.get_paginator("list_stack_resources").paginate(StackName=stack):
                names += [r["PhysicalResourceId"] for r in page["StackResourceSummaries"]
                          if r["ResourceType"] == "AWS::Lambda::Function"]
        except ClientError as error:
            if "does not exist" not in str(error):
                raise
    return names


def db_status(db):
    return rds.describe_db_instances(DBInstanceIdentifier=db)["DBInstances"][0]["DBInstanceStatus"]


def web_status(iid):
    return ec2.describe_instances(InstanceIds=[iid])["Reservations"][0]["Instances"][0]["State"]["Name"]


def handler(event, context=None):
    action = (event or {}).get("action", "status")
    db = os.environ["DB_INSTANCE_ID"]
    web = os.environ.get("WEB_INSTANCE_ID", "")
    status = db_status(db)
    result = {"action": action, "db_before": status, "db": status, "functions": 0}
    if web:
        result["web"] = web_status(web)
    db_error = None
    if action in ("warmup", "start"):
        if status == "stopped":
            # Sin capacidad en la AZ (InsufficientDBInstanceCapacity) no se frena el resto: se enciende lo demás
            # y al final se lanza el error para que el Scheduler reintente.
            try:
                rds.start_db_instance(DBInstanceIdentifier=db)
                result["db"] = "starting"
            except ClientError as error:
                db_error = error
                result["db_error"] = error.response["Error"]["Code"]
        if web and result["web"] == "stopped":
            ec2.start_instances(InstanceIds=[web])
            result["web"] = "pending"
    if action == "start":
        for name in functions():
            lam.delete_function_concurrency(FunctionName=name)
            result["functions"] += 1
    elif action == "stop":
        for name in functions():
            lam.put_function_concurrency(FunctionName=name, ReservedConcurrentExecutions=0)
            result["functions"] += 1
        if web and result["web"] == "running":
            ec2.stop_instances(InstanceIds=[web])
            result["web"] = "stopping"
        if status == "available":
            rds.stop_db_instance(DBInstanceIdentifier=db)
            result["db"] = "stopping"
    elif action == "status":
        result["disabled"] = [n for n in functions()
                              if lam.get_function_concurrency(FunctionName=n).get("ReservedConcurrentExecutions") == 0]
    print(json.dumps(result))
    if db_error:
        raise db_error
    return result
