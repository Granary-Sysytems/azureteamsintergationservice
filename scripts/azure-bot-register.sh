#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

set -a
[ -f "$ROOT_DIR/config/azure.env" ] && source "$ROOT_DIR/config/azure.env"
[ -f "$ROOT_DIR/config/azure.secrets.env" ] && source "$ROOT_DIR/config/azure.secrets.env"
set +a
if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI is not installed. Install it first: brew install azure-cli"
  exit 1
fi

if ! az account show >/dev/null 2>&1; then
  echo "Azure CLI is not logged in. Run: az login"
  exit 1
fi

: "${RESOURCE_GROUP:?Set RESOURCE_GROUP}"
: "${BOT_NAME:?Set BOT_NAME}"
: "${AAD_APP_ID:?Set AAD_APP_ID}"
: "${WEB_APP_NAME:?Set WEB_APP_NAME}"
: "${TENANT_ID:?Set TENANT_ID}"

az bot create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$BOT_NAME" \
  --app-type SingleTenant \
  --appid "$AAD_APP_ID" \
  --tenant-id "$TENANT_ID" \
  --endpoint "https://${WEB_APP_NAME}.azurewebsites.net/api/messages"

echo "Azure Bot created and endpoint configured."
