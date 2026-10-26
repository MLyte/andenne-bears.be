"""Isolated HTTP check for staff photo replacement; never uses production data."""
import io
import json
import re
import shutil
import socket
import subprocess
import tempfile
import time
from pathlib import Path

import requests
from PIL import Image

project = Path(__file__).resolve().parents[2]
php = shutil.which("php")
assert php

with tempfile.TemporaryDirectory(prefix="bears-staff-photo-") as temporary:
    root = Path(temporary)
    web = root / "web"
    private = root / "private"
    (web / "config").mkdir(parents=True)
    (web / "scripts").mkdir()
    private.mkdir()
    for name in ["membres-staff.php", "membres-data.php", "membres-image.php", "private-backup.php", "bears-storage.php", "membres-photo.php"]:
        shutil.copy2(project / name, web / name)
    shutil.copy2(project / "membres.css", web / "membres.css")
    shutil.copy2(project / "scripts" / "membres-staff.js", web / "scripts" / "membres-staff.js")
    password_hash = subprocess.check_output([php, "-r", "echo password_hash('test-only', PASSWORD_DEFAULT);"], text=True).strip()
    (web / "config" / "family-day-config.php").write_text(
        "<?php return ['storage_dir' => '" + private.as_posix()
        + "', 'export_password_hash' => '" + password_hash + "'];",
        encoding="utf-8",
    )
    private_id = "a" * 24
    public_id = "b" * 24
    no_photo_id = "e" * 24
    old_private = "c" * 24 + ".webp"
    old_public = "d" * 24 + ".webp"
    (private / "member-photos").mkdir()
    for filename in [old_private, old_public]:
        Image.new("RGB", (256, 256), "#111111").save(private / "member-photos" / filename, format="WEBP")
    player = lambda id, visible, photo: {"id": id, "name": "Test Player", "first_name": "Test", "last_name": "Player",
        "photo": photo, "approved": True, "public_profile": visible, "number": "", "comment": "",
        "preference": "aucune", "offense": [], "defense": [], "special_teams": [], "created_at": "2026-01-01T00:00:00Z"}
    (private / "members-depth-chart.json").write_text(json.dumps({"version": 1,
        "players": [player(private_id, False, old_private), player(public_id, True, old_public),
            player(no_photo_id, True, None)], "boards": {}}), encoding="utf-8")
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    server = subprocess.Popen([php, "-d", f"extension_dir={Path(php).parent / 'ext'}", "-d", "extension=fileinfo",
        "-S", f"127.0.0.1:{port}", "-t", str(web)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
    try:
        base = f"http://127.0.0.1:{port}/"
        session = requests.Session()
        for _ in range(30):
            try:
                page = session.get(base + "membres-staff.php", timeout=1)
                break
            except requests.ConnectionError:
                time.sleep(.1)
        assert page.status_code == 200
        token_match = re.search(r'name="csrf_token" value="([a-f0-9]+)"', page.text)
        assert token_match, page.text[:1000]
        csrf = token_match.group(1)
        login = session.post(base + "membres-staff.php", data={"action": "login", "csrf_token": csrf,
            "username": "coach", "password": "test-only"}, timeout=10)
        assert login.status_code == 200
        csrf = json.loads(re.search(r'window.membersConfig = (\{.*?\});', login.text).group(1))["csrf"]
        image = Image.new("RGB", (256, 256), "#eecf2b")
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG")
        for version, id, visible in [(1, private_id, False), (2, public_id, True)]:
            buffer.seek(0)
            response = session.post(base + "membres-staff.php", data={"action": "replace_photo",
                "csrf_token": csrf, "version": str(version), "player_id": id},
                files={"photo": ("portrait.jpg", buffer, "image/jpeg")}, timeout=10)
            assert response.status_code == 200, response.text
            assert response.headers.get("content-type", "").startswith("application/json"), response.text[:1200]
            result = response.json()["data"]
            current = next(p for p in result["players"] if p["id"] == id)
            assert current["public_profile"] is visible and current["approved"] is True
            assert current["photo"] and (private / "member-photos" / current["photo"]).is_file()
            assert not (private / "member-photos" / (old_public if visible else old_private)).exists()
            public_photo = requests.get(base + "membres-photo.php", params={"id": id}, timeout=10)
            assert public_photo.status_code == (200 if visible else 404)
        before = sorted(p.name for p in (private / "member-photos").iterdir())
        buffer.seek(0)
        conflict = session.post(base + "membres-staff.php", data={"action": "replace_photo",
            "csrf_token": csrf, "version": "1", "player_id": private_id},
            files={"photo": ("portrait.jpg", buffer, "image/jpeg")}, timeout=10)
        assert conflict.status_code == 409
        assert before == sorted(p.name for p in (private / "member-photos").iterdir())
        buffer.seek(0)
        missing = session.post(base + "membres-staff.php", data={"action": "replace_photo",
            "csrf_token": csrf, "version": "3", "player_id": no_photo_id},
            files={"photo": ("portrait.jpg", buffer, "image/jpeg")}, timeout=10)
        assert missing.status_code == 422
        assert before == sorted(p.name for p in (private / "member-photos").iterdir())
        print("Staff replacement, consent preservation, public access, conflict cleanup, missing-photo refusal: OK")
    finally:
        server.terminate()
        server.wait(timeout=10)
