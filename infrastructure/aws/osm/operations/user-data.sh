#!/usr/bin/env bash
set -Eeuo pipefail

readonly AWS_REGION='${aws_region}'
readonly DATA_DEVICE='${data_device}'
readonly DATA_MOUNT_PATH='${data_mount_path}'
readonly POSTGRESQL_PORT='${postgresql_port}'
readonly DATABASE_NAME='${database_name}'
readonly DATABASE_CLIENT_CIDR='${database_client_cidr}'
readonly ARTIFACTS_BUCKET='${artifacts_bucket}'
readonly ARTIFACTS_KEY='${artifacts_key}'
readonly ARTIFACTS_SHA256='${artifacts_sha256}'
readonly BACKUP_BUCKET='${backup_bucket}'
readonly BACKUP_PREFIX='${backup_prefix}'
readonly CLOUDWATCH_NAMESPACE='${cloudwatch_namespace}'
readonly ENDPOINT_PARAMETER_NAME='${endpoint_parameter_name}'
readonly PORT_PARAMETER_NAME='${port_parameter_name}'
readonly DATABASE_PARAMETER_NAME='${database_parameter_name}'
readonly PUBLISHER_USERNAME_PARAMETER_NAME='${publisher_username_parameter_name}'
readonly PUBLISHER_PASSWORD_PARAMETER_NAME='${publisher_password_parameter_name}'

log()
{
    printf '%s %s\n' "$(date --utc +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

fail()
{
    log "ERROR: $*" >&2
    exit 1
}

resolve_data_device()
{
    local attempt
    local candidate
    local mapped_name

    for attempt in $(seq 1 120); do
        if [[ -b "$${DATA_DEVICE}" ]]; then
            readlink --canonicalize "$${DATA_DEVICE}"
            return 0
        fi

        for candidate in /dev/nvme*n1; do
            [[ -b "$${candidate}" ]] || continue
            mapped_name="$(ebsnvme-id -u "$${candidate}" 2>/dev/null || true)"
            if [[ "$${mapped_name}" == "$${DATA_DEVICE}" ]]; then
                printf '%s\n' "$${candidate}"
                return 0
            fi
        done

        log "Waiting for data volume $${DATA_DEVICE} (attempt $${attempt}/120)"
        sleep 5
    done

    return 1
}

configure_data_volume()
{
    local resolved_device="$1"
    local filesystem_type
    local filesystem_uuid
    local signatures

    filesystem_type="$(blkid --match-tag TYPE --output value "$${resolved_device}" 2>/dev/null || true)"
    if [[ -z "$${filesystem_type}" ]]; then
        signatures="$(wipefs --noheadings --output TYPE "$${resolved_device}" 2>/dev/null | tr -d '[:space:]')"
        [[ -z "$${signatures}" ]] || fail "Refusing to format volume with existing signatures"
        mkfs.xfs -f "$${resolved_device}"
        filesystem_type=xfs
    fi

    [[ "$${filesystem_type}" == xfs ]] || fail "Expected xfs data volume, found $${filesystem_type}"
    filesystem_uuid="$(blkid --match-tag UUID --output value "$${resolved_device}")"
    [[ -n "$${filesystem_uuid}" ]] || fail "Data volume has no filesystem UUID"

    install --directory --mode=0750 "$${DATA_MOUNT_PATH}"
    if ! grep --fixed-strings --quiet "UUID=$${filesystem_uuid} $${DATA_MOUNT_PATH} " /etc/fstab; then
        printf 'UUID=%s %s xfs defaults,nofail,x-systemd.device-timeout=5min 0 2\n' \
            "$${filesystem_uuid}" "$${DATA_MOUNT_PATH}" >> /etc/fstab
    fi
    if ! mountpoint --quiet "$${DATA_MOUNT_PATH}"; then
        mount "$${DATA_MOUNT_PATH}"
    fi
    mountpoint --quiet "$${DATA_MOUNT_PATH}" || fail "Data volume did not mount"
}

read_parameter()
{
    local parameter_name="$1"

    aws ssm get-parameter \
        --region "$${AWS_REGION}" \
        --name "$${parameter_name}" \
        --query Parameter.Value \
        --output text
}

instance_id()
{
    local token

    token="$(curl --fail --silent --show-error \
        --request PUT \
        --header 'X-aws-ec2-metadata-token-ttl-seconds: 21600' \
        http://169.254.169.254/latest/api/token)"
    curl --fail --silent --show-error \
        --header "X-aws-ec2-metadata-token: $${token}" \
        http://169.254.169.254/latest/meta-data/instance-id
}

main()
{
    local resolved_device
    local artifact_directory
    local artifact_path
    local configured_endpoint
    local configured_port
    local configured_database
    local current_instance_id
    local publisher_password

    [[ "$${ARTIFACTS_SHA256}" =~ ^[0-9a-f]{64}$ ]] \
        || fail "ARTIFACTS_SHA256 must be a plan-pinned lowercase SHA-256"

    dnf install --assumeyes awscli coreutils ec2-utils nvme-cli openssl tar xfsprogs

    resolved_device="$(resolve_data_device)" || fail "Data volume was not attached within ten minutes"
    configure_data_volume "$${resolved_device}"

    artifact_directory="$${DATA_MOUNT_PATH}/bootstrap/$${ARTIFACTS_SHA256}"
    artifact_path="$${DATA_MOUNT_PATH}/bootstrap/osm-stack-v1.tar.gz"
    install --directory --mode=0750 "$${artifact_directory}"

    aws s3 cp \
        --region "$${AWS_REGION}" \
        "s3://$${ARTIFACTS_BUCKET}/$${ARTIFACTS_KEY}" \
        "$${artifact_path}" \
        --only-show-errors
    printf '%s  %s\n' "$${ARTIFACTS_SHA256}" "$${artifact_path}" \
        | sha256sum --check --status - \
        || fail "OSM runtime artifact failed SHA-256 verification"
    tar --extract --gzip --file "$${artifact_path}" --directory "$${artifact_directory}"

    [[ -x "$${artifact_directory}/operations/install.sh" ]] \
        || fail "Artifact is missing executable operations/install.sh"
    [[ -r "$${artifact_directory}/database/osm2pgsql/production/schema.sql" ]] \
        || fail "Artifact is missing production database assets"

    configured_endpoint="$(read_parameter "$${ENDPOINT_PARAMETER_NAME}")"
    configured_port="$(read_parameter "$${PORT_PARAMETER_NAME}")"
    configured_database="$(read_parameter "$${DATABASE_PARAMETER_NAME}")"
    [[ -n "$${configured_endpoint}" ]] || fail "Terraform-owned database endpoint is empty"
    [[ "$${configured_port}" == "$${POSTGRESQL_PORT}" ]] \
        || fail "Terraform-owned database port does not match bootstrap configuration"
    [[ "$${configured_database}" == "$${DATABASE_NAME}" ]] \
        || fail "Terraform-owned database name does not match bootstrap configuration"

    current_instance_id="$(instance_id)"
    publisher_password="$(openssl rand -base64 48 | tr -d '\n')"

    env \
    AWS_REGION="$${AWS_REGION}" \
    DATA_MOUNT_PATH="$${DATA_MOUNT_PATH}" \
    POSTGRESQL_PORT="$${configured_port}" \
    DATABASE_NAME="$${configured_database}" \
    DATABASE_CLIENT_CIDR="$${DATABASE_CLIENT_CIDR}" \
    BACKUP_BUCKET="$${BACKUP_BUCKET}" \
    BACKUP_PREFIX="$${BACKUP_PREFIX}" \
    CLOUDWATCH_NAMESPACE="$${CLOUDWATCH_NAMESPACE}" \
    INSTANCE_ID="$${current_instance_id}" \
    PUBLISHER_PASSWORD="$${publisher_password}" \
        "$${artifact_directory}/operations/install.sh" \
        "$${artifact_directory}"

    aws ssm put-parameter --region "$${AWS_REGION}" --overwrite \
        --name "$${PUBLISHER_USERNAME_PARAMETER_NAME}" --type String --value osm_publisher >/dev/null
    aws ssm put-parameter --region "$${AWS_REGION}" --overwrite \
        --name "$${PUBLISHER_PASSWORD_PARAMETER_NAME}" --type SecureString --value "$${publisher_password}" >/dev/null

    unset publisher_password PUBLISHER_PASSWORD
    log "OSM database host installation is complete for $${configured_endpoint}; bootstraps await separate approved SSM starts"
}

main "$@"
