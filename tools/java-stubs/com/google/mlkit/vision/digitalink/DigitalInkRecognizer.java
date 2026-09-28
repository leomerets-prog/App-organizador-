package com.google.mlkit.vision.digitalink;

import com.google.android.gms.tasks.Task;

public interface DigitalInkRecognizer {
    Task<RecognitionResult> recognize(Ink ink);
    Task<RecognitionResult> recognize(Ink ink, RecognitionContext context);
    void close();
}
