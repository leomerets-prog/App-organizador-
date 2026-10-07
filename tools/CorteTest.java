import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.List;

/**
 * ONDE A GRAVAÇÃO É PARTIDA EM TÓPICOS.
 *
 * A ata separa os tópicos pelas marcas que ele toca durante a reunião, e cada
 * tópico leva a fala que veio depois da sua marca. Pra isso o plugin parte o
 * áudio nas marcas e ouve cada pedaço numa sessão própria.
 *
 * Duas coisas aqui podem estragar a ata sem dar erro nenhum:
 *
 *   1. CORTAR NO MEIO DA PALAVRA. A marca é tocada com alguém falando; cortar
 *      exatamente ali parte uma palavra em duas, e o reconhecedor erra as duas
 *      metades. O corte anda até a pausa mais próxima — e só até ela.
 *
 *   2. TÓPICO LEVANDO A FALA DO VIZINHO. O JavaScript casa trecho com marca
 *      pela POSIÇÃO. Se um corte inválido sumisse, todos depois dele ficariam
 *      deslocados. Por isso a divisão devolve sempre cortes + 1 trechos.
 *
 * Como o ReamostraTest, chama os métodos DE VERDADE por reflexão.
 */
public class CorteTest {

    private static final int TAXA = 16_000;
    private static int falhas = 0;

    private static void conf(boolean ok, String msg) {
        System.out.println((ok ? "  \u001b[32m✓\u001b[0m " : "  \u001b[31m✗\u001b[0m ") + msg);
        if (!ok) falhas++;
    }

    public static void main(String[] args) throws Exception {
        System.out.println("\n  Onde a gravação é partida em tópicos\n");
        final int QUADRO = TAXA * 40 / 1000;

        // ── 1. O corte anda até a pausa ───────────────────────────────────
        // Três segundos de fala com uma pausa de 300 ms entre 1,8 s e 2,1 s.
        short[] fala = tom(3.0);
        silenciar(fala, 1.8, 2.1);
        int alvo = amostra(1.2);
        int achado = quieto(fala, alvo, QUADRO);
        conf(achado >= amostra(1.8) && achado <= amostra(2.1),
                "marcado no meio da frase (1,2 s), o corte vai pra pausa: "
                        + segundos(achado) + " s (pausa entre 1,8 e 2,1)");

        // ── 2. Já numa pausa, ele não sai dela ────────────────────────────
        int dentro = quieto(fala, amostra(1.95), QUADRO);
        conf(Math.abs(dentro - amostra(1.95)) <= QUADRO,
                "marcado já na pausa, o corte fica onde está: " + segundos(dentro) + " s");

        // ── 3. Sem lugar mais quieto, não inventa ─────────────────────────
        // Tom de força constante: nenhum quadro é mais quieto que outro.
        short[] constante = new short[amostra(3.0)];
        for (int i = 0; i < constante.length; i++) {
            constante[i] = (short) (Math.sin(2 * Math.PI * 220 * i / (double) TAXA) * 12_000);
        }
        int semPausa = quieto(constante, amostra(1.5), QUADRO);
        conf(Math.abs(semPausa - amostra(1.5)) <= QUADRO,
                "som sem vale nenhum: o corte fica na marca (" + segundos(semPausa) + " s)");

        /*
         * Fala sem pausa entre frases ainda tem vales entre as sílabas. A
         * primeira versão deste caso usava este sinal esperando que o corte
         * não andasse — e ele andou 80 ms, CERTO: foi pro vale mais próximo.
         * Errada estava a expectativa. Cortar no vale da sílaba é melhor que
         * cortar no pico dela.
         */
        short[] silabas = tom(3.0);
        int vale = quieto(silabas, amostra(1.5), QUADRO);
        conf(vale >= amostra(1.53) && vale <= amostra(1.63),
                "fala corrida: o corte vai pro vale entre sílabas mais perto (" + segundos(vale)
                        + " s, vale em 1,58)");

        // ── 4. Silêncio puro não empurra o corte pra borda ────────────────
        short[] mudo = new short[amostra(3.0)];
        int noSilencio = quieto(mudo, amostra(1.5), QUADRO);
        conf(Math.abs(noSilencio - amostra(1.5)) <= QUADRO,
                "silêncio puro: o corte fica na marca, não vai pra borda (" + segundos(noSilencio) + " s)");

        // ── 5. A busca pela pausa tem limite ──────────────────────────────
        // Pausa a 2,3 s da marca: longe demais. Mover até lá trocaria o tópico
        // de lugar.
        short[] longe = tom(6.0);
        silenciar(longe, 4.5, 4.8);
        File arquivo = gravar(longe);
        long ajustado = ajustar(arquivo, amostra(2.2), longe.length);
        conf(ajustado < amostra(4.5),
                "pausa a mais de 1,5 s da marca não puxa o corte: " + segundos((int) ajustado) + " s");

        // ── 6. Pelo arquivo, como no aparelho ─────────────────────────────
        File comPausa = gravar(fala);
        long peloArquivo = ajustar(comPausa, amostra(1.2), fala.length);
        conf(peloArquivo >= amostra(1.8) && peloArquivo <= amostra(2.1),
                "lendo do arquivo, o corte também vai pra pausa: " + segundos((int) peloArquivo) + " s");

        // ── 7. Sempre cortes + 1 trechos, na ordem pedida ─────────────────
        List<?> tres = dividir(comPausa, fala.length, new long[] { 1200, 2600 });
        conf(tres.size() == 3, "dois cortes viram três trechos (" + tres.size() + ")");
        long[][] limites = limites(tres);
        conf(limites[0][0] == 0 && limites[2][1] == fala.length,
                "os trechos cobrem a gravação inteira, do zero ao fim");
        boolean emendados = limites[0][1] == limites[1][0] && limites[1][1] == limites[2][0];
        conf(emendados, "e um começa exatamente onde o outro termina — nada se perde entre eles");
        conf(limites[0][1] >= amostra(1.8) && limites[0][1] <= amostra(2.1),
                "a divisão usa o ajuste: o tópico 2 começa na pausa ("
                        + segundos((int) limites[0][1]) + " s), não no meio da palavra (1,2 s)");

        // Corte fora de ordem, depois do fim e zero: a CONTAGEM não muda.
        List<?> torto = dividir(comPausa, fala.length, new long[] { 2000, 500, 99_000, 0 });
        conf(torto.size() == 5,
                "cortes inválidos não somem — quatro cortes, cinco trechos (" + torto.size() + ")");
        long[][] t = limites(torto);
        boolean emOrdem = true;
        for (int i = 0; i < t.length; i++) {
            if (t[i][1] < t[i][0]) emOrdem = false;
            if (i > 0 && t[i][0] != t[i - 1][1]) emOrdem = false;
        }
        conf(emOrdem, "e nenhum trecho anda pra trás nem pula pedaço");

        // ── 8. A fatia copiada é a fatia pedida ───────────────────────────
        short[] numerado = new short[4000];
        for (int i = 0; i < numerado.length; i++) numerado[i] = (short) (i - 2000);
        File origem = gravar(numerado);
        File destino = File.createTempFile("corte-", ".pcm");
        destino.deleteOnExit();
        copiar(origem, destino, 1000, 1500);
        short[] lido = ler(destino);
        boolean igual = lido.length == 500;
        for (int i = 0; igual && i < lido.length; i++) igual = lido[i] == numerado[1000 + i];
        conf(igual, "a fatia de 1000 a 1500 tem exatamente aquelas 500 amostras (" + lido.length + ")");

        System.out.println(falhas == 0 ? "\n  tudo certo\n" : "\n  " + falhas + " FALHA(S)\n");
        System.exit(falhas == 0 ? 0 : 1);
    }

    // ─── Sinais ──────────────────────────────────────────────────────────

    /** Fala imitada: um tom com a força mudando, que nunca fica quieto. */
    private static short[] tom(double segundos) {
        short[] fora = new short[amostra(segundos)];
        for (int i = 0; i < fora.length; i++) {
            double envelope = 0.6 + 0.4 * Math.sin(2 * Math.PI * 3 * i / (double) TAXA);
            fora[i] = (short) (Math.sin(2 * Math.PI * 220 * i / (double) TAXA) * 12_000 * envelope);
        }
        return fora;
    }

    private static void silenciar(short[] sinal, double de, double ate) {
        for (int i = amostra(de); i < amostra(ate) && i < sinal.length; i++) {
            // Ruído de fundo de sala, não silêncio digital.
            sinal[i] = (short) ((i * 7919) % 41 - 20);
        }
    }

    private static int amostra(double segundos) {
        return (int) Math.round(segundos * TAXA);
    }

    private static String segundos(int amostra) {
        return String.format("%.2f", amostra / (double) TAXA);
    }

    private static File gravar(short[] amostras) throws Exception {
        File f = File.createTempFile("corte-", ".pcm");
        f.deleteOnExit();
        byte[] bytes = new byte[amostras.length * 2];
        for (int i = 0; i < amostras.length; i++) {
            bytes[i * 2] = (byte) (amostras[i] & 0xff);
            bytes[i * 2 + 1] = (byte) ((amostras[i] >> 8) & 0xff);
        }
        try (FileOutputStream out = new FileOutputStream(f)) {
            out.write(bytes);
        }
        return f;
    }

    private static short[] ler(File f) throws Exception {
        return (short[]) metodo("lerAmostras").invoke(null, f, 0L, f.length() / 2);
    }

    // ─── A ponte com o código de verdade ─────────────────────────────────

    private static Method metodo(String nome) throws Exception {
        Class<?> c = Class.forName("com.leomerets.organizador.SpeechPlugin");
        for (Method m : c.getDeclaredMethods()) {
            if (m.getName().equals(nome)) {
                m.setAccessible(true);
                return m;
            }
        }
        throw new IllegalStateException("não achei " + nome + " no plugin");
    }

    private static int quieto(short[] janela, int alvo, int quadro) throws Exception {
        return (Integer) metodo("quietoMaisPerto").invoke(null, janela, alvo, quadro);
    }

    private static long ajustar(File pcm, long alvo, long total) throws Exception {
        return (Long) metodo("ajustarAoSilencio").invoke(null, pcm, alvo, total);
    }

    private static List<?> dividir(File pcm, long total, long[] cortes) throws Exception {
        return (List<?>) metodo("dividir").invoke(null, pcm, total, cortes);
    }

    private static void copiar(File de, File para, long ini, long fim) throws Exception {
        metodo("copiarAmostras").invoke(null, de, para, ini, fim);
    }

    private static long[][] limites(List<?> trechos) throws Exception {
        long[][] fora = new long[trechos.size()][2];
        for (int i = 0; i < trechos.size(); i++) {
            Object t = trechos.get(i);
            Field ini = t.getClass().getDeclaredField("inicio");
            Field fim = t.getClass().getDeclaredField("fim");
            ini.setAccessible(true);
            fim.setAccessible(true);
            fora[i][0] = ini.getLong(t);
            fora[i][1] = fim.getLong(t);
        }
        return fora;
    }
}
