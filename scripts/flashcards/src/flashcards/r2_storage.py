from __future__ import annotations

import mimetypes
import os
import subprocess
from pathlib import Path
from typing import Iterable

DEFAULT_R2_BUCKET = os.getenv("R2_BUCKET_NAME", "asumed")
DEFAULT_R2_PUBLIC_DOMAIN = os.getenv("R2_PUBLIC_DOMAIN", "https://asumed.eduvour.com").rstrip("/")

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".bmp"}


def _wrangler_env() -> dict[str, str]:
    env = os.environ.copy()
    env["CI"] = "1"
    env["NO_UPDATE_NOTIFIER"] = "1"
    env["WRANGLER_SEND_METRICS"] = "false"
    env["NODE_OPTIONS"] = "--dns-result-order=ipv4first --no-network-family-autoselection"
    return env


def upload_file_to_r2(
    local_path: Path,
    remote_key: str | None = None,
    bucket: str = DEFAULT_R2_BUCKET,
    public_domain: str = DEFAULT_R2_PUBLIC_DOMAIN,
) -> str:
    """Upload a file to Cloudflare R2 bucket using pnpm wrangler and return its public URL."""
    if not local_path.is_file():
        raise FileNotFoundError(f"File not found: {local_path}")

    key = remote_key or local_path.name
    cmd = [
        "pnpm",
        "exec",
        "wrangler",
        "r2",
        "object",
        "put",
        f"{bucket}/{key}",
        "--file",
        str(local_path.resolve()),
        "--remote",
    ]

    project_root = Path(__file__).resolve().parents[4]
    result = subprocess.run(
        cmd,
        cwd=str(project_root),
        env=_wrangler_env(),
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        raise RuntimeError(f"Failed to upload {local_path.name} to R2: {result.stderr or result.stdout}")

    return f"{public_domain}/{key}"


def upload_files_to_r2(
    file_paths: Iterable[Path],
    bucket: str = DEFAULT_R2_BUCKET,
    public_domain: str = DEFAULT_R2_PUBLIC_DOMAIN,
) -> dict[str, str]:
    """Upload multiple files to Cloudflare R2 bucket. Returns mapping of filename -> public URL."""
    uploaded: dict[str, str] = {}
    for path in file_paths:
        if not path.is_file():
            continue
        try:
            url = upload_file_to_r2(path, bucket=bucket, public_domain=public_domain)
            uploaded[path.name] = url
            print(f"  [R2 Uploaded] {path.name} -> {url}")
        except Exception as exc:
            print(f"  [R2 Error] Failed to upload {path.name}: {exc}")
    return uploaded


def apply_r2_cors(
    cors_file: Path | None = None,
    bucket: str = DEFAULT_R2_BUCKET,
) -> bool:
    """Apply CORS rules to R2 bucket using cloudflare/r2-cors.json."""
    project_root = Path(__file__).resolve().parents[4]
    config_file = cors_file or (project_root / "cloudflare" / "r2-cors.json")
    if not config_file.exists():
        raise FileNotFoundError(f"CORS config file not found: {config_file}")

    cmd = [
        "pnpm",
        "exec",
        "wrangler",
        "r2",
        "bucket",
        "cors",
        "set",
        bucket,
        "--file",
        str(config_file.resolve()),
        "--force",
    ]

    result = subprocess.run(
        cmd,
        cwd=str(project_root),
        env=_wrangler_env(),
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        print(f"[R2 CORS Error] {result.stderr or result.stdout}")
        return False

    print(f"✨ Successfully applied CORS configuration to R2 bucket '{bucket}'.")
    return True
