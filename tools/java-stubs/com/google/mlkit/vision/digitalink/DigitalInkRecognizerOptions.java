package com.google.mlkit.vision.digitalink;

public class DigitalInkRecognizerOptions {
    public static Builder builder(DigitalInkRecognitionModel model) { return new Builder(); }

    public static class Builder {
        public DigitalInkRecognizerOptions build() { return new DigitalInkRecognizerOptions(); }
    }
}
