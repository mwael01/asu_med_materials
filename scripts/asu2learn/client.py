"""Authenticated HTML-only Moodle navigation. Never fetch resource payloads."""
from __future__ import annotations

import getpass
import os
import re
from http.cookiejar import MozillaCookieJar
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import requests

ROOT = Path(__file__).resolve().parents[2]
BASE = "https://asu2learn.asu.edu.eg/medicine/"
COURSE = BASE + "course/view.php?id=620"
SESSION = ROOT / ".asu2learn/session.cookies"


def internal(url):
    parsed = urlsplit(url)
    return parsed.scheme == "https" and parsed.netloc == "asu2learn.asu.edu.eg" and parsed.path.startswith("/medicine/")


class Client:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers["User-Agent"] = "ASUMedMaterials-LinkSync/1.0"
        self.session.cookies = MozillaCookieJar(str(SESSION))
        if SESSION.exists():
            self.session.cookies.load(ignore_discard=True, ignore_expires=False)

    def html(self, url, *, data=None):
        """Only permitted HTML routes; reject downloads before reading their body."""
        for _ in range(8):
            if not internal(url):
                return url, None
            path = urlsplit(url).path
            allowed = path in {'/medicine/', '/medicine/login/index.php', '/medicine/my/', '/medicine/my/index.php',
                               '/medicine/course/view.php', '/medicine/course/section.php'} or re.fullmatch(r'/medicine/mod/(?:url|page|folder)/view\.php', path)
            if not allowed:
                return url, None
            if any(part in path.lower() for part in ("pluginfile", "webservice", "draftfile", "download", "logout")):
                return url, None
            if not path.endswith(".php") and not path.endswith("/"):
                return url, None
            with self.session.request("POST" if data else "GET", url, data=data,
                                      allow_redirects=False, stream=True, timeout=40) as response:
                if response.is_redirect:
                    url = urljoin(url, response.headers["Location"])
                    data = None
                    continue
                response.raise_for_status()
                mime = response.headers.get("Content-Type", "").split(";", 1)[0].lower()
                if mime not in {"text/html", "application/xhtml+xml"} or response.headers.get("Content-Disposition", "").lower().startswith("attachment"):
                    return url, None
                content = bytearray()
                for chunk in response.iter_content(32768):
                    content.extend(chunk)
                    if len(content) > 4 * 1024 * 1024:
                        raise ValueError("HTML page exceeds metadata size limit")
                return url, bytes(content).decode(response.encoding or "utf-8", errors="replace")
        raise ValueError("Too many HTML redirects")

    def login(self, parse):
        url, html = self.html(BASE + "login/index.php")
        form = parse("login", html, url)
        if not form.get("token"):
            raise ValueError("ASU2Learn login form was not found")
        username = os.environ.get("ASU2LEARN_USERNAME") or input("ASU2Learn username: ")
        password = os.environ.get("ASU2LEARN_PASSWORD") or getpass.getpass("ASU2Learn password: ")
        login_url, login_html = self.html(BASE + "login/index.php", data={"username": username, "password": password, "logintoken": form["token"]})
        login_result = parse("course", login_html, login_url)
        if login_result.get("loginForm") or login_result.get("errors"):
            raise ValueError("ASU2Learn rejected login: " + "; ".join(login_result.get("errors", [])))
        url, html = self.html(COURSE)
        result = parse("course", html, url)
        if not html or not result.get("authenticated"):
            raise ValueError("Course access could not be verified: " + str({k: result.get(k) for k in ("title", "errors", "loginForm")}))
        SESSION.parent.mkdir(mode=0o700, exist_ok=True)
        os.chmod(SESSION.parent, 0o700)
        SESSION.touch(mode=0o600, exist_ok=True)
        os.chmod(SESSION, 0o600)
        self.session.cookies.save(ignore_discard=True, ignore_expires=True)
        print("Authenticated; private session saved. No password stored.")
