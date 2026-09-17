# Organizador

Caderno de trabalho com caneta, para tablet. Você escreve à mão numa folha
dividida em **zonas**, e o app **identifica sozinho** o que você escreveu dentro
de cada uma: cada linha na faixa "Tarefas" vira uma tarefa, cada linha em
"Pauta" vira uma pauta. Tudo isso se junta num painel único, separado por abas —
todas as tarefas, pautas, dúvidas e pendências de todos os cadernos, num lugar
só. O que a zona não pegar, você carimba à mão com o laço.

Feito para o Lenovo Idea Tab com caneta, mas roda em qualquer tablet.

> Continuando o projeto? Leia **[HANDOFF.md](HANDOFF.md)** primeiro — estado,
> decisões já tomadas e as armadilhas conhecidas.

---

## Como está agora (v0.1)

**A folha**
- Escrita com caneta sensível à pressão, rolagem infinita para baixo
- Rejeição de palma: a mão apoiada não risca a folha
- Zonas nomeadas — o que você escreve dentro de "Dúvidas" já nasce classificado
- Cinco modelos de folha: Reunião, Levantamento, Estudo, Lista de tarefas, Livre
- Marca-texto, laço e borracha

**Rabisco liga a borracha** — para caneta sem botão de borracha
- Rabisque **três voltas** em qualquer lugar da folha, ou faça um **vaivém**
- A borracha liga. O rabisco não apaga nada sozinho: quem escolhe o que
  apagar é a mão, arrastando depois
- Uma faixa avisa que a borracha está ligada. **Dois toques na folha** voltam
  para a caneta — ou toque na faixa
- Escrever normalmente nunca dispara o gesto (ver "O gesto do rabisco" abaixo)
- Depois de apagar, aparece **Desfazer** por 5 segundos
- Um anel vermelho mostra o alcance da borracha enquanto ela apaga, como no
  OneNote. Com a borracha ativa, a barra lateral controla o **tamanho dela**
- Toque parado com a borracha não apaga nada — só o arrasto apaga

**A borracha apaga só onde passa** — é borracha de ponta, não de traço.
Passar no meio de uma palavra tira aquele pedaço e deixa as duas metades, cada
uma virando um traço independente. Desfazer devolve a palavra inteira.

**Imagens**
- Ferramenta Imagem → "Adicionar imagem" abre a galeria do tablet
- Também aceita colar da área de transferência
- Arraste para mover, alça roxa para redimensionar (proporção preservada)
- **Para apagar uma imagem da anotação:** toque no **✕** vermelho no canto dela,
  e confirme na barra
- **Segure o dedo sobre a imagem** em qualquer ferramenta para abrir o ajuste —
  não é preciso trocar de ferramenta antes. Arrastar o dedo continua rolando a
  folha normalmente
- A imagem fica **atrás da tinta**: dá para anotar por cima do print

**Renomear** — toque de novo no bloco, seção ou página **já aberto** para
renomear. O botão 🗑 ao lado exclui.

**Tela estreita / tablet em pé** — a barra lateral vira sobreposição; toque
fora dela para fechar.

**Zoom**
- Pinça com dois dedos aproxima e afasta a folha
- Botões − / % / + no canto inferior esquerdo; tocar na porcentagem volta ao
  tamanho da folha
- Aproximar faz sua letra ocupar menos espaço da página, então cabe mais
- Com zoom, arrastar um dedo move a folha nas duas direções
- A aproximação escolhida fica guardada entre aberturas

**Espessura e tema**
- Barra contínua de espessura, de 0,3 a 14 — o traço fino é fino de verdade
- Tema claro e escuro. Segue o tema do Android na primeira abertura
- A cor padrão da caneta acompanha o tema: o que você escreveu no escuro
  continua legível no claro

**Campos identificados sozinho**
- Escreva dentro de uma faixa da folha — Pauta, Tarefas, Dúvidas, Pendências,
  Documentos — e **cada linha vira um item no painel**, sem carimbar nada
- O carimbo aparece na margem com **anel tracejado**: foi o app que identificou
- O corpo da anotação e a folha Livre não geram item nenhum: ali a escrita é a
  anotação em si
- Errou o tipo? Troque no próprio cartão do painel — sua escolha fica
- Não era item? **✕** no cartão arquiva sem apagar uma letra da anotação, e a
  identificação não o traz de volta
- Dá para desligar tudo no botão **Campos**, na barra de ferramentas

**Carimbos à mão**
- Pegue o laço, cerque uma anotação, escolha: Tarefa, Pauta, Dúvida, Tópico,
  Pendência, Documento, Importante
- O carimbo aparece na margem, alinhado com a sua letra, com anel cheio
- Toque no carimbo para marcar como concluído

**Áudio**
- Grave direto na página; a gravação fica salva junto da anotação
- Cada traço guarda o instante em que foi escrito, o que vai permitir
  (próxima etapa) tocar num rabisco e ouvir o que estava sendo dito

**Painel**
- Abas por tipo: Tudo, Tarefas, Pautas, Pendências, Dúvidas, Tópicos,
  Documentos, Importantes — e Arquivados, quando houver
- Filtro **Tudo / Esta página** e chave para mostrar os concluídos
- Cada item mostra um recorte da sua própria letra
- "Ir" leva de volta à página de origem

**Organização** — igual OneNote: Blocos de Anotações → Seções → Páginas

**Versão e atualização** — o rodapé da barra lateral mostra a versão instalada
e abre a tela de atualização. Ela tenta verificar sozinha se há versão nova; o
repositório sendo privado, o GitHub recusa a consulta anônima e a tela explica
isso, oferecendo o botão que abre a página de versões no navegador.

**Offline** — tudo fica salvo no tablet (IndexedDB). Funciona sem internet.

---

## Instalando no tablet

**Como aplicativo (recomendado):** baixe o `Organizador.apk` da release
[`ultimo`](../../releases/tag/ultimo) e toque no arquivo. Atualizar é repetir
isso — as anotações são preservadas, porque o APK é sempre assinado com a mesma
chave (`keystore/organizador.jks`, versionada de propósito; trocá-la quebraria
todas as atualizações futuras).

O GitHub monta o APK sozinho a cada mudança enviada
(`.github/workflows/apk.yml`).

**Sem instalar (via navegador):** passo a passo em
**[GUIA-TABLET.md](GUIA-TABLET.md)**, usando Termux. A pasta **`tablet/`** já
contém o app compilado.

## Desenvolvendo (no computador)

```bash
npm install
npm run dev            # servidor de desenvolvimento
npm test               # testes do rabisco, da borracha e dos campos
npm run build:tablet   # regenera a pasta tablet/ (commitar junto)
```

`npm run dev` mostra dois endereços; o **Network** abre no tablet pelo Wi-Fi.

> Ao mudar qualquer coisa em `src/`, rode `npm run build:tablet` e comite a
> pasta `tablet/` junto — é dela que o tablet lê.

---

## A borracha

É **borracha de ponta**: apaga o pedaço por onde passou, não o traço inteiro.
Cada passada percorre o segmento entre a posição anterior e a atual — trabalhar
por segmento, e não por ponto solto, é o que evita buracos quando a mão anda
rápido e os eventos do sistema chegam espaçados.

O que sobra de um corte vira pedaços independentes, cada um um traço por
direito próprio. Itens carimbados que apontavam para o traço original são
religados aos pedaços, senão apagar um naco de uma tarefa faria a tarefa
sumir do painel.

A lógica fica em `src/ink/erase.ts`, sem depender de React nem de banco.
Verificação: `npm run test:erase`.

---

## A identificação dos campos

A ideia cabe numa frase: **a zona diz o que a escrita significa, e cada linha
escrita ali dentro é um campo**.

Escrever é o único gesto. Ao parar a caneta, o app agrupa os traços em linhas
dentro de cada zona e cria um item por linha — tarefa, pauta, dúvida, o que a
zona significar. Quem escreveu três linhas na faixa "Tarefas" tem três tarefas
no painel.

Por que linha, e não bloco: numa faixa de tarefas as pessoas escrevem uma por
linha. Juntar linhas viraria uma tarefa só, gigante, que não dá para concluir em
separado — o erro que mais custa aqui. Linhas quase encostadas (baseline torta,
acento, pingo do "i") ainda são reunidas, com limite apertado.

Duas defesas que vieram de defeitos reais:

- **Vão entre colunas com piso de altura.** O limite que separa duas colunas na
  mesma faixa é medido em alturas de escrita. Numa linha rasa — letra toda
  baixa, um traço — o limite ficava minúsculo e o espaço normal entre duas
  palavras virava "duas colunas": duas tarefas onde havia uma. Hoje há piso.
- **O item é reconhecido pela tinta que contém.** Enquanto sobrar um traço em
  comum, ele continua sendo o mesmo item — mantém o tipo que você escolheu, o
  concluído que você marcou e o arquivado de quando você disse que aquilo não
  era item. Sem isso, cada palavra acrescentada à linha apagaria sua decisão.

A lógica fica em `src/items/detect.ts`, pura, sem React nem banco.
Verificação: `npm run test:fields`.

---

## O gesto do rabisco

O risco deste recurso é apagar escrita por engano, então o sinal escolhido
precisa separar bem os dois casos.

**Escrever avança; rabiscar volta.** É esse o único sinal usado: quantas vezes
o traço vai e volta ao longo do próprio eixo.

Contar auto-cruzamentos parece o sinal óbvio e é uma armadilha: letra cursiva
fecha um laço em quase toda letra (g, ç, o, e, l), e uma palavra de seis letras
produz tantos cruzamentos quanto três voltas rabiscadas. Isso ligava a borracha
no meio da escrita. A densidade também não separa — a mesma cursiva com laços dá
densidade maior que rabiscos legítimos.

Medido: escrita fica em 0–1 inversões, rabisco em 5–9. A separação é larga.

Os limiares estão em `src/ink/scribble.ts`, na constante `SCRIBBLE`, com
comentário explicando cada um. Para ajustar a sensibilidade, mexa ali.

Há um teste que verifica a fronteira entre "apagar" e "escrever":

```bash
npm run test:scribble
```

Ele cobre 3/4/5 círculos e vaivém (devem apagar) contra palavra cursiva,
**cursiva com laços**, assinatura, linha reta, laço único da letra "e", pingo do
"i" e 1–2 círculos (não podem apagar).
**Ao mexer nos limiares, rode este teste.**

---

## Estrutura

Cada pasta tem um trabalho só:

```
src/
  domain/      modelo de dados, modelos de folha, medidas da página
  ink/         captura da caneta, desenho do traço, gesto do rabisco, zoom
  items/       identificação dos campos escritos nas zonas
  zones/       em que zona um ponto caiu
  db/          persistência local (IndexedDB)
  state/       estado do app e todas as ações que mudam dados
  audio/       gravação
  components/  a folha, a navegação, as barras, o painel
  lib/         geometria e utilidades
tools/         testes do gesto do rabisco, da borracha e dos campos
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
   É o passo natural depois da identificação automática: hoje as faixas vêm
   prontas do modelo de folha.
5. **Ícones personalizados** — você cria os seus carimbos, com os seus
   significados.
6. ~~Empacotar como app Android~~ — feito.
