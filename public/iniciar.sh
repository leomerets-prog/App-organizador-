#!/data/data/com.termux/files/usr/bin/bash
# Liga o Organizador no tablet.
# Uso: bash iniciar.sh

cd "$(dirname "$0")" || exit 1

PORTA=8080

echo ""
echo "  Organizador ligado."
echo ""
echo "  Abra no Chrome do tablet:  http://localhost:$PORTA"
echo ""
echo "  Para desligar: toque na tela do Termux e aperte Ctrl+C"
echo ""

python -m http.server "$PORTA"
