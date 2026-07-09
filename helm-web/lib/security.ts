// API security helpers: in-memory rate limiter, input sanitization, and
// security headers. In-memory is fine for the hackathon; production would back
// the rate limiter with Redis and set headers at the edge/proxy.

const rateLimits = new Map<string, { count: number; resetAt: number }>();

/** Returns true if the request is allowed, false if the limit is exceeded. */
export function checkRateLimit(key: string, maxRequests = 60, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = rateLimits.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

/** Best-effort client key from proxy headers (falls back to a shared bucket). */
export function clientKey(req: Request): string {
  const h = req.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "anonymous"
  );
}

/** Strip obvious XSS vectors and cap length. */
export function sanitizeInput(text: string): string {
  return text
    .replace(/<script[^>]*>.*?<\/script>/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .slice(0, 50_000);
}

/** Standard security headers for API responses. */
export function securityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-XSS-Protection": "1; mode=block",
    "Content-Security-Policy": "default-src 'self'",
  };
}
