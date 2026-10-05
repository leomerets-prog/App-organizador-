package android.os;

import java.io.File;
import java.io.FileNotFoundException;

/** Sombra de android.os.ParcelFileDescriptor. */
public class ParcelFileDescriptor implements java.io.Closeable {
    public static final int MODE_READ_ONLY = 0x10000000;

    public static ParcelFileDescriptor open(File file, int mode) throws FileNotFoundException {
        return null;
    }

    @Override
    public void close() throws java.io.IOException { }
}
