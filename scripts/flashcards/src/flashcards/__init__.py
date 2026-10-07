"""ASU Med Materials flashcard importer."""

from __future__ import annotations

import os
import socket

# Ensure native resolver and IPv4 preference for gRPC
os.environ.setdefault("GRPC_DNS_RESOLVER", "native")
_orig_getaddrinfo = socket.getaddrinfo


def _ipv4_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    if family in (0, socket.AF_UNSPEC):
        family = socket.AF_INET
    return _orig_getaddrinfo(host, port, family, type, proto, flags)


socket.getaddrinfo = _ipv4_getaddrinfo

__version__ = "0.1.0"
