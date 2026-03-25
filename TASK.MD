# MS Teams Bot ↔ Azure ↔ 1C (polling + outbound send) — Технічне завдання (README.md)

## 1. Мета
Побудувати інтеграцію, де:
- MS Teams взаємодіє з ботом (повідомлення + кнопки в Adaptive Cards).
- Події з Teams доставляються в Azure **push**-механізмом (Bot Framework → messaging endpoint), після чого складаються в чергу.
- 1С працює в режимі **polling** (аналог `getUpdates`) до нашого Azure API, забирає події та підтверджує обробку.
- 1С також може ініціювати відправку повідомлень у Teams через наш Azure API (`/send`) — бот виконує proactive send у відповідну розмову.

> Примітка: polling “напряму” з Teams для bot events недоступний; Teams доставляє активності на HTTPS endpoint бота. Це обхід робиться через Azure-чергу + власний API.  
> Azure Bot resource створюється через `az bot create` і потребує `endpoint` (messaging endpoint).  [oai_citation:0‡Microsoft Learn](https://learn.microsoft.com/ru-ru/cli/azure/bot?view=azure-cli-latest)

---

## 2. Компоненти рішення (Azure)
1) **App Service (Linux, Node.js)**  
   Хостить один Node.js сервіс, що включає:
   - Bot endpoint: `POST /api/messages`
   - API для 1С: `GET /updates`, `POST /ack`, `POST /send`

2) **Azure Bot resource** (реєстрація бота)  
   - Прив’язаний до messaging endpoint: `https://<app>.azurewebsites.net/api/messages`
   - Тип: `SingleTenant` (рекомендовано)  [oai_citation:1‡Microsoft Learn](https://learn.microsoft.com/ru-ru/cli/azure/bot?view=azure-cli-latest)

3) **Azure Storage Account + Storage Queue**  
   - Queue `teams-updates` для подій (at-least-once).
   - Ліміт розміру повідомлення ~64KiB; великі payload — зменшувати або виносити в Blob/DB.  [oai_citation:2‡docs.azure.cn](https://docs.azure.cn/en-us/bot-service/provision-app-service?view=azure-bot-service-4.0&utm_source=chatgpt.com)

4) **Сховище conversation references** (мінімум)
   - Допустимо почати з **Azure Table Storage** (простий key-value), або Cosmos DB.
   - Потрібно для proactive send (1С → Teams).  [oai_citation:3‡Microsoft Learn](https://learn.microsoft.com/uk-ua/azure/bot-service/channel-connect-teams?view=azure-bot-service-4.0&utm_source=chatgpt.com)

---

## 3. Функціональні вимоги

### 3.1 Inbound: Teams → Queue → 1C polling
- Будь-який `Action.Submit`/`Action.Execute` (клік по кнопці) має формувати `update` та ставитися в queue.
- `GET /updates?max=N` повертає до N подій із черги.
- `POST /ack` підтверджує обробку події (видалення повідомлення з черги).
- Семантика **at-least-once**: можливі дублікати → 1С має дедуплікувати по `activityId` або `updateId`.

### 3.2 Outbound: 1C → Teams
- `POST /send` приймає запит на відправку в Teams:
  - або по `conversationId`,
  - або по логічному ключу `target` (наприклад `default`), що мапиться на збережений conversation reference.
- Підтримати:
  - простий текст
  - Adaptive Card (JSON) як attachment
- Якщо conversation reference не знайдено → повернути 409/404 з поясненням.

---

## 4. Нефункціональні вимоги
- Безпека:
  - API для 1С захищений: `Authorization: Bearer <token>` (мінімум).
  - Секрети зберігаються в App Service Application Settings (або Key Vault).
- Надійність:
  - Бот на inbound не робить довгі операції: тільки валідація + enqueue + коротка відповідь.
- Спостережуваність:
  - Логи в App Service (stdout) + налаштувати App Insights (опційно).
- Обмеження:
  - Немає вимоги на порядок подій.
  - 1С одна.

---

## 5. API контракт (мінімальний)

### 5.1 GET /updates?max=10
**Відповідь**
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