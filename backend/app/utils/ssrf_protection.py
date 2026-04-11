"""SSRF (Server-Side Request Forgery) protection utilities.

Provides URL validation to block webhook deliveries to private/internal network
addresses, preventing attackers from using the webhook system to scan internal
networks or steal cloud IAM credentials via metadata endpoints.

Blocked address ranges:
- Loopback: 127.0.0.0/8 (IPv4) and ::1 (IPv6)
- Private/RFC1918: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
- Link-local/metadata: 169.254.0.0/16 (includes AWS/GCP 169.254.169.254)
- Unspecified: 0.0.0.0/8 (IPv4) and :: (IPv6)
- Known metadata hostnames: metadata.google.internal, etc.

Bypass variants handled:
- Hex-encoded IPs (0x7f000001)
- Octal-encoded IPs (0177.0.0.1)
- Decimal-encoded IPs (2130706433)
- IPv6-mapped IPv4 (::ffff:127.0.0.1)
"""

import ipaddress
import socket
import urllib.parse
from typing import Union


_BLOCKED_NETWORKS = [
    # Loopback
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    # Private / RFC1918
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    # Link-local and cloud metadata
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("fe80::/10"),
    # Unspecified
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("::/128"),
    # Unique local IPv6
    ipaddress.ip_network("fc00::/7"),
    # Documentation / TEST-NET ranges
    ipaddress.ip_network("192.0.2.0/24"),
    ipaddress.ip_network("198.51.100.0/24"),
    ipaddress.ip_network("203.0.113.0/24"),
]

_BLOCKED_HOSTNAMES = {
    "localhost",
    "metadata.google.internal",
    "metadata.google",
    "metadata",
    "169.254.169.254",
}


def _is_blocked_ip(addr: Union[ipaddress.IPv4Address, ipaddress.IPv6Address]) -> bool:
    """Return True if the address falls within any blocked network range."""
    # Unwrap IPv6-mapped IPv4 addresses (e.g., ::ffff:127.0.0.1)
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped is not None:
        addr = addr.ipv4_mapped

    for network in _BLOCKED_NETWORKS:
        if addr in network:
            return True
    return False


def _parse_ip_from_hostname(hostname: str) -> Union[ipaddress.IPv4Address, ipaddress.IPv6Address, None]:
    """Attempt to parse hostname as a literal IP address (handles hex/octal/decimal).

    Returns an ip_address object if the hostname is a literal IP, else None.
    Handles:
    - Standard dotted-decimal: 192.168.1.1
    - Hex-encoded: 0x7f000001
    - Octal-encoded: 0177.0.0.1
    - Decimal (integer): 2130706433
    - IPv6 with brackets: [::1]
    """
    # Strip brackets from IPv6 literals like [::1]
    stripped = hostname.strip("[]")

    # Try parsing as a standard IP first (IPv4 or IPv6)
    try:
        return ipaddress.ip_address(stripped)
    except ValueError:
        pass

    # Try hex/octal/decimal integer encoding (e.g., 0x7f000001, 2130706433, 0177)
    try:
        # int() handles 0x (hex) and 0o / 0 (octal) prefixes
        int_val = int(stripped, 0)
        # Treat as IPv4 packed integer if in range
        if 0 <= int_val <= 0xFFFFFFFF:
            return ipaddress.IPv4Address(int_val)
    except (ValueError, TypeError):
        pass

    # Try octal dotted notation (e.g., 0177.0.0.1)
    parts = stripped.split(".")
    if len(parts) == 4:
        try:
            int_parts = []
            for part in parts:
                if part.startswith("0x") or part.startswith("0X"):
                    int_parts.append(int(part, 16))
                elif part.startswith("0") and len(part) > 1:
                    int_parts.append(int(part, 8))
                else:
                    int_parts.append(int(part, 10))
            if all(0 <= p <= 255 for p in int_parts):
                return ipaddress.IPv4Address(".".join(str(p) for p in int_parts))
        except (ValueError, TypeError):
            pass

    return None


def is_safe_url(url: str) -> bool:
    """Check if a URL is safe to use as a webhook endpoint (no DNS resolution).

    Blocks literal IP addresses in private/loopback/metadata ranges, and
    known dangerous hostnames. This is the schema-level check — it does not
    perform DNS resolution.

    Args:
        url: The URL to validate.

    Returns:
        True if the URL appears safe, False if it should be blocked.
    """
    try:
        parsed = urllib.parse.urlparse(url)
    except Exception:
        return False

    hostname = parsed.hostname
    if not hostname:
        return False

    # Check known blocked hostnames (case-insensitive)
    if hostname.lower() in _BLOCKED_HOSTNAMES:
        return False

    # Check for "localhost" as subdomain or exact match
    if hostname.lower() == "localhost" or hostname.lower().endswith(".localhost"):
        return False

    # Try parsing as a literal IP (handles hex/octal/decimal/IPv6)
    ip = _parse_ip_from_hostname(hostname)
    if ip is not None:
        return not _is_blocked_ip(ip)

    # Hostname is a DNS name — schema-level check passes (DNS resolution happens at delivery)
    return True


async def resolve_and_validate_url(url: str) -> None:
    """Resolve the hostname in a URL via DNS and validate all returned IPs.

    This async function runs getaddrinfo in a thread pool executor to avoid
    blocking the event loop. It should be called immediately before webhook
    delivery to catch DNS rebinding attacks.

    Args:
        url: The URL whose hostname will be resolved and validated.

    Raises:
        ValueError: If the URL is malformed, missing a hostname, or any resolved
            IP address falls in a blocked network range.
        OSError: If DNS resolution fails (propagated to caller for retry logic).
    """
    import asyncio

    try:
        parsed = urllib.parse.urlparse(url)
    except Exception as exc:
        raise ValueError(f"Malformed URL: {url}") from exc

    hostname = parsed.hostname
    if not hostname:
        raise ValueError(f"No hostname in URL: {url}")

    # First apply the static checks (blocked hostnames, literal IPs)
    if not is_safe_url(url):
        raise ValueError(f"URL blocked by SSRF protection (static check): {url}")

    # Resolve the hostname — run in thread pool to avoid blocking the event loop
    loop = asyncio.get_event_loop()
    try:
        addr_infos = await loop.run_in_executor(
            None,
            lambda: socket.getaddrinfo(hostname, None),
        )
    except OSError:
        # DNS resolution failure — propagate so retry logic can handle it
        raise

    for addr_info in addr_infos:
        # addr_info is (family, type, proto, canonname, sockaddr)
        # sockaddr is (address, port) for IPv4 or (address, port, flow, scope) for IPv6
        sockaddr = addr_info[4]
        ip_str = sockaddr[0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            # Cannot parse — block to be safe
            raise ValueError(f"Resolved non-IP address '{ip_str}' for URL: {url}")

        if _is_blocked_ip(ip):
            raise ValueError(
                f"URL blocked by SSRF protection: hostname '{hostname}' resolved to "
                f"private/internal IP {ip_str} — delivery aborted"
            )
