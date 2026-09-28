#!/usr/bin/env bash
#
# O plugin nativo compila?
#
# Sem SDK do Android aqui, o Java só era conferido na esteira — e um `catch` de
# exceção que ninguém lança, erro que o javac pega num segundo, custou uma volta
# inteira de esteira com o usuário esperando de app quebrado.
#
# Aqui o mesmo javac confere o plugin contra as SOMBRAS em tools/java-stubs,
# que copiam as assinaturas das bibliotecas de verdade. Não substitui a
# compilação real (a esteira continua fazendo), mas pega o erro bobo antes de
# ele custar dez minutos.

set -euo pipefail

raiz=$(cd "$(dirname "$0")/.." && pwd)
saida=$(mktemp -d)
trap 'rm -rf "$saida"' EXIT

javac \
  -nowarn \
  -proc:none \
  -d "$saida" \
  -sourcepath "$raiz/tools/java-stubs:$raiz/android/app/src/main/java" \
  "$raiz"/android/app/src/main/java/com/leomerets/organizador/*.java

echo "✓ O plugin nativo compila (contra as sombras das bibliotecas)."
