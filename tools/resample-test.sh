#!/usr/bin/env bash
#
# O REAMOSTRADOR FAZ O QUE EU DISSE QUE FAZ?
#
# O caminho do áudio é o código mais arriscado da transcrição: é ele que
# escreve o que o reconhecedor ouve, e quando erra não dá erro nenhum — devolve
# texto errado, ou silêncio, sem reclamar de nada. Foi assim que a primeira
# versão falhou no tablet.
#
# A primeira versão pegava uma amostra a cada três e jogava as outras fora. A
# nova tira a MÉDIA das três. A diferença não é estética: jogar amostras fora
# sem filtrar antes é aliasing — o som agudo não some, ele DOBRA pra dentro da
# faixa da voz e vira chiado em cima das consoantes, que é como "pedir" vira
# "pedi".
#
# Este caso mede isso num tom puro, usando o MÉTODO DE VERDADE do plugin
# (chamado por reflexão, não copiado — cópia envelhece e passa a medir outra
# coisa). Com a média, um tom de 15 kHz que não cabe em 16 kHz é ABAFADO; sem
# ela, ele reaparece alto e grave dentro da voz.

set -euo pipefail

raiz=$(cd "$(dirname "$0")/.." && pwd)
saida=$(mktemp -d)
trap 'rm -rf "$saida"' EXIT

javac \
  -nowarn \
  -proc:none \
  -encoding UTF-8 \
  -d "$saida" \
  -sourcepath "$raiz/tools/java-stubs:$raiz/android/app/src/main/java" \
  "$raiz"/android/app/src/main/java/com/leomerets/organizador/*.java

cp "$raiz/tools/ReamostraTest.java" "$saida/"
javac -nowarn -proc:none -encoding UTF-8 -cp "$saida" -d "$saida" "$saida/ReamostraTest.java"
java -Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 -cp "$saida" ReamostraTest
