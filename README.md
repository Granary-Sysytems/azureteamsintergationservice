# Teams ↔ Azure ↔ 1C Integration Service

Node.js service for:
- inbound events from Microsoft Teams Bot Framework (`POST /api/messages`);
- polling API for 1C (`GET /updates`, `POST /ack`);
- outbound proactive send from 1C to Teams (`POST /send`).

## Architecture

- `Teams -> /api/messages -> Azure Storage Queue (teams-updates)`
- `1C -> GET /updates -> POST /ack`
- `1C -> POST /send -> proactive message to Teams`

## Prerequisites

- Node.js 20+
- Azure Storage Account (Queue + Table)
- Azure App Service (Linux, Node.js)
- Azure Bot resource linked to:
  - `https://<your-app>.azurewebsites.net/api/messages`

## Local Run

```bash
npm install
cp .env.example .env
npm run dev
```

Health check:

```bash
curl http://localhost:3978/health
```

## Environment Variables

See `.env.example`:

- `PORT`
- `BOT_APP_ID`
- `BOT_APP_PASSWORD`
- `AZURE_STORAGE_CONNECTION_STRING`
- `AZURE_QUEUE_NAME`
- `AZURE_TABLE_NAME`
- `API_BEARER_TOKEN`
- `BIND_TOKEN_TTL_DAYS` (default `365`)

## API for 1C

All endpoints below require:

`Authorization: Bearer <API_BEARER_TOKEN>`

### GET /updates?max=10

Returns messages from queue (at-least-once delivery).

```bash
curl -X GET "http://localhost:3978/updates?max=10" \
  -H "Authorization: Bearer <token>"
```

Response shape:

```json
{
  "updates": [
    {
      "updateId": "<queueMessageId>",
      "popReceipt": "<queuePopReceipt>",
      "ts": "2026-03-25T12:34:56Z",
      "type": "card.submit",
      "activityId": "<teamsActivityId>",
      "from": { "id": "...", "name": "..." },
      "tenantId": "...",
      "conversationId": "...",
      "data": { "action": "approve", "requestId": "REQ-123" }
    }
  ]
}
```

### POST /ack

```bash
curl -X POST "http://localhost:3978/ack" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "updateId":"<queueMessageId>",
    "popReceipt":"<queuePopReceipt>"
  }'
```

### POST /send

Request must include either `conversationId` or `target`.

Send by `conversationId`:

```bash
curl -X POST "http://localhost:3978/send" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId":"19:xxxx@thread.v2",
    "text":"Hello from 1C"
  }'
```

Send by logical `target`:

```bash
curl -X POST "http://localhost:3978/send" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "target":"user-ihor",
    "adaptiveCard":{
      "$schema":"http://adaptivecards.io/schemas/adaptive-card.json",
      "type":"AdaptiveCard",
      "version":"1.5",
      "body":[{"type":"TextBlock","text":"Request approved"}]
    }
  }'
```

Inline inputs for rejection (comment + amount):

```bash
curl -X POST "http://localhost:3978/send" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "target":"user-ihor",
    "adaptiveCard":{
      "$schema":"http://adaptivecards.io/schemas/adaptive-card.json",
      "type":"AdaptiveCard",
      "version":"1.5",
      "body":[
        {"type":"TextBlock","weight":"Bolder","text":"Погодити заявку"},
        {"type":"Input.Text","id":"comment","label":"Коментар (для відхилення)","isMultiline":true},
        {"type":"Input.Number","id":"amount","label":"Сума (для відхилення)"}
      ],
      "actions":[
        {
          "type":"Action.Submit",
          "title":"Погодити заявку",
          "data":{"action":"approve_request","requestId":"REQ-300"}
        },
        {
          "type":"Action.Submit",
          "title":"Відхилити заявку або відправити на уточнення",
          "data":{
            "action":"reject_or_request_clarification",
            "requestId":"REQ-300",
            "requiredFields":["comment","amount"]
          }
        }
      ]
    }
  }'
```

Send binary file from base64 (service uploads to Blob and sends link):

```bash
curl -X POST "http://localhost:3978/send" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId":"19:xxxx@thread.v2",
    "text":"Документ готовий",
    "base64File":{
      "fileName":"contract.docx",
      "contentType":"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "base64Body":"UEsDBBQABgAIAAAAIQC..."
    }
  }'
```

Response includes uploaded links:

```json
{
  "status": "sent",
  "conversationId": "19:xxxx@thread.v2",
  "activityId": "1712345678901",
  "uploadedFiles": [
    {
      "fileName": "contract.docx",
      "contentType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "downloadUrl": "https://<storage>.blob.core.windows.net/teams-attachments/...?...SAS..."
    }
  ]
}
```

### Onboarding new user by email (1C UI flow)

Use this flow when 1C knows only user email and does not yet have `conversationId`.

1) Start link process:

```bash
curl -X POST "http://localhost:3978/link/start" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "email":"ihor.neshyk@ukroliya.com"
  }'
```

Response contains one-time `bindToken` and instructions.

2) User opens bot in Teams and sends:

```text
LINK <bindToken>
```

Bot stores mapping `email -> conversationId` for that user conversation.

3) 1C resolves conversation by email:

```bash
curl -X GET "http://localhost:3978/conversation/by-email?email=ihor.neshyk@ukroliya.com" \
  -H "Authorization: Bearer <token>"
```

Then use returned `conversationId` in `POST /send`.

## Azure Deploy

### 0) Store deploy config in files

```bash
mkdir -p config
cp config/azure.env.example config/azure.env
cp config/azure.secrets.env.example config/azure.secrets.env
```

Then fill `config/azure.env` and `config/azure.secrets.env`.
Both files are ignored by git.

Expected key in `config/azure.secrets.env`:
- `AZURE_STORAGE_CONNECTION_STRING` (preferred)
- `BOT_APP_PASSWORD`
- `API_BEARER_TOKEN`

### 1) Provision resources

```bash
az group create --name rg-teams-1c --location westeurope

az storage account create \
  --name <storageAccountName> \
  --resource-group rg-teams-1c \
  --location westeurope \
  --sku Standard_LRS

az appservice plan create \
  --name asp-teams-1c \
  --resource-group rg-teams-1c \
  --is-linux \
  --sku B1

az webapp create \
  --name <webAppName> \
  --resource-group rg-teams-1c \
  --plan asp-teams-1c \
  --runtime "NODE|20-lts"
```

Or use helper script:

```bash
./scripts/azure-deploy.sh
```

The script checks `az` availability and active Azure login before provisioning.

### 2) Configure app settings

```bash
az webapp config appsettings set \
  --name <webAppName> \
  --resource-group rg-teams-1c \
  --settings \
    BOT_APP_ID="<aadAppId>" \
    BOT_APP_PASSWORD="<aadAppSecret>" \
    AZURE_STORAGE_CONNECTION_STRING="<storageConnectionString>" \
    AZURE_QUEUE_NAME="teams-updates" \
    AZURE_TABLE_NAME="ConversationReferences" \
    API_BEARER_TOKEN="<strongSharedToken>"
```

Or use helper script:

```bash
./scripts/azure-configure-settings.sh
```

Note: the script reads `AZURE_STORAGE_CONNECTION_STRING` from config files.  
Backward-compatible fallback from `STORAGE_CONNECTION_STRING` is supported.

### 3) Deploy service

Use your preferred deployment flow (GitHub Actions, Zip Deploy, or local git push to App Service).

### 4) Register Azure Bot endpoint

Set messaging endpoint in Azure Bot resource:

`https://<webAppName>.azurewebsites.net/api/messages`

Or create/register bot via script:

```bash
./scripts/azure-bot-register.sh
```

## Notes

- Delivery is at-least-once; 1C must deduplicate by `activityId` or `updateId`.
- Queue payload size should remain under Azure Queue limits.
- `conversation reference` is saved on every inbound Teams activity.
- `bindToken` is one-time and has configurable TTL via `BIND_TOKEN_TTL_DAYS` (default 365 days).

## E2E Tests (Ihor)

Tests are configured for `ihor.neshyk@ukroliya.com` by default.

```bash
cp .env.e2e.example .env.e2e
# fill API_BEARER_TOKEN and (optionally) EXPECTED_CONVERSATION_ID
npm run test:e2e
```

By default only send test runs (`RUN_RECEIVE_TEST=0`).
To run receive + ack flow, set `RUN_RECEIVE_TEST=1` in `.env.e2e`.

## Local Test Baseline

```bash
npm test
```

This runs unit + integration tests without requiring live Azure resources.
The same `npm test` command is used in GitHub Actions CI (`.github/workflows/ci.yml`).
