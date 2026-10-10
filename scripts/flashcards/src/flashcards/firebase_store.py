from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import firebase_admin
from firebase_admin import credentials, firestore, storage


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def get_app(service_account: Path):
    if firebase_admin._apps:
        return firebase_admin.get_app()
    bucket_name = os.getenv("FIREBASE_STORAGE_BUCKET") or os.getenv("PUBLIC_FIREBASE_STORAGE_BUCKET")
    options: dict[str, Any] = {"projectId": "medmaterials"}
    if bucket_name:
        options["storageBucket"] = bucket_name
    return firebase_admin.initialize_app(credentials.Certificate(str(service_account)), options)


def get_db(service_account: Path):
    get_app(service_account)
    return firestore.client()


def fetch_modules(db) -> list[dict[str, Any]]:
    try:
        docs = db.collection("modules").stream()
        results: list[dict[str, Any]] = []
        for doc in docs:
            data = doc.to_dict() or {}
            data["id"] = doc.id
            results.append(data)
        return results
    except Exception as exc:
        print(f"Warning: Failed to stream modules from Firestore: {exc}")
        return []


def fetch_import(db, import_id: str) -> dict[str, Any] | None:
    doc = db.collection("flashcard_imports").document(import_id).get()
    return doc.to_dict() if doc.exists else None


def fetch_all_imports(db) -> list[dict[str, Any]]:
    docs = db.collection("flashcard_imports").order_by("createdAt", direction=firestore.Query.DESCENDING).stream()
    return [doc.to_dict() for doc in docs]


def upload_source_archive(service_account: Path, archive: Path, import_id: str) -> str | None:
    try:
        from .r2_storage import upload_file_to_r2
        remote_key = f"sources/{import_id}.apkg"
        public_url = upload_file_to_r2(archive, remote_key=remote_key)
        return public_url
    except Exception as exc:
        print(f"warning: source archive was not uploaded to R2: {exc}")
        return None


def write_documents(db, writes: Iterable[tuple[str, dict[str, Any]]], batch_size: int = 400) -> None:
    batch = db.batch()
    count = 0
    total = 0
    for path, payload in writes:
        ref = db.document(path)
        batch.set(ref, payload, merge=True)
        count += 1
        total += 1
        if count >= batch_size:
            batch.commit()
            print(f"  [Firestore] Committed {total} documents...")
            batch = db.batch()
            count = 0
    if count:
        batch.commit()
        print(f"  [Firestore] Committed {total} documents total.")



def delete_documents(db, paths: Iterable[str], batch_size: int = 400) -> int:
    batch = db.batch()
    count = 0
    total = 0
    for path in paths:
        ref = db.document(path)
        batch.delete(ref)
        count += 1
        total += 1
        if count >= batch_size:
            batch.commit()
            batch = db.batch()
            count = 0
    if count:
        batch.commit()
    return total
