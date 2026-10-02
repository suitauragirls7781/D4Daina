import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';

/**
 * Runs an unchanged Node-style handler `(req, res)` inside a Worker.
 * `req` and `res` behave the way the handlers in api/** expect from a Node server runtime:
 * parsed `req.query` / `req.body` / `req.cookies`, a readable stream of the exact request bytes, and the
 * usual `res.status().setHeader().end()` chain. The answer comes back as a fetch `Response`.
 */

// Same order of magnitude as the largest body the store sends (settings, order with address).
export const MAX_BODY_BYTES = 1024 * 1024;

// Statuses that must not carry a body (the Response constructor throws otherwise).
const NO_BODY_STATUS = new Set([101, 204, 205, 304]);

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const plainReply = (status, message) => new Response(JSON.stringify({ error: message }), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, max-age=0' },
});

/** One JSON line per problem: Workers logs are the only place to look when something goes wrong. */
const logError = (message, request, error) => {
  console.error(JSON.stringify({
    level: 'error',
    message,
    method: request.method,
    path: new URL(request.url).pathname,
    error: error?.message || String(error ?? ''),
    stack: error?.stack,
  }));
};

/** Query string or form body -> object; a key given more than once becomes an array (as Node's querystring does). */
export const parseParams = (search) => {
  const result = Object.create(null);
  for (const [key, value] of new URLSearchParams(search)) {
    if (key in result) result[key] = [].concat(result[key], value);
    else result[key] = value;
  }
  return result;
};

const parseCookies = (header) => {
  const cookies = Object.create(null);
  for (const part of String(header || '').split(';')) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    const name = part.slice(0, at).trim();
    if (!name || name in cookies) continue;
    const value = part.slice(at + 1).trim().replace(/^"(.*)"$/, '$1');
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
};

/** Reads the whole body, refusing anything above the cap before it is held in memory. */
const readBody = async (request, limit) => {
  if (!request.body) return Buffer.alloc(0);
  if (Number(request.headers.get('content-length')) > limit) throw new HttpError(413, 'Request body is too large.');
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      throw new HttpError(413, 'Request body is too large.');
    }
    chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
  }
  return Buffer.concat(chunks, total);
};

/**
 * What the handlers expect in `req.body`: an object for JSON and for form posts (PayU), a Buffer for
 * application/octet-stream, undefined when there is no Content-Type, and the text for anything else.
 * Broken JSON is a 400.
 */
const parseBodyBytes = (raw, contentType) => {
  if (!contentType) return undefined;
  const type = contentType.split(';')[0].trim().toLowerCase();
  if (type === 'application/json') {
    const text = raw.toString('utf8');
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
  }
  if (type === 'application/x-www-form-urlencoded') return parseParams(raw.toString('utf8'));
  if (type === 'application/octet-stream') return raw;
  return raw.toString('utf8');
};

const requestHeaders = (request, url) => {
  const headers = {};
  for (const [name, value] of request.headers) headers[name.toLowerCase()] = value;
  // Only Cloudflare's own header says who the client is. A forwarded-for sent by the client is dropped,
  // because every rate limit in api/** keys on it.
  const ip = request.headers.get('cf-connecting-ip') || '';
  if (ip) headers['x-forwarded-for'] = ip;
  else delete headers['x-forwarded-for'];
  // The same-origin checks compare Origin with these two, so they come from the real URL, not from the client.
  headers.host = url.host;
  headers['x-forwarded-host'] = url.host;
  headers['x-forwarded-proto'] = url.protocol.replace(':', '');
  return { headers, ip };
};

const createReq = (request, raw, { rawBody }) => {
  const url = new URL(request.url);
  const { headers, ip } = requestHeaders(request, url);
  // A real Node stream of the exact bytes received: `for await (const chunk of req)` and req.on('data')
  // both work, which is how the Razorpay webhook reads the body it verifies the signature over.
  const req = Readable.from(raw.length ? [raw] : [], { objectMode: false });
  req.method = request.method;
  req.url = `${url.pathname}${url.search}`;
  req.headers = headers;
  req.query = parseParams(url.search);
  req.cookies = parseCookies(headers.cookie);
  req.socket = { remoteAddress: ip || undefined, encrypted: url.protocol === 'https:' };
  req.connection = req.socket;
  req.httpVersion = '1.1';

  // Parsed on first use. A handler that switched the parser off gets no body and reads the stream.
  let parsed;
  let isParsed = Boolean(rawBody);
  Object.defineProperty(req, 'body', {
    configurable: true,
    enumerable: true,
    get() {
      if (!isParsed) {
        parsed = parseBodyBytes(raw, headers['content-type']);
        isParsed = true;
      }
      return parsed;
    },
    set(value) {
      parsed = value;
      isParsed = true;
    },
  });
  return req;
};

const toBuffer = (chunk, encoding) => {
  if (chunk === undefined || chunk === null) return null;
  if (Buffer.isBuffer(chunk)) return chunk;
  if (chunk instanceof Uint8Array) return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  return Buffer.from(String(chunk), typeof encoding === 'string' ? encoding : 'utf8');
};

const createRes = () => {
  const headers = new Map(); // lower-cased name -> { name, value } where value is a string, number or array
  const chunks = [];

  const res = {
    statusCode: 200,
    statusMessage: '',
    headersSent: false,
    writableEnded: false,
    finished: false,

    status(code) {
      res.statusCode = Number(code);
      return res;
    },
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), { name: String(name), value });
      return res;
    },
    appendHeader(name, value) {
      const current = headers.get(String(name).toLowerCase());
      return res.setHeader(name, current ? [].concat(current.value, value) : value);
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase())?.value;
    },
    getHeaders() {
      return Object.fromEntries([...headers].map(([key, entry]) => [key, entry.value]));
    },
    getHeaderNames() {
      return [...headers.keys()];
    },
    hasHeader(name) {
      return headers.has(String(name).toLowerCase());
    },
    removeHeader(name) {
      headers.delete(String(name).toLowerCase());
    },
    writeHead(code, messageOrHeaders, maybeHeaders) {
      res.statusCode = Number(code);
      if (typeof messageOrHeaders === 'string') res.statusMessage = messageOrHeaders;
      const given = typeof messageOrHeaders === 'object' && messageOrHeaders ? messageOrHeaders : maybeHeaders;
      for (const [name, value] of Object.entries(given || {})) res.setHeader(name, value);
      return res;
    },
    // Nothing in api/** streams, so written chunks are collected and sent together when the handler ends.
    write(chunk, encoding) {
      if (res.writableEnded) throw new Error('write after end');
      const buffer = toBuffer(chunk, encoding);
      if (buffer) chunks.push(buffer);
      res.headersSent = true;
      return true;
    },
    end(chunk, encoding) {
      if (res.writableEnded) return res;
      if (typeof chunk !== 'function') {
        const buffer = toBuffer(chunk, encoding);
        if (buffer) chunks.push(buffer);
      }
      res.headersSent = true;
      res.writableEnded = true;
      res.finished = true;
      return res;
    },
    json(body) {
      if (!res.hasHeader('content-type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify(body));
    },
    send(body) {
      if (body === undefined || body === null) return res.end();
      if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
        if (!res.hasHeader('content-type')) res.setHeader('Content-Type', 'application/octet-stream');
        return res.end(body);
      }
      if (typeof body === 'object' || typeof body === 'number' || typeof body === 'boolean') return res.json(body);
      if (!res.hasHeader('content-type')) res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(String(body));
    },
    redirect(statusOrUrl, maybeUrl) {
      const status = typeof statusOrUrl === 'number' ? statusOrUrl : 307;
      const url = typeof statusOrUrl === 'number' ? maybeUrl : statusOrUrl;
      return res.status(status).setHeader('Location', String(url)).end();
    },
  };

  const toResponse = (method) => {
    const out = new Headers();
    for (const { name, value } of headers.values()) {
      // An array means one header line per item: the only way several Set-Cookie headers survive.
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item !== undefined && item !== null) out.append(name, String(item));
      }
    }
    const status = res.statusCode >= 200 && res.statusCode <= 599 ? res.statusCode : 500;
    const hasBody = method !== 'HEAD' && !NO_BODY_STATUS.has(status);
    return new Response(hasBody ? Buffer.concat(chunks) : null, { status, headers: out });
  };

  return { res, toResponse };
};

/**
 * @param handler  default export of an api/** file
 * @param request  the incoming fetch Request
 * @param options  rawBody: true for handlers that export `config.api.bodyParser === false`
 */
export const runNodeHandler = async (handler, request, { rawBody = false, maxBodyBytes = MAX_BODY_BYTES } = {}) => {
  const { res, toResponse } = createRes();
  try {
    const raw = await readBody(request, maxBodyBytes);
    const req = createReq(request, raw, { rawBody });
    await handler(req, res);
    // Every handler in api/** answers before it returns; one that did not would leave the client waiting.
    if (!res.writableEnded) throw new Error('Handler returned without sending a response.');
    return toResponse(request.method);
  } catch (error) {
    // The handler had already answered: that answer stands (the customer may have paid), the error is only logged.
    if (res.writableEnded) {
      logError('Handler failed after sending its response', request, error);
      return toResponse(request.method);
    }
    if (error instanceof HttpError) return plainReply(error.statusCode, error.message);
    logError('Unhandled error in API handler', request, error);
    return plainReply(500, 'Something went wrong. Please try again.');
  }
};
