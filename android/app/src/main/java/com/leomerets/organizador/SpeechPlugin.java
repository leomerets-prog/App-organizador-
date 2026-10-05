package com.leomerets.organizador;

import android.content.Intent;
import android.media.AudioFormat;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.os.Build;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * TESTE: o reconhecedor de fala deste aparelho lê uma gravação?
 *
 * Isto é uma SONDA, e não um recurso. Ela existe porque transcrever reunião é
 * caro de construir e o resultado depende do aparelho — e a pergunta honesta,
 * antes de gastar versões, é "o tablet dele consegue?".
 *
 * ## Por que isso é incerto
 *
 * O reconhecimento de fala do Android foi feito pra ouvir o MICROFONE ao vivo.
 * Desde o Android 12 dá pra entregar um arquivo no lugar do microfone
 * (`EXTRA_AUDIO_SOURCE`), mas:
 *
 * - o serviço de reconhecimento do aparelho pode simplesmente não aceitar
 * - o arquivo tem que ser áudio CRU (PCM 16 bits), e a gravação do app é
 *   webm/opus — precisa ser decodificada antes
 * - o reconhecedor encerra a sessão em silêncio longo, então uma reunião
 *   inteira precisaria ser picada e costurada. A sonda não faz isso: ela
 *   transcreve só o começo, porque a pergunta é "dá ou não dá"
 *
 * ## O que a sonda devolve
 *
 * Tudo que ela descobriu, inclusive quando falha: versão do Android, se há
 * reconhecedor, se há reconhecedor offline, se o decodificador deu conta, e o
 * código do erro do reconhecedor traduzido. Uma sonda que responde só "não
 * funcionou" não serve pra decidir nada.
 *
 * Como o resto dos acessórios deste app, tudo pega `Throwable`: nenhuma sonda
 * pode derrubar o caderno.
 */
@CapacitorPlugin(name = "Speech")
public class SpeechPlugin extends Plugin {

    private static final String TAG = "Organizador";

    /**
     * Quanto da gravação a sonda tenta transcrever.
     *
     * Um minuto responde a pergunta e cabe numa sessão de reconhecimento. A
     * reunião inteira precisaria do picote e da costura, que é justamente o
     * trabalho que esta sonda existe pra decidir se vale a pena.
     */
    private static final long LIMITE_US = 60L * 1_000_000L;

    /** O reconhecedor espera 16 kHz mono; é o que todo serviço de fala usa. */
    private static final int TAXA = 16_000;

    /** Prazo da sessão. Preso aqui, "não voltou nunca" viraria tela parada. */
    private static final long PRAZO_MS = 90_000L;

    private final Map<String, File> emAberto = new HashMap<>();

    // ─── O que este aparelho tem ─────────────────────────────────────────────

    @PluginMethod
    public void estado(PluginCall call) {
        JSObject r = new JSObject();
        try {
            r.put("android", Build.VERSION.SDK_INT);
            r.put("temReconhecedor", SpeechRecognizer.isRecognitionAvailable(getContext()));
            // Reconhecedor offline só existe a partir do Android 13.
            boolean offline = false;
            if (Build.VERSION.SDK_INT >= 33) {
                offline = SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext());
            }
            r.put("temOffline", offline);
            // Entregar um arquivo no lugar do microfone é do Android 12 pra cá.
            r.put("aceitaArquivo", Build.VERSION.SDK_INT >= 31);
            r.put("ok", true);
        } catch (Throwable error) {
            Log.e(TAG, "organizador: sonda de fala não conseguiu se descrever", error);
            r.put("ok", false);
            r.put("erro", String.valueOf(error.getMessage()));
        }
        call.resolve(r);
    }

    // ─── Receber a gravação, em pedaços ──────────────────────────────────────

    /*
     * Mesmo motivo do FileSaver: a ponte do Capacitor carrega texto, e uma
     * gravação de uma hora em base64 numa chamada só derruba a WebView por
     * falta de memória.
     */

    @PluginMethod
    public void abrir(PluginCall call) {
        try {
            File destino = File.createTempFile("sonda-", ".audio", getContext().getCacheDir());
            String token = UUID.randomUUID().toString();
            emAberto.put(token, destino);
            JSObject r = new JSObject();
            r.put("token", token);
            call.resolve(r);
        } catch (Throwable error) {
            call.reject("Não consegui preparar o arquivo do teste: " + error.getMessage());
        }
    }

    @PluginMethod
    public void escrever(PluginCall call) {
        String token = call.getString("token");
        String base64 = call.getString("base64");
        File destino = token == null ? null : emAberto.get(token);
        if (destino == null || base64 == null) {
            call.reject("Pedaço sem destino.");
            return;
        }
        try (OutputStream saida = new FileOutputStream(destino, true)) {
            saida.write(Base64.decode(base64, Base64.DEFAULT));
            call.resolve();
        } catch (Throwable error) {
            call.reject("Não consegui escrever o pedaço: " + error.getMessage());
        }
    }

    // ─── A tentativa ─────────────────────────────────────────────────────────

    @PluginMethod
    public void transcrever(PluginCall call) {
        String token = call.getString("token");
        final File origem = token == null ? null : emAberto.remove(token);
        if (origem == null) {
            call.reject("Não achei o arquivo do teste.");
            return;
        }
        final String idioma = call.getString("idioma", "pt-BR");

        File cru;
        final long amostras;
        try {
            cru = File.createTempFile("sonda-", ".pcm", getContext().getCacheDir());
            amostras = decodificarParaPcm(origem, cru);
        } catch (Throwable error) {
            Log.e(TAG, "organizador: sonda não decodificou o áudio", error);
            JSObject r = new JSObject();
            r.put("ok", false);
            r.put("etapa", "decodificar");
            r.put("erro", String.valueOf(error.getMessage()));
            call.resolve(r);
            return;
        }

        if (amostras <= 0) {
            JSObject r = new JSObject();
            r.put("ok", false);
            r.put("etapa", "decodificar");
            r.put("erro", "O decodificador não devolveu áudio nenhum.");
            call.resolve(r);
            return;
        }

        final File pcm = cru;
        /*
         * O reconhecedor TEM que nascer e ser usado na linha principal: ele
         * fala por um Handler, e criado noutra linha não entrega resultado
         * nenhum — falha calada, das piores de achar.
         */
        getActivity().runOnUiThread(() -> {
            try {
                ouvirArquivo(call, pcm, idioma, amostras);
            } catch (Throwable error) {
                Log.e(TAG, "organizador: sonda não pôs o reconhecedor de pé", error);
                JSObject r = new JSObject();
                r.put("ok", false);
                r.put("etapa", "reconhecer");
                r.put("erro", String.valueOf(error.getMessage()));
                call.resolve(r);
            }
        });
    }

    private void ouvirArquivo(PluginCall call, File pcm, String idioma, long amostras) throws Exception {
        if (Build.VERSION.SDK_INT < 31) {
            JSObject r = new JSObject();
            r.put("ok", false);
            r.put("etapa", "reconhecer");
            r.put("erro", "Este Android é anterior ao 12, e não sabe ler um arquivo de áudio — só o microfone ao vivo.");
            call.resolve(r);
            return;
        }

        final SpeechRecognizer reconhecedor;
        if (Build.VERSION.SDK_INT >= 33 && SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext())) {
            reconhecedor = SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext());
        } else {
            reconhecedor = SpeechRecognizer.createSpeechRecognizer(getContext());
        }

        final ParcelFileDescriptor fd = ParcelFileDescriptor.open(pcm, ParcelFileDescriptor.MODE_READ_ONLY);

        Intent pedido = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        pedido.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        pedido.putExtra(RecognizerIntent.EXTRA_LANGUAGE, idioma);
        pedido.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        pedido.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, fd);
        pedido.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, 1);
        pedido.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, AudioFormat.ENCODING_PCM_16BIT);
        pedido.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, TAXA);

        final List<String> pedacos = new ArrayList<>();
        final boolean[] respondeu = { false };

        final Runnable responder = () -> {
            if (respondeu[0]) {
                return;
            }
            respondeu[0] = true;
            try {
                reconhecedor.destroy();
            } catch (Throwable ignored) {
                // Encerrar é cortesia; o resultado já está na mão.
            }
            try {
                fd.close();
            } catch (Throwable ignored) {
                // Idem.
            }
            StringBuilder tudo = new StringBuilder();
            for (String p : pedacos) {
                if (tudo.length() > 0) {
                    tudo.append(' ');
                }
                tudo.append(p);
            }
            JSObject r = new JSObject();
            r.put("ok", tudo.length() > 0);
            r.put("etapa", "reconhecer");
            r.put("texto", tudo.toString());
            r.put("segundos", amostras / (double) TAXA);
            call.resolve(r);
        };

        reconhecedor.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) { }
            @Override public void onBeginningOfSpeech() { }
            @Override public void onRmsChanged(float rms) { }
            @Override public void onBufferReceived(byte[] buffer) { }
            @Override public void onEndOfSpeech() { }

            @Override
            public void onError(int code) {
                if (respondeu[0]) {
                    return;
                }
                respondeu[0] = true;
                try {
                    reconhecedor.destroy();
                } catch (Throwable ignored) {
                    // Já acabou de qualquer jeito.
                }
                try {
                    fd.close();
                } catch (Throwable ignored) {
                    // Idem.
                }
                JSObject r = new JSObject();
                r.put("ok", false);
                r.put("etapa", "reconhecer");
                r.put("codigo", code);
                r.put("erro", explicar(code));
                r.put("segundos", amostras / (double) TAXA);
                call.resolve(r);
            }

            @Override
            public void onResults(Bundle results) {
                ArrayList<String> lista = results == null
                        ? null
                        : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (lista != null && !lista.isEmpty()) {
                    pedacos.add(lista.get(0));
                }
                responder.run();
            }

            @Override
            public void onPartialResults(Bundle partial) { }

            @Override public void onEvent(int type, Bundle params) { }
        });

        reconhecedor.startListening(pedido);

        // Rede de segurança: reconhecedor que não volta não pode deixar a tela
        // esperando pra sempre.
        getBridge().getWebView().postDelayed(responder, PRAZO_MS);
    }

    /** O que cada código de erro quer dizer, em português de gente. */
    private static String explicar(int code) {
        switch (code) {
            case SpeechRecognizer.ERROR_AUDIO: return "O reconhecedor não conseguiu ler o áudio.";
            case SpeechRecognizer.ERROR_CLIENT: return "O reconhecedor recusou o pedido (provavelmente não aceita arquivo).";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: return "Falta permissão de microfone.";
            case SpeechRecognizer.ERROR_NETWORK: return "Precisou de internet e não tinha.";
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: return "A internet demorou demais.";
            case SpeechRecognizer.ERROR_NO_MATCH: return "Leu o áudio e não entendeu nada.";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: return "O reconhecedor estava ocupado.";
            case SpeechRecognizer.ERROR_SERVER: return "O serviço de reconhecimento falhou.";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: return "Não achou fala nenhuma no áudio.";
            default: return "Erro " + code + " do reconhecedor.";
        }
    }

    // ─── Do webm/opus pro áudio cru ──────────────────────────────────────────

    /**
     * Decodifica o começo da gravação em PCM 16 bits, mono, 16 kHz.
     *
     * A reamostragem é a mais simples que existe (pega uma amostra a cada N) e
     * isso é de propósito: a sonda responde "dá ou não dá", e um reamostrador
     * decente é trabalho pra quando a resposta for sim.
     *
     * Devolve quantas amostras saíram — zero quer dizer que o decodificador
     * não deu conta do formato, que é uma resposta tão útil quanto a outra.
     */
    private static long decodificarParaPcm(File origem, File destino) throws Exception {
        MediaExtractor extrator = new MediaExtractor();
        MediaCodec decodificador = null;
        long escritas = 0;
        try (OutputStream saida = new FileOutputStream(destino)) {
            extrator.setDataSource(origem.getAbsolutePath());

            int trilha = -1;
            MediaFormat formato = null;
            for (int i = 0; i < extrator.getTrackCount(); i++) {
                MediaFormat f = extrator.getTrackFormat(i);
                String tipo = f.getString(MediaFormat.KEY_MIME);
                if (tipo != null && tipo.startsWith("audio/")) {
                    trilha = i;
                    formato = f;
                    break;
                }
            }
            if (trilha < 0 || formato == null) {
                throw new IllegalStateException("Não achei trilha de áudio no arquivo.");
            }

            extrator.selectTrack(trilha);
            int taxaOrigem = formato.getInteger(MediaFormat.KEY_SAMPLE_RATE);
            int canais = formato.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
            decodificador = MediaCodec.createDecoderByType(formato.getString(MediaFormat.KEY_MIME));
            decodificador.configure(formato, null, null, 0);
            decodificador.start();

            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            boolean acabouEntrada = false;
            boolean acabouSaida = false;
            // Resto da divisão guardado entre blocos: sem ele, cada bloco
            // recomeçaria a contagem e a reamostragem andaria aos trancos.
            int sobra = 0;

            while (!acabouSaida) {
                if (!acabouEntrada) {
                    int entrada = decodificador.dequeueInputBuffer(10_000);
                    if (entrada >= 0) {
                        ByteBuffer buffer = decodificador.getInputBuffer(entrada);
                        int lidos = buffer == null ? -1 : extrator.readSampleData(buffer, 0);
                        long quando = extrator.getSampleTime();
                        if (lidos < 0 || quando > LIMITE_US) {
                            decodificador.queueInputBuffer(entrada, 0, 0, 0,
                                    MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                            acabouEntrada = true;
                        } else {
                            decodificador.queueInputBuffer(entrada, 0, lidos, quando, 0);
                            extrator.advance();
                        }
                    }
                }

                int saidaIdx = decodificador.dequeueOutputBuffer(info, 10_000);
                if (saidaIdx >= 0) {
                    ByteBuffer buffer = decodificador.getOutputBuffer(saidaIdx);
                    if (buffer != null && info.size > 0) {
                        byte[] bloco = new byte[info.size];
                        buffer.position(info.offset);
                        buffer.get(bloco, 0, info.size);
                        sobra = escreverReamostrado(saida, bloco, canais, taxaOrigem, sobra);
                        escritas += info.size / (2L * canais);
                    }
                    decodificador.releaseOutputBuffer(saidaIdx, false);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                        acabouSaida = true;
                    }
                }
            }
        } finally {
            if (decodificador != null) {
                try {
                    decodificador.stop();
                    decodificador.release();
                } catch (Throwable ignored) {
                    // Soltar é cortesia.
                }
            }
            try {
                extrator.release();
            } catch (Throwable ignored) {
                // Idem.
            }
        }
        return escritas;
    }

    /**
     * Joga o bloco decodificado no arquivo, em mono e na taxa do reconhecedor.
     *
     * Devolve o resto da divisão, que a próxima chamada continua: é ele que
     * impede a reamostragem de recomeçar a cada bloco.
     */
    private static int escreverReamostrado(
            OutputStream saida, byte[] bloco, int canais, int taxaOrigem, int sobra) throws Exception {
        int porAmostra = 2 * canais;
        int total = bloco.length / porAmostra;
        byte[] fora = new byte[total * 2];
        int escritos = 0;
        int conta = sobra;
        for (int i = 0; i < total; i++) {
            conta += TAXA;
            if (conta < taxaOrigem) {
                continue;
            }
            conta -= taxaOrigem;
            // Mono: fica o primeiro canal. Misturar os dois é mais bonito e
            // não muda a resposta da sonda.
            int base = i * porAmostra;
            fora[escritos++] = bloco[base];
            fora[escritos++] = bloco[base + 1];
        }
        if (escritos > 0) {
            saida.write(fora, 0, escritos);
        }
        return conta;
    }
}
