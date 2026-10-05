package android.content;

import android.os.ParcelFileDescriptor;

/** Sombra de android.content.Intent, só com o que o plugin usa. */
public class Intent {
    public Intent(String action) { }
    public Intent putExtra(String name, String value) { return this; }
    public Intent putExtra(String name, int value) { return this; }
    public Intent putExtra(String name, boolean value) { return this; }
    public Intent putExtra(String name, ParcelFileDescriptor value) { return this; }
}
