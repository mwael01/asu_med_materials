from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
import mimetypes
import os
import subprocess
import time
import urllib.parse
import urllib.request
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


CF_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID", "cafd5ca5e8c34ec15e9abb522b23c235")


def _get_cf_token() -> str | None:
    try:
        import tomllib
        cfg_file = Path.home() / ".config/.wrangler/config/default.toml"
        if cfg_file.exists():
            with open(cfg_file, "rb") as f:
                data = tomllib.load(f)
                return data.get("oauth_token")
    except Exception:
        pass
    return None


def upload_file_to_r2(
    local_path: Path,
    remote_key: str | None = None,
    bucket: str = DEFAULT_R2_BUCKET,
    public_domain: str = DEFAULT_R2_PUBLIC_DOMAIN,
) -> str:
    """Upload a file to Cloudflare R2 bucket using direct REST API (or wrangler CLI fallback) and return its public URL."""
    if not local_path.is_file():
        raise FileNotFoundError(f"File not found: {local_path}")

    key = remote_key or local_path.name

    # 1. Try fast direct REST API upload
    token = _get_cf_token()
    if token:
        try:
            mime = mimetypes.guess_type(local_path.name)[0] or "application/octet-stream"
            encoded_key = urllib.parse.quote(key)
            url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/r2/buckets/{bucket}/objects/{encoded_key}"
            req = urllib.request.Request(
                url,
                data=local_path.read_bytes(),
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": mime,
                },
                method="PUT",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                if resp.status in (200, 201):
                    return f"{public_domain.rstrip('/')}/{key}"
        except Exception:
            pass  # Fall back to wrangler CLI

    # 2. Fallback to wrangler CLI
    project_root = Path(__file__).resolve().parents[4]
    wrangler_bin = project_root / "node_modules/.bin/wrangler"
    cmd = [
        str(wrangler_bin) if wrangler_bin.exists() else "wrangler",
        "r2",
        "object",
        "put",
        f"{bucket}/{key}",
        "--file",
        str(local_path.resolve()),
        "--remote",
    ]

    result = subprocess.run(
        cmd,
        cwd=str(project_root),
        env=_wrangler_env(),
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        raise RuntimeError(f"Failed to upload {local_path.name} to R2: {result.stderr or result.stdout}")

    return f"{public_domain.rstrip('/')}/{key}"


def is_already_on_r2(filename: str, public_domain: str = DEFAULT_R2_PUBLIC_DOMAIN) -> bool:
    """Check via quick HTTP HEAD whether file already exists in public R2 domain."""
    encoded = urllib.parse.quote(filename)
    url = f"{public_domain.rstrip('/')}/{encoded}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; ASUMedMaterials/1.0)"},
        method="HEAD",
    )
    try:
        with urllib.request.urlopen(req, timeout=3) as resp:
            return resp.status == 200
    except Exception:
        return False


def upload_files_to_r2(
    file_paths: Iterable[Path],
    bucket: str = DEFAULT_R2_BUCKET,
    public_domain: str = DEFAULT_R2_PUBLIC_DOMAIN,
    max_workers: int = 8,
) -> dict[str, str]:
    """Upload multiple files to Cloudflare R2 bucket concurrently with retries and deduplication. Returns mapping of filename -> public URL."""
    valid_paths = [p for p in file_paths if p.is_file()]
    if not valid_paths:
        return {}

    uploaded: dict[str, str] = {}
    skipped_count = 0
    print(f"Checking and uploading {len(valid_paths)} media files to R2 using {max_workers} worker threads...")

    def _worker(path: Path) -> tuple[str, str | None, bool, Exception | None]:
        url = f"{public_domain.rstrip('/')}/{path.name}"
        # Skip if already uploaded to avoid duplicate network bandwidth
        if is_already_on_r2(path.name, public_domain=public_domain):
            return path.name, url, True, None

        last_exc: Exception | None = None
        for attempt in range(3):
            try:
                uploaded_url = upload_file_to_r2(path, bucket=bucket, public_domain=public_domain)
                return path.name, uploaded_url, False, None
            except Exception as exc:
                last_exc = exc
                if attempt < 2:
                    time.sleep(1 + attempt * 2)
        return path.name, None, False, last_exc

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(_worker, path): path for path in valid_paths}
        for future in as_completed(futures):
            name, url, is_skipped, exc = future.result()
            if url:
                uploaded[name] = url
                if is_skipped:
                    skipped_count += 1
            else:
                print(f"  [R2 Error] Failed to upload {name} after 3 attempts: {exc}")

    print(f"Successfully processed {len(uploaded)}/{len(valid_paths)} files ({skipped_count} already existed on {public_domain}).")
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
