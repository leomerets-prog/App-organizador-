package android.os;

public class Build {
    public static class VERSION {
        /*
         * Não é `final` de propósito: com `static final int` o javac dobra a
         * comparação em constante e some com o ramo do outro lado — justamente
         * o ramo que só roda no Android velho, que é onde o erro se esconderia.
         */
        public static int SDK_INT = 0;
    }
}
