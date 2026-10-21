import com.graphhopper.reader.ReaderWay;
import com.graphhopper.util.shapes.GHPoint3D;
import java.nio.file.*;

/** Exercises rejected ways without depending on GraphHopper coordinate quantization. */
public final class SourceGeometryAuditFixture {
    public static void main(String[] args) throws Exception {
        Path output = Path.of(args[1]);
        Files.createDirectories(output);
        RoadCorridorExporter exporter = new RoadCorridorExporter(output, output);
        ReaderWay way = new ReaderWay(123);
        way.setTag("highway", "residential");
        way.getNodes().add(10);
        way.getNodes().add(11);
        way.getNodes().add(12);
        exporter.retain(way, id -> new GHPoint3D(43, id == 12 ? -88.99 : -89, 0), id -> java.util.Map.of());
        exporter.auditSourceGeometry(Path.of(args[0]));
    }
}
