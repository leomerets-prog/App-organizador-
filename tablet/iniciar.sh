#!/bin/bash
# Liga o Organizador no tablet.
# Uso:  bash iniciar.sh

# Vai para a pasta onde este arquivo está, não importa de onde foi chamado.
cd "$(dirname "$0")" || exit 1

PORTA=8080

# Confere que os arquivos do app estão aqui, antes de tentar ligar.
if [ ! -f index.html ]; then
  echo ""
  echo "  ERRO: não achei os arquivos do app nesta pasta."
  echo "  Você está em: $(pwd)"
  echo ""
  echo "  Rode:  cd ~/organizador/*/tablet && bash iniciar.sh"
  echo ""
  exit 1
fi

# Dependendo da instalação o comando é 'python' ou 'python3'.
if command -v python > /dev/null 2>&1; then
  PY=python
elif command -v python3 > /dev/null 2>&1; then
  PY=python3
else
  echo ""
  echo "  ERRO: o Python não está instalado."
  echo "  Rode:  pkg install python -y"
  echo ""
  exit 1
fi

echo ""
echo "  ============================================"
echo "    O Organizador está ligado."
echo ""
echo "    Abra no Chrome do tablet:"
echo "    http://localhost:$PORTA"
echo ""
echo "    Para desligar: Ctrl+C"
echo "  ============================================"
echo ""
echo "  (as linhas abaixo são normais — é o app sendo aberto)"
echo ""

# Se a porta estiver ocupada, o Python avisa e sai; explicamos o que fazer.
if ! "$PY" -m http.server "$PORTA"; then
  echo ""
  echo "  Se apareceu 'Address already in use', o app já está ligado"
  echo "  em outra aba do Termux. Abra o Chrome em localhost:$PORTA."
  echo ""
  exit 1
fi
