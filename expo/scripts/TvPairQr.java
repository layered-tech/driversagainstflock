import com.google.zxing.BinaryBitmap;
import com.google.zxing.LuminanceSource;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.common.HybridBinarizer;
import java.awt.image.BufferedImage;
import java.nio.file.Path;
import javax.imageio.ImageIO;

class TvPairQr {
    private static class Pixels extends LuminanceSource {
        private final byte[] grayscale;

        Pixels(BufferedImage image) {
            super(image.getWidth(), image.getHeight());
            grayscale = new byte[getWidth() * getHeight()];
            for (int y = 0; y < getHeight(); y++) {
                for (int x = 0; x < getWidth(); x++) {
                    int color = image.getRGB(x, y);
                    grayscale[y * getWidth() + x] = (byte) (((color >> 16 & 255) + (color >> 8 & 255) + (color & 255)) / 3);
                }
            }
        }

        @Override public byte[] getRow(int y, byte[] row) {
            if (row == null || row.length < getWidth()) row = new byte[getWidth()];
            System.arraycopy(grayscale, y * getWidth(), row, 0, getWidth());
            return row;
        }

        @Override public byte[] getMatrix() { return grayscale; }
    }

    public static void main(String[] args) throws Exception {
        BufferedImage image = ImageIO.read(Path.of(args[0]).toFile());
        if (image == null) throw new IllegalArgumentException("TV screenshot is not an image");
        System.out.print(new MultiFormatReader().decode(
            new BinaryBitmap(new HybridBinarizer(new Pixels(image)))
        ).getText());
    }
}
