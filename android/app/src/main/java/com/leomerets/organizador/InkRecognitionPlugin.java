package com.leomerets.organizador;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.mlkit.common.MlKitException;
import com.google.mlkit.common.model.DownloadConditions;
import com.google.mlkit.common.model.RemoteModelManager;
import com.google.mlkit.vision.digitalink.DigitalInkRecognition;
import com.google.mlkit.vision.digitalink.DigitalInkRecognitionModel;
import com.google.mlkit.vision.digitalink.DigitalInkRecognitionModelIdentifier;
import com.google.mlkit.vision.digitalink.DigitalInkRecognizer;
import com.google.mlkit.vision.digitalink.DigitalInkRecognizerOptions;
import com.google.mlkit.vision.digitalink.Ink;
import com.google.mlkit.vision.digitalink.RecognitionCandidate;
import com.google.mlkit.vision.digitalink.RecognitionContext;
import com.google.mlkit.vision.digitalink.WritingArea;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.List;

/**
 * Transcrição da letra manuscrita, dentro do aparelho.
 *
 * Usa o ML Kit Digital Ink, que lê TRAÇOS — pontos e tempos —, e não uma foto
 * da tela. É exatamente o que o app já guarda de cada linha escrita, então não
 * há conversão nem perda no caminho.
 *
 * Depois que o modelo do idioma é baixado uma vez, tudo acontece offline e de
 * graça: nenhuma anotação sai do tablet, que é a promessa do app desde o
 * começo. O download é a única parte que precisa de internet, e acontece uma
 * vez só.
 */
@CapacitorPlugin(name = "InkRecognition")
public class InkRecognitionPlugin extends Plugin {

    /** Português do Brasil: é a letra que este app vai ler. */
    private static final String LANGUAGE_TAG = "pt-BR";

    private DigitalInkRecognitionModel model;
    private DigitalInkRecognizer recognizer;

    /** Prepara modelo e reconhecedor uma vez só. Devolve false já tendo recusado a chamada. */
    private boolean ensureRecognizer(PluginCall call) {
        if (recognizer != null) {
            return true;
        }
        try {
            DigitalInkRecognitionModelIdentifier identifier =
                    DigitalInkRecognitionModelIdentifier.fromLanguageTag(LANGUAGE_TAG);
            if (identifier == null) {
                call.reject("O reconhecedor não tem modelo para " + LANGUAGE_TAG);
                return false;
            }
            model = DigitalInkRecognitionModel.builder(identifier).build();
            recognizer = DigitalInkRecognition.getClient(
                    DigitalInkRecognizerOptions.builder(model).build());
            return true;
        } catch (MlKitException error) {
            call.reject("Não consegui preparar a transcrição: " + error.getMessage());
            return false;
        }
    }

    /** O modelo do idioma já está no aparelho? */
    @PluginMethod
    public void status(PluginCall call) {
        if (!ensureRecognizer(call)) {
            return;
        }
        RemoteModelManager.getInstance()
                .isModelDownloaded(model)
                .addOnSuccessListener(downloaded -> {
                    JSObject result = new JSObject();
                    result.put("available", true);
                    result.put("downloaded", downloaded.booleanValue());
                    call.resolve(result);
                })
                .addOnFailureListener(error ->
                        call.reject("Não consegui verificar o modelo de escrita: " + error.getMessage()));
    }

    /** Baixa o modelo do idioma. Precisa de internet — só nesta vez. */
    @PluginMethod
    public void prepare(PluginCall call) {
        if (!ensureRecognizer(call)) {
            return;
        }
        RemoteModelManager.getInstance()
                .download(model, new DownloadConditions.Builder().build())
                .addOnSuccessListener(nothing -> {
                    JSObject result = new JSObject();
                    result.put("downloaded", true);
                    call.resolve(result);
                })
                .addOnFailureListener(error ->
                        call.reject("Não consegui baixar o modelo de escrita: " + error.getMessage()));
    }

    /** Lê uma linha escrita e devolve o texto. */
    @PluginMethod
    public void recognize(PluginCall call) {
        if (!ensureRecognizer(call)) {
            return;
        }

        JSArray strokes = call.getArray("strokes");
        if (strokes == null || strokes.length() == 0) {
            call.reject("Sem traços para transcrever");
            return;
        }

        Ink.Builder inkBuilder = Ink.builder();
        try {
            for (int i = 0; i < strokes.length(); i++) {
                JSONArray points = strokes.getJSONArray(i);
                Ink.Stroke.Builder strokeBuilder = Ink.Stroke.builder();
                for (int j = 0; j < points.length(); j++) {
                    JSONObject point = points.getJSONObject(j);
                    strokeBuilder.addPoint(Ink.Point.create(
                            (float) point.getDouble("x"),
                            (float) point.getDouble("y"),
                            point.getLong("t")));
                }
                inkBuilder.addStroke(strokeBuilder.build());
            }
        } catch (JSONException error) {
            call.reject("Traços em formato inesperado: " + error.getMessage());
            return;
        }

        // A área de escrita dá escala à letra: sem ela, uma palavra graúda e
        // uma miúda chegam iguais ao reconhecedor.
        float width = call.getFloat("width", 0f);
        float height = call.getFloat("height", 0f);
        String preContext = call.getString("preContext", "");

        RecognitionContext.Builder contextBuilder = RecognitionContext.builder();
        if (width > 0 && height > 0) {
            contextBuilder.setWritingArea(new WritingArea(width, height));
        }
        if (preContext != null && !preContext.isEmpty()) {
            contextBuilder.setPreContext(preContext);
        }

        recognizer.recognize(inkBuilder.build(), contextBuilder.build())
                .addOnSuccessListener(recognition -> {
                    List<RecognitionCandidate> candidates = recognition.getCandidates();
                    JSObject result = new JSObject();
                    result.put("text", candidates.isEmpty() ? "" : candidates.get(0).getText());
                    call.resolve(result);
                })
                .addOnFailureListener(error ->
                        call.reject("Não consegui ler esta linha: " + error.getMessage()));
    }

    @Override
    protected void handleOnDestroy() {
        if (recognizer != null) {
            recognizer.close();
            recognizer = null;
        }
        super.handleOnDestroy();
    }
}
