from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from telethon.errors import SessionPasswordNeededError
from telegram_materials.cli import telegram_client, acquire_telegram_lock


class LoginTests(unittest.IsolatedAsyncioTestCase):
    async def test_account_operation_lock_prevents_overlapping_collectors(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch('telegram_materials.cli.AUTH_DIRECTORY',Path(directory)):
                handle=acquire_telegram_lock()
                try:
                    with self.assertRaises(ValueError):
                        acquire_telegram_lock()
                finally:
                    handle.close()
                acquire_telegram_lock().close()

    async def test_code_request_can_be_finished_in_another_terminal_with_2fa(self):
        client = SimpleNamespace(connect=AsyncMock(), disconnect=AsyncMock(),
                                 is_user_authorized=AsyncMock(return_value=False),
                                 send_code_request=AsyncMock(return_value=SimpleNamespace(phone_code_hash="challenge")),
                                 sign_in=AsyncMock())
        with tempfile.TemporaryDirectory() as directory:
            auth = Path(directory) / "auth"
            with patch("telegram_materials.cli.AUTH_DIRECTORY", auth), patch("telegram_materials.cli.client_credentials", return_value=(12345, "a" * 32)), patch("telethon.TelegramClient", return_value=client):
                with patch("getpass.getpass", return_value="+200000000000"):
                    await telegram_client(login=True, request_code=True)
                self.assertTrue((auth / "pending-login.json").is_file())
                self.assertEqual((auth / "credentials.json").stat().st_mode & 0o777, 0o600)
                self.assertEqual(auth.stat().st_mode & 0o777, 0o700)
                client.send_code_request.reset_mock()
                client.is_user_authorized.side_effect = [False, True]
                client.sign_in.side_effect = [SessionPasswordNeededError(request=None), None]
                with patch("getpass.getpass", side_effect=["12345", "test-password"]):
                    await telegram_client(login=True)
                self.assertFalse((auth / "pending-login.json").exists())
                client.send_code_request.assert_not_called()
                self.assertEqual(client.sign_in.call_count, 2)
                persisted = json.loads((auth / "credentials.json").read_text())
                self.assertEqual(set(persisted), {"api_id", "api_hash"})


if __name__ == "__main__":
    unittest.main()
