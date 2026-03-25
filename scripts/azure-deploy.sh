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
: "${LOCATION:?Set LOCATION}"
: "${STORAGE_ACCOUNT:?Set STORAGE_ACCOUNT}"
: "${APP_SERVICE_PLAN:?Set APP_SERVICE_PLAN}"
: "${WEB_APP_NAME:?Set WEB_APP_NAME}"

az group create --name "$RESOURCE_GROUP" --location "$LOCATION"

az storage account create \
  --name "$STORAGE_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --sku Standard_LRS

az appservice plan create \
  --name "$APP_SERVICE_PLAN" \
  --resource-group "$RESOURCE_GROUP" \
  --is-linux \
  --sku B1

az webapp create \
  --name "$WEB_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --plan "$APP_SERVICE_PLAN" \
  --runtime "NODE|20-lts"

echo "Base Azure resources created."
