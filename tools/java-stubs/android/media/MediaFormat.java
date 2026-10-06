package android.media;

/** Sombra de android.media.MediaFormat. */
public class MediaFormat {
    public static final String KEY_MIME = "mime";
    public static final String KEY_SAMPLE_RATE = "sample-rate";
    public static final String KEY_CHANNEL_COUNT = "channel-count";
    /**
     * REGRA DE EXECUÇÃO: esta chave só aparece no formato de SAÍDA do
     * decodificador, e só quando NÃO é o padrão de 16 bits. Ausente quer dizer
     * 16 — perguntar sem conferir `containsKey` estoura.
     */
    public static final String KEY_PCM_ENCODING = "pcm-encoding";

    public boolean containsKey(String name) { return false; }

    public String getString(String name) { return null; }
    public int getInteger(String name) { return 0; }
}
