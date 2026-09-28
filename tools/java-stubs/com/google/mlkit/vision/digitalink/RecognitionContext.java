package com.google.mlkit.vision.digitalink;

public class RecognitionContext {
    public static Builder builder() { return new Builder(); }

    public static class Builder {
        public Builder setPreContext(String preContext) { return this; }
        public Builder setWritingArea(WritingArea area) { return this; }
        public RecognitionContext build() { return new RecognitionContext(); }
    }
}
