package com.leomerets.organizador;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Salvar um arquivo do app pra dentro do tablet.
 *
 * Existe por um motivo só: até agora nada do que o usuário grava saía do
 * aplicativo. Desinstalar, limpar os dados ou trocar de aparelho levava junto —
 * e ele disse a frase que decide a prioridade: "não posso perder nada dessa
 * conversa".
 *
 * ## O arquivo é escrito em pedaços
 *
 * A ponte do Capacitor carrega texto. Uma gravação de uma hora vira dezenas de
 * megabytes de base64, e mandar isso numa chamada só é o caminho conhecido pra
 * derrubar a WebView por falta de memória. Então: `abrir` devolve uma senha,
 * `escrever` vai enchendo, `fechar` termina. Enquanto não fecha, o arquivo fica
 * marcado como PENDENTE no Android — nenhum outro app o enxerga pela metade.
 *
 * ## Onde o arquivo cai
 *
 * Três caminhos, nessa ordem, e o app SEMPRE diz na tela qual deles pegou:
 *
 * 1. **Android 10 ou mais novo** — pasta Downloads pelo MediaStore, sem pedir
 *    permissão nenhuma (é o armazenamento por escopo; o app escreve só o que
 *    ele mesmo cria)
 * 2. **Android 9 ou mais velho** — pasta Downloads direto, quando a permissão
 *    de escrita já estiver concedida
 * 3. **Se nada disso der** — a pasta do próprio app, que nunca precisa de
 *    permissão. Some se o app for desinstalado, e por isso é o último recurso,
 *    mas é melhor que devolver "não deu" e o usuário ficar sem cópia nenhuma
 *
 * Tudo aqui pega `Throwable`, e não só `Exception`: salvar arquivo é acessório,
 * e nenhum acessório pode derrubar o caderno.
 */
@CapacitorPlugin(name = "FileSaver")
public class FileSaverPlugin extends Plugin {

    private static final String TAG = "Organizador";

    /** Um arquivo aberto, esperando os pedaços. */
    private static class Saida {
        OutputStream fluxo;
        /** Preenchido só no caminho do MediaStore; é o que precisa ser liberado no fim. */
        Uri uri;
        /** Arquivo comum, quando não foi pelo MediaStore. */
        File arquivo;
        String onde;
    }

    private final Map<String, Saida> abertos = new HashMap<>();

    @PluginMethod
    public void abrir(PluginCall call) {
        String nome = call.getString("nome", "");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        if (nome == null || nome.isEmpty()) {
            call.reject("Sem nome de arquivo.");
            return;
        }

        try {
            Saida saida = criar(nome, mimeType);
            String token = UUID.randomUUID().toString();
            synchronized (abertos) {
                abertos.put(token, saida);
            }
            JSObject resposta = new JSObject();
            resposta.put("token", token);
            call.resolve(resposta);
        } catch (Throwable erro) {
            Log.e(TAG, "organizador: não consegui abrir o arquivo pra salvar", erro);
            call.reject(mensagem(erro));
        }
    }

    @PluginMethod
    public void escrever(PluginCall call) {
        String token = call.getString("token", "");
        String base64 = call.getString("base64", "");
        Saida saida;
        synchronized (abertos) {
            saida = abertos.get(token);
        }
        if (saida == null) {
            call.reject("Este arquivo não está mais aberto.");
            return;
        }

        try {
            byte[] bytes = Base64.decode(base64 == null ? "" : base64, Base64.DEFAULT);
            saida.fluxo.write(bytes);
            call.resolve();
        } catch (Throwable erro) {
            Log.e(TAG, "organizador: falha ao escrever um pedaço", erro);
            call.reject(mensagem(erro));
        }
    }

    @PluginMethod
    public void fechar(PluginCall call) {
        String token = call.getString("token", "");
        Saida saida;
        synchronized (abertos) {
            saida = abertos.remove(token);
        }
        if (saida == null) {
            call.reject("Este arquivo não está mais aberto.");
            return;
        }

        try {
            saida.fluxo.flush();
            saida.fluxo.close();
            publicar(saida);
            JSObject resposta = new JSObject();
            resposta.put("onde", saida.onde);
            call.resolve(resposta);
        } catch (Throwable erro) {
            Log.e(TAG, "organizador: falha ao fechar o arquivo", erro);
            descartar(saida);
            call.reject(mensagem(erro));
        }
    }

    @PluginMethod
    public void cancelar(PluginCall call) {
        String token = call.getString("token", "");
        Saida saida;
        synchronized (abertos) {
            saida = abertos.remove(token);
        }
        if (saida != null) descartar(saida);
        call.resolve();
    }

    /** Fecha o que ficou aberto: um arquivo pela metade nunca vira arquivo. */
    @Override
    protected void handleOnDestroy() {
        synchronized (abertos) {
            for (Saida saida : abertos.values()) descartar(saida);
            abertos.clear();
        }
    }

    // ── Onde escrever ────────────────────────────────────────────────────────

    private Saida criar(String nome, String mimeType) throws Throwable {
        if (Build.VERSION.SDK_INT >= 29) {
            try {
                return pelaGaleria(nome, mimeType);
            } catch (Throwable erro) {
                Log.w(TAG, "organizador: MediaStore recusou; tentando a pasta do app", erro);
            }
        } else {
            try {
                File pasta = Environment.getExternalStoragePublicDirectory(
                        Environment.DIRECTORY_DOWNLOADS);
                return emPasta(pasta, nome, "Downloads");
            } catch (Throwable erro) {
                Log.w(TAG, "organizador: Downloads recusou; tentando a pasta do app", erro);
            }
        }
        return naPastaDoApp(nome);
    }

    /** Android 10+: Downloads pelo MediaStore, sem permissão e sem pedir nada. */
    private Saida pelaGaleria(String nome, String mimeType) throws Throwable {
        ContentResolver resolver = getContext().getContentResolver();

        ContentValues valores = new ContentValues();
        valores.put(MediaStore.MediaColumns.DISPLAY_NAME, nome);
        valores.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
        valores.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
        // Pendente = invisível pros outros apps enquanto ainda está sendo escrito.
        valores.put(MediaStore.MediaColumns.IS_PENDING, 1);

        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, valores);
        if (uri == null) throw new IllegalStateException("O Android não abriu o arquivo.");

        OutputStream fluxo = resolver.openOutputStream(uri);
        if (fluxo == null) {
            resolver.delete(uri, null, null);
            throw new IllegalStateException("O Android não deixou escrever no arquivo.");
        }

        Saida saida = new Saida();
        saida.fluxo = fluxo;
        saida.uri = uri;
        saida.onde = "Downloads/" + nome;
        return saida;
    }

    private Saida emPasta(File pasta, String nome, String comoChamar) throws Throwable {
        if (pasta == null) throw new IllegalStateException("Pasta indisponível.");
        if (!pasta.exists() && !pasta.mkdirs()) {
            throw new IllegalStateException("Não consegui criar a pasta " + comoChamar + ".");
        }
        File arquivo = new File(pasta, nome);
        Saida saida = new Saida();
        saida.fluxo = new FileOutputStream(arquivo);
        saida.arquivo = arquivo;
        saida.onde = comoChamar + "/" + nome;
        return saida;
    }

    /** Último recurso: a pasta do app, que nunca precisa de permissão. */
    private Saida naPastaDoApp(String nome) throws Throwable {
        File pasta = getContext().getExternalFilesDir(Environment.DIRECTORY_MUSIC);
        if (pasta == null) pasta = getContext().getFilesDir();
        Saida saida = emPasta(pasta, nome, "pasta do aplicativo");
        saida.onde = "pasta do aplicativo/" + nome + " (some se o app for desinstalado)";
        return saida;
    }

    /** Tira o "pendente": é só agora que o arquivo aparece pros outros apps. */
    private void publicar(Saida saida) {
        if (saida.uri == null) return;
        try {
            ContentValues valores = new ContentValues();
            valores.put(MediaStore.MediaColumns.IS_PENDING, 0);
            getContext().getContentResolver().update(saida.uri, valores, null, null);
        } catch (Throwable erro) {
            Log.w(TAG, "organizador: o arquivo foi escrito mas continuou pendente", erro);
        }
    }

    private void descartar(Saida saida) {
        try {
            if (saida.fluxo != null) saida.fluxo.close();
        } catch (Throwable ignorado) {
            // Fechar já falhou; apagar é o que importa daqui pra frente.
        }
        try {
            if (saida.uri != null) {
                getContext().getContentResolver().delete(saida.uri, null, null);
            } else if (saida.arquivo != null) {
                saida.arquivo.delete();
            }
        } catch (Throwable erro) {
            Log.w(TAG, "organizador: sobrou um arquivo pela metade", erro);
        }
    }

    private static String mensagem(Throwable erro) {
        String texto = erro.getMessage();
        return texto == null || texto.isEmpty() ? erro.getClass().getSimpleName() : texto;
    }
}
