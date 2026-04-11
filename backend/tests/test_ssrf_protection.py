"""Unit tests for SSRF protection utility (app/utils/ssrf_protection.py).

Covers:
- is_safe_url(): loopback, RFC1918, link-local/metadata, unspecified,
  hex/octal/decimal encoded IPs, IPv6-mapped, metadata hostnames, valid public URLs
- resolve_and_validate_url(): DNS resolution returns private IP → raises ValueError,
  DNS resolution returns public IP → passes
"""

import socket
from unittest.mock import patch

import pytest

from app.utils.ssrf_protection import is_safe_url, resolve_and_validate_url


# ---------------------------------------------------------------------------
# is_safe_url() — blocked cases
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "url",
    [
        # Loopback IPv4
        pytest.param("http://127.0.0.1/hook", id="loopback-127.0.0.1"),
        pytest.param("http://127.1.2.3/hook", id="loopback-127.1.2.3"),
        pytest.param("http://127.255.255.255/hook", id="loopback-127-broadcast"),
        # Loopback hostname
        pytest.param("http://localhost/hook", id="loopback-localhost"),
        pytest.param("http://localhost:8080/hook", id="loopback-localhost-port"),
        pytest.param("http://foo.localhost/hook", id="loopback-subdomain-localhost"),
        # RFC1918 ranges
        pytest.param("http://10.0.0.1/hook", id="rfc1918-10.0.0.1"),
        pytest.param("http://10.255.255.255/hook", id="rfc1918-10-broadcast"),
        pytest.param("http://172.16.0.1/hook", id="rfc1918-172.16.0.1"),
        pytest.param("http://172.31.255.255/hook", id="rfc1918-172.31.255.255"),
        pytest.param("http://192.168.1.1/hook", id="rfc1918-192.168.1.1"),
        pytest.param("http://192.168.255.255/hook", id="rfc1918-192.168-broadcast"),
        # Link-local / metadata
        pytest.param("http://169.254.169.254/hook", id="metadata-169.254.169.254"),
        pytest.param("http://169.254.0.1/hook", id="link-local-169.254.0.1"),
        pytest.param("http://169.254.169.254/latest/meta-data/", id="metadata-aws-path"),
        # Unspecified
        pytest.param("http://0.0.0.0/hook", id="unspecified-0.0.0.0"),
        # IPv6 loopback
        pytest.param("http://[::1]/hook", id="ipv6-loopback"),
        # IPv6 unspecified
        pytest.param("http://[::]/hook", id="ipv6-unspecified"),
        # IPv6 link-local
        pytest.param("http://[fe80::1]/hook", id="ipv6-link-local"),
        # IPv6 unique local
        pytest.param("http://[fc00::1]/hook", id="ipv6-unique-local"),
        pytest.param("http://[fd00::1]/hook", id="ipv6-unique-local-fd"),
        # IPv6-mapped IPv4 loopback (::ffff:127.0.0.1)
        pytest.param("http://[::ffff:127.0.0.1]/hook", id="ipv6-mapped-loopback"),
        pytest.param("http://[::ffff:192.168.1.1]/hook", id="ipv6-mapped-rfc1918"),
        pytest.param("http://[::ffff:10.0.0.1]/hook", id="ipv6-mapped-10.0.0.1"),
        # Hex-encoded IP (0x7f000001 = 127.0.0.1)
        pytest.param("http://0x7f000001/hook", id="hex-loopback"),
        pytest.param("http://0xc0a80101/hook", id="hex-192.168.1.1"),
        pytest.param("http://0x0a000001/hook", id="hex-10.0.0.1"),
        # Decimal integer encoding (2130706433 = 127.0.0.1)
        pytest.param("http://2130706433/hook", id="decimal-loopback"),
        pytest.param("http://3232235777/hook", id="decimal-192.168.1.1"),
        pytest.param("http://167772161/hook", id="decimal-10.0.0.1"),
        pytest.param("http://2852039166/hook", id="decimal-169.254.169.254"),
        # Octal dotted-notation (0177.0.0.1 = 127.0.0.1)
        pytest.param("http://0177.0.0.1/hook", id="octal-loopback"),
        pytest.param("http://0300.0250.01.01/hook", id="octal-192.168.1.1"),
        # Known metadata hostnames
        pytest.param("http://metadata.google.internal/hook", id="metadata-google-internal"),
        pytest.param("http://metadata.google/hook", id="metadata-google"),
        pytest.param("https://metadata.google.internal/computeMetadata/v1/", id="metadata-google-internal-https"),
    ],
)
def test_is_safe_url_blocks_unsafe_urls(url: str):
    """is_safe_url() must return False for all blocked URLs."""
    assert is_safe_url(url) is False, f"Expected {url!r} to be blocked but it was allowed"


# ---------------------------------------------------------------------------
# is_safe_url() — allowed cases
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "url",
    [
        pytest.param("https://example.com/hook", id="public-https"),
        pytest.param("http://example.com/hook", id="public-http"),
        pytest.param("https://hooks.example.org/webhook/123", id="public-path"),
        pytest.param("https://8.8.8.8/hook", id="public-ip-google-dns"),
        pytest.param("https://1.1.1.1/hook", id="public-ip-cloudflare"),
        pytest.param("https://203.0.114.1/hook", id="public-ip-outside-test-net"),
        pytest.param("https://my-webhook.acme.io/notify", id="subdomain-public"),
        pytest.param("https://example.com:8443/webhook", id="public-with-port"),
    ],
)
def test_is_safe_url_allows_safe_urls(url: str):
    """is_safe_url() must return True for legitimate public webhook URLs."""
    assert is_safe_url(url) is True, f"Expected {url!r} to be allowed but it was blocked"


# ---------------------------------------------------------------------------
# resolve_and_validate_url() — DNS resolution returns private IP → blocks
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resolve_and_validate_url_blocks_dns_rebinding_to_loopback():
    """resolve_and_validate_url() must raise ValueError when DNS resolves to 127.0.0.1."""
    # Mock getaddrinfo to return 127.0.0.1 for an otherwise-public hostname
    mock_addr_info = [
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 0)),
    ]
    with patch("app.utils.ssrf_protection.socket.getaddrinfo", return_value=mock_addr_info):
        with pytest.raises(ValueError, match="SSRF protection"):
            await resolve_and_validate_url("https://public-looking.example.com/hook")


@pytest.mark.asyncio
async def test_resolve_and_validate_url_blocks_dns_rebinding_to_rfc1918():
    """resolve_and_validate_url() must raise ValueError when DNS resolves to RFC1918."""
    mock_addr_info = [
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("192.168.1.100", 0)),
    ]
    with patch("app.utils.ssrf_protection.socket.getaddrinfo", return_value=mock_addr_info):
        with pytest.raises(ValueError, match="SSRF protection"):
            await resolve_and_validate_url("https://legit-looking.example.com/hook")


@pytest.mark.asyncio
async def test_resolve_and_validate_url_blocks_dns_rebinding_to_metadata():
    """resolve_and_validate_url() must raise ValueError when DNS resolves to 169.254.169.254."""
    mock_addr_info = [
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("169.254.169.254", 0)),
    ]
    with patch("app.utils.ssrf_protection.socket.getaddrinfo", return_value=mock_addr_info):
        with pytest.raises(ValueError, match="SSRF protection"):
            await resolve_and_validate_url("https://rebinding.example.com/hook")


@pytest.mark.asyncio
async def test_resolve_and_validate_url_blocks_if_any_ip_is_private():
    """resolve_and_validate_url() must raise even if only one of multiple resolved IPs is private."""
    # Simulate split DNS or multi-A records where one IP is public and one is private
    mock_addr_info = [
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0)),  # public
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.1", 0)),  # private
    ]
    with patch("app.utils.ssrf_protection.socket.getaddrinfo", return_value=mock_addr_info):
        with pytest.raises(ValueError, match="SSRF protection"):
            await resolve_and_validate_url("https://mixed-dns.example.com/hook")


# ---------------------------------------------------------------------------
# resolve_and_validate_url() — DNS resolution returns public IP → passes
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resolve_and_validate_url_allows_public_ip():
    """resolve_and_validate_url() must not raise when DNS resolves to a public IP."""
    mock_addr_info = [
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0)),
    ]
    with patch("app.utils.ssrf_protection.socket.getaddrinfo", return_value=mock_addr_info):
        # Should not raise
        await resolve_and_validate_url("https://example.com/hook")


@pytest.mark.asyncio
async def test_resolve_and_validate_url_allows_multiple_public_ips():
    """resolve_and_validate_url() must pass when all resolved IPs are public."""
    mock_addr_info = [
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 0)),
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.4.4", 0)),
    ]
    with patch("app.utils.ssrf_protection.socket.getaddrinfo", return_value=mock_addr_info):
        await resolve_and_validate_url("https://dns.google/hook")


# ---------------------------------------------------------------------------
# resolve_and_validate_url() — static checks still apply before DNS
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resolve_and_validate_url_blocks_literal_loopback_without_dns():
    """resolve_and_validate_url() must block literal 127.0.0.1 via static check (no DNS call needed)."""
    with patch("app.utils.ssrf_protection.socket.getaddrinfo") as mock_dns:
        with pytest.raises(ValueError):
            await resolve_and_validate_url("http://127.0.0.1/hook")
        # DNS should not have been called for a literal IP that's already blocked
        mock_dns.assert_not_called()


@pytest.mark.asyncio
async def test_resolve_and_validate_url_blocks_localhost_without_dns():
    """resolve_and_validate_url() must block localhost via static check."""
    with patch("app.utils.ssrf_protection.socket.getaddrinfo") as mock_dns:
        with pytest.raises(ValueError):
            await resolve_and_validate_url("http://localhost/hook")
        mock_dns.assert_not_called()
