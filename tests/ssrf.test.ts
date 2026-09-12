import { describe, it, expect } from "vitest";
import { isBlockedIp } from "../src/lib/ssrf";

describe("isBlockedIp (SSRF private-range guard)", () => {
  const blocked = [
    "127.0.0.1", // loopback
    "10.0.0.1", // private
    "172.16.0.1", // private (start of /12)
    "172.31.255.255", // private (end of /12)
    "192.168.1.1", // private
    "169.254.169.254", // link-local — cloud metadata endpoint
    "0.0.0.0", // this-host
    "100.64.0.1", // CGNAT
    "::1", // IPv6 loopback
    "fc00::1", // IPv6 unique-local
    "fd12:3456::1", // IPv6 unique-local
    "fe80::1", // IPv6 link-local
    "::ffff:127.0.0.1", // IPv4-mapped loopback
    "not-an-ip", // invalid -> blocked
  ];
  const allowed = [
    "8.8.8.8",
    "1.1.1.1",
    "93.184.216.34", // example.com
    "172.15.0.1", // just outside 172.16/12
    "172.32.0.1", // just outside 172.16/12
    "192.167.0.1", // just outside 192.168/16
    "2606:4700:4700::1111", // public IPv6 (Cloudflare)
  ];

  it.each(blocked)("blocks %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each(allowed)("allows %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });
});
