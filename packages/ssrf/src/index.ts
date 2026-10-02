import { isBlockedIP } from './ranges.js';

export interface NormalizedTarget {
  raw: string;
  normalized: string;
  scheme: 'http' | 'https';
  host: string;
  port: number;
  pathname: string;
  search: string;
}

export class TargetValidationError extends Error {
  constructor(
    public readonly code: 'INVALID_URL' | 'TARGET_BLOCKED',
    message: string
  ) {
    super(message);
    this.name = 'TargetValidationError';
  }
}

const DENIED_TLDS = ['.gov', '.mil'];
const BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata.google.internal',
  '169.254.169.254',
  'instance-data',
]);

/**
 * Normalizes and validates target URL per rules T-01 to T-04, T-10
 */
export function normalizeTarget(rawUrl: string, allowCustomPort = false): NormalizedTarget {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new TargetValidationError('INVALID_URL', 'URL must be a non-empty string');
  }

  const trimmed = rawUrl.trim();
  if (trimmed.length > 2048) {
    throw new TargetValidationError('INVALID_URL', 'URL exceeds maximum length of 2048 characters (T-04)');
  }

  // Prepend https:// if no scheme provided
  let urlToParse = trimmed;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(urlToParse)) {
    urlToParse = `https://${urlToParse}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(urlToParse);
  } catch {
    throw new TargetValidationError('INVALID_URL', 'Malformed URL format');
  }

  // T-01: Only http and https
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new TargetValidationError('INVALID_URL', `Scheme '${parsed.protocol}' is disallowed; only http and https are accepted (T-01)`);
  }
  const scheme = protocol.slice(0, -1) as 'http' | 'https';

  // T-03: Userinfo must be rejected
  if (parsed.username || parsed.password) {
    throw new TargetValidationError('INVALID_URL', 'Userinfo in URLs (user:pass@host) is strictly prohibited (T-03)');
  }

  // T-02: Port 80 and 443 only (unless enterprise flag set)
  let port = parsed.port ? parseInt(parsed.port, 10) : (scheme === 'https' ? 443 : 80);
  if (!allowCustomPort && port !== 80 && port !== 443) {
    throw new TargetValidationError('INVALID_URL', `Port ${port} is not allowed; only 80 and 443 are supported (T-02)`);
  }

  // T-04: Hostname normalized
  let host = parsed.hostname.toLowerCase();
  // Strip trailing dot
  if (host.endsWith('.')) {
    host = host.slice(0, -1);
  }

  if (!host) {
    throw new TargetValidationError('INVALID_URL', 'Hostname cannot be empty (T-04)');
  }

  // Check direct IP block before DNS
  if (BLOCKED_HOSTS.has(host) || isBlockedIP(host)) {
    throw new TargetValidationError('TARGET_BLOCKED', `Destination host '${host}' is blocked (T-05)`);
  }

  // T-10: Deny .gov, .mil
  for (const tld of DENIED_TLDS) {
    if (host.endsWith(tld)) {
      throw new TargetValidationError('TARGET_BLOCKED', `Domain category '${tld}' is restricted from automated audits (T-10)`);
    }
  }

  // Normalize path & drop fragment
  const pathname = parsed.pathname || '/';
  const search = parsed.search || '';

  const normalized = `${scheme}://${host}${port !== (scheme === 'https' ? 443 : 80) ? `:${port}` : ''}${pathname}${search}`;

  return {
    raw: rawUrl,
    normalized,
    scheme,
    host,
    port,
    pathname,
    search,
  };
}

export * from './ranges.js';
