package android.provider;

import android.net.Uri;

public final class MediaStore {
    /*
     * As colunas existem desde sempre, MENOS `IS_PENDING`, que é do Android 10.
     * Em aparelho mais velho o caminho do MediaStore nem é tomado — quem
     * garante isso é o `SDK_INT >= 29` no plugin, não esta sombra.
     */
    public static class MediaColumns {
        public static final String DISPLAY_NAME = "_display_name";
        public static final String MIME_TYPE = "mime_type";
        public static final String RELATIVE_PATH = "relative_path";
        public static final String IS_PENDING = "is_pending";
    }

    public static final class Downloads extends MediaColumns {
        public static final Uri EXTERNAL_CONTENT_URI = null;
    }
}
