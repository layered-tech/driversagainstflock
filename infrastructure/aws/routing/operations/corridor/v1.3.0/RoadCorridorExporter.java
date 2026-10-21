import com.fasterxml.jackson.databind.ObjectMapper;
import com.graphhopper.reader.ReaderWay;
import com.graphhopper.reader.ReaderElement;
import com.graphhopper.reader.ReaderNode;
import com.graphhopper.reader.osm.OSMInputFile;
import com.graphhopper.reader.osm.WaySegmentParser;
import com.graphhopper.storage.BaseGraph;
import com.graphhopper.storage.DAType;
import com.graphhopper.storage.GHDirectory;
import com.graphhopper.util.shapes.GHPoint3D;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.regex.*;
import java.util.zip.*;

/**
 * Retains corridor semantics before GraphHopper's routing transformations.
 * Uses the same pinned GH PBF reader and source snapshot, not the lossy graph-cache.
 * Whole source ways retain stable OSM identity across graph splitting/reordering.
 */
public final class RoadCorridorExporter {
    static final ObjectMapper JSON = new ObjectMapper();
    static final Set<String> CLASSES = Set.of("motorway", "motorway_link", "trunk", "trunk_link",
        "primary", "primary_link", "secondary", "secondary_link", "tertiary", "tertiary_link",
        "unclassified", "residential", "living_street", "service", "road");
    // Keep all roads in the checksum-pinned U.S. source, including Alaska and Hawaii.
    static final double[] COVERAGE = {-180, -90, 180, 90};
    static final double TILE_DEGREES = 0.1;
    final Path output;
    final Path spool;
    final TreeSet<String> tileIds = new TreeSet<>();
    long wayCount;
    long invalidGeometryCount;
    final List<Map<String, Object>> rejectedWays = new ArrayList<>();
    long lastWayId = -1;

    RoadCorridorExporter(Path output, Path spool) {
        this.output = output;
        this.spool = spool;
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 7) throw new IllegalArgumentException(
            "Usage: RoadCorridorExporter PBF OUTPUT SCRATCH RELEASE SOURCE_MD5 GRAPH_JAR_SHA256 EXPORTER_SHA256");
        Path source = Path.of(args[0]);
        // GH's XML reader drops empty tags, unlike its PBF reader. Only accept
        // the production PBF format so empty speed overrides remain unknown.
        if (!source.toString().endsWith(".osm.pbf")) throw new IllegalArgumentException("Only .osm.pbf input preserves the corridor tag contract");
        Path output = Path.of(args[1]);
        Path scratch = Path.of(args[2]);
        if (Files.exists(output) || Files.exists(scratch)) throw new IllegalArgumentException("Output and scratch must be fresh paths");
        if (!args[3].matches("[0-9]{8}T[0-9]{6}Z-us-v[0-9]+") || !args[4].matches("[a-f0-9]{32}")
            || !args[5].matches("[a-f0-9]{64}") || !args[6].matches("[a-f0-9]{64}"))
            throw new IllegalArgumentException("Invalid provenance");
        if (!digest(source, "MD5").equals(args[4])) throw new IllegalArgumentException("Source checksum mismatch");
        Files.createDirectories(output.resolve("tiles"));
        Files.createDirectories(scratch.resolve("spool"));
        RoadCorridorExporter exporter = new RoadCorridorExporter(output, scratch.resolve("spool"));
        // MMAP keeps the national source-node lookup off the Java heap. It is separate
        // from the routing graph so retaining roads cannot alter routing connectivity.
        try (BaseGraph graph = new BaseGraph.Builder(0)
                .setDir(new GHDirectory(scratch.resolve("nodes").toString(), DAType.MMAP)).create()) {
            new WaySegmentParser.Builder(graph.getNodeAccess(), graph.getDirectory())
                .setWayFilter(RoadCorridorExporter::allowed)
                .setWayPreprocessor(exporter::retain)
                .setEdgeHandler((from, to, points, way, tags) -> {})
                .setWorkerThreads(8)
                .build().readOSM(source.toFile());
        }
        exporter.auditSourceGeometry(source);
        exporter.finish(source.getFileName().toString(), args[3], args[4], args[5], args[6]);
        System.out.println("CORRIDOR_OK region=us ways=" + exporter.wayCount + " tiles=" + exporter.tileIds.size());
    }

    static String text(ReaderWay way, String key) {
        Object value = way.getTag(key);
        if (value == null) return null;
        String text = value.toString().trim();
        return text.isEmpty() ? null : text;
    }

    static String first(ReaderWay way, String... keys) {
        for (String key : keys) {
            String value = text(way, key);
            if (value != null) return value.toLowerCase(Locale.ROOT);
        }
        return "";
    }

    static boolean truthy(String value) {
        return value != null && !value.isBlank() && !Set.of("no", "false", "0").contains(value.trim().toLowerCase(Locale.ROOT));
    }

    static boolean allowed(ReaderWay way) {
        return way.getId() > 0 && way.getNodes().size() >= 2 && text(way, "highway") != null && CLASSES.contains(text(way, "highway"))
            && !Set.of("no", "private").contains(first(way, "motorcar", "motor_vehicle", "vehicle", "access"))
            && !truthy(text(way, "area"));
    }

    static String direction(ReaderWay way) {
        String value = first(way, "oneway:motorcar", "oneway:motor_vehicle", "oneway:vehicle", "oneway");
        if (Set.of("-1", "reverse").contains(value)) return "backward";
        if (Set.of("yes", "true", "1").contains(value)) return "forward";
        if (Set.of("no", "false", "0").contains(value)) return "both";
        return "roundabout".equals(first(way, "junction")) || Set.of("motorway", "motorway_link").contains(text(way, "highway"))
            ? "forward" : "both";
    }

    static Integer mph(String value) {
        if (value == null) return null;
        Matcher match = Pattern.compile("^(\\d+(?:\\.\\d+)?)\\s*(mph|km/h|kph|kmh)?$").matcher(value.trim().toLowerCase(Locale.ROOT));
        if (!match.matches()) return null;
        double speed = Double.parseDouble(match.group(1));
        if (!Double.isFinite(speed) || speed <= 0) return null;
        return (int) Math.max(1, Math.round("mph".equals(match.group(2)) ? speed : speed / 1.609344));
    }

    static String raw(ReaderWay way, String... keys) {
        for (String key : keys) {
            Object value = way.getTag(key);
            if (value != null) return value.toString();
        }
        return null;
    }

    void retain(ReaderWay way, WaySegmentParser.CoordinateSupplier supplier, WaySegmentParser.NodeTagSupplier tags) {
        try {
            if (way.getId() <= lastWayId) throw new IllegalArgumentException("Source ways must have unique ascending IDs");
            if (way.getId() > 9007199254740991L) throw new IllegalArgumentException("OSM way ID exceeds mobile integer precision");
            lastWayId = way.getId();
            List<double[]> coordinates = new ArrayList<>();
            List<Long> nodeIds = new ArrayList<>();
            for (int i = 0; i < way.getNodes().size(); i++) {
                long id = way.getNodes().get(i);
                if (id > 9007199254740991L) throw new IllegalArgumentException("OSM node ID exceeds mobile integer precision");
                GHPoint3D point = supplier.getCoordinate(id);
                if (id <= 0 || point == null || !Double.isFinite(point.lon) || !Double.isFinite(point.lat)
                    || Math.abs(point.lon) > 180 || Math.abs(point.lat) > 90) {
                    reject(way, "invalid_node", i, supplier);
                    return;
                }
                double[] coordinate = {Math.round(point.lon * 1e7) / 1e7d, Math.round(point.lat * 1e7) / 1e7d};
                if (!coordinates.isEmpty() && Arrays.equals(coordinates.get(coordinates.size() - 1), coordinate)) {
                    if (nodeIds.get(nodeIds.size() - 1) == id) continue;
                    reject(way, "coincident_distinct_nodes", i, supplier);
                    return;
                }
                coordinates.add(coordinate);
                nodeIds.add(id);
            }
            if (coordinates.size() < 2) { reject(way, "insufficient_points", 0, supplier); return; }
            TreeSet<String> tiles = tilesFor(coordinates);
            if (tiles.isEmpty()) return;
            Map<String, Object> record = new LinkedHashMap<>();
            String direction = direction(way);
            String speed = raw(way, "maxspeed:motorcar", "maxspeed");
            String forward = raw(way, "maxspeed:motorcar:forward", "maxspeed:forward", "maxspeed:motorcar", "maxspeed");
            String backward = raw(way, "maxspeed:motorcar:backward", "maxspeed:backward", "maxspeed:motorcar", "maxspeed");
            String effective = direction.equals("forward") ? forward : direction.equals("backward") ? backward : speed;
            record.put("id", "osm-way-" + way.getId());
            record.put("continuity_id", "osm-way-" + way.getId());
            record.put("osm_way_id", way.getId());
            record.put("coordinates", coordinates);
            record.put("node_ids", nodeIds);
            record.put("direction", direction);
            record.put("name", text(way, "name"));
            record.put("ref", text(way, "ref"));
            record.put("road_class", text(way, "highway"));
            record.put("is_roundabout", "roundabout".equals(first(way, "junction")));
            record.put("tunnel", truthy(text(way, "tunnel")));
            String layer = text(way, "layer");
            int layerNumber = 0;
            if (layer != null && layer.matches("[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?"))
                layerNumber = (int) Double.parseDouble(layer);
            record.put("layer", layerNumber);
            record.put("maxspeed", effective);
            record.put("speed_limit_mph", mph(effective));
            record.put("maxspeed_forward", forward);
            record.put("speed_limit_forward_mph", mph(forward));
            record.put("maxspeed_backward", backward);
            record.put("speed_limit_backward_mph", mph(backward));
            String line = JSON.writeValueAsString(record) + "\n";
            for (String tile : tiles) {
                Files.writeString(spool.resolve(tile + ".jsonl"), line, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
                tileIds.add(tile);
            }
            wayCount++;
        } catch (IOException exception) { throw new UncheckedIOException(exception); }
    }

    void reject(ReaderWay way, String reason, int index, WaySegmentParser.CoordinateSupplier supplier) throws IOException {
        invalidGeometryCount++;
        if (invalidGeometryCount > 100) throw new IllegalStateException("Excessive source geometry rejections; refusing to continue");
        Map<String, Object> record = new LinkedHashMap<>();
        record.put("osm_way_id", way.getId());
        record.put("reason", reason);
        record.put("node_index", index);
        record.put("name", text(way, "name"));
        record.put("road_class", text(way, "highway"));
        List<Long> ids = new ArrayList<>();
        List<double[]> coordinates = new ArrayList<>();
        for (int i = 0; i < way.getNodes().size(); i++) {
            long id = way.getNodes().get(i);
            ids.add(id);
            GHPoint3D point = supplier.getCoordinate(id);
            coordinates.add(point == null ? null : new double[]{point.lon, point.lat});
        }
        record.put("node_ids", ids);
        record.put("supplied_coordinates", coordinates);
        rejectedWays.add(record);
        System.err.println("CORRIDOR_REJECTED " + JSON.writeValueAsString(record));
    }

    void auditSourceGeometry(Path source) throws Exception {
        Set<Long> needed = new HashSet<>();
        for (Map<String, Object> record : rejectedWays) {
            for (Object id : (List<?>) record.get("node_ids")) needed.add((Long) id);
        }
        Map<Long, double[]> original = new HashMap<>();
        if (!needed.isEmpty()) {
            System.out.println("CORRIDOR_SOURCE_AUDIT nodes=" + needed.size());
            try (OSMInputFile input = new OSMInputFile(source.toFile()).setWorkerThreads(8).open()) {
                for (ReaderElement element; (element = input.getNext()) != null;) {
                    if (element instanceof ReaderNode node && needed.contains(node.getId())) {
                        original.put(node.getId(), new double[]{node.getLon(), node.getLat()});
                        if (original.size() == needed.size()) break;
                    } else if (element instanceof ReaderWay) break;
                }
            }
        }
        Path report = output.resolve("source-geometry.jsonl");
        try (BufferedWriter writer = Files.newBufferedWriter(report, StandardCharsets.UTF_8)) {
            for (Map<String, Object> record : rejectedWays) {
                List<double[]> coordinates = new ArrayList<>();
                for (Object id : (List<?>) record.get("node_ids")) coordinates.add(original.get((Long) id));
                record.put("source_coordinates", coordinates);
                String line = JSON.writeValueAsString(record);
                writer.write(line);
                writer.newLine();
                System.err.println("CORRIDOR_SOURCE_REJECTION " + line);
            }
        }
    }

    static TreeSet<String> tilesFor(List<double[]> coordinates) {
        TreeSet<String> result = new TreeSet<>();
        for (int i = 1; i < coordinates.size(); i++) {
            double[] a = coordinates.get(i - 1), b = coordinates.get(i);
            if (!intersects(a, b, COVERAGE)) continue;
            // Include both cells on an exact grid boundary, including negative longitudes.
            int minX = (int) Math.ceil(Math.max(Math.min(a[0], b[0]), COVERAGE[0]) * 10) - 1;
            int maxX = (int) Math.floor(Math.min(Math.max(a[0], b[0]), COVERAGE[2]) * 10);
            int minY = (int) Math.ceil(Math.max(Math.min(a[1], b[1]), COVERAGE[1]) * 10) - 1;
            int maxY = (int) Math.floor(Math.min(Math.max(a[1], b[1]), COVERAGE[3]) * 10);
            for (int x = minX; x <= maxX; x++) for (int y = minY; y <= maxY; y++) {
                if (intersects(a, b, new double[]{x / 10d, y / 10d, (x + 1) / 10d, (y + 1) / 10d}))
                    result.add(x + "_" + y);
            }
        }
        return result;
    }

    // Slab intersection includes long segments with both endpoints outside the area.
    static boolean intersects(double[] a, double[] b, double[] bounds) {
        double start = 0, end = 1;
        for (int axis = 0; axis < 2; axis++) {
            double delta = b[axis] - a[axis];
            if (delta == 0) {
                if (a[axis] < bounds[axis] || a[axis] > bounds[axis + 2]) return false;
            } else {
                double first = (bounds[axis] - a[axis]) / delta;
                double second = (bounds[axis + 2] - a[axis]) / delta;
                start = Math.max(start, Math.min(first, second));
                end = Math.min(end, Math.max(first, second));
                if (start > end) return false;
            }
        }
        return true;
    }

    void finish(String source, String release, String md5, String graphSha, String exporterSha) throws Exception {
        if (wayCount == 0) throw new IllegalStateException("No U.S. corridor roads; refusing manifest");
        List<Map<String, Object>> tiles = new ArrayList<>();
        for (String id : tileIds) {
            Path target = output.resolve("tiles/" + id + ".jsonl.gz");
            Path input = spool.resolve(id + ".jsonl");
            long records;
            try (var lines = Files.lines(input)) { records = lines.count(); }
            try (OutputStream gzip = new GZIPOutputStream(Files.newOutputStream(target))) { Files.copy(input, gzip); }
            // Verify compressed output by reading it back before making a manifest.
            MessageDigest uncompressed = MessageDigest.getInstance("SHA-256");
            try (InputStream gzip = new GZIPInputStream(Files.newInputStream(target))) {
                byte[] buffer = new byte[65536];
                for (int count; (count = gzip.read(buffer)) != -1;) uncompressed.update(buffer, 0, count);
            }
            if (!HexFormat.of().formatHex(uncompressed.digest()).equals(digest(input, "SHA-256")))
                throw new IllegalStateException("Compressed tile mismatch: " + id);
            String checksum = digest(target, "SHA-256");
            String key = "tiles/" + id + "-" + checksum + ".jsonl.gz";
            Path immutableTarget = output.resolve(key);
            Files.move(target, immutableTarget);
            String[] parts = id.split("_");
            int x = Integer.parseInt(parts[0]), y = Integer.parseInt(parts[1]);
            Map<String, Object> tile = new LinkedHashMap<>();
            tile.put("id", id);
            tile.put("key", key);
            tile.put("bounds", new double[]{x / 10d, y / 10d, (x + 1) / 10d, (y + 1) / 10d});
            tile.put("record_count", records);
            tile.put("size_bytes", Files.size(immutableTarget));
            tile.put("uncompressed_size_bytes", Files.size(input));
            tile.put("sha256", checksum);
            tiles.add(tile);
            Files.delete(input);
        }
        Map<String, Object> manifest = new LinkedHashMap<>();
        manifest.put("schema_version", 1);
        manifest.put("release_id", release);
        manifest.put("region", "us");
        manifest.put("coverage", Map.of("bounds", COVERAGE, "method", "source-extract", "tile_degrees", TILE_DEGREES));
        manifest.put("source", Map.of("name", source, "md5", md5));
        manifest.put("graphhopper", Map.of("version", "11.0", "sha256", graphSha));
        manifest.put("exporter", Map.of("version", "1.6.0", "sha256", exporterSha, "semantics", "retained-source-osm-ways"));
        manifest.put("record_count", wayCount);
        manifest.put("invalid_source_geometry_count", invalidGeometryCount);
        manifest.put("quarantine", Map.of("key", "source-geometry.jsonl", "record_count", invalidGeometryCount,
            "sha256", digest(output.resolve("source-geometry.jsonl"), "SHA-256")));
        manifest.put("format", "gzip-jsonl-whole-ways");
        manifest.put("deduplication_key", "id");
        manifest.put("attribution", "© OpenStreetMap contributors; ODbL 1.0; https://www.openstreetmap.org/copyright");
        manifest.put("tiles", tiles);
        Path pending = output.resolve("manifest.json.partial");
        JSON.writerWithDefaultPrettyPrinter().writeValue(pending.toFile(), manifest);
        Files.move(pending, output.resolve("manifest.json"), StandardCopyOption.ATOMIC_MOVE);
    }

    static String digest(Path path, String algorithm) throws Exception {
        MessageDigest digest = MessageDigest.getInstance(algorithm);
        try (InputStream input = Files.newInputStream(path)) {
            byte[] buffer = new byte[65536];
            for (int count; (count = input.read(buffer)) != -1;) digest.update(buffer, 0, count);
        }
        return HexFormat.of().formatHex(digest.digest());
    }
}
