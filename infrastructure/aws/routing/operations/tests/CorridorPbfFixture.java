import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.protobuf.ByteString;
import org.openstreetmap.osmosis.osmbinary.Fileformat;
import org.openstreetmap.osmosis.osmbinary.Osmformat;
import java.io.*;
import java.util.*;

/** Builds a tiny real PBF, including empty tags, for exporter integration tests. */
public final class CorridorPbfFixture {
    public static void main(String[] args) throws Exception {
        JsonNode elements = new ObjectMapper().readTree(new File(args[0]));
        LinkedHashMap<String, Integer> strings = new LinkedHashMap<>();
        strings.put("", 0);
        for (JsonNode element : elements) {
            if (element.has("tags")) element.get("tags").fields().forEachRemaining(tag -> {
                strings.computeIfAbsent(tag.getKey(), ignored -> strings.size());
                strings.computeIfAbsent(tag.getValue().asText(), ignored -> strings.size());
            });
        }
        var table = Osmformat.StringTable.newBuilder();
        for (String string : strings.keySet()) table.addS(ByteString.copyFromUtf8(string));
        var group = Osmformat.PrimitiveGroup.newBuilder();
        for (JsonNode element : elements) {
            if (element.get("type").asText().equals("node")) {
                group.addNodes(Osmformat.Node.newBuilder().setId(element.get("id").asLong())
                    .setLon(Math.round(element.get("lon").asDouble() * 1e7))
                    .setLat(Math.round(element.get("lat").asDouble() * 1e7)));
            } else {
                var way = Osmformat.Way.newBuilder().setId(element.get("id").asLong());
                long previous = 0;
                for (JsonNode node : element.get("nodes")) {
                    long id = node.asLong();
                    way.addRefs(id - previous);
                    previous = id;
                }
                element.get("tags").fields().forEachRemaining(tag -> {
                    way.addKeys(strings.get(tag.getKey()));
                    way.addVals(strings.get(tag.getValue().asText()));
                });
                group.addWays(way);
            }
        }
        try (DataOutputStream output = new DataOutputStream(new FileOutputStream(args[1]))) {
            block(output, "OSMHeader", Osmformat.HeaderBlock.newBuilder().addRequiredFeatures("OsmSchema-V0.6").build().toByteString());
            block(output, "OSMData", Osmformat.PrimitiveBlock.newBuilder().setGranularity(100)
                .setStringtable(table).addPrimitivegroup(group).build().toByteString());
        }
    }

    static void block(DataOutputStream output, String type, ByteString bytes) throws IOException {
        byte[] blob = Fileformat.Blob.newBuilder().setRaw(bytes).build().toByteArray();
        byte[] header = Fileformat.BlobHeader.newBuilder().setType(type).setDatasize(blob.length).build().toByteArray();
        output.writeInt(header.length);
        output.write(header);
        output.write(blob);
    }
}
