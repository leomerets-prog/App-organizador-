# Organizador

Caderno de trabalho com caneta, para tablet. Você escreve à mão numa folha
dividida em **zonas**, marca o que importa com um **carimbo**, e o app reúne
tudo num painel único — todas as tarefas, dúvidas e pendências de todos os
cadernos, num lugar só.

Feito para o Lenovo Idea Tab com caneta, mas roda em qualquer tablet.

---

## Como está agora (v0.1)

**A folha**
- Escrita com caneta sensível à pressão, rolagem infinita para baixo
- Rejeição de palma: a mão apoiada não risca a folha
- Zonas nomeadas — o que você escreve dentro de "Dúvidas" já nasce classificado
- Quatro modelos de folha: Reunião, Levantamento, Estudo, Livre
- Marca-texto, laço e borracha

**Rabisco apaga** — para caneta sem botão de borracha
- Rabisque **três voltas** por cima do que quer apagar, ou faça um **vaivém**
- O app reconhece o gesto pelo formato e apaga só o que foi rabiscado
- Escrever normalmente nunca dispara o gesto (ver "O gesto do rabisco" abaixo)

**Carimbos**
- Pegue o laço, cerque uma anotação, escolha: Tarefa, Dúvida, Tópico,
  Pendência, Documento, Importante
- O carimbo aparece na margem, alinhado com a sua letra
- Toque no carimbo para marcar como concluído

**Áudio**
- Grave direto na página; a gravação fica salva junto da anotação
- Cada traço guarda o instante em que foi escrito, o que vai permitir
  (próxima etapa) tocar num rabisco e ouvir o que estava sendo dito

**Painel**
- Tudo que foi carimbado, de todos os cadernos, agrupado por tipo
- Cada item mostra um recorte da sua própria letra
- "Ir" leva de volta à página de origem

**Organização** — igual OneNote: Blocos de Anotações → Seções → Páginas

**Offline** — tudo fica salvo no tablet (IndexedDB). Funciona sem internet.

---

## Rodando no tablet

```bash
npm install
npm run dev
```

O terminal mostra dois endereços. Use o **Network** (`http://192.168.x.x:5173`)
no Chrome do tablet — o computador e o tablet precisam estar no mesmo Wi-Fi.

Para instalar como app na tela inicial: menu do Chrome → **Instalar aplicativo**.
Ele passa a abrir em tela cheia, com ícone próprio, e funciona offline.

Para gerar a versão final:

```bash
npm run build      # gera dist/
npm run preview    # serve dist/ para testar
```

---

## O gesto do rabisco

O risco deste recurso é apagar escrita por engano, então a detecção exige duas
coisas ao mesmo tempo:

1. **O traço volta por cima de si mesmo** — voltas fechadas geram
   auto-cruzamentos; o vaivém gera idas e voltas ao longo do eixo do traço.
2. **O traço é denso** — percorre um caminho muito mais longo do que a área que
   ocupa. Escrever avança pela linha; rabiscar fica no lugar.

Os limiares estão em `src/ink/scribble.ts`, na constante `SCRIBBLE`, com
comentário explicando cada um. Para ajustar a sensibilidade, mexa ali.

Há um teste que verifica a fronteira entre "apagar" e "escrever":

```bash
npm run test:scribble
```

Ele cobre 3/4/5 círculos e vaivém (devem apagar) contra palavra cursiva, linha
reta, laço único da letra "e", pingo do "i" e 1–2 círculos (não podem apagar).
**Ao mexer nos limiares, rode este teste.**

---

## Estrutura

Cada pasta tem um trabalho só:

```
src/
  domain/      modelo de dados, modelos de folha, medidas da página
  ink/         captura da caneta, desenho do traço, gesto do rabisco
  zones/       em que zona um ponto caiu
  db/          persistência local (IndexedDB)
  state/       estado do app e todas as ações que mudam dados
  audio/       gravação
  components/  a folha, a navegação, as barras, o painel
  lib/         geometria e utilidades
tools/         teste do gesto do rabisco
```

Regra da casa: **componente não fala com o banco**. Ele chama uma ação de
`state/store.ts`, que atualiza a memória primeiro (a tela responde na hora) e
grava no banco em seguida. É isso que mantém a escrita fluida.

---

## Próximas etapas

1. **Transcrição da letra** (OCR) — a peça está desenhada no modelo de dados
   (`Item.ocr`) mas ainda não ligada. Na fase PWA usa um serviço de visão com
   internet; quando o app virar Android nativo, passa a usar ML Kit, que roda
   offline e sem custo.
2. **Áudio ligado à tinta** — tocar num traço e ouvir o trecho da gravação
   daquele momento. Os dados necessários já estão sendo guardados.
3. **Zonas editáveis na folha** — arrastar as bordas, criar zona nova à mão.
4. **Ícones personalizados** — você cria os seus carimbos, com os seus
   significados.
5. **Empacotar como app Android**.
