package com.google.mlkit.common.model;

import com.google.android.gms.tasks.Task;
import com.google.mlkit.vision.digitalink.DigitalInkRecognitionModel;

public class RemoteModelManager {
    public static RemoteModelManager getInstance() { return new RemoteModelManager(); }
    public Task<Boolean> isModelDownloaded(DigitalInkRecognitionModel model) { return null; }
    public Task<Void> download(DigitalInkRecognitionModel model, DownloadConditions conditions) { return null; }
}
