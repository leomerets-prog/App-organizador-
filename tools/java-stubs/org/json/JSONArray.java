package org.json;

public class JSONArray {
    public int length() { return 0; }
    public JSONArray getJSONArray(int index) throws JSONException { return null; }
    public JSONObject getJSONObject(int index) throws JSONException { return null; }
    /**
     * REGRA DE EXECUÇÃO: `opt` devolve NULO fora dos limites e no lugar de
     * `JSONObject.NULL`, em vez de estourar como os `get*`. É por isso que ele
     * serve pra ler lista vinda do JavaScript, onde um buraco é normal.
     */
    public Object opt(int index) { return null; }
    /**
     * REGRA DE EXECUÇÃO: devolve o `padrao` quando a posição não existe ou não
     * é número — nunca estoura. É o que deixa um corte inválido vindo do
     * JavaScript virar zero em vez de derrubar a transcrição inteira.
     */
    public double optDouble(int index, double padrao) { return padrao; }
    /** Acrescenta no fim e devolve a própria lista. */
    public JSONArray put(Object value) { return this; }
}
