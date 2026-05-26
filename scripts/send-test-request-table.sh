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

CONVERSATION_RESPONSE="$(
  curl --silent --show-error --fail \
    -X GET "${SERVICE_BASE_URL}/conversation/by-email?email=${TARGET_EMAIL}" \
    -H "Authorization: Bearer ${API_BEARER_TOKEN}" \
    -H "Content-Type: application/json"
)"

CONVERSATION_ID="$(
  printf "%s" "${CONVERSATION_RESPONSE}" | node -e '
let data = "";
process.stdin.on("data", (chunk) => (data += chunk));
process.stdin.on("end", () => {
  try {
    const json = JSON.parse(data);
    if (!json.conversationId) {
      process.exit(2);
    }
    process.stdout.write(json.conversationId);
  } catch (_error) {
    process.exit(2);
  }
});
'
)"

read -r -d '' PAYLOAD <<EOF || true
{
  "conversationId": "${CONVERSATION_ID}",
  "text": "Тестове погодження заявки (${REQUEST_ID})",
  "adaptiveCard": {
    "\$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
    "type": "AdaptiveCard",
    "version": "1.5",
    "msteams": {
      "width": "Full"
    },
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
          { "width": 0.6 },
          { "width": 0.8 },
          { "width": 1.4 },
          { "width": 1.8 },
          { "width": 0.8 },
          { "width": 1.2 }
        ],
        "rows": [
          {
            "type": "TableRow",
            "cells": [
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "✓", "weight": "Bolder", "horizontalAlignment": "Center" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "№", "weight": "Bolder" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "Постач.", "weight": "Bolder", "wrap": true }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "Вид", "weight": "Bolder", "wrap": true }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "т", "weight": "Bolder", "horizontalAlignment": "Right" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "грн/т", "weight": "Bolder", "horizontalAlignment": "Right" }] }
            ]
          },
          {
            "type": "TableRow",
            "cells": [
              { "type": "TableCell", "items": [{ "type": "Input.Toggle", "id": "sel_123", "valueOn": "true", "valueOff": "false", "value": "true", "title": "" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "123" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "Вітчизна", "wrap": true }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "соняшник", "wrap": true }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "150", "horizontalAlignment": "Right" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "35 000", "horizontalAlignment": "Right" }] }
            ]
          },
          {
            "type": "TableRow",
            "cells": [
              { "type": "TableCell", "items": [{ "type": "Input.Toggle", "id": "sel_124", "valueOn": "true", "valueOff": "false", "value": "true", "title": "" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "124" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "Обрій", "wrap": true }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "соняшник BO", "wrap": true }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "500", "horizontalAlignment": "Right" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "36 500", "horizontalAlignment": "Right" }] }
            ]
          },
          {
            "type": "TableRow",
            "cells": [
              { "type": "TableCell", "items": [{ "type": "Input.Toggle", "id": "sel_125", "valueOn": "true", "valueOff": "false", "value": "true", "title": "" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "125" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "Ферма", "wrap": true }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "соняшник", "wrap": true }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "1 500", "horizontalAlignment": "Right" }] },
              { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "35 500", "horizontalAlignment": "Right" }] }
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
          "selectionInputIds": ["sel_123", "sel_124", "sel_125"],
          "candidateRequestIds": ["123", "124", "125"]
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
