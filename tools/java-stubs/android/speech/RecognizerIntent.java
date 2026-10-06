package android.speech;

/**
 * Sombra de android.speech.RecognizerIntent.
 *
 * REGRA DE EXECUÇÃO: os quatro EXTRA_AUDIO_SOURCE* só existem do Android 12
 * (API 31) pra cima, e o serviço de reconhecimento do aparelho pode ignorá-los
 * mesmo assim — nesse caso o que volta é ERROR_CLIENT.
 */
public class RecognizerIntent {
    public static final String ACTION_RECOGNIZE_SPEECH = "android.speech.action.RECOGNIZE_SPEECH";
    public static final String EXTRA_LANGUAGE_MODEL = "android.speech.extra.LANGUAGE_MODEL";
    public static final String LANGUAGE_MODEL_FREE_FORM = "free_form";
    public static final String EXTRA_LANGUAGE = "android.speech.extra.LANGUAGE";
    public static final String EXTRA_PARTIAL_RESULTS = "android.speech.extra.PARTIAL_RESULTS";
    public static final String EXTRA_AUDIO_SOURCE = "android.speech.extra.AUDIO_SOURCE";
    public static final String EXTRA_AUDIO_SOURCE_CHANNEL_COUNT = "android.speech.extra.AUDIO_SOURCE_CHANNEL_COUNT";
    public static final String EXTRA_AUDIO_SOURCE_ENCODING = "android.speech.extra.AUDIO_SOURCE_ENCODING";
    public static final String EXTRA_AUDIO_SOURCE_SAMPLING_RATE = "android.speech.extra.AUDIO_SOURCE_SAMPLING_RATE";
    /**
     * REGRA DE EXECUÇÃO: o VALOR deste extra é o nome do outro extra que
     * define quando a sessão acaba. Passando EXTRA_AUDIO_SOURCE, ela acaba
     * quando o arquivo acaba — que é o que serve pra transcrever gravação.
     */
    public static final String EXTRA_SEGMENTED_SESSION = "android.speech.extra.SEGMENTED_SESSION";
}
