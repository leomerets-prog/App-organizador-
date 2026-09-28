package com.google.mlkit.vision.digitalink;

public class DigitalInkRecognitionModel {
    public static Builder builder(DigitalInkRecognitionModelIdentifier identifier) { return new Builder(); }

    public static class Builder {
        public DigitalInkRecognitionModel build() { return new DigitalInkRecognitionModel(); }
    }
}
