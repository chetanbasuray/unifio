# Unifio API Reference

## Overview
Unifio — unify any data format into one clean output. The API merges multiple data sources (JSON, XML, CSV, YAML), optionally transforms fields with JSONPath expressions, and returns the unified payload as Base64-encoded JSON.

## Versioning
- Base URL: `https://<your-host>`
- Current stable version: `v0`
- Endpoint pattern: `/v{N}/combine`
- Clients should pin to a specific version to avoid breaking changes. New major versions will be surfaced at a new path
  (e.g., `/v1/combine`) while `/v0/combine` remains available for existing integrations.

## Authentication
- None. Authentication is planned for a future update.

## Endpoint
### `POST /v0/combine`
Merges and optionally transforms supplied data snippets.

#### Request Body
```json
{
  "inputs": [
    { "type": "json", "data": "{...}" },
    { "type": "xml", "data": "<root>...</root>" },
    { "type": "csv", "data": "name,age\nAlice,30" },
    { "type": "yaml", "data": "age: 30" }
  ],
  "output_format": {
    "user_summary": {
      "name": "$.name",
      "age": "$.age"
    }
  }
}
```

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `inputs` | array | Yes | Non-empty list of input descriptors to merge. |
| `inputs[].type` | string | Yes | One of `json`, `xml`, `csv`, or `yaml`. |
| `inputs[].data` | string | Yes | Raw payload string in the format indicated by `type`. |
| `output_format` | object | No | JSON object whose values are JSONPath expressions applied to the merged payload. |

#### Response
```json
{
  "result": "base64EncodedJson"
}
```
Decoding `result` yields the merged JSON object or the transformed structure when `output_format` is provided.

> **Security Note:** Base64 is only an encoding step for transport safety—it does **not** encrypt or hide the response. Encrypt sensitive data before sending it to Unifio.

#### Error Responses
| Status | Body | When |
| ------ | ---- | ---- |
| `400` | `{ "error": "Invalid input" }` | Request body fails validation (missing inputs, unsupported type, non-string data). |
| `400` | `{ "error": "Invalid JSON body" }` | Body could not be parsed as JSON. |
| `404` | `{ "error": "Not found" }` | Requested path or method is unsupported. |
| `500` | `{ "error": "Internal error" }` | Unexpected server failure. |

#### Example
Request:
```bash
curl -X POST https://api.example.com/v0/combine \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": [
      { "type": "json", "data": "{\"name\":\"Ada\",\"age\":31}" },
      { "type": "yaml", "data": "location:\n  city: London" },
      { "type": "csv", "data": "skill,level\\nmath,expert" }
    ],
    "output_format": {
      "profile": {
        "name": "$.name",
        "city": "$.location.city",
        "skills": "$.rows[0].skill"
      }
    }
  }'
```

Decoded Response:
```json
{
  "profile": {
    "name": "Ada",
    "city": "London",
    "skills": "math"
  }
}
```
