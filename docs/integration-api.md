# Partner Integration API

GermanVerbMaster now exposes a lightweight REST surface that learning platforms can embed to deliver verb drills and capture usage analytics. This document doubles as the sandbox guide for partners and internal teams.

## Authentication

All partner endpoints require an API key passed via the `X-Partner-Key` header. Keys are stored hashed in SQLite. Generate a sandbox key locally with:

```bash
npm run integration:create-key -- --name "Acme LMS" --contact "partners@acme.test" --origins "https://sandbox.acme.test,https://lms.acme.test"
```

The script prints the plain key for distribution plus an `INSERT` statement for `integration_partners`. Apply the statement to your development database with `sqlite3 db/data.sqlite` or through the Drizzle console. Re-run the command whenever you need to rotate credentials.

## Available Endpoints

### `GET /api/partner/drills`
Fetch a curated drill bundle suitable for embedding into an LMS module.

| Query Param | Type | Description |
| --- | --- | --- |
| `limit` | number | Maximum number of drills to return (default `20`, max `100`). |
| `level` | string | Optional CEFR level filter (`A1`–`C2`). |
| `patternGroup` | string | Filter verbs by conjugation pattern group. |

**Response**
```jsonc
{
  "partner": { "id": 1, "name": "Acme LMS", "contactEmail": "partners@acme.test" },
  "filters": { "level": "B1", "patternGroup": null, "limit": 10 },
  "count": 10,
  "generatedAt": "2025-01-12T18:34:21.135Z",
  "drills": [
    {
      "infinitive": "sein",
      "english": "to be",
      "auxiliary": "sein",
      "level": "A1",
      "patternGroup": "irregular",
      "prompts": {
        "praeteritum": { "question": "Was ist die Präteritum-Form von “sein”?", "answer": "war", "example": "Ich war müde." },
        "partizipII": { "question": "Was ist das Partizip II von “sein”?", "answer": "gewesen", "example": "Ich bin müde gewesen." },
        "auxiliary": { "question": "Welches Hilfsverb wird mit “sein” verwendet?", "answer": "sein" },
        "english": { "question": "What is the English meaning of “sein”?", "answer": "to be" }
      },
      "source": { "name": "Duden", "levelReference": "A1" },
      "updatedAt": "2025-01-11T22:15:00.000Z"
    }
  ]
}
```

### `GET /api/partner/usage-summary`
Returns request analytics for the authenticated partner. Use `windowHours` to control the time horizon (default `24`, maximum `336`).

**Response**
```jsonc
{
  "partner": { "id": 1, "name": "Acme LMS" },
  "windowHours": 24,
  "totals": {
    "totalRequests": 42,
    "successfulRequests": 40,
    "failedRequests": 1,
    "successRate": 95.24,
    "averageResponseTimeMs": 132,
    "lastRequestAt": "2025-01-12T18:30:05.921Z"
  },
  "topEndpoints": [
    { "endpoint": "/api/partner/drills", "count": 38 },
    { "endpoint": "/api/partner/usage-summary", "count": 4 }
  ],
  "recentRequests": [
    { "endpoint": "/api/partner/drills", "statusCode": 200, "requestedAt": "2025-01-12T18:34:21.135Z", "responseTimeMs": 118 }
  ]
}
```

## Sandbox Workflow

1. **Create a partner record** using the script above and apply the SQL snippet.
2. **Run the stack locally** with `npm run dev`. The Express API listens on `http://localhost:5173` when Vite is active.
3. **Call the API** using `curl` or an HTTP client:
   ```bash
   curl -H "X-Partner-Key: <plain-key-from-script>" \
        "http://localhost:5173/api/partner/drills?level=B1&limit=5"
   ```
4. **Inspect analytics** by requesting `/api/partner/usage-summary`. The endpoint reports aggregated totals and the latest 25 requests, which downstream dashboards can ingest.
5. **Validate embed flows** by wiring the drill payload into your LMS widget. Each prompt already includes localized questions and sample answers for rapid prototyping.

## Notes & Next Steps

- The current implementation authenticates with static API keys. Future iterations can attach OAuth client credentials or JWT signing for deeper LMS SSO flows.
- Usage metrics are persisted in the `integration_usage` table and can be surfaced alongside existing analytics dashboards.
- Add additional scopes or rate limits per partner by extending the schema without breaking this contract.
