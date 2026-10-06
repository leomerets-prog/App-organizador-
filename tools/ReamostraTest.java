import java.io.ByteArrayOutputStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;

/**
 * O reamostrador do plugin, medido com tom puro.
 *
 * Chama o MÉTODO DE VERDADE por reflexão, em vez de copiar o corpo dele pra cá:
 * cópia envelhece em silêncio e passa a medir outra coisa, que é a pior forma
 * de ter um caso de teste.
 *
 * As três perguntas:
 *
 *   1. sai a quantidade certa de amostras? (48 kHz → 16 kHz é um terço)
 *   2. a voz passa inteira? (um tom de 1 kHz tem que sobreviver)
 *   3. o agudo que NÃO CABE é abafado, em vez de dobrar pra dentro da voz?
 *
 * A terceira é a que justifica a mudança toda. Um tom de 15 kHz não cabe em
 * 16 kHz de taxa (o limite é 8 kHz): jogando amostras fora, ele reaparece como
 * um tom de 1 kHz ALTO, bem no meio da faixa da fala. Tirando a média, some.
 */
public class ReamostraTest {

    private static int falhas = 0;

    private static void conf(boolean ok, String msg) {
        System.out.println((ok ? "  \u001b[32m✓\u001b[0m " : "  \u001b[31m✗\u001b[0m ") + msg);
        if (!ok) falhas++;
    }

    public static void main(String[] args) throws Exception {
        final int ORIGEM = 48_000;
        final int DESTINO = 16_000;
        final int SEGUNDOS = 1;

        System.out.println("\n  O caminho do áudio — reamostragem de 48 kHz pra 16 kHz\n");

        short[] mil = reamostrar(tom(1_000, ORIGEM, SEGUNDOS, 1), 1, ORIGEM);
        short[] quinze = reamostrar(tom(15_000, ORIGEM, SEGUNDOS, 1), 1, ORIGEM);

        // 1. A quantidade.
        int esperado = ORIGEM * SEGUNDOS / 3;
        conf(Math.abs(mil.length - esperado) <= 2,
                "saíram " + mil.length + " amostras (esperado ~" + esperado + ")");

        // 2. A voz passa.
        int picoVoz = pico(mil);
        conf(picoVoz > 20_000,
                "um tom de 1 kHz (faixa da voz) atravessa inteiro: pico " + picoVoz + " de 32767");

        /*
         * 3. O agudo que não cabe.
         *
         * MEDIDO, com e sem a correção: pegando uma amostra a cada três, um
         * tom de 15 kHz atravessa com pico 30000 — tão alto quanto a voz, e
         * dobrado pra dentro dela como se fosse um tom de 1 kHz. Tirando a
         * média, cai pra 2346.
         *
         * O limite é um quinto. A primeira versão deste caso pedia um terço e
         * PASSAVA com o reamostrador antigo — medir a coisa errada é pior que
         * não medir, porque dá a sensação de estar conferido.
         */
        int picoAgudo = pico(quinze);
        conf(picoAgudo < picoVoz / 5,
                "um tom de 15 kHz (que não cabe) é abafado: pico " + picoAgudo
                        + ", contra " + picoVoz + " da voz");

        // 4. Dois canais viram um, sem perder metade da conversa.
        short[] esquerda = tom(1_000, ORIGEM, SEGUNDOS, 1);
        short[] estereo = new short[esquerda.length * 2];
        for (int i = 0; i < esquerda.length; i++) {
            estereo[i * 2] = 0;              // canal esquerdo mudo
            estereo[i * 2 + 1] = esquerda[i]; // toda a voz no direito
        }
        short[] misturado = reamostrar(estereo, 2, ORIGEM);
        conf(pico(misturado) > 8_000,
                "voz só no canal direito não é jogada fora: pico " + pico(misturado));

        // 5. O medidor não passa do fim da régua.
        short[] noLimite = new short[480];
        for (int i = 0; i < noLimite.length; i++) noLimite[i] = -32768;
        int picoRelatado = picoDe(noLimite, 1, ORIGEM);
        conf(picoRelatado <= 32767,
                "o pico relatado não passa de 32767 (veio " + picoRelatado + ")");

        System.out.println(falhas == 0 ? "\n  tudo certo\n" : "\n  " + falhas + " FALHA(S)\n");
        System.exit(falhas == 0 ? 0 : 1);
    }

    /** Um tom puro em PCM 16 bits, com os canais todos iguais. */
    private static short[] tom(double hz, int taxa, int segundos, int canais) {
        int quadros = taxa * segundos;
        short[] fora = new short[quadros * canais];
        for (int i = 0; i < quadros; i++) {
            double v = Math.sin(2 * Math.PI * hz * i / taxa) * 30_000;
            for (int c = 0; c < canais; c++) fora[i * canais + c] = (short) v;
        }
        return fora;
    }

    private static int pico(short[] amostras) {
        int maior = 0;
        for (short s : amostras) maior = Math.max(maior, Math.abs(s));
        return maior;
    }

    // ─── A ponte com o código de verdade ─────────────────────────────────────

    private static Class<?> plugin() throws Exception {
        return Class.forName("com.leomerets.organizador.SpeechPlugin");
    }

    private static Object nova(String nome) throws Exception {
        Class<?> c = Class.forName("com.leomerets.organizador.SpeechPlugin$" + nome);
        Constructor<?> ctor = c.getDeclaredConstructors()[0];
        ctor.setAccessible(true);
        return ctor.newInstance();
    }

    private static Method metodo() throws Exception {
        for (Method m : plugin().getDeclaredMethods()) {
            if (m.getName().equals("escreverReamostrado")) {
                m.setAccessible(true);
                return m;
            }
        }
        throw new IllegalStateException("não achei escreverReamostrado no plugin");
    }

    /** Roda o reamostrador de verdade e devolve o que ele escreveu. */
    private static short[] reamostrar(short[] entrada, int canais, int taxaOrigem) throws Exception {
        ByteArrayOutputStream saida = new ByteArrayOutputStream();
        Object estado = nova("Reamostrador");
        Object medida = nova("Decodificado");
        // Em blocos, como o decodificador entrega — é assim que o estado entre
        // blocos é posto à prova.
        int porBloco = 1024;
        for (int inicio = 0; inicio < entrada.length; inicio += porBloco * canais) {
            int fim = Math.min(inicio + porBloco * canais, entrada.length);
            byte[] bloco = paraBytes(entrada, inicio, fim);
            metodo().invoke(null, saida, bloco, canais, taxaOrigem, estado, 16, medida);
        }
        byte[] bytes = saida.toByteArray();
        short[] fora = new short[bytes.length / 2];
        for (int i = 0; i < fora.length; i++) {
            fora[i] = (short) ((bytes[i * 2] & 0xff) | (bytes[i * 2 + 1] << 8));
        }
        return fora;
    }

    /** O pico que o plugin RELATA, que é outro número que o da onda. */
    private static int picoDe(short[] entrada, int canais, int taxaOrigem) throws Exception {
        ByteArrayOutputStream saida = new ByteArrayOutputStream();
        Object estado = nova("Reamostrador");
        Object medida = nova("Decodificado");
        metodo().invoke(null, saida, paraBytes(entrada, 0, entrada.length), canais, taxaOrigem, estado, 16, medida);
        java.lang.reflect.Field campo = medida.getClass().getDeclaredField("pico");
        campo.setAccessible(true);
        return campo.getInt(medida);
    }

    private static byte[] paraBytes(short[] amostras, int inicio, int fim) {
        byte[] fora = new byte[(fim - inicio) * 2];
        for (int i = inicio; i < fim; i++) {
            fora[(i - inicio) * 2] = (byte) (amostras[i] & 0xff);
            fora[(i - inicio) * 2 + 1] = (byte) ((amostras[i] >> 8) & 0xff);
        }
        return fora;
    }
}
