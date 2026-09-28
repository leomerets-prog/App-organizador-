package com.google.mlkit.common.model;

public class DownloadConditions {
    public static class Builder {
        public Builder requireWifi() { return this; }
        public DownloadConditions build() { return new DownloadConditions(); }
    }
}
