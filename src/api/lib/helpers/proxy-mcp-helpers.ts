import { Buffer } from 'buffer';

/**
 * RATE LIMIT + CACHE CONFIG
 */
export const RATE_LIMIT_CONFIG = {
  MAX_REQUESTS_PER_MINUTE: 30,
  MIN_REQUEST_DELAY: 1000, // ms between requests to same host
  MAX_RETRIES: 3,
  BASE_RETRY_DELAY: 2000, // ms (2s)
  DEFAULT_CACHE_TTL: 30_000, // 30s
  COINGECKO_CACHE_TTL: 60_000, // 60s
  API_CACHE_TTL: 45_000, // 45s
  MAX_CACHE_SIZE: 100,
};

/**
 * In-memory rate limiter (per-hostname)
 * key: hostname -> { requests, resetTime, lastRequest }
 */
export const rateLimitMap = new Map<
  string,
  { requests: number; resetTime: number; lastRequest: number }
>();

/**
 * Simple in-memory response cache
 * Stored body as base64 to be binary-safe
 */
interface CacheEntry {
  status: number;
  headers: Record<string, string>;
  bodyBase64: string; // base64 encoded
  timestamp: number;
  ttl: number;
}
export const responseCache = new Map<string, CacheEntry>();

/**
 * Hop-by-hop and sensitive headers (should NOT be forwarded)
 * Includes RFC-7230 hop-by-hop headers + common infra headers and auth headers
 */
export const HOP_BY_HOP = new Set<string>([
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'cookie',
  'authorization',
  'connection',
  'forwarded',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-port',
  'x-forwarded-proto',
  'x-real-ip',
  'x-matched-path',

  // Vercel / infra headers (prevent leaking)
  'x-vercel-deployment-url',
  'x-vercel-forwarded-for',
  'x-vercel-id',
  'x-vercel-internal-bot-check',
  'x-vercel-internal-ingress-bucket',
  'x-vercel-internal-ingress-port',
  'x-vercel-ip-as-number',
  'x-vercel-ip-city',
  'x-vercel-ip-continent',
  'x-vercel-ip-country',
  'x-vercel-ip-country-region',
  'x-vercel-ip-latitude',
  'x-vercel-ip-longitude',
  'x-vercel-ip-postal-code',
  'x-vercel-ip-timezone',
  'x-vercel-ja4-digest',
  'x-vercel-oidc-token',
  'x-vercel-proxied-for',
  'x-vercel-proxy-signature',
  'x-vercel-proxy-signature-ts',
  'x-vercel-sc-basepath',
  'x-vercel-sc-headers',
  'x-vercel-sc-host',
]);

/**
 * Block header prefixes to match platform-specific families
 */
export const BLOCKED_HEADER_PREFIXES = ['x-vercel-', 'cf-', 'x-forwarded-'];

/**
 * Returns whether the header should be blocked from forwarding.
 */
export function shouldBlockHeader(headerName: string): boolean {
  if (!headerName) return true;
  const lower = headerName.toLowerCase();
  if (HOP_BY_HOP.has(lower)) return true;
  return BLOCKED_HEADER_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * Create a cache key from URL + method + body (body is Buffer)
 */
export function getCacheKey(
  url: string,
  method: string,
  body?: Buffer,
): string {
  const bodyHash = body
    ? Buffer.from(body).toString('base64').substring(0, 32)
    : '';
  return `${method}:${url}:${bodyHash}`;
}

/**
 * Get a cached response entry (returns null if missing or expired)
 */
export function getCachedResponse(
  cacheKey: string,
): { status: number; headers: Record<string, string>; body: Buffer } | null {
  const entry = responseCache.get(cacheKey);
  if (!entry) return null;

  const now = Date.now();
  if (now > entry.timestamp + entry.ttl) {
    responseCache.delete(cacheKey);
    return null;
  }

  // return binary Buffer
  return {
    status: entry.status,
    headers: { ...entry.headers },
    body: Buffer.from(entry.bodyBase64, 'base64'),
  };
}

/**
 * Cache an HTTP response (binary-safe). Use for GET successful responses.
 * body is a Buffer
 */
export function cacheResponse(
  cacheKey: string,
  status: number,
  headers: Record<string, string>,
  body: Buffer,
  ttl: number = RATE_LIMIT_CONFIG.DEFAULT_CACHE_TTL,
): void {
  try {
    // Only cache GET-level responses (caller should enforce)
    const entry: CacheEntry = {
      status,
      headers,
      bodyBase64: body.toString('base64'),
      timestamp: Date.now(),
      ttl,
    };

    responseCache.set(cacheKey, entry);

    // Basic cleanup if cache grew too big: remove oldest expired entries
    if (responseCache.size > RATE_LIMIT_CONFIG.MAX_CACHE_SIZE) {
      const now = Date.now();
      for (const [k, e] of responseCache.entries()) {
        if (now > e.timestamp + e.ttl) {
          responseCache.delete(k);
        }
        if (responseCache.size <= RATE_LIMIT_CONFIG.MAX_CACHE_SIZE) break;
      }
    }
  } catch (err) {
    console.warn(`[cacheResponse] failed to cache:`, err);
  }
}

/**
 * Browser-like User-Agent pool (rotate to reduce bot-detection)
 */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
];

export function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Simple rate limiter decision (returns true if we SHOULD rate-limit (i.e. delay) the request)
 */
export function shouldRateLimit(
  hostname: string,
  maxRequestsPerMinute: number = RATE_LIMIT_CONFIG.MAX_REQUESTS_PER_MINUTE,
): boolean {
  const now = Date.now();
  const windowMs = 60 * 1000;
  let info = rateLimitMap.get(hostname);
  if (!info || now > info.resetTime) {
    info = { requests: 0, resetTime: now + windowMs, lastRequest: 0 };
    rateLimitMap.set(hostname, info);
  }

  const timeSinceLast = now - info.lastRequest;
  if (timeSinceLast < RATE_LIMIT_CONFIG.MIN_REQUEST_DELAY) {
    return true;
  }
  if (info.requests >= maxRequestsPerMinute) {
    return true;
  }

  // accept this request
  info.requests++;
  info.lastRequest = now;
  rateLimitMap.set(hostname, info);
  return false;
}

/**
 * Add delay to meet MIN_REQUEST_DELAY (if needed)
 */
export async function addRequestDelay(hostname: string): Promise<void> {
  const info = rateLimitMap.get(hostname);
  if (!info) return;
  const now = Date.now();
  const timeSinceLast = now - info.lastRequest;
  if (timeSinceLast < RATE_LIMIT_CONFIG.MIN_REQUEST_DELAY) {
    const delay = RATE_LIMIT_CONFIG.MIN_REQUEST_DELAY - timeSinceLast;
    await new Promise((r) => setTimeout(r, delay));
  }
}

/**
 * Generic retry-with-exponential-backoff wrapper.
 * If an error message includes "429" it will retry; otherwise it throws immediately.
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = RATE_LIMIT_CONFIG.MAX_RETRIES,
  baseDelayMs: number = RATE_LIMIT_CONFIG.BASE_RETRY_DELAY,
): Promise<T> {
  let lastErr: unknown = new Error('Retry limit exceeded');
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      lastErr = err;
      const message = err && err.message ? String(err.message) : '';
      const rateLimited =
        message.includes('429') ||
        message.toLowerCase().includes('rate limit') ||
        (err && (err as any).status === 429);

      if (!rateLimited) {
        // non-rate-limit errors should fail fast
        throw err;
      }

      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000;
        console.log(
          `[retryWithBackoff] rate-limited, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      } else {
        break;
      }
    }
  }
  throw lastErr;
}

/**
 * Utility: ensures a string fallback for possibly undefined values
 */
export function ensureString(
  value: string | undefined,
  fallback = 'unknown',
): string {
  return value !== undefined ? value : fallback;
}
