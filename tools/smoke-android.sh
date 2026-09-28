#!/usr/bin/env bash
#
# O app ABRE mesmo — inclusive ATUALIZANDO por cima do que já estava instalado?
#
# Compilar prova que o código é válido; não prova que o app abre. Um plugin que
# falta, uma exceção no arranque, um erro de JavaScript ou um cache velho de
# service worker passam pela compilação inteiros e só aparecem no aparelho do
# usuário — que foi exatamente o que aconteceu: APK verde na esteira, app
# fechando no tablet.
#
# Por isso a verificação imita o que o usuário faz, na ordem em que ele faz:
#
#   1. instala a versão que está publicada hoje (a que ele tem no aparelho)
#   2. abre, pra que ela deixe banco e service worker registrados
#   3. instala a versão nova POR CIMA — que é o que "atualizar" significa
#   4. abre de novo e confere que o app está de pé, com a tela montada
#
# Instalação limpa nunca reproduz o defeito de quem atualiza. Este roteiro sim.

set -uo pipefail

PACOTE=com.leomerets.organizador
APK=${1:-dist-apk/Organizador.apk}
LOG=${2:-dist-apk/logcat.txt}
ANTERIOR=${3:-dist-apk/anterior.apk}

falhou=0
reprovar() {
  echo "::error::$1"
  falhou=1
}

# ── 1 e 2: a versão que o usuário já tem ────────────────────────────────────
# Falhas aqui não reprovam nada: se a versão publicada estiver quebrada, é
# justamente o que se está consertando. Ela serve só pra deixar o aparelho no
# estado em que o usuário está.
if [ -f "$ANTERIOR" ]; then
  echo "── Instalando a versão que já está publicada ──"
  adb install -r -g "$ANTERIOR" || echo "(não consegui instalar a anterior; seguindo)"
  adb shell am start -W -n "$PACOTE/.MainActivity" || true
  sleep 18
  adb shell input swipe 400 600 800 620 400 || true
  sleep 3
  adb shell am force-stop "$PACOTE" || true
else
  echo "── Sem versão anterior pra instalar; testando só a instalação limpa ──"
fi

# ── 3 e 4: a versão nova, por cima ──────────────────────────────────────────
echo "── Instalando a versão nova por cima ──"
adb logcat -c || true
adb install -r -g "$APK" || reprovar "A instalação da versão nova falhou."

echo "── Abrindo o app ──"
abertura=$(adb shell am start -W -n "$PACOTE/.MainActivity")
echo "$abertura"
if echo "$abertura" | grep -qi "error"; then
  reprovar "O Android recusou abrir a tela principal."
fi

# Tempo pro WebView subir, o banco abrir e a primeira folha pintar. Generoso de
# propósito: emulador é mais lento que tablet, e alarme falso aqui custa a
# confiança na verificação inteira.
sleep 30

adb logcat -d > "$LOG" || true

processo=$(adb shell pidof "$PACOTE" | tr -d '\r\n')
if [ -z "$processo" ]; then
  reprovar "O app fechou sozinho depois de abrir (o processo não está mais rodando)."
fi

if grep -q "FATAL EXCEPTION" "$LOG"; then
  reprovar "Exceção fatal no Android — o app quebrou no arranque."
fi

# Travar conta como quebrar: pro usuário é a mesma coisa, e o Android fecha o
# app do mesmo jeito. Foi assim que o desenho repetido por folha derrubou o app.
if grep -q "ANR in $PACOTE" "$LOG"; then
  reprovar "O app travou (ANR): alguma coisa segurou a tela por tempo demais."
fi

if ! grep -q "organizador: iniciando" "$LOG"; then
  reprovar "O JavaScript nem começou: a página não carregou dentro do app."
fi

if ! grep -q "organizador: pronto" "$LOG"; then
  reprovar "A tela não chegou a montar — é a tela branca que o usuário vê."
fi

if grep -q "organizador: erro" "$LOG"; then
  reprovar "Erro de JavaScript no arranque do app."
fi

echo "── O que o Android disse ──"
grep -E "FATAL|AndroidRuntime|Organizador|organizador|Capacitor|chromium: \[ERROR" "$LOG" | tail -60
echo "───────────────────────────"

if [ "$falhou" -eq 0 ]; then
  echo "✓ O app atualizou, abriu, montou a tela e continua rodando."
fi
exit "$falhou"
