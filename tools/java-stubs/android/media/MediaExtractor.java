package android.media;

import java.io.IOException;
import java.nio.ByteBuffer;

/** Sombra de android.media.MediaExtractor. */
public class MediaExtractor {
    public void setDataSource(String path) throws IOException { }
    public int getTrackCount() { return 0; }
    public MediaFormat getTrackFormat(int index) { return null; }
    public void selectTrack(int index) { }
    public int readSampleData(ByteBuffer byteBuf, int offset) { return -1; }
    public long getSampleTime() { return -1; }
    public boolean advance() { return false; }
    public void release() { }
}
