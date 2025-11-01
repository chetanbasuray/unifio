const fs = require('fs');
const path = require('path');
const http = require('http');
const { z } = require('./validation/zod');
const { convertInput } = require('./converters');
const { deepMerge, clone } = require('./utils/deepMerge');
const { applyOutputFormat, MAX_OUTPUT_BYTES } = require('./utils/transform');

loadEnv();

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function badRequest(message) {
  return createHttpError(400, message);
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

function formatDurationNs(durationNs) {
  return Number(durationNs) / 1e6;
}

function logRequest(method, url, status, durationMs) {
  const timestamp = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.log(
    `[${timestamp}] ${method} ${url} -> ${status} ${durationMs.toFixed(2)}ms`,
  );
}

const MAX_PAYLOAD_SIZE = 5 * 1024 * 1024;

async function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalSize = 0;
    let completed = false;

    const finish = (error, result) => {
      if (completed) {
        return;
      }
      completed = true;
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    };

    req.on('data', (chunk) => {
      if (completed) {
        return;
      }

      totalSize += chunk.length;
      if (totalSize > MAX_PAYLOAD_SIZE) {
        const payloadError = new Error('Payload too large');
        payloadError.statusCode = 413;
        req.destroy(payloadError);
        finish(payloadError);
        return;
      }

      chunks.push(chunk);
    });

    req.on('end', () => {
      if (completed) {
        return;
      }

      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        finish(null, {});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        finish(null, parsed);
      } catch (error) {
        const parseError = new Error('Invalid JSON body');
        parseError.statusCode = 400;
        finish(parseError);
      }
    });

    req.on('error', (error) => {
      finish(error);
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

    if (!isLikelyText(input.data)) {
      // eslint-disable-next-line no-console
      console.warn('[Unifio] Rejected input with invalid encoding or binary data.');
      throw badRequest('Invalid input encoding — only UTF-8 text is supported');
    }

    let converted;
    try {
      converted = await convertInput(input);
    } catch (error) {
      throw badRequest(`Failed to parse inputs[${index}] (${input.type}): ${error.message}`);
    }
    if (merged === undefined) {
      merged = clone(converted);
    } else {
      merged = deepMerge(merged, converted);
    }
  }

  const finalData = outputFormat ? applyOutputFormat(outputFormat, merged) : merged;
  const serialized = JSON.stringify(finalData);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_OUTPUT_BYTES) {
    const error = new Error('Output too large. Try narrowing your query or reducing array size.');
    error.statusCode = 413;
    throw error;
  }

  const base64 = Buffer.from(serialized).toString('base64');
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

function normalizeError(error) {
  const status = error && Number.isInteger(error.statusCode) ? error.statusCode : 500;
  const isServerError = status >= 500;
  const message = !isServerError && error && error.message ? error.message : 'Internal error';
  return { status, message, isServerError };
}

function handleError(error, req, res) {
  const { status, message, isServerError } = normalizeError(error);
  if (isServerError) {
    // eslint-disable-next-line no-console
    console.error(error);
  }
  const payload = { error: message };
  if (error && error.meta) {
    payload.meta = error.meta;
  }
  sendJson(res, status, payload);
}

async function routeRequest(req, res) {
  const parsedUrl = new URL(req.url, 'http://localhost');

  if (req.method === 'POST' && parsedUrl.pathname === ROUTE_PATH) {
    const body = await parseRequestBody(req);
    const response = await handleCombine(body);
    sendJson(res, 200, response);
    return;
  }

  throw createHttpError(404, 'Not found');
}

async function handleHttpRequest(req, res) {
  const start = process.hrtime.bigint();
  res.once('finish', () => {
    const end = process.hrtime.bigint();
    const durationMs = formatDurationNs(end - start);
    const endpoint = new URL(req.url, 'http://localhost').pathname;
    logRequest(req.method, endpoint, res.statusCode, durationMs);
  });

  try {
    await routeRequest(req, res);
  } catch (error) {
    handleError(error, req, res);
  }
}

const server = http.createServer((req, res) => {
  handleHttpRequest(req, res);
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

module.exports = handleHttpRequest;
module.exports.server = server;
module.exports.start = start;
module.exports.stop = stop;
module.exports.handleCombine = handleCombine;
