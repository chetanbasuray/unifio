# Unifio API Reference

## Overview
Unifio is a data unification gateway that normalizes and merges heterogeneous payloads (JSON, XML, CSV, YAML) into a predictable JSON structure. The service performs format detection, sanitizes hostile constructs, and applies optional JSONPath-based projections before returning the unified payload as Base64-encoded JSON.

This guide is intended for developers who want to integrate with the public Unifio API. It explains supported endpoints, payload schemas, safety guardrails, and integration patterns.

## Base URL & Versioning
- **Base URL:** `https://<your-host>` (replace with the hostname for your deployment)
- **Stable version:** `v0`
- **Endpoint pattern:** `/v{N}/…`

Version upgrades ship under new paths (for example `/v1/combine`). Existing versions remain available for backwards compatibility until a scheduled deprecation.

## Authentication & Headers
- **Authentication:** Not required. Future releases may introduce API keys.
- **Content-Type:** `application/json` for all request bodies.
- **Accept:** `application/json` responses are returned by default.

## Endpoints

### `POST /v0/combine`
Merge, sanitize, and optionally transform one or more structured data snippets.

#### Request Schema
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
| `inputs` | array | ✅ | Non-empty list of input descriptors to normalize and merge. |
| `inputs[].type` | string | ✅ | One of `json`, `xml`, `csv`, or `yaml`. Determines the parsing strategy. |
| `inputs[].data` | string | ✅ | Raw payload string in the declared format. Binary content is rejected. |
| `output_format` | object | ❌ | Optional JSON object whose values are [JSONPath](https://goessner.net/articles/JsonPath/) expressions evaluated against the merged result. Nested objects yield nested output. |

Additional validation rules:
- Each `inputs[].data` string must represent valid text (UTF-8). Binary blobs or malformed encodings fail fast.
- Empty strings are allowed but produce empty structures for that format.
- Duplicate keys from later inputs override previous values during merge.

#### Response Schema
```json
{
  "result": "base64EncodedJson",
  "meta": {
    "truncated": false,
    "truncatedFields": [],
    "maxDepthReached": false,
    "outputTruncated": false,
    "timestamp": "2025-11-01T12:34:56.000Z"
  }
}
```

Decoding the Base64-encoded `result` yields the fully merged JSON document (or the projected structure when `output_format` is supplied). The `meta` object summarizes protective limits that may have been triggered:

| Meta Field | Description |
| ---------- | ----------- |
| `truncated` | `true` when large arrays are truncated to their safe maximum length. |
| `truncatedFields` | Paths that were truncated. |
| `maxDepthReached` | `true` when recursive structures hit the maximum traversal depth. |
| `outputTruncated` | `true` when the serialized response exceeded the size cap and was shortened. |
| `timestamp` | RFC 3339 timestamp when the response was produced. |

> **Important:** Base64 encoding is for transport safety only. Use your own encryption if confidentiality is required.

#### Error Responses

| Status | Body | Description |
| ------ | ---- | ----------- |
| `400` | `{ "error": "Invalid JSON body" }` | The HTTP body could not be parsed as JSON. |
| `400` | `{ "error": "Invalid input" }` | Schema validation failed (missing fields, unsupported `type`, non-string `data`). |
| `400` | `{ "error": "Failed to parse inputs[i] (yaml): Failed to parse YAML" }` | Format-specific parser failure (the index and type vary). |
| `413` | `{ "error": "Payload too large" }` | Request exceeds the maximum configured size (if enabled on your deployment). |
| `429` | `{ "error": "Rate limit exceeded" }` | Returned when upstream protection throttles the client. |
| `500` | `{ "error": "Internal error" }` | Unexpected server-side failure. |

Errors use concise machine-readable strings; clients may use simple string matching to categorize failures.

#### Example Workflow
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

Decoded response:
```json
{
  "profile": {
    "name": "Ada",
    "city": "London",
    "skills": "math"
  }
}
```

### `GET /v0/health`
Lightweight readiness endpoint that reports the service status.

#### Response
```json
{
  "status": "ok",
  "uptimeSeconds": 12345,
  "startedAt": "2025-11-01T12:00:00.000Z",
  "checkedAt": "2025-11-01T15:25:00.000Z"
}
```

- `status` — `"ok"` when the service loop is responsive.
- `uptimeSeconds` — Total uptime in seconds.
- `startedAt` — ISO timestamp when the process booted.
- `checkedAt` — ISO timestamp corresponding to the current request.

Use this endpoint for container orchestration readiness probes or load balancer health checks. It performs no downstream dependency calls and is safe to poll frequently.

## Data Protections & Sanitization
Unifio incorporates multiple layers of defensive parsing before a payload reaches the transformation stage:

- **CSV formula neutralization:** Cell values beginning with `=`, `+`, `-`, or `@` are automatically prefixed with `'` so they render as literal text in spreadsheet consumers.
- **YAML tag rejection:** Payloads containing language-specific or custom tags (such as `!!js/function` or `!<tag:yaml.org,2002:python/object>`) are rejected with `Failed to parse YAML`.
- **XML parser hardening:** External entity resolution (XXE) is disabled to prevent file exfiltration or SSRF attempts.
- **Binary/encoding guard:** Inputs are inspected to confirm they resemble UTF-8 text; binary blobs are rejected before parsing.
- **Depth & size limits:** Recursive traversal and output serialization enforce limits to prevent stack exhaustion and oversized responses.

These safeguards are applied automatically and surface as descriptive parse errors when triggered.

## Transformation Semantics
- All parsed inputs are merged into a single JSON document. Later inputs override earlier keys.
- When `output_format` is provided, each leaf value is evaluated as a JSONPath expression against the merged document. Missing paths yield `null`.
- Arrays can be truncated for safety; check `meta.truncated` and `meta.truncatedFields` to detect this case.
- `maxDepthReached` indicates that a structure exceeded the recursion limit. Consider simplifying deeply nested inputs if this occurs.

## Rate Limiting & Throughput
Unifio is optimized for short-lived compute bound tasks. Recommended client behavior:

- Batch related documents into a single request when possible to minimize network overhead.
- Retry with exponential backoff on `429` responses.
- Requests larger than a few hundred kilobytes may be rejected depending on deployment policy; split oversized data into multiple calls.

## Troubleshooting
- **`Failed to parse inputs[i] (...)`** — Inspect the offending payload (index `i`) for malformed syntax or forbidden constructs.
- **`Invalid input`** — Verify the request matches the schema and that every `inputs[].data` is a string.
- **Unexpected `null` fields** — Confirm the JSONPath expressions in `output_format` resolve against the merged document.
- **Health endpoint reports high uptime but downstream errors persist** — Use structured logging or trace IDs from the response headers (if enabled) to correlate failures.

## Change Log
- **2025-02-XX:** Initial public release of the `/v0/health` endpoint and documentation refresh.

For additional questions or feature requests, contact the Unifio team at `support@unifio.app`.
