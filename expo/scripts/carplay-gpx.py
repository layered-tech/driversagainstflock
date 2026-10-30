"""Observe pymobiledevice3's complete GPX playback; never seek or inject test slices."""

import asyncio
import json
import logging
import sys
import xml.etree.ElementTree as ET
from datetime import datetime
from time import monotonic


def load_track(filename):
    namespace = {"g": "http://www.topografix.com/GPX/1/1"}
    points = []
    for point in ET.parse(filename).findall("g:trk/g:trkseg/g:trkpt", namespace):
        recorded = datetime.fromisoformat(point.find("g:time", namespace).text.replace("Z", "+00:00"))
        latitude, longitude = float(point.attrib["lat"]), float(point.attrib["lon"])
        if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
            raise ValueError("GPX has invalid coordinates")
        points.append({"time": recorded.timestamp(), "latitude": latitude, "longitude": longitude})
    if len(points) < 2:
        raise ValueError("GPX needs at least two timed track points")
    epoch = points[0]["time"]
    for point in points:
        point["atMs"] = round((point.pop("time") - epoch) * 1000)
    if any(b["atMs"] <= a["atMs"] for a, b in zip(points, points[1:])):
        raise ValueError("GPX timestamps must increase strictly")
    return points


class ProgressObserver(logging.Handler):
    """Publish a fix only after the GPX player has finished sending it."""

    def __init__(self, points, publish, clock=monotonic):
        super().__init__()
        self.points = points
        self.publish = publish
        self.index = 0
        self.pending = None
        self.clock = clock
        self.started_at = clock()

    def elapsed_ms(self):
        return round((self.clock() - self.started_at) * 1000)

    def commit(self):
        if self.pending is not None:
            self.publish({"progress": True, "atMs": self.pending["atMs"], "fixes": self.index,
                          "elapsedMs": self.elapsed_ms()})
            self.pending = None

    def emit(self, record):
        message = record.getMessage()
        if message.startswith("waiting for "):
            self.commit()
        elif message.startswith("set location to "):
            if self.index >= len(self.points):
                raise ValueError("GPX player sent extra fixes")
            latitude, longitude = map(float, message.removeprefix("set location to ").split())
            point = self.points[self.index]
            if abs(latitude - point["latitude"]) > 1e-9 or abs(longitude - point["longitude"]) > 1e-9:
                raise ValueError("GPX player skipped or reordered a track point")
            self.pending = point
            self.index += 1


async def play_route(simulation, filename, publish, clock=monotonic):
    points = load_track(filename)
    observer = ProgressObserver(points, publish, clock)
    logger = simulation.logger
    original_level = logger.level
    logger.setLevel(logging.INFO)
    logger.addHandler(observer)
    try:
        # pymobiledevice3 owns all coordinates, timestamps and sleeps for the entire file.
        await simulation.play_gpx_file(str(filename))
        observer.commit()
        if observer.index != len(points):
            raise ValueError("GPX playback stopped before the end of the track")
        elapsed_ms = observer.elapsed_ms()
        if elapsed_ms < points[-1]["atMs"] - 50:
            raise ValueError("GPX playback completed faster than the recorded route")
        publish({"completed": True, "atMs": points[-1]["atMs"], "fixes": len(points),
                 "elapsedMs": elapsed_ms})
    finally:
        logger.removeHandler(observer)
        logger.setLevel(original_level)


def publish(message):
    print(json.dumps(message), flush=True)


async def serve(filename, udid):
    from pymobiledevice3.remote.userspace_tunnel import UserspaceRsdTunnel
    from pymobiledevice3.services.dvt.instruments.dvt_provider import DvtProvider
    from pymobiledevice3.services.dvt.instruments.location_simulation import LocationSimulation

    points = load_track(filename)
    async with UserspaceRsdTunnel(serial=udid) as rsd:
        async with DvtProvider(rsd) as dvt, LocationSimulation(dvt) as simulation:
            publish({"ready": True, "points": len(points), "durationMs": points[-1]["atMs"]})
            playback = None
            reader = None
            try:
                line = await asyncio.to_thread(sys.stdin.readline)
                request = json.loads(line) if line else {"command": "close"}
                if request["command"] == "close":
                    return
                if request["command"] != "start" or set(request) - {"command", "id"}:
                    raise ValueError("Only complete start-to-finish GPX playback is supported")
                publish({"id": request["id"], "started": True})
                playback = asyncio.create_task(play_route(simulation, filename, publish))
                reader = asyncio.create_task(asyncio.to_thread(sys.stdin.readline))
                done, _ = await asyncio.wait({playback, reader}, return_when=asyncio.FIRST_COMPLETED)
                if playback in done:
                    await playback
                    line = await reader
                else:
                    line = reader.result()
                if line and json.loads(line).get("command") != "close":
                    raise ValueError("A drive cannot be paused, sought or restarted; only close is supported")
            finally:
                if playback is not None and not playback.done():
                    playback.cancel()
                    try:
                        await playback
                    except asyncio.CancelledError:
                        pass
                if reader is not None and not reader.done():
                    reader.cancel()
                await simulation.clear()
                publish({"closed": True})


if __name__ == "__main__":
    asyncio.run(serve(sys.argv[1], sys.argv[2]))
