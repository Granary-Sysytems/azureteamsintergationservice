#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -f "$ROOT_DIR/.env.e2e" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env.e2e"
  set +a
fi

: "${SERVICE_BASE_URL:?Set SERVICE_BASE_URL (example: https://app-teams-bot.azurewebsites.net)}"
: "${API_BEARER_TOKEN:?Set API_BEARER_TOKEN}"
: "${TARGET_EMAIL:=ihor.neshyk@ukroliya.com}"

REQUEST_ID="REQ-TABLE-$(date +%s)"
NOW_UTC="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

read -r -d '' PAYLOAD <<EOF || true
{
  "target": "${TARGET_EMAIL}",
  "text": "Тестове погодження заявки (${REQUEST_ID})",
  "adaptiveCard": {
    "\$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
    "type": "AdaptiveCard",
    "version": "1.5",
    "body": [
      {
        "type": "TextBlock",
        "weight": "Bolder",
        "size": "Medium",
        "text": "Заявки на погодження"
      },
      {
        "type": "TextBlock",
        "spacing": "Small",
        "isSubtle": true,
        "wrap": true,
        "text": "Сформовано: ${NOW_UTC}"
      },
      {
        "type": "Table",
        "firstRowAsHeaders": true,
        "showGridLines": true,
        "columns": [
          { "width": 1 },
          { "width": 1 },
          { "width": 2 },
          { "width": 2 },
          { "width": 1 },
          { "width": 1 }
        ],
        "rows": [
          {
            "type": "TableRow",
            "cells": [
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "checkbox", "weight": "Bolder" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "№ заявки", "weight": "Bolder" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "Постачальник", "weight": "Bolder" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "Вид соняшника", "weight": "Bolder" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "Кількість т", "weight": "Bolder" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "Ціна грн/т", "weight": "Bolder" }] }
            ]
          },
          {
            "type": "TableRow",
            "cells": [
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "☑" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "123" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "Вітчизна" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "соняшник" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "150" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "35000" }] }
            ]
          },
          {
            "type": "TableRow",
            "cells": [
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "☑" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "124" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "Обрій" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "соняшник BO" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "500" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "36500" }] }
            ]
          },
          {
            "type": "TableRow",
            "cells": [
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "☑" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "125" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "Ферма" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "соняшник" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "1500" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "35500" }] }
            ]
          }
        ]
      }
    ],
    "actions": [
      {
        "type": "Action.Submit",
        "title": "Погодити",
        "data": {
          "action": "approve_selected",
          "requestId": "${REQUEST_ID}",
          "selectedRequestIds": ["123", "124", "125"]
        }
      },
      {
        "type": "Action.Submit",
        "title": "Відхилити все",
        "data": {
          "action": "reject_all",
          "requestId": "${REQUEST_ID}",
          "selectedRequestIds": ["123", "124", "125"]
        }
      }
    ]
  }
}
EOF

echo "Sending test card to ${TARGET_EMAIL}..."

curl --silent --show-error --fail \
  -X POST "${SERVICE_BASE_URL}/send" \
  -H "Authorization: Bearer ${API_BEARER_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}"

echo
echo "Done."
