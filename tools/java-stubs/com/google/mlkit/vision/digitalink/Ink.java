package com.google.mlkit.vision.digitalink;

public class Ink {
    public static Builder builder() { return new Builder(); }

    public static class Builder {
        public Builder addStroke(Stroke stroke) { return this; }
        public Ink build() { return new Ink(); }
    }

    public static class Stroke {
        public static Builder builder() { return new Builder(); }

        public static class Builder {
            public Builder addPoint(Point point) { return this; }
            public Stroke build() { return new Stroke(); }
        }
    }

    public static class Point {
        public static Point create(float x, float y) { return new Point(); }
        public static Point create(float x, float y, long t) { return new Point(); }
    }
}
