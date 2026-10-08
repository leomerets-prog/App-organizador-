package com.leomerets.organizador;

import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.android.gms.tasks.Task;
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
import com.google.mlkit.vision.digitalink.RecognitionResult;
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

    private static final String TAG = "Organizador";

    /** Português do Brasil: é a letra que este app vai ler. */
    private static final String LANGUAGE_TAG = "pt-BR";

    private DigitalInkRecognitionModel model;
    private DigitalInkRecognizer recognizer;
    private String idiomaEscolhido = "";

    /**
     * Acha o modelo de português na lista do reconhecedor.
     *
     * Pedir pelo nome exato ("pt-BR") é o caminho curto, mas ele devolve nulo
     * quando o catálogo usa outra grafia — e aí a transcrição inteira morre
     * sem explicação, que foi o que o usuário viu: escreveu, nada apareceu.
     * Por isso, se o nome exato falhar, a lista de modelos é varrida atrás de
     * qualquer português; e o idioma escolhido é devolvido pro app, pra que dê
     * pra ver na tela qual foi.
     */
    private DigitalInkRecognitionModelIdentifier resolveIdentifier() {
        DigitalInkRecognitionModelIdentifier exato = null;
        try {
            exato = DigitalInkRecognitionModelIdentifier.fromLanguageTag(LANGUAGE_TAG);
        } catch (Throwable error) {
            Log.w(TAG, "organizador: " + LANGUAGE_TAG + " não resolveu direto", error);
        }
        if (exato != null) {
            idiomaEscolhido = LANGUAGE_TAG;
            return exato;
        }

        DigitalInkRecognitionModelIdentifier portugues = null;
        for (DigitalInkRecognitionModelIdentifier candidato :
                DigitalInkRecognitionModelIdentifier.allModelIdentifiers()) {
            String tag = candidato.getLanguageTag();
            if (tag == null) {
                continue;
            }
            if (tag.equalsIgnoreCase(LANGUAGE_TAG)) {
                idiomaEscolhido = tag;
                return candidato;
            }
            if (portugues == null && tag.toLowerCase().startsWith("pt")) {
                portugues = candidato;
            }
        }

        if (portugues != null) {
            idiomaEscolhido = portugues.getLanguageTag();
            Log.i(TAG, "organizador: usando o modelo de escrita " + idiomaEscolhido);
        }
        return portugues;
    }

    /**
     * Prepara modelo e reconhecedor uma vez só. Devolve false já tendo recusado
     * a chamada.
     *
     * Pega `Throwable`, e não só `Exception`: aparelho sem o reconhecedor
     * devolve NoClassDefFoundError/VerifyError, que são Error. Recusar a
     * chamada com uma explicação é o pior que pode acontecer aqui — derrubar o
     * app não é opção: a transcrição é acessório, o caderno é o essencial.
     */
    private boolean ensureRecognizer(PluginCall call) {
        if (recognizer != null) {
            return true;
        }
        try {
            DigitalInkRecognitionModelIdentifier identifier = resolveIdentifier();
            if (identifier == null) {
                call.reject("O reconhecedor deste aparelho não tem modelo de português.");
                return false;
            }
            model = DigitalInkRecognitionModel.builder(identifier).build();
            recognizer = DigitalInkRecognition.getClient(
                    DigitalInkRecognizerOptions.builder(model).build());
            return true;
        } catch (Throwable error) {
            // Um `catch` só, de Throwable: quem lançava MlKitException aqui era
            // a resolução do idioma, que agora mora em `resolveIdentifier()` e
            // trata a própria falha. Um catch de exceção verificada que ninguém
            // lança nem compila em Java.
            Log.e(TAG, "organizador: reconhecedor de escrita indisponível", error);
            call.reject("Este aparelho não tem o reconhecedor de escrita: " + error.getMessage());
            return false;
        }
    }

    /** O modelo do idioma já está no aparelho? */
    @PluginMethod
    public void status(PluginCall call) {
        if (!ensureRecognizer(call)) {
            return;
        }
        try {
            statusInterno(call);
        } catch (Throwable error) {
            falhou(call, error);
        }
    }

    private void statusInterno(PluginCall call) {
        RemoteModelManager.getInstance()
                .isModelDownloaded(model)
                .addOnSuccessListener(downloaded -> {
                    JSObject result = new JSObject();
                    result.put("available", true);
                    result.put("downloaded", downloaded.booleanValue());
                    result.put("language", idiomaEscolhido);
                    Log.i(TAG, "organizador: modelo " + idiomaEscolhido
                            + (downloaded.booleanValue() ? " já baixado" : " ainda não baixado"));
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
        try {
            prepareInterno(call);
        } catch (Throwable error) {
            falhou(call, error);
        }
    }

    private void prepareInterno(PluginCall call) {
        RemoteModelManager.getInstance()
                .download(model, new DownloadConditions.Builder().build())
                .addOnSuccessListener(nothing -> {
                    JSObject result = new JSObject();
                    result.put("downloaded", true);
                    result.put("language", idiomaEscolhido);
                    Log.i(TAG, "organizador: modelo " + idiomaEscolhido + " baixado");
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

        try {
            recognizeInterno(call);
        } catch (Throwable error) {
            falhou(call, error);
        }
    }

    private void recognizeInterno(PluginCall call) {
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

        /*
         * A área de escrita dá escala à letra: sem ela, uma palavra graúda e
         * uma miúda chegam iguais ao reconhecedor.
         *
         * Cada leitura vem embrulhada porque a ponte do Capacitor recusa a
         * chamada inteira quando um campo esperado não veio ("Missing required
         * properties"). Foi isso que segurou a transcrição desde o começo: o
         * erro acontecia ANTES de o reconhecedor ver a letra, e chegava na tela
         * como se ele não tivesse conseguido ler. Campo ausente aqui vale como
         * campo vazio, e a leitura acontece assim mesmo.
         */
        float width = lerNumero(call, "width");
        float height = lerNumero(call, "height");
        String preContext = lerTexto(call, "preContext");

        /*
         * O contexto do reconhecedor é tudo ou nada.
         *
         * O construtor dele EXIGE todos os campos: deixar `preContext` de fora
         * faz `build()` estourar com "Missing required properties: preContext"
         * — antes de a letra ser lida. Era esse o erro que aparecia na tela do
         * usuário como "não consegui ler", e ele nunca chegava ao ML Kit de
         * verdade: nenhuma linha foi lida desde o começo por causa disto.
         *
         * Então: com área, o contexto vai COMPLETO (com o texto anterior vazio,
         * que é o normal aqui). Sem área, não se monta contexto nenhum e a
         * leitura vai pela chamada simples.
         */
        Ink ink = inkBuilder.build();
        Task<RecognitionResult> leitura;
        if (width > 0 && height > 0) {
            RecognitionContext context = RecognitionContext
                    .builder()
                    .setPreContext(preContext == null ? "" : preContext)
                    .setWritingArea(new WritingArea(width, height))
                    .build();
            leitura = recognizer.recognize(ink, context);
        } else {
            leitura = recognizer.recognize(ink);
        }

        leitura
                .addOnSuccessListener(recognition -> {
                    List<RecognitionCandidate> candidates = recognition.getCandidates();
                    String texto = candidates.isEmpty() ? "" : candidates.get(0).getText();
                    // O que entrou e o que saiu, no log: quando o reconhecedor
                    // devolve vazio sem erro, é só por aqui que se enxerga o
                    // que ele recebeu. O TEXTO lido não vai: o log do Android
                    // é legível por qualquer um com o cabo e a depuração
                    // ligada, e a anotação é dele. O tamanho basta pra saber
                    // se leu alguma coisa.
                    Log.i(TAG, "organizador: leitura — " + strokes.length()
                            + " traço(s), área " + width + "x" + height
                            + ", " + candidates.size() + " candidato(s)"
                            + ", " + texto.length() + " caractere(s)");
                    JSObject result = new JSObject();
                    result.put("text", texto);
                    call.resolve(result);
                })
                .addOnFailureListener(error ->
                        call.reject("Não consegui ler esta linha: " + error.getMessage()));
    }

    /** Número que pode não ter vindo: ausente vale zero, e a leitura segue. */
    private float lerNumero(PluginCall call, String nome) {
        try {
            Float valor = call.getFloat(nome);
            return valor == null ? 0f : valor;
        } catch (Throwable error) {
            Log.w(TAG, "organizador: campo " + nome + " não veio; seguindo com zero");
            return 0f;
        }
    }

    /** Texto que pode não ter vindo: ausente vale vazio, e a leitura segue. */
    private String lerTexto(PluginCall call, String nome) {
        try {
            String valor = call.getString(nome, "");
            return valor == null ? "" : valor;
        } catch (Throwable error) {
            Log.w(TAG, "organizador: campo " + nome + " não veio; seguindo com vazio");
            return "";
        }
    }

    /** Nenhuma falha da transcrição pode virar app fechado: vira recusa e log. */
    private void falhou(PluginCall call, Throwable error) {
        Log.e(TAG, "organizador: falha na transcrição", error);
        call.reject("A transcrição falhou: " + error.getMessage());
    }

    @Override
    protected void handleOnDestroy() {
        try {
            if (recognizer != null) {
                recognizer.close();
                recognizer = null;
            }
        } catch (Throwable error) {
            Log.e(TAG, "organizador: falha ao fechar o reconhecedor", error);
        }
        super.handleOnDestroy();
    }
}
