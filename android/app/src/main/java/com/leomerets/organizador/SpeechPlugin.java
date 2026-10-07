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
        final long[] cortes = cortesDoPedido(call);

        File cru;
        final Decodificado medida;
        try {
            cru = File.createTempFile("sonda-", ".pcm", getContext().getCacheDir());
            medida = decodificarParaPcm(origem, cru, limiteUs);
            /*
             * A cópia do webm já serviu: o que se ouve daqui em diante é o
             * áudio cru. Uma reunião de uma hora são dezenas de megabytes no
             * cache — e duas cópias dela, o dobro.
             */
            //noinspection ResultOfMethodCallIgnored
            origem.delete();
        } catch (Throwable error) {
            //noinspection ResultOfMethodCallIgnored
            origem.delete();
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
                ouvirArquivo(call, pcm, idioma, medida, palavras, cortes);
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
    /**
     * ONDE PARTIR A GRAVAÇÃO — os instantes das marcas, em ms.
     *
     * Não ordena e não descarta nada, de propósito: o JavaScript casa cada
     * trecho com uma marca PELA POSIÇÃO NA LISTA. Um corte descartado aqui
     * deslocaria todos os seguintes, e cada tópico levaria a fala do vizinho.
     * Valor inválido vira zero, que produz um trecho vazio no lugar certo.
     */
    private static long[] cortesDoPedido(PluginCall call) {
        try {
            JSArray lista = call.getArray("cortes");
            if (lista == null) {
                return new long[0];
            }
            long[] fora = new long[lista.length()];
            for (int i = 0; i < fora.length; i++) {
                double ms = lista.optDouble(i, 0);
                fora[i] = Double.isNaN(ms) || Double.isInfinite(ms) || ms < 0 ? 0L : (long) ms;
            }
            return fora;
        } catch (Throwable ignored) {
            return new long[0];
        }
    }

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

    // ─── Ouvir, um tópico de cada vez ────────────────────────────────────────

    /*
     * POR QUE A GRAVAÇÃO É OUVIDA EM PEDAÇOS.
     *
     * Ele pediu a ata "separando os tópicos". O app não entende a conversa — e
     * não vai fingir que entende. Quem separa os tópicos é ele, com o ⚑ Marcar
     * durante a reunião. O que faltava era a FALA de cada tópico: o reconhecedor
     * devolve um texto corrido, sem dizer em que segundo cada frase foi dita, e
     * sem isso não há como cortar o texto nas marcas.
     *
     * Então o corte vem antes: o áudio é partido nas marcas e cada pedaço é
     * ouvido numa sessão própria. O texto de cada tópico é, por construção, o
     * que foi dito entre aquela marca e a próxima — sem adivinhação nenhuma.
     *
     * Sem marca nenhuma é UM pedaço só, o arquivo inteiro: exatamente o caminho
     * que já funcionou no tablet dele.
     */

    /** Um pedaço da gravação entre dois cortes, e o que se ouviu nele. */
    private static final class Trecho {
        /** Em amostras, desde o começo do áudio. */
        long inicio;
        /** Em amostras, exclusivo. */
        long fim;
        String texto = "";
        String trilha = "";
        /** Código do reconhecedor quando foi erro DE VERDADE (silêncio não conta). */
        int codigo = 0;
        /** O reconhecedor não deu sinal nenhum até o prazo. */
        boolean calado;
    }

    /** Avisado a cada pedaço de fala reconhecido no trecho em andamento. */
    private interface Andamento {
        void segmento(String textoDoTrecho);
    }

    /**
     * Respiro entre uma sessão e a próxima.
     *
     * Destruir um reconhecedor e criar outro no mesmo instante pode encontrar o
     * serviço de fala ainda ocupado com o anterior. Um terço de segundo por
     * tópico não pesa numa reunião, e evita o ERROR_RECOGNIZER_BUSY.
     */
    private static final long PAUSA_ENTRE_TRECHOS_MS = 300L;

    /** Se mesmo assim vier "ocupado", espera isto e tenta UMA vez mais. */
    private static final long ESPERA_SE_OCUPADO_MS = 800L;

    /** Trecho mais curto que isto não vale uma sessão: ninguém diz nada em meio segundo. */
    private static final long TRECHO_MINIMO_AMOSTRAS = TAXA / 2;

    private void ouvirArquivo(
            final PluginCall call,
            final File pcm,
            final String idioma,
            final Decodificado medida,
            final ArrayList<String> palavras,
            final long[] cortesMs) throws Exception {
        if (Build.VERSION.SDK_INT < 31) {
            JSObject r = new JSObject();
            r.put("ok", false);
            r.put("etapa", "reconhecer");
            r.put("erro", "Este Android é anterior ao 12, e não sabe ler um arquivo de áudio — só o microfone ao vivo.");
            call.resolve(r);
            return;
        }

        final List<Trecho> trechos = dividir(pcm, medida.amostras, cortesMs);
        final int[] atual = { 0 };
        final File[] fatia = { null };
        final Runnable[] proximo = new Runnable[1];

        proximo[0] = () -> {
            // A fatia do trecho anterior já serviu. O arquivo inteiro, não:
            // ele é apagado só no fim.
            if (fatia[0] != null && !fatia[0].equals(pcm)) {
                //noinspection ResultOfMethodCallIgnored
                fatia[0].delete();
            }
            fatia[0] = null;

            final int i = atual[0];
            /*
             * Reconhecedor calado num trecho vai ficar calado em todos: é o
             * serviço de fala que não está respondendo, não o pedaço de áudio.
             * Esperar o prazo inteiro mais N vezes seria deixar a tela parada
             * por minutos pra chegar na mesma resposta.
             */
            boolean desistir = i > 0 && trechos.get(i - 1).calado;
            if (i >= trechos.size() || desistir) {
                responderTrechos(call, trechos, medida, palavras, pcm);
                return;
            }

            final Trecho t = trechos.get(i);
            avisar(trechos, i, "");
            if (t.fim - t.inicio < TRECHO_MINIMO_AMOSTRAS) {
                atual[0]++;
                proximo[0].run();
                return;
            }

            // Recortar é leitura e escrita de disco: fora da linha principal,
            // pra tela não engasgar num tópico de dez minutos.
            new Thread(() -> {
                File arquivo;
                try {
                    arquivo = trechos.size() == 1 ? pcm : fatiar(pcm, t, getContext().getCacheDir());
                } catch (Throwable error) {
                    Log.e(TAG, "organizador: não recortou o trecho " + (i + 1), error);
                    t.trilha = t.trilha + "não deu pra recortar;";
                    arquivo = null;
                }
                final File pronto = arquivo;
                getActivity().runOnUiThread(() -> {
                    if (pronto == null) {
                        atual[0]++;
                        proximo[0].run();
                        return;
                    }
                    fatia[0] = pronto;
                    try {
                        ouvirTrecho(
                                pronto,
                                idioma,
                                palavras,
                                t,
                                prazoPara((t.fim - t.inicio) / (double) TAXA),
                                parcial -> avisar(trechos, i, parcial),
                                () -> {
                                    atual[0]++;
                                    getBridge().getWebView().postDelayed(proximo[0], PAUSA_ENTRE_TRECHOS_MS);
                                },
                                0);
                    } catch (Throwable error) {
                        Log.e(TAG, "organizador: reconhecedor não ficou de pé no trecho " + (i + 1), error);
                        t.trilha = t.trilha + "não ficou de pé;";
                        atual[0]++;
                        proximo[0].run();
                    }
                });
            }).start();
        };

        proximo[0].run();
    }

    /**
     * Uma sessão do reconhecedor sobre um arquivo — o caminho que funcionou no
     * tablet dele, sem mudar nada no pedido: mesmo áudio, mesmo modo
     * segmentado, mesmas dicas. O que mudou é pra onde vai o resultado: pro
     * trecho, e não direto pra tela.
     */
    private void ouvirTrecho(
            final File pcm,
            final String idioma,
            final ArrayList<String> palavras,
            final Trecho t,
            final long prazo,
            final Andamento andamento,
            final Runnable fim,
            final int tentativa) throws Exception {
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
        final boolean[] acabou = { false };
        /*
         * A TRILHA: que avisos o reconhecedor deu, na ordem.
         *
         * É o que separa "ele nem acordou" de "ele ouviu e não entendeu" — e
         * sem essa distinção não dá pra saber se o problema é o arquivo, o
         * áudio ou o serviço de fala do aparelho.
         */
        final StringBuilder trilha = new StringBuilder();

        final Runnable soltar = () -> {
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
        };

        final Runnable encerrar = () -> {
            if (acabou[0]) {
                return;
            }
            acabou[0] = true;
            soltar.run();
            t.texto = juntar(pedacos);
            t.trilha = t.trilha + trilha;
            if (trilha.length() == 0) {
                t.calado = true;
            }
            fim.run();
        };

        reconhecedor.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) { trilha.append("pronto;"); }
            @Override public void onBeginningOfSpeech() { trilha.append("começou;"); }
            @Override public void onRmsChanged(float rms) { }
            @Override public void onBufferReceived(byte[] buffer) { }
            @Override public void onEndOfSpeech() { trilha.append("fim da fala;"); }

            @Override
            public void onError(int code) {
                if (acabou[0]) {
                    return;
                }
                acabou[0] = true;
                soltar.run();
                if (code == SpeechRecognizer.ERROR_RECOGNIZER_BUSY && tentativa == 0) {
                    t.trilha = t.trilha + trilha + "ocupado, tentando de novo;";
                    getBridge().getWebView().postDelayed(() -> {
                        try {
                            ouvirTrecho(pcm, idioma, palavras, t, prazo, andamento, fim, tentativa + 1);
                        } catch (Throwable error) {
                            t.codigo = code;
                            fim.run();
                        }
                    }, ESPERA_SE_OCUPADO_MS);
                    return;
                }
                /*
                 * Tópico em que ninguém disse nada não é erro: é silêncio. O
                 * reconhecedor responde isso com NO_MATCH ou SPEECH_TIMEOUT, e
                 * tratar como falha faria UM tópico calado derrubar a ata.
                 */
                if (code != SpeechRecognizer.ERROR_NO_MATCH && code != SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                    t.codigo = code;
                }
                // O que veio antes do erro continua valendo.
                t.texto = juntar(pedacos);
                t.trilha = t.trilha + trilha + "erro " + code + ";";
                fim.run();
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
                encerrar.run();
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
                    andamento.segmento(juntar(pedacos));
                }
            }

            @Override
            public void onEndOfSegmentedSession() {
                trilha.append("fim da sessão;");
                encerrar.run();
            }

            @Override public void onEvent(int type, Bundle params) { }
        });

        reconhecedor.startListening(pedido);

        // Rede de segurança: reconhecedor que não volta não pode deixar a tela
        // esperando pra sempre.
        getBridge().getWebView().postDelayed(encerrar, prazo);
    }

    /**
     * Conta o andamento ANTES do fim.
     *
     * Uma reunião de meia hora leva minutos pra transcrever, e o `resolve` só
     * vem no fim. Sem isto a tela fica parada o tempo todo — e tela parada é
     * indistinguível de tela travada, que é justamente o que ele já relatou
     * três vezes no fluxograma. Agora também diz EM QUE TÓPICO está.
     */
    private void avisar(List<Trecho> trechos, int atual, String parcialDoAtual) {
        try {
            List<String> ate = new ArrayList<>();
            for (int k = 0; k < atual && k < trechos.size(); k++) {
                ate.add(trechos.get(k).texto);
            }
            ate.add(parcialDoAtual);
            JSObject passo = new JSObject();
            passo.put("texto", juntar(ate));
            passo.put("topico", atual + 1);
            passo.put("topicos", trechos.size());
            notifyListeners("andamento", passo);
        } catch (Throwable ignored) {
            // Contar o andamento nunca pode atrapalhar o resultado.
        }
    }

    /** Junta o que cada trecho ouviu e devolve pra tela, trecho por trecho. */
    private void responderTrechos(
            PluginCall call,
            List<Trecho> trechos,
            Decodificado medida,
            ArrayList<String> palavras,
            File pcm) {
        //noinspection ResultOfMethodCallIgnored
        pcm.delete();

        List<String> textos = new ArrayList<>();
        StringBuilder trilhas = new StringBuilder();
        int primeiroErro = 0;
        boolean calado = false;
        JSArray lista = new JSArray();
        for (int i = 0; i < trechos.size(); i++) {
            Trecho t = trechos.get(i);
            textos.add(t.texto);
            if (trechos.size() > 1) {
                if (trilhas.length() > 0) {
                    trilhas.append(" | ");
                }
                trilhas.append(i + 1).append(": ");
            }
            trilhas.append(t.trilha);
            if (primeiroErro == 0 && t.codigo != 0) {
                primeiroErro = t.codigo;
            }
            calado = calado || t.calado;
            try {
                JSObject o = new JSObject();
                o.put("inicioMs", t.inicio * 1000L / TAXA);
                o.put("fimMs", t.fim * 1000L / TAXA);
                o.put("texto", t.texto);
                lista.put(o);
            } catch (Throwable ignored) {
                // Um trecho que não se deixa descrever não pode derrubar os outros.
            }
        }

        String tudo = juntar(textos);
        JSObject r = new JSObject();
        r.put("ok", tudo.length() > 0);
        r.put("etapa", "reconhecer");
        r.put("texto", tudo);
        r.put("trechos", lista);
        medida.contar(r);
        r.put("trilha", trilhas.toString());
        r.put("dicas", palavras.size());
        if (tudo.length() == 0) {
            if (primeiroErro != 0) {
                r.put("codigo", primeiroErro);
                r.put("erro", explicar(primeiroErro));
            } else if (calado) {
                r.put("erro", "O reconhecedor não deu sinal nenhum — nem resultado, nem erro. O serviço"
                        + " de fala deste aparelho provavelmente ignora o arquivo e fica esperando o"
                        + " microfone.");
            } else {
                r.put("erro", "O reconhecedor respondeu (" + trilhas + ") mas não devolveu texto nenhum.");
            }
        }
        call.resolve(r);
    }

    // ─── Onde cortar ─────────────────────────────────────────────────────────

    /**
     * Quanto o corte pode andar pra achar silêncio, pra cada lado.
     *
     * A marca é tocada COM a reunião acontecendo — quase sempre no meio de uma
     * frase. Cortar exatamente ali parte uma palavra em duas, e o reconhecedor
     * erra as duas metades. Andando até a pausa mais próxima, a palavra fica
     * inteira de um lado só. Um segundo e meio cobre a pausa entre duas frases
     * sem deslocar o tópico de lugar.
     */
    static final int RAIO_AJUSTE_MS = 1500;

    /** Tamanho do pedaço em que a energia é medida. 40 ms é menos que uma sílaba. */
    static final int QUADRO_MS = 40;

    /**
     * Parte a gravação nos cortes pedidos.
     *
     * Devolve SEMPRE `cortes + 1` trechos, na ordem pedida, mesmo que algum
     * fique vazio. É essa contagem fixa que deixa o JavaScript casar cada
     * trecho com a marca que o abriu — se um corte inválido sumisse daqui,
     * todos os tópicos depois dele levariam a fala do vizinho.
     */
    static List<Trecho> dividir(File pcm, long total, long[] cortesMs) {
        List<Long> limites = new ArrayList<>();
        limites.add(0L);
        for (long ms : cortesMs) {
            long alvo = Math.max(0L, ms) * TAXA / 1000L;
            long ajustado = alvo;
            try {
                if (alvo > 0 && alvo < total) {
                    ajustado = ajustarAoSilencio(pcm, alvo, total);
                }
            } catch (Throwable ignored) {
                // Sem conseguir ler a vizinhança, corta onde ele marcou.
            }
            // Nunca antes do corte anterior, nunca depois do fim: a ordem dos
            // tópicos é a ordem das marcas, e é ela que casa trecho com marca.
            long anterior = limites.get(limites.size() - 1);
            limites.add(Math.max(anterior, Math.min(total, ajustado)));
        }
        limites.add(Math.max(limites.get(limites.size() - 1), total));

        List<Trecho> fora = new ArrayList<>();
        for (int i = 0; i + 1 < limites.size(); i++) {
            Trecho t = new Trecho();
            t.inicio = limites.get(i);
            t.fim = limites.get(i + 1);
            fora.add(t);
        }
        return fora;
    }

    /** O ponto mais quieto perto do alvo, em amostras desde o começo. */
    static long ajustarAoSilencio(File pcm, long alvo, long total) throws java.io.IOException {
        long raio = (long) TAXA * RAIO_AJUSTE_MS / 1000L;
        long ini = Math.max(0L, alvo - raio);
        long fim = Math.min(total, alvo + raio);
        if (fim - ini < 2) {
            return Math.max(0L, Math.min(total, alvo));
        }
        short[] janela = lerAmostras(pcm, ini, fim);
        return ini + quietoMaisPerto(janela, (int) (alvo - ini), TAXA * QUADRO_MS / 1000);
    }

    /**
     * O índice do trecho mais quieto da janela — e, entre os igualmente
     * quietos, o mais perto do alvo.
     *
     * O desempate importa: em silêncio de verdade todos os quadros empatam, e
     * sem ele o corte iria parar na borda da janela, um segundo e meio longe
     * de onde ele marcou, sem motivo nenhum.
     */
    static int quietoMaisPerto(short[] janela, int alvo, int quadro) {
        int n = janela.length;
        if (n == 0) {
            return 0;
        }
        int alvoPreso = Math.max(0, Math.min(n - 1, alvo));
        if (quadro <= 0 || n < quadro) {
            return alvoPreso;
        }
        int passo = Math.max(1, quadro / 2);
        int quadros = (n - quadro) / passo + 1;
        double[] energia = new double[quadros];
        double menor = Double.MAX_VALUE;
        for (int k = 0; k < quadros; k++) {
            int base = k * passo;
            double soma = 0;
            for (int j = 0; j < quadro; j++) {
                double v = janela[base + j];
                soma += v * v;
            }
            energia[k] = soma / quadro;
            menor = Math.min(menor, energia[k]);
        }
        /*
         * "Tão quieto quanto o mais quieto": até uma vez e meia a energia dele,
         * mais um piso de ruído desprezível (um valor de 10 numa régua de
         * 32767). Ruído de sala varia bem mais que 5% de um quadro pro outro,
         * e com folga apertada o corte correria até a pausa mais LONGE só
         * porque lá o ar-condicionado estava um pouco mais baixo. Fala, por
         * outro lado, tem dez a cem vezes a energia do ruído: não entra no
         * empate. Sem o piso, silêncio digital puro (energia zero) não
         * deixaria empate nenhum.
         */
        double limite = menor * 1.5 + 100.0;
        int melhor = alvoPreso;
        int melhorDistancia = Integer.MAX_VALUE;
        for (int k = 0; k < quadros; k++) {
            if (energia[k] > limite) {
                continue;
            }
            int centro = k * passo + quadro / 2;
            int distancia = Math.abs(centro - alvoPreso);
            if (distancia < melhorDistancia) {
                melhorDistancia = distancia;
                melhor = centro;
            }
        }
        return Math.max(0, Math.min(n - 1, melhor));
    }

    /** Amostras [ini, fim) do arquivo cru. Arquivo mais curto devolve o que tiver. */
    static short[] lerAmostras(File pcm, long ini, long fim) throws java.io.IOException {
        int quantas = (int) Math.max(0L, fim - ini);
        byte[] bytes = new byte[quantas * 2];
        int lidos = 0;
        try (java.io.RandomAccessFile in = new java.io.RandomAccessFile(pcm, "r")) {
            in.seek(ini * 2L);
            while (lidos < bytes.length) {
                int n = in.read(bytes, lidos, bytes.length - lidos);
                if (n < 0) {
                    break;
                }
                lidos += n;
            }
        }
        short[] fora = new short[lidos / 2];
        for (int i = 0; i < fora.length; i++) {
            fora[i] = (short) ((bytes[i * 2] & 0xff) | (bytes[i * 2 + 1] << 8));
        }
        return fora;
    }

    /** Copia o trecho pra um arquivo próprio, que é o que o reconhecedor lê. */
    static File fatiar(File pcm, Trecho t, File pasta) throws java.io.IOException {
        File destino = File.createTempFile("trecho-", ".pcm", pasta);
        copiarAmostras(pcm, destino, t.inicio, t.fim);
        return destino;
    }

    static void copiarAmostras(File origem, File destino, long inicio, long fim) throws java.io.IOException {
        try (java.io.RandomAccessFile in = new java.io.RandomAccessFile(origem, "r");
             OutputStream out = new FileOutputStream(destino)) {
            in.seek(inicio * 2L);
            long faltam = Math.max(0L, fim - inicio) * 2L;
            byte[] buffer = new byte[64 * 1024];
            while (faltam > 0) {
                int n = in.read(buffer, 0, (int) Math.min(buffer.length, faltam));
                if (n < 0) {
                    break;
                }
                out.write(buffer, 0, n);
                faltam -= n;
            }
        }
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
