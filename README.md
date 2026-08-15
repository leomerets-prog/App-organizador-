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

**Rabisco liga a borracha** — para caneta sem botão de borracha
- Rabisque **três voltas** em qualquer lugar da folha, ou faça um **vaivém**
- A borracha liga. O rabisco não apaga nada sozinho: quem escolhe o que
  apagar é a mão, arrastando depois
- Uma faixa avisa que a borracha está ligada; toque nela para voltar à caneta
- Escrever normalmente nunca dispara o gesto (ver "O gesto do rabisco" abaixo)

**Espessura e tema**
- Barra contínua de espessura, de 0,3 a 14 — o traço fino é fino de verdade
- Tema claro e escuro. Segue o tema do Android na primeira abertura
- A cor padrão da caneta acompanha o tema: o que você escreveu no escuro
  continua legível no claro

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

## Instalando no tablet

Passo a passo completo em **[GUIA-TABLET.md](GUIA-TABLET.md)** — roda tudo
dentro do tablet, via Termux, sem computador e sem nuvem.

A pasta **`tablet/`** já contém o app compilado e pronto. No tablet não se
compila nada: basta servir essa pasta.

## Desenvolvendo (no computador)

```bash
npm install
npm run dev            # servidor de desenvolvimento
npm run test:scribble  # teste do gesto do rabisco
npm run build:tablet   # regenera a pasta tablet/ (commitar junto)
```

`npm run dev` mostra dois endereços; o **Network** abre no tablet pelo Wi-Fi.

> Ao mudar qualquer coisa em `src/`, rode `npm run build:tablet` e comite a
> pasta `tablet/` junto — é dela que o tablet lê.

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

1. **Exportar as anotações** para arquivo — hoje elas só existem dentro do
   tablet, e limpar os dados do navegador as apaga
2. **Transcrição da letra** (OCR) — a peça está desenhada no modelo de dados
   (`Item.ocr`) mas ainda não ligada. Na fase PWA usa um serviço de visão com
   internet; quando o app virar Android nativo, passa a usar ML Kit, que roda
   offline e sem custo.
3. **Áudio ligado à tinta** — tocar num traço e ouvir o trecho da gravação
   daquele momento. Os dados necessários já estão sendo guardados.
4. **Zonas editáveis na folha** — arrastar as bordas, criar zona nova à mão.
5. **Ícones personalizados** — você cria os seus carimbos, com os seus
   significados.
6. **Empacotar como app Android**.
