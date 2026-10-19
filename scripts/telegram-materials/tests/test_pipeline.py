from __future__ import annotations

import asyncio
import copy
import io
import json
import tempfile
import unittest
import urllib.error
import zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from telegram_materials.collector import Collector, button_actions, extract_links, is_scoped, may_traverse, is_mixed_index, nearby_link_label
from telegram_materials.core import MODULE_ID, Stage, identity, link_id, normalize_url, propose_lessons, resource_key, clearly_other_module
from telegram_materials.files import file_type, stage_file, unpack_zip, unpack_archive, verify_entry, WRANGLER_MAX_BYTES
from telegram_materials.review import approve, bundle, context_variants
from telegram_materials.store import build_material, existing_matches, merge_existing, publish

LESSONS = [{"id": "anatomy", "title": "Larynx & Trachea", "subject": "Anatomy", "moduleId": MODULE_ID, "active": True},
           {"id": "histo", "title": "Larynx & Trachea", "subject": "Histology", "moduleId": MODULE_ID, "active": True}]


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.stage = Stage(Path(self.temp.name))

    def tearDown(self):
        self.stage.db.close()
        self.temp.cleanup()

    def pdf(self, name="input.part"):
        from PIL import Image
        path = self.stage.directory / name
        Image.new("RGB", (2, 2), "white").save(path, "PDF", creationDate="fixed", modDate="fixed")
        return path

    def test_identical_files_share_bytes_but_keep_both_lesson_contexts_and_urls(self):
        first = self.pdf()
        duplicate = self.stage.directory / "duplicate.part"
        duplicate.write_bytes(first.read_bytes())
        a = self.stage.source("bot", "test", ["Anatomy", "Larynx"])
        b = self.stage.source("bot", "test", ["Histology", "Trachea"])
        file_id = stage_file(self.stage, first, "Notes", a, ["Anatomy"], "https://example.org/a.pdf")
        self.assertEqual(stage_file(self.stage, duplicate, "Same notes", b, ["Histology"], "https://example.org/b.pdf"), file_id)
        self.assertEqual(len(list(self.stage.files.iterdir())), 1)
        self.assertEqual(len(self.stage.occurrences(file_id)), 2)
        self.assertEqual(len(self.stage.get(file_id)["sourceUrls"]), 2)
        self.stage.put(self.stage.get(file_id), "shared-alias", ["Physiology"], self.stage.occurrences(file_id)[0])
        alias = self.stage.occurrences(file_id)[-1]
        self.assertEqual(alias["source"], "shared-alias")
        self.assertEqual(alias["context"], ["Physiology"])
        verify_entry(self.stage, self.stage.get(file_id))

    def test_corrupt_or_changed_files_cannot_be_published(self):
        path = self.stage.directory / "broken.part"
        path.write_bytes(b"%PDF-1.4 truncated")
        with self.assertRaises(ValueError):
            file_type(path)
        file_id = stage_file(self.stage, self.pdf(), "Notes", "source", [])
        entry = self.stage.get(file_id)
        (self.stage.directory / entry["file"]).write_bytes(b"changed")
        with self.assertRaises(ValueError):
            verify_entry(self.stage, entry)

    def test_bulk_file_reuse_retains_the_new_lesson_context(self):
        original = self.stage.source("telegram_file", "document:1", ["Anatomy"])
        file_id = stage_file(self.stage, self.pdf(), "Notes", original, ["Anatomy"], evidence={"messageId": 1})
        self.stage.status(original, "done")
        alias = self.stage.source("telegram_file", "document:1", ["Histology"])
        self.assertEqual(self.stage.reuse_pending_sources(), 1)
        self.assertEqual(self.stage.source_by_key(alias)["status"], "done")
        self.assertIn(["Histology"], [item["context"] for item in self.stage.occurrences(file_id)])

    def test_captured_public_media_post_reuses_its_caption_links_too(self):
        root = self.stage.source("telegram_archive", "https://t.me/resp", ["Channel"])
        proof = {"messageId": 123, "chatId": -1001}
        self.stage.put({"id": "clip", "kind": "video", "title": "Clip"}, root, ["Channel"],
                       {**proof, "url": "https://t.me/resp/123", "video": True})
        self.stage.put({"id": "notes", "kind": "link", "title": "Notes"}, root, ["Channel"],
                       {**proof, "url": "https://example.org/notes"})
        post = self.stage.source("telegram_archive", "https://t.me/resp/123", ["Lesson"])
        self.assertEqual(self.stage.reuse_pending_sources(), 1)
        self.assertEqual(self.stage.source_by_key(post)["status"], "done")
        self.assertIn(["Lesson"], [item["context"] for item in self.stage.occurrences("notes")])
        self.assertEqual(self.stage.captured_telegram_message("https://t.me/resp/124"), [])

    def test_archive_members_never_write_their_supplied_paths(self):
        archive = self.stage.directory / "archive.zip"
        with zipfile.ZipFile(archive, "w") as handle:
            handle.writestr("../../escape.pdf", self.pdf().read_bytes())
            handle.writestr("__MACOSX/._escape.pdf", b"Mac resource fork, not a PDF")
            handle.writestr("notes/._escape.pdf", b"Mac resource fork, not a PDF")
        unpack_zip(self.stage, archive, "source", ["Respiratory"])
        entries = self.stage.entries()
        self.assertEqual(len(entries), 1)
        self.assertTrue((self.stage.directory / entries[0]["file"]).is_relative_to(self.stage.files))
        self.assertFalse((self.stage.directory / "escape.pdf").exists())

    def test_archive_text_links_are_preserved_alongside_files(self):
        archive = self.stage.directory / "archive.zip"
        with zipfile.ZipFile(archive, "w") as handle:
            handle.writestr("links.txt", "https://example.org/lecture https://example.org/notes.pdf")
        collected = []
        unpack_zip(self.stage, archive, "source", ["Respiratory"], on_link=lambda url, title, context: collected.append(url))
        self.assertEqual(collected, ["https://example.org/lecture", "https://example.org/notes.pdf"])

    def test_7z_streams_verified_files_and_links_without_extracting_member_paths(self):
        import libarchive
        archive = self.stage.directory / "archive.7z"
        data = self.pdf().read_bytes()
        text = b"https://example.org/lesson"
        with libarchive.file_writer(str(archive), "7zip") as writer:
            writer.add_file_from_memory("../../escape.pdf", len(data), data)
            writer.add_file_from_memory("links.txt", len(text), text)
        collected = []
        unpack_archive(self.stage, archive, "source", ["Respiratory"], on_link=lambda url, title, context: collected.append(url))
        self.assertEqual(len(self.stage.entries()), 1)
        verify_entry(self.stage, self.stage.entries()[0])
        self.assertEqual(collected, ["https://example.org/lesson"])
        self.assertFalse((self.stage.directory / "escape.pdf").exists())
        with patch("telegram_materials.files.MAX_ARCHIVE_BYTES", 1):
            with self.assertRaisesRegex(ValueError, "expanded size"):
                unpack_archive(self.stage, archive, "source", [])

    def test_oversized_bundle_member_is_blocked_before_any_upload(self):
        first = stage_file(self.stage, self.pdf(), "Large book", "source", [])
        entry = self.stage.get(first)
        entry["bytes"] = WRANGLER_MAX_BYTES + 1
        self.stage.save(entry)
        self.stage.put({"id": "second", "kind": "file", "title": "Other", "bytes": 1})
        grouped = bundle(self.stage, [first, "second"], "Books")
        with self.assertRaisesRegex(ValueError, "315 MB"):
            approve(self.stage, None, grouped, ["anatomy"])
        entry = self.stage.get(grouped)
        entry.update(status="approved", lessonIds=["anatomy"])
        self.stage.save(entry)
        with patch("telegram_materials.store.catalogue", return_value=({"active": True}, LESSONS, [])), patch("telegram_materials.store.upload") as upload:
            with self.assertRaisesRegex(ValueError, "315 MB"):
                publish(self.stage, None, True)
            upload.assert_not_called()

    def test_book_cutoff_skips_large_archive_pdfs_but_keeps_smaller_files(self):
        self.stage.setting("max_book_bytes", 100)
        archive = self.stage.directory / "books.zip"
        with zipfile.ZipFile(archive, "w") as writer:
            writer.writestr("large.pdf", self.pdf().read_bytes())
            writer.writestr("links.txt", "https://example.org/lesson")
        collected = []
        unpack_zip(self.stage, archive, "source", ["Respiratory"], on_link=lambda url, title, context: collected.append(url))
        self.assertEqual(self.stage.entries(), [])
        self.assertEqual(collected, ["https://example.org/lesson"])
        self.assertEqual(self.stage.sources()[0]["status"], "excluded")
        self.assertIn("book limit", self.stage.sources()[0]["error"])

    def test_matching_keeps_subject_ambiguity_visible_and_rejects_foreign_lessons(self):
        self.assertEqual([item["lessonId"] for item in propose_lessons("Larynx and Trachea", ["Anatomy"], LESSONS)], ["anatomy"])
        self.assertEqual([item["lessonId"] for item in propose_lessons("Larynx and Trachea", ["Histo"], LESSONS)], ["histo"])
        self.assertEqual(len(propose_lessons("Larynx and Trachea", [], LESSONS)), 2)
        self.assertEqual(propose_lessons("Unknown notes", [], LESSONS), [])
        with patch("telegram_materials.review.catalogue", return_value=({}, LESSONS, [])):
            self.stage.put({"id": "x", "kind": "link", "title": "Notes", "url": "https://example.org"})
            with self.assertRaises(ValueError):
                approve(self.stage, None, "x", ["renal"])
            self.assertNotEqual(self.stage.get("x").get("status"), "approved")

    def test_sharing_urls_dedup_without_erasing_access_parameters(self):
        a = "https://drive.google.com/file/d/ABC/view?usp=sharing&resourcekey=secret"
        b = "https://drive.google.com/open?id=ABC"
        self.assertEqual(resource_key(a), resource_key(b))
        self.assertIn("resourcekey=secret", normalize_url(a))
        self.assertIn("t=60", normalize_url("https://youtu.be/abcdefghijk?t=60&utm_source=x"))
        self.assertNotEqual(resource_key("https://t.me/+AbC"), resource_key("https://t.me/+abc"))
        self.assertNotEqual(link_id("a~b", "c"), link_id("a", "b~c"))

    def test_bundle_retains_order_and_always_builds_structured_playlists(self):
        for entry_id in ("second", "first"):
            self.stage.put({"id": entry_id, "title": entry_id, "kind": "video", "url": "https://youtu.be/" + entry_id, "sourceType": "youtube"})
        bundle_id = bundle(self.stage, ["second", "first"], "Respiratory lectures")
        entry = self.stage.get(bundle_id)
        entry["lessonIds"] = ["anatomy", "histo"]
        material = build_material(self.stage, entry, LESSONS, {})
        self.assertEqual(material["type"], "playlist")
        self.assertEqual([video["id"] for video in material["videos"]], ["second", "first"])
        self.assertNotIn("subject", material)
        self.assertNotIn("lessonId", material)
        with self.assertRaises(ValueError):
            bundle(self.stage, ["first", "second"], "Duplicate")

    def test_source_failures_resume_and_shared_archives_retain_all_breadcrumbs(self):
        original = self.stage.source("drive_folder", "https://drive.google.com/drive/folders/A", ["Anatomy"])
        self.stage.source("drive_folder", "https://drive.google.com/drive/folders/A", ["Histology"])
        self.stage.status(original, "failed", "Interrupted")
        self.stage.reset_failures()
        self.assertEqual(self.stage.sources("pending")[0]["key"], original)
        self.assertIn(["Histology", "notes.pdf"], context_variants(self.stage, ["Anatomy", "notes.pdf"]))

    def test_excluded_branches_cannot_enqueue_late_descendants(self):
        self.stage.source("bot", "test", ["Year 2", "GIT module"])
        self.stage.source("bot", "test", ["Year 2", "GIT module", "Anatomy"])
        self.stage.exclude_branch(["Year 2", "GIT module"], "Outside respiratory")
        self.stage.source("bot", "test", ["Year 2", "GIT module", "Histology"])
        self.stage.source("bot", "test", ["Year 2", "GIT module extra"])
        self.assertEqual(len(self.stage.sources("excluded")), 2)
        self.assertEqual([source["context"] for source in self.stage.sources("pending")], [["Year 2", "GIT module extra"]])

    def test_manybot_persistent_teacher_keyboard_does_not_create_nested_peer_routes(self):
        root = [{"text": "Respiratory", "kind": "text"}]
        first, second = {"text": "Dr A", "kind": "text"}, {"text": "Dr B", "kind": "text"}
        self.stage.source("bot", "ASU_MedDataBot", ["Respiratory", "Dr A"], {"route": [*root, first]})
        self.stage.source("bot", "ASU_MedDataBot", ["Respiratory", "Dr B"], {"route": [*root, second]})
        self.stage.source("bot", "ASU_MedDataBot", ["Respiratory", "Dr A", "Dr B"], {"route": [*root, first, second]})
        self.assertEqual(len(self.stage.sources()), 2)
        page = {"text": "➡️", "kind": "text"}
        self.stage.source("bot", "ASU_MedDataBot", ["Respiratory", "➡️"], {"route": [*root, page]})
        self.stage.source("bot", "ASU_MedDataBot", ["Respiratory", "➡️", "➡️"], {"route": [*root, page, page]})
        self.assertEqual(len(self.stage.sources()), 4)

    def test_downloaded_link_cannot_be_published_as_a_second_material(self):
        url = "https://example.org/notes.pdf"
        link = identity(resource_key(url))
        self.stage.put({"id": link, "kind": "link", "url": url, "title": "Notes"})
        file_id = stage_file(self.stage, self.pdf(), "Notes", "source", [], url)
        self.assertEqual(self.stage.get(link)["resolvedTo"], file_id)
        self.stage.put(self.stage.get(link), "later-lesson", ["Histology"], {"url": url})
        self.assertIn(["Histology"], [item["context"] for item in self.stage.occurrences(file_id)])
        with self.assertRaises(ValueError):
            approve(self.stage, None, link, ["anatomy"])

    def test_existing_material_merge_preserves_editorial_fields_and_item_ids(self):
        old = {"id": "old", "title": "Curated title", "author": "Doctor", "bookmarksCount": 10,
               "url": "https://drive.google.com/file/d/ABC/view", "type": "drive",
               "documents": [{"id": "original-page", "title": "Original", "url": "https://drive.google.com/file/d/ABC/view"}]}
        new_url = "https://asumed.eduvour.com/materials/sha256/new.pdf"
        patch_data = merge_existing(old, {"documents": [{"id": "new-id", "title": "Downloaded", "url": new_url}]},
                                    [{"id": "file", "url": old["url"]}], {"file": new_url})
        merged = {**old, **patch_data}
        self.assertEqual(merged["title"], old["title"])
        self.assertEqual(merged["author"], old["author"])
        self.assertEqual(merged["bookmarksCount"], 10)
        self.assertEqual(merged["documents"], [{"id": "original-page", "title": "Original", "url": new_url}])

    def test_live_nullable_optional_fields_do_not_break_catalogue_deduplication(self):
        material = {"id": "old", "title": "Notes", "url": "https://example.org/notes.pdf", "type": "summary",
                    "documents": None, "videos": None, "importSources": None}
        entry = {"id": "entry", "kind": "link", "url": material["url"], "title": "Notes"}
        self.assertEqual(existing_matches(entry, [material], self.stage), ["old"])
        self.assertEqual(merge_existing(material, {}, [], {})["url"], material["url"])

    def test_bundle_checksums_match_previously_published_documents(self):
        checksum = "a" * 64
        self.stage.put({"id": checksum, "kind": "file", "sha256": checksum, "title": "Notes"})
        previous = {"id": "previous-bundle", "documents": [{"url": "https://asumed.eduvour.com/materials/sha256/" + checksum + ".pdf"}]}
        self.assertEqual(existing_matches({"id": "bundle", "kind": "bundle", "members": [checksum]}, [previous], self.stage), ["previous-bundle"])
        self.assertEqual(existing_matches(self.stage.get(checksum), [previous], self.stage), ["previous-bundle"])

    def test_linked_telegram_video_is_promoted_after_media_inspection(self):
        collector = Collector(self.stage, None, [])
        source = {"key": "source", "locator": "testbot", "context": ["Respiratory"]}
        url = "https://t.me/respiratory/123"
        collector.add_link(url, "Lecture", source)
        self.assertEqual(self.stage.entries()[0]["kind"], "link")
        collector.add_link(url, "Lecture", source, {"video": True, "messageId": 123})
        self.assertEqual(self.stage.entries()[0]["kind"], "video")
        self.assertEqual(self.stage.entries()[0]["sourceType"], "telegram")

    def test_external_archive_indexes_do_not_reenter_unrelated_bot_menus(self):
        collector = Collector(self.stage, None, [])
        collector.add_link("https://t.me/Introduction_ModulesBot", "Global bot index",
                           {"kind": "telegram_archive", "key": "source", "locator": "https://t.me/records", "context": ["Respiratory"]})
        self.assertEqual(self.stage.sources()[0]["status"], "excluded")
        self.assertEqual(self.stage.entries()[0]["url"], "https://t.me/Introduction_ModulesBot")

    def test_mixed_module_index_uses_the_nearest_link_label(self):
        text = "Module index\nBlood Module\nhttps://t.me/blood\nRespiratory Module\nhttps://t.me/resp\nRenal Module\nhttps://t.me/renal"
        self.assertTrue(is_mixed_index(text))
        self.assertEqual(nearby_link_label(text, "https://t.me/resp"), "Respiratory Module")
        self.assertEqual(nearby_link_label(text, "https://t.me/renal"), "Renal Module")
        self.assertTrue(clearly_other_module("Pharmacology - CVS - Blood disorders.pdf"))
        self.assertFalse(clearly_other_module("Blood supply of the lung.pdf"))
        self.assertFalse(clearly_other_module("CVS and Respiratory revision.pdf"))

    def test_drive_api_disabled_uses_public_download_without_cookies(self):
        source_key = self.stage.source("drive_file", "https://drive.google.com/file/d/ABC", ["Respiratory"])
        source = self.stage.sources()[0]
        collector = Collector(self.stage, None, [])
        data = self.pdf().read_bytes()
        calls = []
        def download(**kwargs):
            calls.append(kwargs)
            if kwargs.get("skip_download"):
                return SimpleNamespace(path="Respiratory notes.pdf")
            kwargs["progress"](len(data), len(data))
            kwargs["output"].write(data)
        error = urllib.error.HTTPError("https://www.googleapis.com/drive/v3/files/ABC", 403, "Forbidden", {},
                io.BytesIO(json.dumps({"error": {"details": [{"reason": "SERVICE_DISABLED"}]}}).encode()))
        with patch.object(collector, "drive_request", side_effect=error), patch("gdown.download", side_effect=download):
            collector.drive(source)
        self.assertTrue(self.stage.setting("drive_api_unavailable"))
        self.assertTrue(all(call["use_cookies"] is False for call in calls))
        self.assertEqual(self.stage.entries()[0]["kind"], "file")
        verify_entry(self.stage, self.stage.entries()[0])

    def test_public_drive_large_book_is_aborted_and_partial_file_removed(self):
        from telegram_materials.files import IgnoredLargeBook
        self.stage.setting("max_book_bytes", 100)
        collector = Collector(self.stage, None, [])
        source = {"key": "source", "kind": "drive_file", "locator": "https://drive.google.com/file/d/ABC", "context": []}
        def download(**kwargs):
            if kwargs.get("skip_download"):
                return SimpleNamespace(path="Book.pdf")
            kwargs["progress"](1, 101)
        with patch("gdown.download", side_effect=download), self.assertRaises(IgnoredLargeBook):
            collector.drive_public(source)
        self.assertEqual(list(self.stage.directory.glob("*.part")), [])

    def test_public_drive_lists_siblings_as_independent_sources(self):
        self.stage.source("drive_folder", "https://drive.google.com/drive/folders/root", ["Respiratory"])
        collector = Collector(self.stage, None, [])
        session = SimpleNamespace(close=lambda: None)
        children = [("private", "Private child", "application/vnd.google-apps.folder"), ("notes", "Lung.pdf", "application/pdf")]
        with patch("gdown.download._get_session", return_value=(session, "")), patch("gdown.download_folder._parse_embedded_folder_view", return_value=("Respiratory", children)):
            collector.drive_public(self.stage.sources()[0])
        self.assertEqual([source["kind"] for source in self.stage.sources()], ["drive_folder", "drive_folder", "drive_file"])
        self.assertEqual(self.stage.sources()[0]["status"], "incomplete")

    def test_publisher_dry_run_and_bad_approval_never_upload(self):
        self.stage.put({"id": "link", "kind": "link", "title": "Notes", "url": "https://example.org", "status": "approved", "lessonIds": ["anatomy"]})
        with patch("telegram_materials.store.catalogue", return_value=({"active": True, "semester": 1}, LESSONS, [])), patch("telegram_materials.store.upload") as upload:
            result = publish(self.stage, None)
            self.assertEqual(result[0]["entryId"], "link")
            upload.assert_not_called()
            entry = self.stage.get("link"); entry["lessonIds"] = ["missing"]; self.stage.save(entry)
            with self.assertRaises(ValueError):
                publish(self.stage, None, True)
            upload.assert_not_called()

    def test_youtube_playlist_collects_all_continuations_in_order(self):
        source_key = self.stage.source("youtube_playlist", "https://www.youtube.com/playlist?list=PLtest", ["Year 2", "Respiratory"])
        source = self.stage.sources()[0]
        def renderer(vid):
            return {"playlistVideoRenderer": {"videoId": vid, "title": {"simpleText": vid}}}
        initial = {"metadata": {"playlistMetadataRenderer": {"title": "Respiratory lectures"}}, "contents": [renderer("one"),
                   {"continuationItemRenderer": {"continuationEndpoint": {"continuationCommand": {"token": "page-two"}}}}]}
        config = {"INNERTUBE_API_KEY": "public-key", "INNERTUBE_CONTEXT": {"client": {"clientName": "WEB"}}}
        page = "var ytInitialData = " + json.dumps(initial) + "; ytcfg.set(" + json.dumps(config) + ");"
        modern = {"lockupViewModel": {"contentType": "LOCKUP_CONTENT_TYPE_VIDEO", "contentId": "two",
                  "metadata": {"lockupMetadataViewModel": {"title": {"content": "Second lecture"}}}}}
        responses = [io.BytesIO(page.encode()), io.BytesIO(json.dumps({"contents": [modern]}).encode())]
        with patch("telegram_materials.collector.open_url", side_effect=responses) as opened, patch("telegram_materials.collector.time.sleep"):
            Collector(self.stage, None, LESSONS).youtube_playlist(source)
        self.assertEqual(opened.call_count, 2)
        self.assertEqual([video["id"] for video in self.stage.entries()[0]["videos"]], ["one", "two"])
        self.assertEqual(self.stage.entries()[0]["videos"][1]["title"], "Second lecture")
        self.assertEqual(len(self.stage.sources()[0]["payload"]["availableVideos"]), 2)

    def test_drive_pagination_keeps_folders_and_files_as_separate_sources(self):
        self.stage.source("drive_folder", "https://drive.google.com/drive/folders/root", ["Respiratory"])
        responses = [io.BytesIO(json.dumps(payload).encode()) for payload in [
            {"id": "root", "name": "Respiratory", "mimeType": "application/vnd.google-apps.folder"},
            {"files": [{"id": "child", "name": "Anatomy", "mimeType": "application/vnd.google-apps.folder"}], "nextPageToken": "two"},
            {"files": [{"id": "pdf", "name": "Notes.pdf", "mimeType": "application/pdf"}]}]]
        collector = Collector(self.stage, None, LESSONS)
        with patch.object(collector, "drive_request", side_effect=responses) as requests:
            collector.drive(self.stage.sources()[0])
        self.assertEqual(requests.call_count, 3)
        self.assertEqual([source["kind"] for source in self.stage.sources()], ["drive_folder", "drive_folder", "drive_file"])
        self.assertTrue(self.stage.sources()[-1]["payload"]["trusted"])


class TelegramTests(unittest.IsolatedAsyncioTestCase):
    async def test_general_discussion_group_is_a_link_but_direct_posts_are_collected(self):
        with tempfile.TemporaryDirectory() as directory:
            stage = Stage(Path(directory))
            root = stage.source("telegram_archive", "https://t.me/discussion", ["Respiratory"])
            client = SimpleNamespace(get_entity=AsyncMock(return_value=SimpleNamespace(title="General discussion", megagroup=True)),
                                     iter_messages=AsyncMock(), get_messages=AsyncMock(return_value=SimpleNamespace(id=123)))
            collector = Collector(stage, client, [])
            collector.capture_message = AsyncMock()
            await collector.telegram_archive(stage.source_by_key(root))
            self.assertEqual(stage.source_by_key(root)["status"], "excluded")
            client.iter_messages.assert_not_called()
            post = stage.source("telegram_archive", "https://t.me/discussion/123", ["Respiratory", "Explicit study post"])
            await collector.telegram_archive(stage.source_by_key(post))
            collector.capture_message.assert_awaited_once()
            stage.db.close()

    async def test_shared_archive_with_incomplete_scope_is_fetched_once(self):
        with tempfile.TemporaryDirectory() as directory:
            stage = Stage(Path(directory))
            stage.source("telegram_archive", "https://t.me/shared", ["Anatomy"])
            stage.source("telegram_archive", "https://t.me/shared", ["Histology"])
            collector = Collector(stage, None, [])
            async def scan(source):
                stage.put({"id": "notes", "kind": "link", "title": "Larynx notes", "url": "https://example.org"}, source["key"], source["context"] + ["Larynx"])
                stage.status(source["key"], "incomplete", "Shared archive needs scope review")
            collector.telegram_archive = AsyncMock(side_effect=scan)
            await collector.run()
            self.assertEqual(collector.telegram_archive.await_count, 1)
            self.assertTrue(all(source["status"] == "incomplete" for source in stage.sources()))
            contexts = context_variants(stage, stage.occurrences("notes")[0]["context"])
            self.assertIn(["Anatomy", "Larynx"], contexts)
            self.assertIn(["Histology", "Larynx"], contexts)
            third = stage.source("telegram_archive", "https://t.me/shared", ["Physiology"])
            self.assertEqual(stage.reuse_pending_sources(), 1)
            self.assertEqual(stage.source_by_key(third)["status"], "incomplete")
            self.assertIn(["Physiology", "Larynx"], context_variants(stage, stage.occurrences("notes")[0]["context"]))
            stage.db.close()

    async def test_bot_files_are_queued_without_waiting_for_binary_downloads(self):
        with tempfile.TemporaryDirectory() as directory:
            stage=Stage(Path(directory))
            client=SimpleNamespace(download_media=AsyncMock())
            collector=Collector(stage,client,[])
            message=SimpleNamespace(id=9,chat_id=10,grouped_id=None,raw_text='Notes',buttons=[],
                                    get_entities_text=lambda: [],document=SimpleNamespace(id=44),photo=None,
                                    file=SimpleNamespace(name='notes.pdf',mime_type='application/pdf',size=123))
            await collector.capture_message(message,{'key':'origin','context':['Year 2','Respiratory']})
            client.download_media.assert_not_called()
            self.assertEqual(stage.sources()[0]['kind'],'telegram_file')
            self.assertEqual(stage.sources()[0]['payload']['expectedBytes'],123)
            self.assertEqual(stage.entries(),[])
            stage.db.close()

    async def test_download_workers_do_not_fetch_the_same_document_twice(self):
        with tempfile.TemporaryDirectory() as directory:
            stage=Stage(Path(directory))
            for locator,context in [('file-a',['Anatomy']),('file-a',['Histology']),('file-b',['Physiology'])]:
                stage.source('telegram_file',locator,context)
            collector=Collector(stage,None,[])
            calls=[]
            async def download(source):
                calls.append(source['locator'])
                await asyncio.sleep(0.01)
            collector.telegram_file=download
            with patch('builtins.print'):
                await collector.run()
            self.assertCountEqual(calls,['file-a','file-b'])
            self.assertEqual(len(stage.sources('done')),3)
            stage.db.close()

    async def test_file_response_with_unchanged_parent_keyboard_is_a_leaf_not_a_submenu(self):
        KeyboardButton = type('KeyboardButton', (), {})
        def menu(file=None):
            buttons = [SimpleNamespace(button=KeyboardButton(), text=name, data=None, url=None) for name in ('Dr A', 'Dr B')]
            return SimpleNamespace(raw_text='Notes' if file else 'Doctors', file=file, buttons=[buttons], get_entities_text=lambda: [])
        with tempfile.TemporaryDirectory() as directory:
            stage=Stage(Path(directory))
            collector=Collector(stage,None,[])
            prefix=[{'kind':'text','text':'Respiratory'}]
            collector.remember('bot',prefix,[menu()])
            route=[*prefix,{'kind':'text','text':'Dr A'}]
            self.assertEqual(collector.persistent_parent('bot','',route,[menu(SimpleNamespace())])['route'],prefix)
            inherited = menu(SimpleNamespace()); inherited.buttons = []
            self.assertEqual(collector.persistent_parent('bot','',route,[inherited])['route'],prefix)
            inherited.reply_markup = SimpleNamespace()
            self.assertIsNone(collector.persistent_parent('bot','',route,[inherited]))
            self.assertIsNone(collector.persistent_parent('bot','',[*prefix,{'kind':'text','text':'➡️'}],[menu(SimpleNamespace())]))
            stage.db.close()

    async def test_independent_bots_overlap_but_one_dialogue_never_interleaves_itself(self):
        with tempfile.TemporaryDirectory() as directory:
            stage = Stage(Path(directory))
            for name in ("BotA", "bota", "BotB"):
                stage.source("bot", name, [name])
            collector = Collector(stage, None, [])
            active, peak = {}, 0
            async def visit(source):
                nonlocal peak
                name = source["locator"].casefold()
                self.assertEqual(active.get(name, 0), 0)
                active[name] = 1
                peak = max(peak, sum(active.values()))
                await asyncio.sleep(0.01)
                if len(source["context"]) == 1:
                    stage.source("bot", source["locator"], source["context"] + ["child"])
                active[name] = 0
            collector.bot = visit
            with patch("builtins.print"):
                await collector.run()
            self.assertGreater(peak, 1)
            self.assertEqual(len(stage.sources("done")), 6)
            self.assertEqual(stage.sources("pending"), [])
            stage.db.close()

    async def test_back_navigation_reuses_only_a_verified_ancestor_menu(self):
        KeyboardButton = type('KeyboardButton', (), {})
        def menu(text, labels):
            return SimpleNamespace(raw_text=text, buttons=[[SimpleNamespace(button=KeyboardButton(), text=label, data=None) for label in labels]])
        root, leaf = menu("Root", ["A", "B"]), menu("A", ["Go Back"])
        route_a, route_b = [{"kind": "text", "text": "A"}], [{"kind": "text", "text": "B"}]
        with tempfile.TemporaryDirectory() as directory:
            stage = Stage(Path(directory))
            collector = Collector(stage, None, [])
            collector.remember("bot", [], [root])
            collector.remember("bot", route_a, [leaf])
            collector.exchange = AsyncMock(side_effect=[[root], [menu("B", [])]])
            await collector.seek("bot", route_b)
            self.assertEqual(collector.exchange.await_count, 2)
            self.assertTrue(all("command" not in call.kwargs for call in collector.exchange.await_args_list))
            collector.remember("bot", route_a, [leaf])
            collector.exchange = AsyncMock(side_effect=[[menu("Unexpected", [])], [root], [menu("B", [])]])
            await collector.seek("bot", route_b)
            self.assertEqual(collector.exchange.await_args_list[1].kwargs["command"], "/start")
            stage.db.close()

    async def test_distinct_telegram_documents_with_identical_names_are_not_skipped(self):
        with tempfile.TemporaryDirectory() as directory:
            stage = Stage(Path(directory))
            root = SimpleNamespace(raw_text="Menu", file=None, document=None, photo=None, buttons=[])
            def message(document_id):
                return SimpleNamespace(id=document_id, raw_text="Notes", file=SimpleNamespace(name="notes.pdf"),
                                       document=SimpleNamespace(id=document_id), photo=None, buttons=[])
            collector = Collector(stage, None, [])
            collector.exchange = AsyncMock(side_effect=[root_messages := [root], [message(1)], root_messages, [message(2)]])
            collector.capture_message = AsyncMock()
            for label in ("A", "B"):
                key = stage.source("bot", "testbot", ["Year 2", "Respiratory", label], {"route": [{"kind": "label", "text": label}]})
                await collector.bot(next(source for source in stage.sources() if source["key"] == key))
            self.assertEqual(collector.capture_message.await_count, 2)
            stage.db.close()

    async def test_year_two_delegation_is_followed_before_module_selection(self):
        with tempfile.TemporaryDirectory() as directory:
            stage = Stage(Path(directory))
            collector = Collector(stage, None, [])
            source = {"key": "root", "locator": "originalbot", "context": ["Original", "2nd year"]}
            message = SimpleNamespace(raw_text="https://t.me/new_year_two_bot", id=1, chat_id=10, grouped_id=None,
                                      buttons=[], file=None, get_entities_text=lambda: [])
            await collector.capture_message(message, source, scoped=False)
            self.assertEqual(stage.sources()[0]["locator"], "new_year_two_bot")
            self.assertEqual(stage.entries(), [])
            stage.db.execute("DELETE FROM sources")
            stage.db.commit()
            await collector.capture_message(message, {**source, "kind": "telegram_archive"}, scoped=False)
            self.assertEqual(stage.sources(), [])
            stage.db.close()

    async def test_menu_scope_and_hidden_entity_links(self):
        self.assertTrue(is_scoped(["Second year", "Respiratory"]))
        self.assertFalse(is_scoped(["Third year", "Respiratory"]))
        self.assertFalse(is_scoped(["Year 2", "4️⃣ Year", "Respiratory"]))
        self.assertFalse(is_scoped(["Year 2", "🥉 year", "Respiratory"]))
        self.assertTrue(is_scoped(["🥈 year", "Respiratory"]))
        self.assertFalse(may_traverse(["Second year", "Respiratory"], {"text": "Renal"}))
        self.assertFalse(may_traverse(["Second year", "Respiratory"], {"text": "Third year"}))
        self.assertTrue(may_traverse(["Second year", "Respiratory"], {"text": "First lecture"}))
        self.assertTrue(may_traverse(["Second year", "Respiratory"], {"text": "Blood supply of the lung"}))
        message = SimpleNamespace(raw_text="Notes https://example.org/a.pdf", buttons=[],
                                  get_entities_text=lambda: [(SimpleNamespace(url="https://example.org/b.pdf"), "hidden")])
        self.assertEqual(len(extract_links(message)), 2)
        naked = type('MessageEntityUrl', (), {})()
        message.get_entities_text = lambda: [(naked, 't.me/respiratory_channel')]
        self.assertIn(('https://t.me/respiratory_channel', 't.me/respiratory_channel'), extract_links(message))

    async def test_response_edits_are_kept_and_flood_wait_is_retried(self):
        from telethon.errors import FloodWaitError
        class Client:
            handlers = []
            calls = 0
            def add_event_handler(self, callback, builder):
                self.handlers.append((callback, builder))
            def remove_event_handler(self, callback, builder):
                self.handlers.remove((callback, builder))
            async def send_message(self, bot, command):
                self.calls += 1
                if self.calls == 1:
                    raise FloodWaitError(request=None, capture=2)
                for text in ("Loading", "Respiratory notes"):
                    for callback, _ in self.handlers:
                        await callback(SimpleNamespace(message=SimpleNamespace(id=1, out=False, raw_text=text)))
        client = Client()
        clock = iter(index * 0.5 for index in range(1000))
        with tempfile.TemporaryDirectory() as directory:
            stage = Stage(Path(directory))
            collector = Collector(stage, client, [])
            with patch("telegram_materials.collector.time.monotonic", side_effect=lambda: next(clock)), patch("telegram_materials.collector.time.time", side_effect=lambda: next(clock)), patch("telegram_materials.collector.asyncio.sleep", new_callable=AsyncMock), patch("builtins.print"):
                messages = await collector.exchange("bot", command="/start")
            self.assertEqual(client.calls, 2)
            self.assertEqual(messages[0].raw_text, "Respiratory notes")
            self.assertEqual(client.handlers, [])
            stage.db.close()


if __name__ == "__main__":
    unittest.main()
