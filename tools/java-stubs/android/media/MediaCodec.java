package android.media;

import java.io.IOException;
import java.nio.ByteBuffer;

/**
 * Sombra de android.media.MediaCodec.
 *
 * REGRA DE EXECUÇÃO que o javac não vê: `dequeueOutputBuffer` devolve valores
 * NEGATIVOS que não são erro (INFO_TRY_AGAIN_LATER, INFO_OUTPUT_FORMAT_CHANGED).
 * Tratar qualquer negativo como falha trava a decodificação.
 */
public class MediaCodec {
    public static final int BUFFER_FLAG_END_OF_STREAM = 4;

    public static class BufferInfo {
        public int offset;
        public int size;
        public long presentationTimeUs;
        public int flags;
    }

    public static MediaCodec createDecoderByType(String type) throws IOException { return null; }
    public void configure(MediaFormat format, Object surface, Object crypto, int flags) { }
    public void start() { }
    public void stop() { }
    public void release() { }
    public int dequeueInputBuffer(long timeoutUs) { return -1; }
    public ByteBuffer getInputBuffer(int index) { return null; }
    public void queueInputBuffer(int index, int offset, int size, long presentationTimeUs, int flags) { }
    public int dequeueOutputBuffer(BufferInfo info, long timeoutUs) { return -1; }
    public ByteBuffer getOutputBuffer(int index) { return null; }
    public void releaseOutputBuffer(int index, boolean render) { }
}
