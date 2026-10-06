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

import com.getcapacitor.JSArray;
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

    /** O reconhecedor espera 16 kHz mono; é o que todo serviço de fala usa. */
    private static final int TAXA = 16_000;

    /**
     * O PRAZO, agora proporcional ao tamanho da gravação.
     *
     * Era fixo em 90 segundos, de quando isto só provava os primeiros sessenta.
     * Com a reunião inteira, um prazo fixo mataria a sessão no meio e devolveria
     * meia ata — pior que não devolver nada, porque parece completa.
     *
     * O reconhecedor de aparelho costuma andar mais rápido que o tempo real,
     * mas não sempre; uma vez e meia a duração, com piso de dois minutos, dá
     * folga sem deixar a tela pendurada pra sempre quando ele simplesmente não
     * responde.
     */
    private static final long PRAZO_MINIMO_MS = 120_000L;
    private static final long PRAZO_MAXIMO_MS = 20L * 60_000L;

    private static long prazoPara(double segundos) {
        long proporcional = (long) (segundos * 1500);
        return Math.max(PRAZO_MINIMO_MS, Math.min(PRAZO_MAXIMO_MS, proporcional));
    }

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
            /*
             * CUIDADO com o que este campo quer dizer: ele é uma conferência
             * de VERSÃO, não de capacidade. O Android 12 passou a permitir
             * entregar um arquivo, mas o serviço de reconhecimento instalado
             * pode ignorar — e foi exatamente assim que a sonda deu "sim" num
             * aparelho onde não funcionou. O nome na tela diz isso.
             */
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
        /*
         * Até onde ler a gravação. Zero (o normal agora) quer dizer até o fim —
         * o corte em um minuto era da sonda, que só precisava responder "dá ou
         * não dá".
         */
        final long limiteUs = segundosPedidos(call) * 1_000_000L;
        final ArrayList<String> palavras = palavrasDoPedido(call);

        File cru;
        final Decodificado medida;
        try {
            cru = File.createTempFile("sonda-", ".pcm", getContext().getCacheDir());
            medida = decodificarParaPcm(origem, cru, limiteUs);
        } catch (Throwable error) {
            Log.e(TAG, "organizador: sonda não decodificou o áudio", error);
            JSObject r = new JSObject();
            r.put("ok", false);
            r.put("etapa", "decodificar");
            r.put("erro", String.valueOf(error.getMessage()));
            call.resolve(r);
            return;
        }

        if (medida.amostras <= 0) {
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
                ouvirArquivo(call, pcm, idioma, medida, palavras);
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

    /**
     * Até quantos segundos da gravação ler. Zero, ausente ou negativo = tudo.
     *
     * `getInt(nome)` pode voltar nulo, e desembrulhar nulo num `int` estoura a
     * chamada inteira com uma mensagem que não ajuda ninguém.
     */
    private static long segundosPedidos(PluginCall call) {
        try {
            Integer pedido = call.getInt("limiteSegundos");
            if (pedido == null || pedido <= 0) {
                return Long.MAX_VALUE / 1_000_000L;
            }
            return pedido;
        } catch (Throwable ignored) {
            return Long.MAX_VALUE / 1_000_000L;
        }
    }

    /**
     * AS PALAVRAS DO CADERNO — o que ele escreveu na folha, como dica.
     *
     * É a diferença entre "trocou palavras" e "acertou": o reconhecedor erra
     * justamente no que não é vocabulário comum — nomes de pessoas, de setores,
     * de sistemas, siglas. E essas palavras já estão escritas na folha da
     * reunião, de próprio punho, antes mesmo de a transcrição começar.
     *
     * Do Android 13 pra cima há um campo oficial pra isso. Abaixo, vai ignorado
     * sem reclamar — a transcrição continua, só menos ajudada.
     */
    private static ArrayList<String> palavrasDoPedido(PluginCall call) {
        ArrayList<String> fora = new ArrayList<>();
        try {
            JSArray lista = call.getArray("palavras");
            if (lista == null) {
                return fora;
            }
            for (int i = 0; i < lista.length(); i++) {
                Object item = lista.opt(i);
                String palavra = item == null ? null : String.valueOf(item).trim();
                if (palavra != null && palavra.length() > 1) {
                    fora.add(palavra);
                }
            }
        } catch (Throwable ignored) {
            // Dica é cortesia: sem ela a transcrição continua, só menos ajudada.
        }
        return fora;
    }

    private void ouvirArquivo(
            PluginCall call,
            File pcm,
            String idioma,
            Decodificado medida,
            ArrayList<String> palavras) throws Exception {
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
        if (Build.VERSION.SDK_INT >= 33) {
            // "A sessão acaba quando o arquivo acabar" — é isso que o valor diz.
            pedido.putExtra(RecognizerIntent.EXTRA_SEGMENTED_SESSION, RecognizerIntent.EXTRA_AUDIO_SOURCE);
            if (!palavras.isEmpty()) {
                /*
                 * `putStringArrayListExtra`, e não um array: o campo é
                 * documentado como ArrayList<String>, e o reconhecedor lê de
                 * volta com `getStringArrayListExtra`. Mandado como String[],
                 * o que ele acha é nulo — e ele ignora CALADO, sem erro
                 * nenhum. Tipo errado aqui não quebra nada; só faz a dica não
                 * existir, que é a pior forma de falhar.
                 */
                pedido.putStringArrayListExtra(RecognizerIntent.EXTRA_BIASING_STRINGS, palavras);
            }
        }

        final List<String> pedacos = new ArrayList<>();
        final boolean[] respondeu = { false };
        /*
         * A TRILHA: que avisos o reconhecedor deu, na ordem.
         *
         * É o que separa "ele nem acordou" de "ele ouviu e não entendeu" — e
         * sem essa distinção não dá pra saber se o problema é o arquivo, o
         * áudio ou o serviço de fala do aparelho.
         */
        final StringBuilder trilha = new StringBuilder();
        final long prazo = prazoPara(medida.amostras / (double) TAXA);

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
            String tudo = juntar(pedacos);
            JSObject r = new JSObject();
            r.put("ok", tudo.length() > 0);
            r.put("etapa", "reconhecer");
            r.put("texto", tudo);
            medida.contar(r);
            r.put("trilha", trilha.toString());
            r.put("dicas", palavras.size());
            if (tudo.length() == 0) {
                /*
                 * O caso que o usuário encontrou: nem resultado, nem erro.
                 * Antes isto resolvia com `erro` vazio e a tela dizia só "não
                 * transcreveu", que não serve pra decidir nada. Agora a sonda
                 * diz o que ela própria viu acontecer.
                 */
                r.put(
                        "erro",
                        trilha.length() == 0
                                ? "O reconhecedor não deu sinal nenhum em " + (prazo / 1000)
                                        + "s — nem resultado, nem erro. O serviço de fala deste"
                                        + " aparelho provavelmente ignora o arquivo e fica"
                                        + " esperando o microfone."
                                : "O reconhecedor respondeu (" + trilha + ") mas não devolveu"
                                        + " texto nenhum.");
            }
            call.resolve(r);
        };

        reconhecedor.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) { trilha.append("pronto;"); }
            @Override public void onBeginningOfSpeech() { trilha.append("começou;"); }
            @Override public void onRmsChanged(float rms) { }
            @Override public void onBufferReceived(byte[] buffer) { }
            @Override public void onEndOfSpeech() { trilha.append("fim da fala;"); }

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
                r.put("trilha", trilha + "erro;");
                medida.contar(r);
                call.resolve(r);
            }

            @Override
            public void onResults(Bundle results) {
                trilha.append("resultado;");
                ArrayList<String> lista = results == null
                        ? null
                        : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (lista != null && !lista.isEmpty()) {
                    pedacos.add(lista.get(0));
                }
                responder.run();
            }

            @Override
            public void onPartialResults(Bundle partial) {
                if (trilha.indexOf("parcial;") < 0) {
                    trilha.append("parcial;");
                }
            }

            /*
             * Modo segmentado (Android 13+): é o caminho DOCUMENTADO pra ler um
             * arquivo, porque ele não encerra no primeiro silêncio — e reunião
             * é feita de silêncios. Os resultados chegam aos pedaços, e o fim
             * vem quando o arquivo acaba.
             */
            @Override
            public void onSegmentResults(Bundle segment) {
                trilha.append("segmento;");
                ArrayList<String> lista = segment == null
                        ? null
                        : segment.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (lista != null && !lista.isEmpty()) {
                    pedacos.add(lista.get(0));
                    /*
                     * Conta o andamento ANTES do fim.
                     *
                     * Uma reunião de meia hora leva minutos pra transcrever, e
                     * o `resolve` só vem no fim. Sem isto, a tela fica parada o
                     * tempo todo — e tela parada é indistinguível de tela
                     * travada, que é justamente o que ele já relatou três vezes
                     * no fluxograma.
                     */
                    try {
                        JSObject passo = new JSObject();
                        passo.put("texto", juntar(pedacos));
                        passo.put("trechos", pedacos.size());
                        notifyListeners("andamento", passo);
                    } catch (Throwable ignored) {
                        // Contar o andamento nunca pode atrapalhar o resultado.
                    }
                }
            }

            @Override
            public void onEndOfSegmentedSession() {
                trilha.append("fim da sessão;");
                responder.run();
            }

            @Override public void onEvent(int type, Bundle params) { }
        });

        reconhecedor.startListening(pedido);

        // Rede de segurança: reconhecedor que não volta não pode deixar a tela
        // esperando pra sempre.
        getBridge().getWebView().postDelayed(responder, prazo);
    }

    /** Os trechos do reconhecedor costurados num texto só. */
    private static String juntar(List<String> pedacos) {
        StringBuilder tudo = new StringBuilder();
        for (String p : pedacos) {
            if (p == null || p.isEmpty()) {
                continue;
            }
            if (tudo.length() > 0) {
                tudo.append(' ');
            }
            tudo.append(p);
        }
        return tudo.toString();
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
     * Decodifica a gravação em PCM 16 bits, mono, 16 kHz — o que o
     * reconhecedor come.
     *
     * `limiteUs` corta a leitura num ponto do áudio. A sonda usava um minuto
     * porque só precisava responder "dá ou não dá"; a resposta foi sim, e
     * agora o normal é ler até o fim.
     *
     * Devolve quantas amostras saíram — zero quer dizer que o decodificador
     * não deu conta do formato, que é uma resposta tão útil quanto a outra.
     */
    /**
     * O que saiu da decodificação — e não só quanto.
     *
     * O `pico` é o que distingue "decodifiquei certo" de "decodifiquei lixo":
     * áudio de verdade tem picos perto do máximo, e um pico quase zero quer
     * dizer que o reconhecedor recebeu silêncio, por mais segundos que
     * tenham passado. Sem esse número, "não transcreveu" não diz se a culpa é
     * do decodificador ou do serviço de fala.
     */
    private static final class Decodificado {
        long amostras;
        int pico;
        String codificacao = "?";

        void contar(JSObject r) {
            r.put("segundos", amostras / (double) TAXA);
            r.put("pico", pico);
            r.put("codificacao", codificacao);
        }
    }

    private static Decodificado decodificarParaPcm(File origem, File destino, long limiteUs) throws Exception {
        MediaExtractor extrator = new MediaExtractor();
        MediaCodec decodificador = null;
        final Decodificado saiu = new Decodificado();
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
            int bits = 0;
            final Reamostrador estado = new Reamostrador();

            while (!acabouSaida) {
                if (!acabouEntrada) {
                    int entrada = decodificador.dequeueInputBuffer(10_000);
                    if (entrada >= 0) {
                        ByteBuffer buffer = decodificador.getInputBuffer(entrada);
                        int lidos = buffer == null ? -1 : extrator.readSampleData(buffer, 0);
                        long quando = extrator.getSampleTime();
                        if (lidos < 0 || quando > limiteUs) {
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
                        /*
                         * O FORMATO DA SAÍDA, a cada bloco.
                         *
                         * Um decodificador de opus pode devolver 16 bits ou
                         * FLOAT de 32. Lendo float como se fosse 16 bits, o que
                         * chega ao reconhecedor é ruído — e ele devolve
                         * silêncio sem reclamar de nada, que foi exatamente o
                         * que aconteceu no tablet.
                         */
                        if (bits == 0) {
                            bits = bitsDaSaida(decodificador);
                            saiu.codificacao = bits == 32 ? "float 32" : bits + " bits";
                        }
                        escreverReamostrado(saida, bloco, canais, taxaOrigem, estado, bits, saiu);
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
        return saiu;
    }

    /**
     * Quantos bits por amostra o decodificador está devolvendo.
     *
     * `KEY_PCM_ENCODING` só aparece no formato de SAÍDA, e só quando não é o
     * padrão de 16 bits — ausente quer dizer 16.
     */
    private static int bitsDaSaida(MediaCodec decodificador) {
        try {
            MediaFormat saida = decodificador.getOutputFormat();
            if (saida != null && saida.containsKey(MediaFormat.KEY_PCM_ENCODING)) {
                int enc = saida.getInteger(MediaFormat.KEY_PCM_ENCODING);
                if (enc == AudioFormat.ENCODING_PCM_FLOAT) return 32;
                if (enc == AudioFormat.ENCODING_PCM_8BIT) return 8;
            }
        } catch (Throwable ignored) {
            // Formato que não se deixa perguntar: segue no padrão.
        }
        return 16;
    }

    /**
     * O ESTADO DA REAMOSTRAGEM, que atravessa os blocos.
     *
     * O decodificador entrega o áudio aos pedaços, e nenhum pedaço acaba numa
     * fronteira redonda. Sem guardar o meio da conta aqui, cada bloco
     * recomeçaria do zero e a reamostragem andaria aos trancos — um estalo a
     * cada bloco, dezenas por segundo.
     */
    private static final class Reamostrador {
        /** O meio da divisão entre a taxa da gravação e a do reconhecedor. */
        int conta;
        /** A soma do balde atual, pra tirar a média. */
        long soma;
        int quantas;
        /** A última amostra emitida, pra quando a taxa precisa SUBIR. */
        int ultimo;
    }

    /**
     * Joga o bloco decodificado no arquivo, em mono e na taxa do reconhecedor.
     *
     * POR QUE A MÉDIA, E NÃO "UMA A CADA N".
     *
     * A primeira versão pegava uma amostra a cada N e jogava o resto fora. Pra
     * responder "este tablet transcreve?" aquilo bastou. Pra transcrever de
     * verdade, não: jogar amostras fora sem filtrar antes é o que se chama
     * aliasing — tudo o que está acima de 8 kHz na gravação não desaparece, ele
     * DOBRA pra dentro da faixa da voz e vira chiado em cima das consoantes. E
     * consoante borrada é exatamente como o reconhecedor troca "pedir" por
     * "pedi", "Marcela" por "mas cela".
     *
     * A média dos valores que estão sendo colapsados é o filtro mais simples
     * que existe, e resolve a maior parte disso de graça: nada de amostra
     * jogada fora, tudo entra na conta.
     *
     * Os canais também passaram a ser MISTURADOS em vez de descartados. Numa
     * gravação de dois canais, metade da voz estava sendo deixada de lado.
     */
    private static void escreverReamostrado(
            OutputStream saida,
            byte[] bloco,
            int canais,
            int taxaOrigem,
            Reamostrador estado,
            int bits,
            Decodificado saiu) throws Exception {
        int bytesPorValor = bits / 8;
        int porAmostra = bytesPorValor * canais;
        if (porAmostra <= 0 || taxaOrigem <= 0) {
            return;
        }
        int total = bloco.length / porAmostra;
        // Folga de quatro: quando a taxa precisa SUBIR, sai mais do que entra.
        int cabem = (int) ((long) total * TAXA / taxaOrigem) + 4;
        byte[] fora = new byte[cabem * 2];
        int escritos = 0;
        for (int i = 0; i < total; i++) {
            estado.soma += misturaDe(bloco, i * porAmostra, bits, canais, bytesPorValor);
            estado.quantas++;
            estado.conta += TAXA;
            boolean primeira = true;
            while (estado.conta >= taxaOrigem && escritos + 2 <= fora.length) {
                estado.conta -= taxaOrigem;
                if (primeira) {
                    if (estado.quantas > 0) {
                        estado.ultimo = (int) (estado.soma / estado.quantas);
                    }
                    estado.soma = 0;
                    estado.quantas = 0;
                    primeira = false;
                }
                /*
                 * O PICO, limitado a 32767.
                 *
                 * Uma amostra de 16 bits vai de -32768 a 32767, e o valor
                 * absoluto de -32768 é 32768 — que foi o que apareceu na tela
                 * dele: "32768 de 32767", um número acima do próprio máximo.
                 * Não atrapalhava a transcrição, mas um medidor que passa do
                 * fim da régua faz duvidar de tudo que ele mede.
                 */
                int forca = Math.min(Math.abs(estado.ultimo), 32767);
                if (forca > saiu.pico) {
                    saiu.pico = forca;
                }
                fora[escritos++] = (byte) (estado.ultimo & 0xff);
                fora[escritos++] = (byte) ((estado.ultimo >> 8) & 0xff);
                saiu.amostras++;
            }
        }
        if (escritos > 0) {
            saida.write(fora, 0, escritos);
        }
    }

    /** Os canais de uma amostra, misturados num valor só. */
    private static int misturaDe(byte[] bloco, int base, int bits, int canais, int bytesPorValor) {
        if (canais <= 1) {
            return amostraDe(bloco, base, bits);
        }
        long soma = 0;
        for (int c = 0; c < canais; c++) {
            soma += amostraDe(bloco, base + c * bytesPorValor, bits);
        }
        return (int) (soma / canais);
    }

    /** Uma amostra, qualquer que seja o formato do decodificador, em 16 bits. */
    private static int amostraDe(byte[] bloco, int base, int bits) {
        if (bits == 32) {
            int cru = (bloco[base] & 0xff)
                    | ((bloco[base + 1] & 0xff) << 8)
                    | ((bloco[base + 2] & 0xff) << 16)
                    | ((bloco[base + 3] & 0xff) << 24);
            float f = Float.intBitsToFloat(cru);
            return (int) Math.max(-32768, Math.min(32767, f * 32767f));
        }
        if (bits == 8) {
            // PCM de 8 bits é SEM SINAL, com o silêncio em 128.
            return ((bloco[base] & 0xff) - 128) << 8;
        }
        return (short) ((bloco[base] & 0xff) | (bloco[base + 1] << 8));
    }
}
