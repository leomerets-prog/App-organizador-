package android.content;

import java.io.File;

public abstract class Context {
    public ContentResolver getContentResolver() { return null; }
    public File getExternalFilesDir(String type) { return null; }
    public File getFilesDir() { return null; }
    public File getCacheDir() { return null; }
}
