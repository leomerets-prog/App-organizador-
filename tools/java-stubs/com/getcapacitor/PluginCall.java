package com.getcapacitor;

public class PluginCall {
    public JSArray getArray(String name) { return null; }
    public JSObject getObject(String name) { return null; }
    public String getString(String name) { return null; }
    public String getString(String name, String defaultValue) { return defaultValue; }
    public Float getFloat(String name) { return null; }
    public float getFloat(String name, Float defaultValue) { return 0f; }
    public void resolve() {}
    public void resolve(JSObject data) {}
    public void reject(String message) {}
}
