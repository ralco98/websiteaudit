import ipaddr from 'node:net';

/**
 * Blocked CIDR ranges per rule T-05
 */
export interface IPv4Range {
  network: number;
  mask: number;
}

export function parseIPv4(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let num = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const n = parseInt(part, 10);
    if (n < 0 || n > 255) return null;
    num = (num << 8) | n;
  }
  return num >>> 0;
}

function ipv4CidrToRange(cidr: string): IPv4Range {
  const [ip, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);
  const ipNum = parseIPv4(ip)!;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return { network: (ipNum & mask) >>> 0, mask };
}

// T-05 IPv4 Blocked CIDRs:
// 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16,
// 172.16.0.0/12, 192.0.0.0/24, 192.168.0.0/16, 198.18.0.0/15, 224.0.0.0/4, 240.0.0.0/4
const BLOCKED_IPV4_CIDRS = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.0.0.0/24',
  '192.168.0.0/16',
  '198.18.0.0/15',
  '224.0.0.0/4',
  '240.0.0.0/4',
];

const PARSED_BLOCKED_IPV4: IPv4Range[] = BLOCKED_IPV4_CIDRS.map(ipv4CidrToRange);

export function isBlockedIPv4(ipStr: string): boolean {
  const ipNum = parseIPv4(ipStr);
  if (ipNum === null) return false; // Not an IPv4 literal
  for (const { network, mask } of PARSED_BLOCKED_IPV4) {
    if (((ipNum & mask) >>> 0) === network) {
      return true;
    }
  }
  return false;
}

export function isBlockedIPv6(ipStr: string): boolean {
  const lower = ipStr.toLowerCase().trim();
  // Loopback ::1
  if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
  // Unique Local Address fc00::/7 (fc00... or fd00...)
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  // Link-Local fe80::/10 (fe8, fe9, fea, feb)
  if (/^fe[89ab]/i.test(lower)) return true;
  // IPv4-mapped IPv6 ::ffff:0:0/96 or ::ffff:w.x.y.z
  if (lower.startsWith('::ffff:') || lower.includes(':ffff:')) {
    const lastPart = lower.split(':').pop();
    if (lastPart && lastPart.includes('.')) {
      return isBlockedIPv4(lastPart);
    }
    return true;
  }
  // 64:ff9b::/96 (NAT64)
  if (lower.startsWith('64:ff9b:')) return true;
  // Unspecified ::
  if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return true;

  return false;
}

export function isBlockedIP(ip: string): boolean {
  if (ip.includes(':')) {
    return isBlockedIPv6(ip);
  }
  return isBlockedIPv4(ip);
}
