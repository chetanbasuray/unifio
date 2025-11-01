# Unifio

Unifio — unify any data format into one clean output. The Unifio service accepts payloads that contain multiple data snippets in JSON, XML, CSV, or YAML formats, merges them into a single structure, optionally reshapes the result using JSONPath selectors, and returns the response as Base64-encoded JSON.

## Getting Started

### Prerequisites
- Node.js 18+

### Installation
```bash
npm install
```

### Local Development
```bash
npm run dev
```

### Running Tests
```bash
npm test
```
Runs the Jest suite covering happy-path merges and validation failures.

## Usage

### HTTP Request
`POST /v0/combine`

#### Example Request
```json
{
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
}
```

#### Example Response
```json
{
  "result": "eyJwcm9maWxlIjp7Im5hbWUiOiJBZGEiLCJjaXR5IjoiTG9uZG9uIiwic2tpbGxzIjoibWF0aCJ9fQ=="
}
```

### Example cURL
```bash
curl -X POST http://localhost:3000/v0/combine \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": [
      { "type": "json", "data": "{\"name\":\"Ada\"}" },
      { "type": "csv", "data": "skill,level\\nmath,expert" }
    ]
  }'
```

## Deployment
The service listens on `process.env.PORT` or defaults to port `3000`, making it friendly for platforms such as Vercel.

## Security
- Unifio automatically neutralizes potential CSV formula injection vectors by prefixing risky cell values with a single quote.
- Unifio automatically enforces output limits to prevent accidental or malicious flooding. Arrays are capped to 1000 elements and total JSON size is limited to 1 MB by default.

## API Documentation
See [API.md](./API.md) for a complete reference, including version details and error responses.

## License
not for use by others
