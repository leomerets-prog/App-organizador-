package android.content;

import android.database.Cursor;
import android.net.Uri;

import java.io.OutputStream;

public abstract class ContentResolver {
    public Uri insert(Uri url, ContentValues values) { return null; }
    public OutputStream openOutputStream(Uri uri) { return null; }
    public int update(Uri uri, ContentValues values, String where, String[] selectionArgs) { return 0; }
    public int delete(Uri url, String where, String[] selectionArgs) { return 0; }
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) { return null; }
}
