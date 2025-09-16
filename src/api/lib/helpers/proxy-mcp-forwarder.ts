// controller/proxy-mcp-forward.ts
import { Request, Response } from 'express';
import {
  shouldBlockHeader,
  getCacheKey,
  getCachedResponse,
  cacheResponse,
  shouldRateLimit,
  addRequestDelay,
  retryWithBackoff,
  getRandomUserAgent,
  RATE_LIMIT_CONFIG,
} from './proxy-mcp-helpers';
import { Buffer } from 'buffer';

/**
 * Forward an Express request to an upstream URL and stream/mirror response.
 */
// --- Fake DB resolvers (replace with real DB logic later) ---
async function getMcpConfigById(id: string) {
  // TODO: Replace with DB query
  // Example return shape
  return {
    mcpOrigin: 'https://api.example.com/mcp/123y', // The upstream base URL
    authHeaders: { 'x-api-key': 'fake-key' }, // Optional auth headers
    requireAuth: true, // Toggle for adding auth headers
    pricingRules: {}, // You might need this later
    walletAddress: '0xFakeWalletAddress', // Example wallet
  };
}

// --- Forward request implementation ---
export const forwardRequest = async (
  req: Request,
  id: string,
  body?: Buffer,
  metadata?: { user?: string }, //UserWithWallet
) => {
  let targetUpstream: URL | undefined = undefined;
  let authHeaders: Record<string, unknown> | undefined = undefined;
  // 1. Resolve MCP server config
  if (id) {
    const mcpConfig = await getMcpConfigById(id);
    const mcpOrigin = mcpConfig?.mcpOrigin;
    if (mcpOrigin) {
      targetUpstream = new URL(mcpOrigin);
    }

    if (mcpConfig?.authHeaders && mcpConfig?.requireAuth) {
      authHeaders = mcpConfig.authHeaders as Record<string, unknown>;
    }
  }

  console.log(
    `[${new Date().toISOString()}] Target upstream: ${targetUpstream}`,
  );

  if (!targetUpstream) {
    throw new Error('No target upstream found');
  }

  // 2. Rewrite URL (remove `/mcp/:id` prefix)
  /*const originalUrl =  req.originalUrl; // e.g. /mcp/12345/data?foo=bar
  const pathWithoutId = originalUrl.replace(/^\/mcp\/[^\/]+/, ""); // → /data?foo=bar
  const finalUrl = new URL(pathWithoutId, targetUpstream);*/

  const url = new URL(req.originalUrl);
  url.host = targetUpstream.host;
  url.protocol = targetUpstream.protocol;
  url.port = targetUpstream.port;

  console.log(`[Proxy] Target upstream: ${url.toString()}`);

  // Remove /mcp/:id from path when forwarding to upstream, keeping everything after /:id
  const pathWithoutId = url.pathname.replace(/^\/mcp\/[^\/]+/, '');
  url.pathname = targetUpstream.pathname + (pathWithoutId || '');
  console.log(`[${new Date().toISOString()}] Modified path: ${url.pathname}`);

  // Preserve all query parameters from the original mcpOrigin
  if (targetUpstream.search) {
    console.log(
      `[${new Date().toISOString()}] Adding query parameters from target upstream`,
    );
    // Copy all query parameters from the target upstream (mcpOrigin)
    const targetParams = new URLSearchParams(targetUpstream.search);
    targetParams.forEach((value, key) => {
      url.searchParams.set(key, value);
    });
  }

  // Check cache first for GET requests
  const cacheKey = getCacheKey(url.toString(), req.method, body);
  if (req.method === 'GET') {
    const cachedResponse = getCachedResponse(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }
  }

  // Check rate limiting before proceeding
  const hostname = targetUpstream.hostname;
  if (shouldRateLimit(hostname)) {
    console.log(
      `[${new Date().toISOString()}] Rate limiting detected for ${hostname}, adding delay`,
    );
    await addRequestDelay(hostname);
  }

  // 3. Build headers
  const headers = new Headers();

  // Forward incoming headers except hop-by-hop ones
  for (const [key, value] of Object.entries(req.headers)) {
    if (!shouldBlockHeader(key) && value) {
      headers.set(key, Array.isArray(value) ? value.join(',') : value);
    }
  }

  // Force correct host
  headers.set('host', targetUpstream.host);

  // Add browser-like defaults (avoid bot detection)
  if (!headers.has('user-agent')) {
    headers.set('user-agent', getRandomUserAgent());
  }
  headers.set('accept', 'application/json, text/event-stream, text/plain, */*');
  headers.set('accept-language', 'en-US,en;q=0.9');
  headers.set('accept-encoding', 'gzip, deflate, br');
  headers.set('referer', 'https://mcpay.fun');
  headers.set('origin', 'https://mcpay.fun');

  // Add MCP-specific metadata (wallet, etc.)
  if (metadata.user) {
    headers.set('x-mcpay-wallet-address', metadata.user);
  }

  // Add auth headers if required
  if (authHeaders) {
    console.log(`[${new Date().toISOString()}] Adding auth headers to request`);
    for (const [key, value] of Object.entries(authHeaders)) {
      headers.set(key, value as string);
    }
  }

  // 4. Make request to upstream

  console.log(
    `[${new Date().toISOString()}] Making request to upstream server`,
  );
  console.log(`[${new Date().toISOString()}] Making fetch request:`, {
    url: url.toString(),
    targetUpstream: targetUpstream.toString(),
    method: req.method,
    headers: Object.fromEntries(headers.entries()),
    hasBody: !!body || (req.method !== 'GET' && !!req.body),
    body: body ? new TextDecoder().decode(body) : undefined,
  });

  // Wrap the fetch in retry logic with exponential backoff
  const response = await retryWithBackoff(
    async () => {
      const fetchResponse = await fetch(url.toString(), {
        method: req.method,
        headers,
        body: body || (req.method !== 'GET' ? req.body : undefined),
        // @ts-expect-error - TODO: fix this
        duplex: 'half',
      });

      // Check if we got rate limited
      if (fetchResponse.status === 429) {
        console.log(
          `[${new Date().toISOString()}] Received 429 from ${hostname}, will retry`,
        );
        throw new Error(`429 Rate Limited by ${hostname}`);
      }

      return fetchResponse;
    },
    RATE_LIMIT_CONFIG.MAX_RETRIES,
    RATE_LIMIT_CONFIG.BASE_RETRY_DELAY,
  );

  console.log(
    `[${new Date().toISOString()}] Received response from upstream with status: ${response.status}`,
  );

  // Cache successful GET responses
  if (req.method === 'GET' && response.status < 400) {
    // Determine TTL based on content type and status
    let ttl = RATE_LIMIT_CONFIG.DEFAULT_CACHE_TTL;
    // Cache API responses for longer if they're likely to be stable
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      if (hostname.includes('coingecko.com')) {
        ttl = RATE_LIMIT_CONFIG.COINGECKO_CACHE_TTL;
      } else if (hostname.includes('api.')) {
        ttl = RATE_LIMIT_CONFIG.API_CACHE_TTL;
      }
    }

    // Buffer the response body once
    const bodyBuffer = Buffer.from(await response.arrayBuffer());

    // Convert headers to plain object
    const headersObj: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headersObj[key] = value;
    });
    /*cacheResponse(cacheKey, response, ttl).catch(error => {
            console.warn(`[${new Date().toISOString()}] Failed to cache response:`, error);
        });*/
    cacheResponse(cacheKey, response.status, headersObj, bodyBuffer, 60_000);
  }

  return response;
};
