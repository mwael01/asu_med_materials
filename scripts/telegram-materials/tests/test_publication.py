"""Exercise interrupted publication using an atomic in-memory Firestore adapter."""
from __future__ import annotations

import copy
import hashlib
import io
import tempfile
import unittest
from email.message import Message
from pathlib import Path
from unittest.mock import patch

from firebase_admin import firestore
from telegram_materials.core import MODULE_ID, Stage
from telegram_materials.store import publish, verify_r2


class Snapshot:
    def __init__(self, ref):
        self.id, self.value = ref.id, copy.deepcopy(ref.db.records.get(ref.path))
        self.exists = self.value is not None
    def to_dict(self):
        return copy.deepcopy(self.value)


class Ref:
    def __init__(self, db, path):
        self.db, self.path, self.id = db, path, path.split("/")[-1]
    def document(self, name):
        return Ref(self.db, self.path + "/" + name)
    def collection(self, name):
        return Ref(self.db, self.path + "/" + name)
    def get(self, transaction=None):
        return Snapshot(self)
    def set(self, data, merge=False):
        tx = Transaction(self.db); tx.set(self, data, merge); tx.commit()


class Transaction:
    def __init__(self, db):
        self.db, self.writes = db, []
    def create(self, ref, data):
        self.writes.append((ref, data, False, True))
    def update(self, ref, data):
        self.writes.append((ref, data, True, False))
    def set(self, ref, data, merge=False):
        self.writes.append((ref, data, merge, False))
    def commit(self):
        if self.db.fail_next:
            self.db.fail_next = False
            raise ConnectionError("Synthetic database outage")
        next_records = copy.deepcopy(self.db.records)
        for ref, data, merge, create in self.writes:
            if create and ref.path in next_records:
                raise ValueError("Document already exists")
            previous = next_records.get(ref.path, {})
            updated = {**previous} if merge else {}
            for key, value in data.items():
                updated[key] = previous.get(key, 0) + value.value if isinstance(value, firestore.Increment) else value
            next_records[ref.path] = updated
        self.db.records = next_records


class Database:
    def __init__(self):
        self.records, self.fail_next = {}, False
    def collection(self, name):
        return Ref(self, name)
    def transaction(self):
        return Transaction(self)


def transactional(function):
    def wrapper(transaction):
        result = function(transaction)
        transaction.commit()
        return result
    return wrapper


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.stage = Stage(Path(self.temp.name))
        self.db = Database()
        for name, subject in (("anatomy", "Anatomy"), ("histology", "Histology")):
            self.db.records["lessons/" + name] = {"moduleId": MODULE_ID, "subject": subject, "active": True}
        self.stage.put({"id": "source", "title": "Shared notes", "url": "https://example.org/notes", "kind": "link",
                        "status": "approved", "lessonIds": ["anatomy", "histology"]})
        self.catalogue_patch = patch("telegram_materials.store.catalogue", side_effect=self.catalogue)
        self.transaction_patch = patch("firebase_admin.firestore.transactional", transactional)
        self.catalogue_patch.start(); self.transaction_patch.start()

    def tearDown(self):
        self.catalogue_patch.stop(); self.transaction_patch.stop()
        self.stage.db.close(); self.temp.cleanup()

    def catalogue(self, db):
        lessons = [{"id": path.split("/")[1], **data} for path, data in self.db.records.items() if path.startswith("lessons/")]
        materials = [{"id": path.split("/")[1], **data} for path, data in self.db.records.items() if path.startswith("materials/")]
        return {"active": True, "semester": 1}, lessons, materials

    def test_publish_retry_keeps_one_material_two_links_and_one_version_increment(self):
        publish(self.stage, self.db, True)
        publish(self.stage, self.db, True)
        self.assertEqual(len([path for path in self.db.records if path.startswith("materials/")]), 1)
        self.assertEqual(len([path for path in self.db.records if path.startswith("material_lesson_links/")]), 2)
        self.assertEqual(self.db.records["materials_version/current"]["version"], 1)
        run = self.db.records["material_imports/" + self.stage.setting("run_id")]
        self.assertEqual(run["publishedCount"], 1)
        self.assertEqual(self.stage.get("source")["status"], "published")
        material = next(data for path, data in self.db.records.items() if path.startswith("materials/"))
        self.assertEqual(material["importReviewStatus"], "pending")
        checkpoint = next(data for path, data in self.db.records.items() if "/entries/" in path)
        self.assertEqual(checkpoint["reviewStatus"], "pending")

    def test_failed_commit_exposes_neither_partial_assignments_nor_new_materials(self):
        self.db.fail_next = True
        with self.assertRaises(ConnectionError):
            publish(self.stage, self.db, True)
        self.assertFalse(any(path.startswith(("materials/", "material_lesson_links/", "materials_version/")) for path in self.db.records))
        self.assertEqual(self.stage.get("source")["status"], "approved")
        publish(self.stage, self.db, True)
        self.assertEqual(self.db.records["materials_version/current"]["version"], 1)

    def test_upload_failure_cannot_publish_material_or_assignments(self):
        entry = self.stage.get("source")
        entry.update(kind="file", sha256="hash", bytes=10, mime="application/pdf", file="files/hash.pdf")
        self.stage.save(entry)
        with patch("telegram_materials.store.verify_entry"), patch("telegram_materials.store.upload", side_effect=ConnectionError("Synthetic R2 outage")):
            with self.assertRaises(ConnectionError):
                publish(self.stage, self.db, True)
        self.assertFalse(any(path.startswith("materials/") for path in self.db.records))


class R2VerificationTests(unittest.TestCase):
    def test_integrity_checks_do_not_cache_preupload_404s_at_the_student_url(self):
        data = b'%PDF-1.7\n%%EOF'
        checksum = hashlib.sha256(data).hexdigest()
        entry = {'mime': 'application/pdf', 'bytes': len(data), 'sha256': checksum}
        url = f'https://asumed.eduvour.com/materials/sha256/{checksum}.pdf?v={checksum}'
        requested = []
        def response(request, timeout):
            requested.append(request.full_url)
            stream = io.BytesIO(data)
            stream.headers = Message(); stream.headers['Content-Type'] = 'application/pdf'
            return stream
        with patch('telegram_materials.store.urllib.request.urlopen', side_effect=response):
            self.assertTrue(verify_r2(url, entry))
            self.assertTrue(verify_r2(url, entry))
        self.assertTrue(all(value.startswith(url + '&verify=') for value in requested))
        self.assertNotEqual(requested[0], requested[1])


if __name__ == "__main__":
    unittest.main()
