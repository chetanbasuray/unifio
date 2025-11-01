# Unifio

_Unify any data format into one clean output._

<p align="left">
  <a href="https://nodejs.org/en/">
    <img src="https://img.shields.io/badge/node.js-18.x-green" alt="Node.js" />
  </a>
  <a href="https://vercel.com/">
    <img src="https://img.shields.io/badge/deployed%20on-Vercel-black" alt="Deployed on Vercel" />
  </a>
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT" />
  </a>
</p>

<!-- JSON merge API, YAML to JSON API, CSV XML parser, data unifier -->

## Overview
Unifio is a serverless API for consolidating data from JSON, YAML, XML, and CSV sources into one predictable JSON payload. By layering JSONPath expressions on top of arbitrary inputs, teams can automate data shaping for integrations, ETL pipelines, and reporting workflows.

## Live Endpoint
`https://unifio.vercel.app/v0/combine`

## Example Request
```bash
curl -X POST https://unifio.vercel.app/v0/combine \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": [
      { "type": "json", "data": "{\\"user\\":{\\"id\\":1,\\"email\\":\\"ada@example.com\\"}}" },
      { "type": "yaml", "data": "profile:\\n  name: Ada Lovelace\\n  title: Mathematician" },
      { "type": "csv", "data": "skill,level\\nanalysis,expert\\nlogic,advanced" },
      { "type": "xml", "data": "<settings><newsletter enabled=\"true\"/><timezone>UTC</timezone></settings>" }
    ],
    "output_format": {
      "id": "$.user.id",
      "name": "$.profile.name",
      "skills": "$.rows[*].skill",
      "preferences": {
        "newsletter": "$.settings.newsletter.@attributes.enabled",
        "timezone": "$.settings.timezone.#text"
      }
    }
  }'
```

## Example Response
```json
{
  "result": "eyJpZCI6MSwibmFtZSI6IkFkYSBMb3ZlbGFjZSIsInNraWxscyI6WyJhbmFseXNpcyIsImxvZ2ljIl0sInByZWZlcmVuY2VzIjp7Im5ld3NsZXR0ZXIiOiJ0cnVlIiwidGltZXpvbmUiOiJVVCJ9fQ==",
  "meta": {
    "truncated": false,
    "truncatedFields": [],
    "maxDepthReached": false,
    "outputTruncated": false,
    "timestamp": "2025-11-01T12:34:56.000Z"
  }
}
```

⚠️ **Reminder:** Base64 merely encodes the JSON payload for transport—it does not encrypt or conceal the data.

Decoded result:
```json
{
  "id": 1,
  "name": "Ada Lovelace",
  "skills": ["analysis", "logic"],
  "preferences": {
    "newsletter": "true",
    "timezone": "UTC"
  }
}
```

## Response Metadata
Each response contains a `meta` object describing limit-related behavior:

- **`truncated`** – `true` if any JSONPath array was capped at the configured maximum.
- **`truncatedFields`** – Names of fields that were truncated to `MAX_ARRAY_ITEMS` elements.
- **`maxDepthReached`** – Indicates that a branch exceeded the recursion depth safeguard and returned `null`.
- **`outputTruncated`** – `true` when the overall JSON result would exceed the output size limit (the request returns a 413 error in that case).
- **`timestamp`** – ISO 8601 timestamp of when Unifio processed the request.

## Supported Formats
- JSON
- YAML
- XML
- CSV

## Error Handling
- **400 Bad Request** – Invalid payloads, malformed inputs, or JSONPath errors.
- **413 Payload Too Large** – Requests exceeding 5 MB or responses that would surpass the configured output limit.
- **500 Internal Server Error** – Unexpected failures; logged for operators to investigate.

## Versioning
The current stable API lives at `/v0`. Future releases will introduce `/v1`, `/v2`, etc., with clear migration notes to preserve backward compatibility.

## Security and Limits
- Request bodies are capped at **5 MB**, and recursion depth inside `applyOutputFormat` is limited to **10** levels to prevent runaway processing.
- JSONPath outputs enforce array and payload caps to guard against response flooding.
- YAML parsing uses the official `yaml` library with unsafe tags disabled, and XML parsing relies on `xml2js` configured to block entity expansion.
- CSV inputs are sanitized to neutralize formula-injection attempts when exported to spreadsheets.
- Unifio only accepts UTF-8 textual data; binary or invalidly encoded payloads are rejected with a 400 error.

### Base64 Encoding Is Not Encryption
**Note:** Base64 is not encryption. It simply converts binary data to text form. Do not treat Base64 as a security mechanism. Anyone who intercepts a response can decode it instantly, so always encrypt sensitive information before sending it to Unifio.

## Hosting & Deployment
Built with Node.js and deployed on Vercel. Forks can self-host by deploying the serverless function to any Node.js-compatible platform.

## Contributing
Issues and pull requests are welcome. Please open a discussion if you plan large changes so we can coordinate the roadmap.

## License
Released under the [MIT License](https://opensource.org/licenses/MIT).
