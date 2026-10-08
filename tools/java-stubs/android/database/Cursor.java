package android.database;

import java.io.Closeable;

public interface Cursor extends Closeable {
    boolean moveToFirst();
    String getString(int columnIndex);
    void close();
}
