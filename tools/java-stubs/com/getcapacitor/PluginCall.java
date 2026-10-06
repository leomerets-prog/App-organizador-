package com.getcapacitor;

public class PluginCall {
    public JSArray getArray(String name) { return null; }
    public JSObject getObject(String name) { return null; }
    public String getString(String name) { return null; }
    public String getString(String name, String defaultValue) { return defaultValue; }
    public Float getFloat(String name) { return null; }
    public float getFloat(String name, Float defaultValue) { return 0f; }
    /*
     * CUIDADO com os tipos destes dois: no Capacitor de verdade `getInt(nome)`
     * devolve `Integer` — ou seja, pode voltar NULO quando o JavaScript não
     * mandou o campo, e desembrulhar isso direto num `int` estoura. A versão
     * com padrão devolve `int` e nunca é nula. As sombras repetem essa
     * diferença de propósito: um stub mais frouxo que o original esconde
     * justamente o erro que ele deveria pegar.
     */
    public Integer getInt(String name) { return null; }
    public int getInt(String name, Integer defaultValue) { return defaultValue; }
    public void resolve() {}
    public void resolve(JSObject data) {}
    public void reject(String message) {}
}
