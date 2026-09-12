// SSRF guard. The server fetches user-supplied URLs (the company site + its
// same-domain links), so a request could be pointed at internal infrastructure:
// cloud metadata (169.254.169.254), loopback, or private LAN ranges. We resolve
// the host and block any address in a private / loopback / link-local range.
//
// Limitation: there's a small TOCTOU window between our DNS lookup and the actual
// fetch (DNS rebinding). Fully closing it means pinning the resolved IP; for this
// scope, resolve-and-block plus per-redirect-hop re-checks is the pragmatic guard.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isBlockedIpv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // 10/8 private
  if (a === 127) return true; // 127/8 loopback
  if (a === 169 && b === 254) return true; // 169.254/16 link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 private
  if (a === 192 && b === 168) return true; // 192.168/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const addr = ip.toLowerCase();
  // IPv4-mapped (::ffff:1.2.3.4) — check the embedded IPv4.
  const mapped = addr.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1]);
  if (addr === "::1" || addr === "::") return true; // loopback / unspecified
  const head = addr.split(":")[0];
  if (head.startsWith("fc") || head.startsWith("fd")) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(head)) return true; // fe80::/10 link-local
  return false;
}

// PURE and testable. True if this literal IP is in a range we refuse to fetch.
// A non-IP string is treated as blocked (caller passes only resolved addresses).
export function isBlockedIp(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return isBlockedIpv4(ip);
  if (fam === 6) return isBlockedIpv6(ip);
  return true;
}

// Resolve a hostname and report whether it (or any of its addresses) is blocked.
// Fails closed: an unresolvable host is treated as blocked (we couldn't fetch it
// anyway, so the caller degrades to honest-none).
export async function isHostBlocked(hostname: string): Promise<boolean> {
  if (isIP(hostname)) return isBlockedIp(hostname);
  try {
    const addrs = await lookup(hostname, { all: true });
    if (addrs.length === 0) return true;
    return addrs.some((a) => isBlockedIp(a.address));
  } catch {
    return true;
  }
}
