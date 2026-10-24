#!/usr/bin/env python3
"""Exercise backup lock contention without touching the database or runtime locks."""

import fcntl
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest


BACKUP = Path(__file__).resolve().parents[1] / "bin/backup.sh"
WRITER_LOCKS = (
    "global.lock",
    "global-current.lock",
    "global-history.lock",
    "global-changeset.lock",
)


class BackupLockTest(unittest.TestCase):
    def test_waiting_for_backfill_leaves_replication_available(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = BACKUP.read_text().split("# The core captures", 1)[0]
            source = source.replace("/run/daf-osm", str(root))
            source = source.replace(
                "flock --exclusive 4", f'touch "{root}/waiting"\nflock --exclusive 4'
            )
            # macOS lacks the flock CLI; use the same kernel operation there.
            if shutil.which("flock") is None:
                helper = root / "flock.py"
                helper.write_text(
                    "import fcntl, sys\n"
                    "mode = fcntl.LOCK_EX\n"
                    "if sys.argv[1] == '--nonblock': mode |= fcntl.LOCK_NB\n"
                    "try: fcntl.flock(int(sys.argv[2]), mode)\n"
                    "except BlockingIOError: sys.exit(1)\n"
                )
                source = source.replace("flock ", f'"{sys.executable}" "{helper}" ')
            fixture = root / "backup.sh"
            fixture.write_text(
                source
                + f'echo ready > "{root}/ready"\n'
                + 'read -r release\n'
            )
            with (root / "global-changeset-backfill.lock").open("w") as backfill:
                fcntl.flock(backfill, fcntl.LOCK_EX)
                process = subprocess.Popen(["bash", str(fixture)], stdin=subprocess.PIPE)
                try:
                    # Wait until backup reaches the contended backfill lock.
                    deadline = time.monotonic() + 5
                    while not (root / "waiting").exists() and time.monotonic() < deadline:
                        time.sleep(0.01)
                    self.assertTrue((root / "waiting").exists())
                    self.assertIsNone(process.poll())
                    self.assertFalse((root / "ready").exists())
                    for name in WRITER_LOCKS:
                        with (root / name).open("a") as writer:
                            fcntl.flock(writer, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    duplicate = subprocess.run(["bash", str(fixture)], timeout=5)
                    self.assertEqual(duplicate.returncode, 75)
                    fcntl.flock(backfill, fcntl.LOCK_UN)
                    deadline = time.monotonic() + 5
                    while not (root / "ready").exists() and time.monotonic() < deadline:
                        time.sleep(0.01)
                    self.assertTrue((root / "ready").exists(), "Backup did not proceed")
                    for name in (*WRITER_LOCKS, "global-changeset-backfill.lock"):
                        with (root / name).open("a") as writer:
                            with self.assertRaises(BlockingIOError):
                                fcntl.flock(writer, fcntl.LOCK_EX | fcntl.LOCK_NB)
                finally:
                    fcntl.flock(backfill, fcntl.LOCK_UN)
                    process.communicate(b"release\n", timeout=5)
                self.assertEqual(process.returncode, 0)
                for name in (*WRITER_LOCKS, "global-changeset-backfill.lock", "backup.lock"):
                    with (root / name).open("a") as lock:
                        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)


if __name__ == "__main__":
    unittest.main()
