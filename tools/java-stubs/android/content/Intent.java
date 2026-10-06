package android.content;

import android.os.ParcelFileDescriptor;

import java.util.ArrayList;

/** Sombra de android.content.Intent, só com o que o plugin usa. */
public class Intent {
    public Intent(String action) { }
    public Intent putExtra(String name, String value) { return this; }
    public Intent putExtra(String name, int value) { return this; }
    public Intent putExtra(String name, boolean value) { return this; }
    public Intent putExtra(String name, ParcelFileDescriptor value) { return this; }
    /**
     * REGRA DE EXECUÇÃO: isto e `putExtra(String, String[])` são campos
     * DIFERENTES mesmo com a mesma chave. Quem lê com
     * `getStringArrayListExtra` só acha o que foi posto por aqui; posto como
     * array, o que ele acha é nulo — e, num extra opcional, ignora calado.
     */
    public Intent putStringArrayListExtra(String name, ArrayList<String> value) { return this; }
}
