package android.speech;

import android.content.Context;
import android.content.Intent;

/**
 * Sombra de android.speech.SpeechRecognizer.
 *
 * REGRA DE EXECUÇÃO que o javac não vê: o reconhecedor TEM que ser criado e
 * usado na linha principal. Criado noutra linha, ele não entrega resultado
 * nenhum e não reclama — falha calada.
 *
 * `isOnDeviceRecognitionAvailable` e `createOnDeviceSpeechRecognizer` só
 * existem do Android 13 (API 33) pra cima; chamar antes disso é
 * NoSuchMethodError no aparelho.
 */
public class SpeechRecognizer {
    public static final String RESULTS_RECOGNITION = "results_recognition";
    public static final int ERROR_NETWORK_TIMEOUT = 1;
    public static final int ERROR_NETWORK = 2;
    public static final int ERROR_AUDIO = 3;
    public static final int ERROR_SERVER = 4;
    public static final int ERROR_CLIENT = 5;
    public static final int ERROR_SPEECH_TIMEOUT = 6;
    public static final int ERROR_NO_MATCH = 7;
    public static final int ERROR_RECOGNIZER_BUSY = 8;
    public static final int ERROR_INSUFFICIENT_PERMISSIONS = 9;

    public static boolean isRecognitionAvailable(Context context) { return false; }
    public static boolean isOnDeviceRecognitionAvailable(Context context) { return false; }
    public static SpeechRecognizer createSpeechRecognizer(Context context) { return null; }
    public static SpeechRecognizer createOnDeviceSpeechRecognizer(Context context) { return null; }

    public void setRecognitionListener(RecognitionListener listener) { }
    public void startListening(Intent intent) { }
    public void destroy() { }
}
