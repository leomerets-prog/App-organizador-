package android.webkit;

/** Sombra de android.webkit.WebView, só com o que o plugin usa. */
public class WebView {
    public boolean postDelayed(Runnable action, long delayMillis) { return false; }
}
