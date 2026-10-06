package android.speech;

import android.os.Bundle;

/** Sombra de android.speech.RecognitionListener. */
public interface RecognitionListener {
    void onReadyForSpeech(Bundle params);
    void onBeginningOfSpeech();
    void onRmsChanged(float rmsdB);
    void onBufferReceived(byte[] buffer);
    void onEndOfSpeech();
    void onError(int error);
    void onResults(Bundle results);
    void onPartialResults(Bundle partialResults);
    void onEvent(int eventType, Bundle params);

    /**
     * Sessão segmentada: do Android 12 (API 31) pra cima, e com implementação
     * PADRÃO na interface de verdade — por isso aqui também são `default`.
     * Quem lê um arquivo precisa delas: sem a sessão segmentada, o
     * reconhecedor encerra no primeiro silêncio longo.
     */
    default void onSegmentResults(Bundle segmentResults) { }

    default void onEndOfSegmentedSession() { }
}
