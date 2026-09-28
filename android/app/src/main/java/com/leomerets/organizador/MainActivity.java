package com.leomerets.organizador;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // O registro precisa vir ANTES do super: é o super que monta a ponte
        // com a página, e um plugin registrado depois disso não existe pra ela.
        registerPlugin(InkRecognitionPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
