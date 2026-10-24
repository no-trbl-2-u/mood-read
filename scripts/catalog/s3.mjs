// scripts/catalog/s3.mjs: the smallest S3-compatible client `pnpm catalog:add` needs to reach Cloudflare R2: get,
// head and put one object, path-style, signed with AWS Signature Version 4 (region "auto" on R2). No SDK: node's own
// crypto and fetch. The credentials come in as arguments (from the environment, through `secrets.mjs run`) and are
// never printed; an error names the object key and the status, never the endpoint or a credential.
import { createHash, createHmac } from 'node:crypto';

const sha256Hex = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

/** RFC 3986 encoding as SigV4 wants it: everything but unreserved characters, `/` kept in paths. */
export function uriEncode(s, keepSlash = false) {
  return [...new TextEncoder().encode(s)]
    .map((b) => {
      const c = String.fromCharCode(b);
      if (/[A-Za-z0-9\-._~]/.test(c) || (keepSlash && c === '/')) return c;
      return `%${b.toString(16).toUpperCase().padStart(2, '0')}`;
    })
    .join('');
}

/**
 * The SigV4 Authorization header for one request. `headers` are the ones to sign (host and x-amz-date and
 * x-amz-content-sha256 included); `amzDate` is YYYYMMDDTHHMMSSZ. Pure, so it is tested against AWS's own example.
 */
export function authorization({ method, path, query = '', headers, payloadHash, accessKeyId, secretAccessKey, region, service = 's3', amzDate }) {
  const names = Object.keys(headers).map((h) => h.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')]));
  const canonicalHeaders = names.map((h) => `${h}:${lower[h]}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = [method, path, query, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), service), 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  return `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

const amzDateOf = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/**
 * A client for one bucket: `{ get(key), head(key), put(key, body, { contentType, cacheControl }) }`. `endpoint` is the
 * account's S3 API endpoint (https://<account>.r2.cloudflarestorage.com); one that already ends in the bucket is
 * accepted too.
 */
export function createS3Client({ endpoint, bucket, accessKeyId, secretAccessKey, region = 'auto', fetchImpl = fetch, now = () => new Date() }) {
  if (!endpoint || !accessKeyId || !secretAccessKey) throw new Error('R2 credentials are missing (CLOUDFLARE_S3_ACCESS_KEY_ID, CLOUDFLARE_S3_SECRET_ACCESS_KEY, S3_API_ENDPOINT)');
  if (!bucket) throw new Error('no bucket named');
  const base = new URL(endpoint);
  const prefix = base.pathname.replace(/\/+$/, '');
  const bucketPath = prefix.endsWith(`/${bucket}`) ? prefix : `${prefix}/${bucket}`;

  async function send(method, key, body, extra = {}) {
    const path = `${uriEncode(bucketPath, true)}/${uriEncode(key, true)}`;
    const payload = body ?? new Uint8Array(0);
    const payloadHash = sha256Hex(payload);
    const amzDate = amzDateOf(now());
    const headers = { host: base.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, ...extra };
    const auth = authorization({ method, path, headers, payloadHash, accessKeyId, secretAccessKey, region, amzDate });
    const { host: _host, ...sent } = headers;
    const res = await fetchImpl(`${base.origin}${path}`, { method, headers: { ...sent, authorization: auth }, body: body ?? undefined });
    return res;
  }

  return {
    /** The object's bytes, or null when there is none. */
    async get(key) {
      const res = await send('GET', key);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`R2 answered ${res.status} reading ${key}`);
      return new Uint8Array(await res.arrayBuffer());
    },
    /** True when the object exists. */
    async head(key) {
      const res = await send('HEAD', key);
      if (res.status === 404) return false;
      if (!res.ok) throw new Error(`R2 answered ${res.status} checking ${key}`);
      return true;
    },
    async put(key, body, { contentType, cacheControl } = {}) {
      const extra = {};
      if (contentType) extra['content-type'] = contentType;
      if (cacheControl) extra['cache-control'] = cacheControl;
      const res = await send('PUT', key, body, extra);
      if (!res.ok) throw new Error(`R2 answered ${res.status} writing ${key}`);
    },
  };
}
