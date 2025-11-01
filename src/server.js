const fs = require('fs');
const path = require('path');
const http = require('http');
const { z } = require('./validation/zod');
const { convertInput } = require('./converters');
const { deepMerge, clone } = require('./utils/deepMerge');
const { applyOutputFormat } = require('./utils/transform');

loadEnv();

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }
  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) {
      continue;
    }
    const equalsIndex = line.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }
    const key = line.slice(0, equalsIndex).trim();
    if (!key) {
      continue;
    }
    const value = line.slice(equalsIndex + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const PORT = Number(process.env.PORT) || 3000;
const API_VERSION = 'v0';
const ROUTE_PATH = `/${API_VERSION}/combine`;

function logRequest(method, url, status) {
  const timestamp = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.log(`[${timestamp}] ${method} ${url} -> ${status}`);
}

async function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        resolve(parsed);
      } catch (error) {
        const parseError = new Error('Invalid JSON body');
        parseError.statusCode = 400;
        reject(parseError);
      }
    });
    req.on('error', (error) => {
      reject(error);
    });
  });
}

const typeSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.toLowerCase() : value),
  z.enum(['json', 'xml', 'csv', 'yaml']),
);

const combineRequestSchema = z
  .object({
    inputs: z
      .array(
        z.object({
          type: typeSchema,
          data: z.string(),
        }),
      )
      .nonempty(),
    output_format: z.unknown().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.output_format !== undefined &&
      (typeof data.output_format !== 'object' || data.output_format === null || Array.isArray(data.output_format))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['output_format'],
        message: 'output_format must be an object',
      });
    }
  });

function parseCombineRequest(body) {
  const parsed = combineRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest('Invalid input');
  }
  return parsed.data;
}

async function handleCombine(body) {
  const { inputs, output_format: outputFormat } = parseCombineRequest(body);

  let merged;
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    let converted;
    try {
      converted = await convertInput(input);
    } catch (error) {
      const parseError = badRequest(`Failed to parse inputs[${index}] (${input.type}): ${error.message}`);
      throw parseError;
    }
    if (merged === undefined) {
      merged = clone(converted);
    } else {
      merged = deepMerge(merged, converted);
    }
  }

  const finalData = outputFormat ? applyOutputFormat(outputFormat, merged) : merged;
  const base64 = Buffer.from(JSON.stringify(finalData)).toString('base64');
  return { result: base64 };
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, 'http://localhost');

  if (req.method === 'POST' && parsedUrl.pathname === ROUTE_PATH) {
    try {
      const body = await parseRequestBody(req);
      const response = await handleCombine(body);
      sendJson(res, 200, response);
      logRequest(req.method, req.url, 200);
    } catch (error) {
      const message = error.message || 'Internal error';
      const status = error.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 500;
      if (status >= 500) {
        // eslint-disable-next-line no-console
        console.error(error);
      }
      sendJson(res, status, { error: message });
      logRequest(req.method, req.url, status);
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
  logRequest(req.method, req.url, 404);
});

function start(port = PORT) {
  return new Promise((resolve) => {
    server.listen(port, () => {
      resolve(server);
    });
  });
}

function stop() {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

if (require.main === module) {
  start().then(() => {
    // eslint-disable-next-line no-console
    console.log(`Unifio server listening on port ${PORT}`);
  });
}

module.exports = { server, start, stop, handleCombine };
