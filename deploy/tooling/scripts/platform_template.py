#!/usr/bin/env python3
"""Template CloudFormation de la PLATAFORMA del proyecto (una pila por ambiente: <amb>-<app>-platform).

Variante CYC Cofersa (adaptada de aws-project-deployer): RDS PostgreSQL en instancia (db.t4g.micro por
defecto) en lugar de Aurora Serverless, y el frontend Next.js (SSR) en Lambda (imagen Docker) detrás de CloudFront
(HTTPS) en lugar de Amplify. La imagen se construye en CodeBuild y se publica en ECR.

Crea lo que el backend SAM espera encontrar y que el proyecto no trae: red (o usa una VPC existente), RDS
PostgreSQL cifrado, secretos de los 4 usuarios del aplicativo, RDS Proxy (opcional), los parámetros SSM que lee
samconfig.toml, la Lambda + CloudFront + ECR del frontend, el bucket de artefactos, el runner de base de datos
(CodeBuild dentro de la VPC: provisioning → schema → cambios → datos → validación) y el HORARIO DE SERVICIO
(EventBridge Scheduler: arranque, encendido y apagado de RDS y Lambdas en la zona horaria configurada).

    python scripts/platform_template.py --project . --out deploy/platform.yaml
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _common import fail, manifest_path, read_config  # noqa: E402

SKILL_DIR = Path(__file__).resolve().parent.parent
LAMBDA_SOURCE = SKILL_DIR / "assets" / "service_hours.py"
ENI_ACTIONS = ["ec2:CreateNetworkInterface", "ec2:DescribeNetworkInterfaces", "ec2:DeleteNetworkInterface",
               "ec2:DescribeSubnets", "ec2:DescribeSecurityGroups", "ec2:DescribeVpcs", "ec2:DescribeDhcpOptions"]
# CloudFront: políticas administradas por AWS (ids fijos y públicos)
CACHE_DISABLED = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
CACHE_OPTIMIZED = "658327ea-f89d-4fab-a63d-7e88639e58f6"
ORIGIN_ALL_VIEWER_EXCEPT_HOST = "b689b0a8-53d0-40ab-baf2-68738e2966ac"

WEB_BUILDSPEC = r"""version: 0.2
env:
  shell: bash
phases:
  build:
    commands:
      - |
        set -euo pipefail
        aws s3 cp "$SOURCE_S3" /tmp/web.zip --quiet
        mkdir -p /tmp/web && unzip -q -o /tmp/web.zip -d /tmp/web && cd /tmp/web
        REGISTRY="${REPOSITORY_URI%%/*}"
        aws ecr get-login-password | docker login --username AWS --password-stdin "$REGISTRY"
        docker build -t "$REPOSITORY_URI:latest" -t "$REPOSITORY_URI:$IMAGE_TAG" \
          --build-arg NEXT_PUBLIC_API_BASE_URL --build-arg NEXT_PUBLIC_COGNITO_USER_POOL_ID \
          --build-arg NEXT_PUBLIC_COGNITO_CLIENT_ID --build-arg NEXT_PUBLIC_COGNITO_DOMAIN \
          --build-arg NEXT_PUBLIC_APP_URL --build-arg NEXT_PUBLIC_APP_EXPOSURE \
          --build-arg NEXT_PUBLIC_REALTIME_ENABLED .
        docker push "$REPOSITORY_URI:$IMAGE_TAG"
        docker push "$REPOSITORY_URI:latest"
        echo 'IMAGEN PUBLICADA'
"""



def Ref(x: str) -> dict:  # noqa: N802
    return {"Ref": x}


def Sub(x: str) -> dict:  # noqa: N802
    return {"Fn::Sub": x}


def GetAtt(resource: str, attr: str) -> dict:  # noqa: N802
    return {"Fn::GetAtt": [resource, attr]}


def If(cond: str, a: Any, b: Any) -> dict:  # noqa: N802
    return {"Fn::If": [cond, a, b]}


def AZ(i: int) -> dict:  # noqa: N802
    return {"Fn::Select": [i, {"Fn::GetAZs": ""}]}


def tags(name: dict | str) -> list[dict]:
    return [{"Key": "Project", "Value": Ref("ProjectLabel")}, {"Key": "Environment", "Value": Ref("EnvironmentTag")},
            {"Key": "Name", "Value": name}]


def ssm(name: str, value: Any, kind: str = "String") -> dict:
    return {"Type": "AWS::SSM::Parameter",
            "Properties": {"Name": Sub(f"/${{Environment}}/${{ProjectSlug}}/{name}"), "Type": kind, "Value": value,
                           "Tags": {"Project": Ref("ProjectLabel"), "Environment": Ref("EnvironmentTag")}}}


def secret(key: str, description: str) -> dict:
    return {"Type": "AWS::SecretsManager::Secret",
            "Properties": {
                "Name": Sub(f"/${{Environment}}/${{ProjectSlug}}/db/{key}"),
                "Description": description,
                "GenerateSecretString": {
                    "SecretStringTemplate": Sub(f'{{"username": "${{{key.capitalize()}User}}"}}'),
                    "GenerateStringKey": "password", "PasswordLength": 32, "RequireEachIncludedType": True,
                    "ExcludeCharacters": "\"'`\\/@ :;{}[]$&|<>",
                },
                "Tags": tags(Sub(f"/${{Environment}}/${{ProjectSlug}}/db/{key}")),
            }}


BUILDSPEC = r"""version: 0.2
env:
  shell: bash
phases:
  install:
    commands:
      - dnf install -y -q postgresql16 unzip > /dev/null
  build:
    commands:
      - |
        set -euo pipefail
        aws s3 cp "$BUNDLE_S3" /tmp/db.zip --quiet
        mkdir -p /tmp/db && unzip -q -o /tmp/db.zip -d /tmp/db && cd "/tmp/db/$ENV_DIR"
        field() { python3 -c 'import json,sys; print(json.loads(sys.stdin.read())[sys.argv[1]])' "$1"; }
        secret() { aws secretsmanager get-secret-value --secret-id "$1" --query SecretString --output text; }
        export PGHOST="$DB_HOST" PGPORT=5432 PGSSLMODE=require PGCONNECT_TIMEOUT=30
        export PGUSER="$(secret "$MASTER_SECRET_ARN" | field username)"
        export PGPASSWORD="$(secret "$MASTER_SECRET_ARN" | field password)"
        for i in $(seq 1 30); do psql -X -d postgres -c 'select 1' > /dev/null 2>&1 && break; echo "esperando base ($i)"; sleep 20; done
        psql -X -v ON_ERROR_STOP=1 -d postgres \
          -v pass_ro="$(secret "$SECRET_REPORT" | field password)" -v pass_rw="$(secret "$SECRET_APP" | field password)" \
          -v pass_ddl="$(secret "$SECRET_DEPLOY" | field password)" -v pass_admin="$(secret "$SECRET_DBA" | field password)" \
          -f aurora_postgresql_provisioning.sql
        psql -X -v ON_ERROR_STOP=1 -d "$DB_NAME" -f aurora_postgresql_schema.sql
        for f in changes_run/*.sql; do [ -e "$f" ] || continue; psql -X -v ON_ERROR_STOP=1 -d "$DB_NAME" -f "$f"; done
        if [ "$LOAD_DATA" = "true" ] && [ -f aurora_postgresql_data.sql ]; then
          psql -X -v ON_ERROR_STOP=1 -d "$DB_NAME" -f aurora_postgresql_data.sql
        fi
        psql -X -At -v ON_ERROR_STOP=1 -d "$DB_NAME" -f aurora_postgresql_validation.sql | tee /tmp/validation.txt
        grep -q '^TOTAL_FALTA|resumen|0$' /tmp/validation.txt || { echo 'VALIDACION FALLIDA: hay objetos FALTA'; exit 1; }
        echo 'BASE DE DATOS LISTA'
"""


def render(project: dict[str, Any]) -> dict[str, Any]:
    code = LAMBDA_SOURCE.read_text(encoding="utf-8")
    if len(code) > 4000:
        fail("assets/service_hours.py supera el límite de código inline de CloudFormation (4096 caracteres).")
    private = If("CreateVpc", [Ref("PrivateSubnetA"), Ref("PrivateSubnetB")], Ref("ExistingPrivateSubnetIds"))
    vpc_id = If("CreateVpc", Ref("Vpc"), Ref("ExistingVpcId"))
    r: dict[str, Any] = {}
    # ---------------------------------------------------------------- red (opcional)
    r["Vpc"] = {"Type": "AWS::EC2::VPC", "Condition": "CreateVpc",
                "Properties": {"CidrBlock": Ref("VpcCidr"), "EnableDnsHostnames": True, "EnableDnsSupport": True,
                               "Tags": tags(Sub("${Environment}-${ProjectSlug}-vpc"))}}
    r["InternetGateway"] = {"Type": "AWS::EC2::InternetGateway", "Condition": "CreateVpc",
                            "Properties": {"Tags": tags(Sub("${Environment}-${ProjectSlug}-igw"))}}
    r["GatewayAttachment"] = {"Type": "AWS::EC2::VPCGatewayAttachment", "Condition": "CreateVpc",
                              "Properties": {"VpcId": Ref("Vpc"), "InternetGatewayId": Ref("InternetGateway")}}
    for i, (suffix, public) in enumerate((("PublicSubnetA", True), ("PublicSubnetB", True),
                                          ("PrivateSubnetA", False), ("PrivateSubnetB", False))):
        r[suffix] = {"Type": "AWS::EC2::Subnet", "Condition": "CreateVpc",
                     "Properties": {"VpcId": Ref("Vpc"), "AvailabilityZone": AZ(i % 2),
                                    "CidrBlock": {"Fn::Select": [i, {"Fn::Cidr": [Ref("VpcCidr"), 4, 8]}]},
                                    "MapPublicIpOnLaunch": False,
                                    "Tags": tags(Sub(f"${{Environment}}-${{ProjectSlug}}-{'public' if public else 'private'}"
                                                     f"-{'a' if i % 2 == 0 else 'b'}"))}}
    r["NatEip"] = {"Type": "AWS::EC2::EIP", "Condition": "CreateVpc", "DependsOn": "GatewayAttachment",
                   "Properties": {"Domain": "vpc", "Tags": tags(Sub("${Environment}-${ProjectSlug}-nat-eip"))}}
    r["NatGateway"] = {"Type": "AWS::EC2::NatGateway", "Condition": "CreateVpc",
                       "Properties": {"SubnetId": Ref("PublicSubnetA"), "AllocationId": GetAtt("NatEip", "AllocationId"),
                                      "Tags": tags(Sub("${Environment}-${ProjectSlug}-nat"))}}
    for kind in ("Public", "Private"):
        r[f"{kind}RouteTable"] = {"Type": "AWS::EC2::RouteTable", "Condition": "CreateVpc",
                                  "Properties": {"VpcId": Ref("Vpc"),
                                                 "Tags": tags(Sub(f"${{Environment}}-${{ProjectSlug}}-{kind.lower()}-rt"))}}
        for az in ("A", "B"):
            r[f"{kind}Subnet{az}RouteAssociation"] = {
                "Type": "AWS::EC2::SubnetRouteTableAssociation", "Condition": "CreateVpc",
                "Properties": {"SubnetId": Ref(f"{kind}Subnet{az}"), "RouteTableId": Ref(f"{kind}RouteTable")}}
    r["PublicDefaultRoute"] = {"Type": "AWS::EC2::Route", "Condition": "CreateVpc", "DependsOn": "GatewayAttachment",
                               "Properties": {"RouteTableId": Ref("PublicRouteTable"), "DestinationCidrBlock": "0.0.0.0/0",
                                              "GatewayId": Ref("InternetGateway")}}
    r["PrivateDefaultRoute"] = {"Type": "AWS::EC2::Route", "Condition": "CreateVpc",
                                "Properties": {"RouteTableId": Ref("PrivateRouteTable"),
                                               "DestinationCidrBlock": "0.0.0.0/0", "NatGatewayId": Ref("NatGateway")}}
    for svc in ("s3", "dynamodb"):
        r[f"{svc.capitalize()}GatewayEndpoint"] = {
            "Type": "AWS::EC2::VPCEndpoint", "Condition": "CreateVpc",
            "Properties": {"VpcId": Ref("Vpc"), "ServiceName": Sub(f"com.amazonaws.${{AWS::Region}}.{svc}"),
                           "VpcEndpointType": "Gateway", "RouteTableIds": [Ref("PrivateRouteTable")]}}
    # ---------------------------------------------------------------- seguridad
    r["LambdaSecurityGroup"] = {"Type": "AWS::EC2::SecurityGroup", "Properties": {
        "GroupDescription": Sub("${ProjectLabel} - Lambdas y runner de BD"), "VpcId": vpc_id,
        "SecurityGroupEgress": [{"IpProtocol": "-1", "CidrIp": "0.0.0.0/0", "Description": "salida a AWS e Internet via NAT"}],
        "Tags": tags(Sub("${Environment}-${ProjectSlug}-lambda-sg"))}}
    r["DatabaseSecurityGroup"] = {"Type": "AWS::EC2::SecurityGroup", "Properties": {
        "GroupDescription": Sub("${ProjectLabel} - RDS PostgreSQL"), "VpcId": vpc_id,
        "SecurityGroupIngress": [{"IpProtocol": "tcp", "FromPort": 5432, "ToPort": 5432,
                                  "SourceSecurityGroupId": Ref("LambdaSecurityGroup"),
                                  "Description": "Lambdas y runner de BD"}],
        "Tags": tags(Sub("${Environment}-${ProjectSlug}-db-sg"))}}
    r["ProxySecurityGroup"] = {"Type": "AWS::EC2::SecurityGroup", "Condition": "UseProxy", "Properties": {
        "GroupDescription": Sub("${ProjectLabel} - RDS Proxy"), "VpcId": vpc_id,
        "SecurityGroupIngress": [{"IpProtocol": "tcp", "FromPort": 5432, "ToPort": 5432,
                                  "SourceSecurityGroupId": Ref("LambdaSecurityGroup"), "Description": "Lambdas"}],
        "Tags": tags(Sub("${Environment}-${ProjectSlug}-proxy-sg"))}}
    r["DatabaseIngressFromProxy"] = {"Type": "AWS::EC2::SecurityGroupIngress", "Condition": "UseProxy", "Properties": {
        "GroupId": Ref("DatabaseSecurityGroup"), "IpProtocol": "tcp", "FromPort": 5432, "ToPort": 5432,
        "SourceSecurityGroupId": Ref("ProxySecurityGroup"), "Description": "RDS Proxy"}}
    # ---------------------------------------------------------------- Aurora
    r["DatabaseSubnetGroup"] = {"Type": "AWS::RDS::DBSubnetGroup", "Properties": {
        "DBSubnetGroupDescription": Sub("${ProjectLabel} ${Environment} - subredes privadas"), "SubnetIds": private,
        "Tags": tags(Sub("${Environment}-${ProjectSlug}-db-subnets"))}}
    r["DatabaseInstance"] = {"Type": "AWS::RDS::DBInstance", "DeletionPolicy": "Snapshot", "UpdateReplacePolicy": "Snapshot",
                             "Properties": {
                                 "DBInstanceIdentifier": Sub("${Environment}-${ProjectSlug}-rds${DbIdentifierSuffix}"),
                                 "AvailabilityZone": If("HasDbAz", Ref("DbAvailabilityZone"), Ref("AWS::NoValue")),
                                 "Engine": "postgres", "EngineVersion": Ref("DbEngineVersion"),
                                 "DBInstanceClass": Ref("DbInstanceClass"),
                                 "AllocatedStorage": Ref("DbAllocatedStorage"), "StorageType": "gp3",
                                 "MasterUsername": "dbmaster", "ManageMasterUserPassword": True,
                                 "StorageEncrypted": True, "CopyTagsToSnapshot": True, "MultiAZ": False,
                                 "PubliclyAccessible": False, "AutoMinorVersionUpgrade": True,
                                 "BackupRetentionPeriod": If("IsProduction", 14, 7),
                                 "DeletionProtection": If("IsProduction", True, False),
                                 "DBSubnetGroupName": Ref("DatabaseSubnetGroup"),
                                 "VPCSecurityGroups": [Ref("DatabaseSecurityGroup")],
                                 "EnableCloudwatchLogsExports": ["postgresql"],
                                 "Tags": tags(Sub("${Environment}-${ProjectSlug}-rds"))}}
    for key, desc in (("app", "usuario de la aplicación (rw)"), ("report", "usuario de reportes (ro)"),
                      ("deploy", "usuario de despliegue (ddl)"), ("dba", "usuario DBA (admin)")):
        r[f"{key.capitalize()}DbSecret"] = secret(key, Sub(f"${{ProjectLabel}} ${{Environment}} - {desc}"))
    # ---------------------------------------------------------------- RDS Proxy (opcional)
    r["ProxyRole"] = {"Type": "AWS::IAM::Role", "Condition": "UseProxy", "Properties": {
        "AssumeRolePolicyDocument": {"Version": "2012-10-17", "Statement": [
            {"Effect": "Allow", "Principal": {"Service": "rds.amazonaws.com"}, "Action": "sts:AssumeRole"}]},
        "Policies": [{"PolicyName": "read-db-secrets", "PolicyDocument": {"Version": "2012-10-17", "Statement": [
            {"Sid": "ReadAppSecrets", "Effect": "Allow", "Action": ["secretsmanager:GetSecretValue"],
             "Resource": [Ref("AppDbSecret"), Ref("ReportDbSecret")]}]}}],
        "Tags": tags(Sub("${Environment}-${ProjectSlug}-proxy-role"))}}
    r["DatabaseProxy"] = {"Type": "AWS::RDS::DBProxy", "Condition": "UseProxy", "Properties": {
        "DBProxyName": Sub("${Environment}-${ProjectSlug}-proxy"), "EngineFamily": "POSTGRESQL", "RequireTLS": True,
        "RoleArn": GetAtt("ProxyRole", "Arn"), "VpcSubnetIds": private,
        "VpcSecurityGroupIds": [Ref("ProxySecurityGroup")], "IdleClientTimeout": 1800,
        "Auth": [{"AuthScheme": "SECRETS", "IAMAuth": "DISABLED", "SecretArn": Ref("AppDbSecret")},
                 {"AuthScheme": "SECRETS", "IAMAuth": "DISABLED", "SecretArn": Ref("ReportDbSecret")}],
        "Tags": [{"Key": "Project", "Value": Ref("ProjectLabel")}, {"Key": "Environment", "Value": Ref("EnvironmentTag")}]}}
    r["DatabaseProxyTargets"] = {"Type": "AWS::RDS::DBProxyTargetGroup", "Condition": "UseProxy",
                                 "Properties": {
                                     "DBProxyName": Ref("DatabaseProxy"), "TargetGroupName": "default",
                                     "DBInstanceIdentifiers": [Ref("DatabaseInstance")]}}
    # ---------------------------------------------------------------- frontend: ECR + Lambda (imagen) + CloudFront
    r["WebRepository"] = {"Type": "AWS::ECR::Repository", "Properties": {
        "RepositoryName": Sub("${Environment}-${ProjectSlug}-web"), "ImageScanningConfiguration": {"ScanOnPush": True},
        "EncryptionConfiguration": {"EncryptionType": "AES256"},
        "LifecyclePolicy": {"LifecyclePolicyText": json.dumps({"rules": [{
            "rulePriority": 1, "description": "conservar las ultimas 10 imagenes",
            "selection": {"tagStatus": "any", "countType": "imageCountMoreThan", "countNumber": 10},
            "action": {"type": "expire"}}]})},
        "RepositoryPolicyText": {"Version": "2012-10-17", "Statement": [
            {"Sid": "LambdaPullWebImage", "Effect": "Allow", "Principal": {"Service": "lambda.amazonaws.com"},
             "Action": ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"],
             "Condition": {"StringLike": {"aws:sourceArn": Sub(
                 "arn:${AWS::Partition}:lambda:${AWS::Region}:${AWS::AccountId}:function:${Environment}-${ProjectSlug}-web")}}}]},
        "Tags": tags(Sub("${Environment}-${ProjectSlug}-web"))}}
    r["WebDistribution"] = {"Type": "AWS::CloudFront::Distribution", "Properties": {"DistributionConfig": {
        "Enabled": True, "Comment": Sub("${Environment}-${ProjectSlug}-web"), "PriceClass": "PriceClass_100",
        "HttpVersion": "http2and3",
        "Origins": [{"Id": "web-lambda",
                     "DomainName": {"Fn::Select": [2, {"Fn::Split": ["/", GetAtt("WebFunctionUrl", "FunctionUrl")]}]},
                     "CustomOriginConfig": {"OriginProtocolPolicy": "https-only", "HTTPSPort": 443,
                                            "OriginSSLProtocols": ["TLSv1.2"],
                                            "OriginReadTimeout": 30, "OriginKeepaliveTimeout": 5}}],
        "DefaultCacheBehavior": {"TargetOriginId": "web-lambda", "ViewerProtocolPolicy": "redirect-to-https",
                                 "AllowedMethods": ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"],
                                 "CachePolicyId": CACHE_DISABLED, "OriginRequestPolicyId": ORIGIN_ALL_VIEWER_EXCEPT_HOST,
                                 "Compress": True},
        "CacheBehaviors": [{"PathPattern": "/_next/static/*", "TargetOriginId": "web-lambda",
                            "ViewerProtocolPolicy": "redirect-to-https", "AllowedMethods": ["GET", "HEAD"],
                            "CachePolicyId": CACHE_OPTIMIZED, "Compress": True}]},
        "Tags": tags(Sub("${Environment}-${ProjectSlug}-web-cdn"))}}
    # Frontend sin servidor: la misma imagen corre en Lambda (Lambda Web Adapter) detrás de una Function URL.
    # El código lo actualiza deploy.py (update_function_code) tras cada build; aquí solo se fija :latest.
    r["WebFunctionLogGroup"] = {"Type": "AWS::Logs::LogGroup", "Properties": {
        "LogGroupName": Sub("/aws/lambda/${Environment}-${ProjectSlug}-web"),
        "RetentionInDays": If("IsProduction", 30, 7)}}
    r["WebFunctionRole"] = {"Type": "AWS::IAM::Role", "Properties": {
        "AssumeRolePolicyDocument": {"Version": "2012-10-17", "Statement": [
            {"Effect": "Allow", "Principal": {"Service": "lambda.amazonaws.com"}, "Action": "sts:AssumeRole"}]},
        "Policies": [{"PolicyName": "web-logs", "PolicyDocument": {"Version": "2012-10-17", "Statement": [
            {"Sid": "WriteLogs", "Effect": "Allow", "Action": ["logs:CreateLogStream", "logs:PutLogEvents"],
             "Resource": Sub("${WebFunctionLogGroup.Arn}:*")}]}}],
        "Tags": tags(Sub("${Environment}-${ProjectSlug}-web-fn-role"))}}
    r["WebFunction"] = {"Type": "AWS::Lambda::Function", "DependsOn": ["WebFunctionLogGroup"], "Properties": {
        "FunctionName": Sub("${Environment}-${ProjectSlug}-web"),
        "Description": Sub("${ProjectLabel} - frontend Next.js (SSR)"),
        "PackageType": "Image", "Code": {"ImageUri": Sub("${WebRepository.RepositoryUri}:latest")},
        "Architectures": ["x86_64"], "MemorySize": 1024, "Timeout": 30,
        "Role": GetAtt("WebFunctionRole", "Arn"),
        "Environment": {"Variables": {"AWS_LWA_PORT": "3000", "AWS_LWA_READINESS_CHECK_PATH": "/login"}},
        "Tags": tags(Sub("${Environment}-${ProjectSlug}-web"))}}
    r["WebFunctionUrl"] = {"Type": "AWS::Lambda::Url", "Properties": {
        "TargetFunctionArn": GetAtt("WebFunction", "Arn"), "AuthType": "NONE", "InvokeMode": "BUFFERED"}}
    r["WebFunctionUrlPermission"] = {"Type": "AWS::Lambda::Permission", "Properties": {
        "FunctionName": Ref("WebFunction"), "Action": "lambda:InvokeFunctionUrl", "Principal": "*",
        "FunctionUrlAuthType": "NONE"}}
    r["WebFunctionInvokePermission"] = {"Type": "AWS::Lambda::Permission", "Properties": {
        "FunctionName": Ref("WebFunction"), "Action": "lambda:InvokeFunction", "Principal": "*",
        "InvokedViaFunctionUrl": True}}
    r["WebBuilderLogGroup"] = {"Type": "AWS::Logs::LogGroup", "Properties": {
        "LogGroupName": Sub("/codebuild/${Environment}-${ProjectSlug}-web-builder"),
        "RetentionInDays": If("IsProduction", 30, 7)}}
    r["WebBuilderRole"] = {"Type": "AWS::IAM::Role", "Properties": {
        "AssumeRolePolicyDocument": {"Version": "2012-10-17", "Statement": [
            {"Effect": "Allow", "Principal": {"Service": "codebuild.amazonaws.com"}, "Action": "sts:AssumeRole"}]},
        "Policies": [{"PolicyName": "web-builder", "PolicyDocument": {"Version": "2012-10-17", "Statement": [
            {"Sid": "ReadSource", "Effect": "Allow", "Action": ["s3:GetObject"], "Resource": Sub("${ArtifactsBucket.Arn}/web/*")},
            {"Sid": "EcrToken", "Effect": "Allow", "Action": ["ecr:GetAuthorizationToken"], "Resource": "*"},
            {"Sid": "PushWebImage", "Effect": "Allow",
             "Action": ["ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart",
                        "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"],
             "Resource": GetAtt("WebRepository", "Arn")},
            {"Sid": "WriteLogs", "Effect": "Allow", "Action": ["logs:CreateLogStream", "logs:PutLogEvents"],
             "Resource": Sub("${WebBuilderLogGroup.Arn}:*")}]}}],
        "Tags": tags(Sub("${Environment}-${ProjectSlug}-web-builder-role"))}}
    r["WebBuilder"] = {"Type": "AWS::CodeBuild::Project", "Properties": {
        "Name": Sub("${Environment}-${ProjectSlug}-web-builder"),
        "Description": Sub("${ProjectLabel} - construye la imagen Docker del frontend Next.js y la publica en ECR"),
        "ServiceRole": GetAtt("WebBuilderRole", "Arn"), "TimeoutInMinutes": 45, "QueuedTimeoutInMinutes": 30,
        "Artifacts": {"Type": "NO_ARTIFACTS"},
        "Source": {"Type": "NO_SOURCE", "BuildSpec": WEB_BUILDSPEC},
        "Environment": {"Type": "LINUX_CONTAINER", "ComputeType": "BUILD_GENERAL1_MEDIUM", "PrivilegedMode": True,
                        "Image": "aws/codebuild/amazonlinux-x86_64-standard:5.0",
                        "EnvironmentVariables": [
                            {"Name": "REPOSITORY_URI", "Value": GetAtt("WebRepository", "RepositoryUri")},
                            {"Name": "SOURCE_S3", "Value": "definido-en-cada-ejecucion"},
                            {"Name": "IMAGE_TAG", "Value": "definido-en-cada-ejecucion"}]},
        "LogsConfig": {"CloudWatchLogs": {"Status": "ENABLED", "GroupName": Ref("WebBuilderLogGroup")}},
        "Tags": tags(Sub("${Environment}-${ProjectSlug}-web-builder"))}}
    # ---------------------------------------------------------------- artefactos y runner de BD
    r["ArtifactsBucket"] = {"Type": "AWS::S3::Bucket", "DeletionPolicy": "Retain", "UpdateReplacePolicy": "Retain",
                            "Properties": {
                                "BucketEncryption": {"ServerSideEncryptionConfiguration": [
                                    {"ServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]},
                                "PublicAccessBlockConfiguration": {"BlockPublicAcls": True, "BlockPublicPolicy": True,
                                                                   "IgnorePublicAcls": True, "RestrictPublicBuckets": True},
                                "OwnershipControls": {"Rules": [{"ObjectOwnership": "BucketOwnerEnforced"}]},
                                "LifecycleConfiguration": {"Rules": [{"Id": "expire-artifacts", "Status": "Enabled",
                                                                      "ExpirationInDays": 60}]},
                                "Tags": tags(Sub("${Environment}-${ProjectSlug}-artifacts"))}}
    r["ArtifactsBucketTlsOnly"] = {"Type": "AWS::S3::BucketPolicy", "Properties": {
        "Bucket": Ref("ArtifactsBucket"), "PolicyDocument": {"Version": "2012-10-17", "Statement": [
            {"Sid": "DenyInsecureTransport", "Effect": "Deny", "Principal": "*", "Action": "s3:*",
             "Resource": [GetAtt("ArtifactsBucket", "Arn"), Sub("${ArtifactsBucket.Arn}/*")],
             "Condition": {"Bool": {"aws:SecureTransport": "false"}}}]}}}
    r["DbRunnerLogGroup"] = {"Type": "AWS::Logs::LogGroup", "Properties": {
        "LogGroupName": Sub("/codebuild/${Environment}-${ProjectSlug}-db-runner"),
        "RetentionInDays": If("IsProduction", 30, 7)}}
    r["DbRunnerRole"] = {"Type": "AWS::IAM::Role", "Properties": {
        "AssumeRolePolicyDocument": {"Version": "2012-10-17", "Statement": [
            {"Effect": "Allow", "Principal": {"Service": "codebuild.amazonaws.com"}, "Action": "sts:AssumeRole"}]},
        "Policies": [{"PolicyName": "db-runner", "PolicyDocument": {"Version": "2012-10-17", "Statement": [
            {"Sid": "ReadBundles", "Effect": "Allow", "Action": ["s3:GetObject"], "Resource": Sub("${ArtifactsBucket.Arn}/db/*")},
            {"Sid": "ReadDbSecrets", "Effect": "Allow", "Action": ["secretsmanager:GetSecretValue"],
             "Resource": [GetAtt("DatabaseInstance", "MasterUserSecret.SecretArn"), Ref("AppDbSecret"),
                          Ref("ReportDbSecret"), Ref("DeployDbSecret"), Ref("DbaDbSecret")]},
            {"Sid": "WriteLogs", "Effect": "Allow", "Action": ["logs:CreateLogStream", "logs:PutLogEvents"],
             "Resource": Sub("${DbRunnerLogGroup.Arn}:*")},
            {"Sid": "VpcNetworkInterfaces", "Effect": "Allow", "Action": ENI_ACTIONS, "Resource": "*"},
            {"Sid": "VpcNetworkInterfacePermission", "Effect": "Allow", "Action": ["ec2:CreateNetworkInterfacePermission"],
             "Resource": Sub("arn:${AWS::Partition}:ec2:${AWS::Region}:${AWS::AccountId}:network-interface/*"),
             "Condition": {"StringEquals": {"ec2:AuthorizedService": "codebuild.amazonaws.com"}}}]}}],
        "Tags": tags(Sub("${Environment}-${ProjectSlug}-db-runner-role"))}}
    r["DbRunner"] = {"Type": "AWS::CodeBuild::Project", "Properties": {
        "Name": Sub("${Environment}-${ProjectSlug}-db-runner"),
        "Description": Sub("${ProjectLabel} - aplica provisioning, schema, cambios, datos y validación en RDS"),
        "ServiceRole": GetAtt("DbRunnerRole", "Arn"), "TimeoutInMinutes": 45, "QueuedTimeoutInMinutes": 30,
        "Artifacts": {"Type": "NO_ARTIFACTS"},
        "Source": {"Type": "NO_SOURCE", "BuildSpec": BUILDSPEC},
        "Environment": {"Type": "LINUX_CONTAINER", "ComputeType": "BUILD_GENERAL1_SMALL",
                        "Image": "aws/codebuild/amazonlinux-x86_64-standard:5.0",
                        "EnvironmentVariables": [
                            {"Name": "DB_HOST", "Value": GetAtt("DatabaseInstance", "Endpoint.Address")},
                            {"Name": "DB_NAME", "Value": Ref("DbName")},
                            {"Name": "MASTER_SECRET_ARN", "Value": GetAtt("DatabaseInstance", "MasterUserSecret.SecretArn")},
                            {"Name": "SECRET_APP", "Value": Ref("AppDbSecret")},
                            {"Name": "SECRET_REPORT", "Value": Ref("ReportDbSecret")},
                            {"Name": "SECRET_DEPLOY", "Value": Ref("DeployDbSecret")},
                            {"Name": "SECRET_DBA", "Value": Ref("DbaDbSecret")},
                            {"Name": "BUNDLE_S3", "Value": "definido-en-cada-ejecucion"},
                            {"Name": "ENV_DIR", "Value": "."}, {"Name": "LOAD_DATA", "Value": "true"}]},
        "VpcConfig": {"VpcId": vpc_id, "Subnets": private, "SecurityGroupIds": [Ref("LambdaSecurityGroup")]},
        "LogsConfig": {"CloudWatchLogs": {"Status": "ENABLED", "GroupName": Ref("DbRunnerLogGroup")}},
        "Tags": tags(Sub("${Environment}-${ProjectSlug}-db-runner"))}}
    # ---------------------------------------------------------------- horario de servicio
    r["ServiceHoursLogGroup"] = {"Type": "AWS::Logs::LogGroup", "Properties": {
        "LogGroupName": Sub("/aws/lambda/${Environment}-${ProjectSlug}-service-hours"),
        "RetentionInDays": If("IsProduction", 30, 7)}}
    r["ServiceHoursRole"] = {"Type": "AWS::IAM::Role", "Properties": {
        "AssumeRolePolicyDocument": {"Version": "2012-10-17", "Statement": [
            {"Effect": "Allow", "Principal": {"Service": "lambda.amazonaws.com"}, "Action": "sts:AssumeRole"}]},
        "Policies": [{"PolicyName": "service-hours", "PolicyDocument": {"Version": "2012-10-17", "Statement": [
            {"Sid": "StartStopDatabase", "Effect": "Allow",
             "Action": ["rds:StartDBInstance", "rds:StopDBInstance", "rds:DescribeDBInstances"],
             "Resource": Sub("arn:${AWS::Partition}:rds:${AWS::Region}:${AWS::AccountId}:db:${DatabaseInstance}")},
            {"Sid": "ToggleProjectFunctions", "Effect": "Allow",
             "Action": ["lambda:PutFunctionConcurrency", "lambda:DeleteFunctionConcurrency", "lambda:GetFunctionConcurrency"],
             "Resource": Sub("arn:${AWS::Partition}:lambda:${AWS::Region}:${AWS::AccountId}:function:${Environment}-${ProjectSlug}-api-*")},
            {"Sid": "ListAppStackResources", "Effect": "Allow", "Action": ["cloudformation:ListStackResources"],
             "Resource": Sub("arn:${AWS::Partition}:cloudformation:${AWS::Region}:${AWS::AccountId}:"
                             "stack/${Environment}-${ProjectSlug}-api/*")},
            {"Sid": "WriteLogs", "Effect": "Allow", "Action": ["logs:CreateLogStream", "logs:PutLogEvents"],
             "Resource": Sub("${ServiceHoursLogGroup.Arn}:*")}]}}],
        "Tags": tags(Sub("${Environment}-${ProjectSlug}-service-hours-role"))}}
    r["ServiceHoursFunction"] = {"Type": "AWS::Lambda::Function", "Properties": {
        "FunctionName": Sub("${Environment}-${ProjectSlug}-service-hours"),
        "Description": Sub("${ProjectLabel} - horario de servicio (${ServiceTimezone})"),
        "Runtime": "python3.13", "Handler": "index.handler", "MemorySize": 256, "Timeout": 120,
        "Role": GetAtt("ServiceHoursRole", "Arn"), "Code": {"ZipFile": code},
        "LoggingConfig": {"LogFormat": "JSON", "LogGroup": Ref("ServiceHoursLogGroup")},
        "Environment": {"Variables": {"DB_INSTANCE_ID": Ref("DatabaseInstance"),
                                      "APP_STACKS": Sub("${Environment}-${ProjectSlug}-api")}},
        "Tags": tags(Sub("${Environment}-${ProjectSlug}-service-hours"))}}
    r["SchedulerRole"] = {"Type": "AWS::IAM::Role", "Properties": {
        "AssumeRolePolicyDocument": {"Version": "2012-10-17", "Statement": [
            {"Effect": "Allow", "Principal": {"Service": "scheduler.amazonaws.com"}, "Action": "sts:AssumeRole",
             "Condition": {"StringEquals": {"aws:SourceAccount": Ref("AWS::AccountId")}}}]},
        "Policies": [{"PolicyName": "invoke-service-hours", "PolicyDocument": {"Version": "2012-10-17", "Statement": [
            {"Sid": "InvokeServiceHours", "Effect": "Allow", "Action": ["lambda:InvokeFunction"],
             "Resource": GetAtt("ServiceHoursFunction", "Arn")}]}}],
        "Tags": tags(Sub("${Environment}-${ProjectSlug}-scheduler-role"))}}
    for name, cron, action, label in (("Warmup", "ServiceWarmupCron", "warmup", "arranca RDS"),
                                      ("Start", "ServiceStartCron", "start", "habilita las Lambdas"),
                                      ("Ensure", "ServiceEnsureCron", "start", "reintenta el arranque en horario"),
                                      ("Stop", "ServiceStopCron", "stop", "apaga Lambdas y RDS")):
        r[f"Service{name}Schedule"] = {"Type": "AWS::Scheduler::Schedule", "Properties": {
            "Name": Sub(f"${{Environment}}-${{ProjectSlug}}-service-{name.lower() if name == 'Ensure' else action}"),
            "Description": Sub(f"${{ProjectLabel}} - {label} (${{ServiceTimezone}})"),
            "ScheduleExpression": Ref(cron), "ScheduleExpressionTimezone": Ref("ServiceTimezone"),
            "FlexibleTimeWindow": {"Mode": "OFF"}, "State": If("HasServiceHours", "ENABLED", "DISABLED"),
            "Target": {"Arn": GetAtt("ServiceHoursFunction", "Arn"), "RoleArn": GetAtt("SchedulerRole", "Arn"),
                       "Input": json.dumps({"action": action}),
                       "RetryPolicy": {"MaximumRetryAttempts": 3, "MaximumEventAgeInSeconds": 3600}}}}
    # ---------------------------------------------------------------- parámetros SSM que lee samconfig.toml
    r["SubnetsParameter"] = ssm("network/subnets", {"Fn::Join": [",", private]}, "StringList")
    r["LambdaSecurityGroupParameter"] = ssm("network/lambda-sg", Ref("LambdaSecurityGroup"))
    r["DbEndpointParameter"] = ssm("db/proxy-endpoint", If("UseProxy", GetAtt("DatabaseProxy", "Endpoint"),
                                                           GetAtt("DatabaseInstance", "Endpoint.Address")))
    r["DbClusterParameter"] = ssm("db/cluster-id", Ref("DatabaseInstance"))
    r["FrontendOriginParameter"] = ssm("frontend/origin", Sub("https://${WebDistribution.DomainName}"))
    outputs = {
        "VpcId": {"Value": vpc_id}, "PrivateSubnetIds": {"Value": {"Fn::Join": [",", private]}},
        "LambdaSecurityGroupId": {"Value": Ref("LambdaSecurityGroup")},
        "DbInstanceId": {"Value": Ref("DatabaseInstance")},
        "DbEndpoint": {"Value": GetAtt("DatabaseInstance", "Endpoint.Address")},
        "DbAppEndpoint": {"Value": If("UseProxy", GetAtt("DatabaseProxy", "Endpoint"),
                                      GetAtt("DatabaseInstance", "Endpoint.Address"))},
        "MasterSecretArn": {"Value": GetAtt("DatabaseInstance", "MasterUserSecret.SecretArn")},
        "AppSecretName": {"Value": Sub("/${Environment}/${ProjectSlug}/db/app")},
        "FrontendUrl": {"Value": Sub("https://${WebDistribution.DomainName}")},
        "WebRepositoryUri": {"Value": GetAtt("WebRepository", "RepositoryUri")},
        "WebBuilderProject": {"Value": Ref("WebBuilder")},
        "WebDistributionId": {"Value": Ref("WebDistribution")},
        "WebFunctionName": {"Value": Ref("WebFunction")},
        "WebFunctionUrl": {"Value": GetAtt("WebFunctionUrl", "FunctionUrl")},
        "ArtifactsBucket": {"Value": Ref("ArtifactsBucket")},
        "DbRunnerProject": {"Value": Ref("DbRunner")},
        "ServiceHoursFunction": {"Value": Ref("ServiceHoursFunction")},
    }
    return {
        "AWSTemplateFormatVersion": "2010-09-09",
        # ExistingVpcId/ExistingPrivateSubnetIds solo se usan con CreateNetwork=false (vacíos por defecto)
        "Metadata": {"cfn-lint": {"config": {"ignore_checks": ["W1030"]}}},
        "Description": f"{project['label']} - plataforma (red, RDS, secretos, SSM, Lambda+CloudFront, runner BD, horario)",
        "Parameters": {
            "Environment": {"Type": "String", "AllowedValues": ["dev", "qa", "prod"]},
            "EnvironmentTag": {"Type": "String", "AllowedValues": ["DEV", "QA", "PROD"]},
            "ProjectSlug": {"Type": "String", "Default": project["slug"], "AllowedPattern": "^[a-z][a-z0-9-]{1,30}$"},
            "ProjectLabel": {"Type": "String", "Default": project["label"]},
            "DbName": {"Type": "String", "Description": "base del aplicativo (naming-map.json del ambiente)"},
            "AppUser": {"Type": "String", "Default": project["users"]["rw"]},
            "ReportUser": {"Type": "String", "Default": project["users"]["ro"]},
            "DeployUser": {"Type": "String", "Default": project["users"]["ddl"]},
            "DbaUser": {"Type": "String", "Default": project["users"]["admin"]},
            "CreateNetwork": {"Type": "String", "AllowedValues": ["true", "false"], "Default": "true"},
            "VpcCidr": {"Type": "String", "Default": "10.40.0.0/16"},
            "ExistingVpcId": {"Type": "String", "Default": ""},
            "ExistingPrivateSubnetIds": {"Type": "CommaDelimitedList", "Default": ""},
            "UseRdsProxy": {"Type": "String", "AllowedValues": ["true", "false"], "Default": "false"},
            "DbEngineVersion": {"Type": "String", "Default": "16.15"},
            "DbInstanceClass": {"Type": "String", "Default": "db.t4g.micro"},
            "DbAllocatedStorage": {"Type": "Number", "Default": 20, "MinValue": 20},
            # cambiar la AZ obliga a reemplazar la instancia: el sufijo le da un nombre nuevo (CloudFormation no
            # reemplaza recursos con nombre fijo) y la vieja se borra con snapshot final (UpdateReplacePolicy)
            "DbAvailabilityZone": {"Type": "String", "Default": ""},
            "DbIdentifierSuffix": {"Type": "String", "Default": "", "AllowedPattern": "^[a-z0-9-]{0,10}$"},
            "ServiceHoursEnabled": {"Type": "String", "AllowedValues": ["true", "false"], "Default": "true"},
            "ServiceTimezone": {"Type": "String", "Default": "America/Costa_Rica"},
            "ServiceWarmupCron": {"Type": "String", "Default": "cron(45 4 ? * * *)"},
            "ServiceStartCron": {"Type": "String", "Default": "cron(0 5 ? * * *)"},
            "ServiceStopCron": {"Type": "String", "Default": "cron(0 18 ? * * *)"},
            "ServiceEnsureCron": {"Type": "String", "Default": "cron(0/15 5-17 ? * * *)"},
        },
        "Conditions": {
            "IsProduction": {"Fn::Equals": [Ref("Environment"), "prod"]},
            "CreateVpc": {"Fn::Equals": [Ref("CreateNetwork"), "true"]},
            "UseProxy": {"Fn::Equals": [Ref("UseRdsProxy"), "true"]},
            "HasDbAz": {"Fn::Not": [{"Fn::Equals": [Ref("DbAvailabilityZone"), ""]}]},
            "HasServiceHours": {"Fn::Equals": [Ref("ServiceHoursEnabled"), "true"]},
        },
        "Resources": r,
        "Outputs": outputs,
    }


def project_info(root: Path) -> dict[str, Any]:
    manifest = read_config(manifest_path(root)) or {}
    project = manifest.get("project") or {}
    naming_path = root / "database" / "naming-map.json"
    if not naming_path.exists():
        fail(f"No existe {naming_path}: el proyecto no tiene scripts Aurora generados.")
    naming = json.loads(naming_path.read_text(encoding="utf-8"))
    slug = str(project.get("slug") or "").replace("_", "-")
    if not slug:
        fail("El manifest no tiene project.slug.")
    return {"slug": slug, "label": str(project.get("label") or slug.upper()), "users": naming["users"],
            "region": str((manifest.get("target") or {}).get("aws_region") or "us-east-1")}


def to_yaml(template: dict[str, Any]) -> str:
    import yaml

    class Dumper(yaml.SafeDumper):
        pass

    def literal(dumper: yaml.SafeDumper, data: str) -> yaml.Node:
        style = "|" if "\n" in data else None
        return dumper.represent_scalar("tag:yaml.org,2002:str", data, style=style)

    Dumper.add_representer(str, literal)
    Dumper.ignore_aliases = lambda self, data: True  # CloudFormation no acepta anclas/alias YAML
    return yaml.dump(template, Dumper=Dumper, sort_keys=False, allow_unicode=True, width=1000)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--project", type=Path, default=Path("."))
    parser.add_argument("--out", type=Path, default=Path("deploy/platform.yaml"))
    args = parser.parse_args(argv)
    template = render(project_info(args.project))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(to_yaml(template), encoding="utf-8")
    print(f"{args.out}: {len(template['Resources'])} recursos")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
