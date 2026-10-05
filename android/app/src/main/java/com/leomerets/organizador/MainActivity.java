package com.leomerets.organizador;

import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "Organizador";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        /*
         * O registro vem ANTES do super: é o super que monta a ponte com a
         * página, e um plugin registrado depois disso não existe pra ela.
         *
         * E vem dentro de um try que pega Throwable, não só Exception: se o
         * reconhecedor de escrita faltar no aparelho, o que estoura aqui é
         * NoClassDefFoundError — um Error, não uma Exception. Sem esta rede, o
         * app inteiro morreria na abertura por causa de um recurso acessório,
         * e o usuário perderia o caderno por causa da transcrição.
         */
        try {
            registerPlugin(InkRecognitionPlugin.class);
        } catch (Throwable error) {
            Log.e(TAG, "organizador: transcrição indisponível neste aparelho", error);
        }
        // Em try separado de propósito: se um dos dois acessórios faltar no
        // aparelho, o outro continua existindo.
        try {
            registerPlugin(FileSaverPlugin.class);
        } catch (Throwable error) {
            Log.e(TAG, "organizador: salvar arquivo indisponível neste aparelho", error);
        }
        // Em try próprio, como os outros: a sonda da fala é o acessório mais
        // incerto de todos, e é justamente por isso que ela não pode levar o
        // caderno junto se o aparelho não tiver reconhecedor nenhum.
        try {
            registerPlugin(SpeechPlugin.class);
        } catch (Throwable error) {
            Log.e(TAG, "organizador: reconhecimento de fala indisponível neste aparelho", error);
        }
        super.onCreate(savedInstanceState);
    }
}
