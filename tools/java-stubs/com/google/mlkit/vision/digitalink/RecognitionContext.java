package com.google.mlkit.vision.digitalink;

/**
 * ATENÇÃO — o construtor de verdade EXIGE todos os campos.
 *
 * Deixar `setPreContext` de fora faz `build()` estourar em tempo de execução
 * com "Missing required properties: preContext". A sombra não tem como impor
 * isso (é contrato de execução, não de tipo), e foi exatamente esse erro que
 * segurou a transcrição inteira: ele acontecia antes de a letra ser lida e
 * chegava na tela como "não consegui ler".
 *
 * Quem mexer aqui: preencha SEMPRE os dois campos, ou não monte contexto nenhum
 * e use `recognize(ink)` sem contexto.
 */
public class RecognitionContext {
    public static Builder builder() { return new Builder(); }

    public static class Builder {
        public Builder setPreContext(String preContext) { return this; }
        public Builder setWritingArea(WritingArea area) { return this; }
        public RecognitionContext build() { return new RecognitionContext(); }
    }
}
