package com.getcapacitor;

import android.app.Activity;
import android.content.Context;

public class Plugin {
    protected void handleOnDestroy() {}
    public void load() {}
    public Context getContext() { return null; }
    public Activity getActivity() { return null; }
    public Bridge getBridge() { return null; }
    /*
     * Avisa o JavaScript no meio de uma chamada longa, sem esperar o
     * `resolve`. É assim que a transcrição de uma reunião inteira conta o
     * andamento: o `resolve` só vem no fim, e uma tela parada por três minutos
     * é indistinguível de uma tela travada.
     *
     * No Capacitor de verdade isto não falha quando ninguém está ouvindo —
     * simplesmente não faz nada.
     */
    protected void notifyListeners(String nome, JSObject dados) {}
}
