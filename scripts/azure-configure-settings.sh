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

: "${AZURE_STORAGE_CONNECTION_STRING:=${STORAGE_CONNECTION_STRING:-}}"

: "${RESOURCE_GROUP:?Set RESOURCE_GROUP}"
: "${WEB_APP_NAME:?Set WEB_APP_NAME}"
: "${BOT_APP_ID:?Set BOT_APP_ID}"
: "${BOT_APP_TENANT_ID:=${TENANT_ID:-}}"
: "${BOT_APP_PASSWORD:?Set BOT_APP_PASSWORD}"
: "${AZURE_STORAGE_CONNECTION_STRING:?Set AZURE_STORAGE_CONNECTION_STRING}"
: "${API_BEARER_TOKEN:?Set API_BEARER_TOKEN}"
: "${BOT_APP_TENANT_ID:?Set BOT_APP_TENANT_ID or TENANT_ID}"

az webapp config appsettings set \
  --name "$WEB_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --settings \
    BOT_APP_ID="$BOT_APP_ID" \
    BOT_APP_TENANT_ID="$BOT_APP_TENANT_ID" \
    BOT_APP_PASSWORD="$BOT_APP_PASSWORD" \
    MicrosoftAppId="$BOT_APP_ID" \
    MicrosoftAppTenantId="$BOT_APP_TENANT_ID" \
    MicrosoftAppType="SingleTenant" \
    MicrosoftAppPassword="$BOT_APP_PASSWORD" \
    AZURE_STORAGE_CONNECTION_STRING="$AZURE_STORAGE_CONNECTION_STRING" \
    AZURE_QUEUE_NAME="teams-updates" \
    AZURE_TABLE_NAME="ConversationReferences" \
    API_BEARER_TOKEN="$API_BEARER_TOKEN" \
    DEFAULT_TARGET="default"

echo "Web app settings configured."
