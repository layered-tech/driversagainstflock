import asyncio
import importlib.util
import logging
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("carplay_gpx", Path(__file__).parents[1] / "carplay-gpx.py")
gpx = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gpx)


class CarPlayGPXTest(unittest.TestCase):
    def test_saved_route_is_timed_and_keeps_endpoints(self):
        points = gpx.load_track(Path(__file__).parents[2] / ".android-auto/route-pewaukee.gpx")
        self.assertEqual(len(points), 148)
        self.assertEqual(points[0]["atMs"], 0)
        self.assertEqual(points[-1]["atMs"], 147000)
        self.assertAlmostEqual(points[0]["latitude"], 43.12152)
        self.assertAlmostEqual(points[-1]["longitude"], -88.24412)

    def simulate(self, *, skip=None, fail=False, speed=1):
        filename = Path(__file__).parents[2] / ".android-auto/route-pewaukee.gpx"
        points = gpx.load_track(filename)
        elapsed = [0]
        calls, messages = [], []

        class Simulation:
            logger = logging.getLogger("carplay-test-player")

            async def play_gpx_file(self, path):
                calls.append(path)
                for index, point in enumerate(points):
                    if index == skip:
                        continue
                    if index:
                        self.logger.info("waiting for 1.000s")
                        elapsed[0] += speed
                    self.logger.info("set location to %s %s", point["latitude"], point["longitude"])
                    if fail:
                        raise ConnectionError("phone disconnected")

        asyncio.run(gpx.play_route(Simulation(), filename, messages.append, lambda: elapsed[0]))
        return filename, calls, messages

    def test_delegates_the_whole_file_once_and_observes_every_fix(self):
        filename, calls, messages = self.simulate()
        self.assertEqual(calls, [str(filename)])
        progress = [item for item in messages if item.get("progress")]
        self.assertEqual([item["atMs"] for item in progress], list(range(0, 148000, 1000)))
        self.assertEqual([item["fixes"] for item in progress], list(range(1, 149)))
        self.assertEqual(messages[-1], {"completed": True, "atMs": 147000,
                                       "fixes": 148, "elapsedMs": 147000})

    def test_rejects_skipped_points_and_accelerated_playback(self):
        with self.assertRaisesRegex(ValueError, "skipped or reordered"):
            self.simulate(skip=50)
        with self.assertRaisesRegex(ValueError, "faster than"):
            self.simulate(speed=0.5)

    def test_playback_stops_on_device_failure(self):
        with self.assertRaisesRegex(ConnectionError, "phone disconnected"):
            self.simulate(fail=True)

    def test_rejects_missing_or_non_increasing_track_times(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invalid.gpx"
            path.write_text('<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>' +
                            '<trkpt lat="1" lon="2"><time>2026-10-26T00:00:00Z</time></trkpt>' * 2 +
                            '</trkseg></trk></gpx>')
            with self.assertRaisesRegex(ValueError, "increase strictly"):
                gpx.load_track(path)


if __name__ == "__main__":
    unittest.main()
