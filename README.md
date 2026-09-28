# Organizador

Caderno de trabalho com caneta, para tablet. Você escreve à mão numa folha
dividida em **zonas**, e o app **identifica e transcreve sozinho** o que você
escreveu dentro de cada uma: cada linha na faixa "Tarefas" vira uma ação, cada
linha em "Dúvidas" vira uma dúvida.

Daí tudo isso chega na **Central**: a tela onde você trabalha o que escreveu —
visão geral, Ações, Pautas, Pendências, Dúvidas, Documentos —, com busca no
texto, filtro por caderno e as ações de cada item (concluir, reclassificar,
voltar pra página onde ele nasceu). O texto também fica na folha, embaixo da sua
letra; os dois lugares mostram o mesmo item.

As faixas são suas: arraste, redimensione, crie e renomeie na própria folha.

Feito para o Lenovo Idea Tab com caneta, mas roda em qualquer tablet.

> Continuando o projeto? Leia **[HANDOFF.md](HANDOFF.md)** primeiro — estado,
> decisões já tomadas e as armadilhas conhecidas.

---

## Como está agora (v0.1)

**A folha**
- Escrita com caneta sensível à pressão, rolagem infinita para baixo
- Rejeição de palma: a mão apoiada não risca a folha
- Zonas nomeadas — o que você escreve dentro de "Dúvidas" já nasce classificado
- **Zonas editáveis**: arraste a faixa pra mover, os cantos pra redimensionar,
  renomeie e escolha o que ela significa (ferramenta **Zonas**)
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

**O texto fica na folha**
- A transcrição aparece em letra pequena **embaixo da sua escrita**, dentro da
  própria faixa — não vai pra outra tela
- **Segure o dedo** sobre uma linha pra escrever ou corrigir o texto dela. O que
  você escreve à mão nunca é sobrescrito pela leitura automática
- Botão **Texto** na barra esconde e mostra a transcrição na folha
- A leitura automática da letra roda **dentro do aplicativo instalado (APK)**;
  no navegador o texto é escrito à mão

**Faixa apertada, espaço na hora**
- A bolinha **⇕** na margem direita fica na divisa entre duas faixas
- Puxe pra baixo ou pra cima e a faixa cresce; funciona **sem trocar de
  ferramenta**, no meio da escrita
- A faixa vizinha cede o espaço, então nunca sobra buraco nem sobreposição

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

**Central** (botão na barra lateral)
- Trilho de módulos com o que há em cada um: Visão geral, Ações, Pautas,
  Pendências, Dúvidas, Tópicos, Documentos, Importantes, Arquivados
- **Visão geral**: quanto há em aberto de cada tipo e por caderno
- **Busca** no texto transcrito e no caminho (caderno › seção › página)
- Filtros de caderno, **Tudo / Esta página** e mostrar concluídos
- Cada linha traz o texto, o caminho, a data, um recorte da sua letra, o seletor
  de tipo e o ✕ que arquiva
- Tocar no texto abre a página onde ele foi escrito

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
npm test               # rabisco, borracha, campos, zonas e Central
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

## A Central

A folha é onde se escreve. A Central é onde o que foi escrito vira trabalho.

Tudo que saiu das faixas — de todos os cadernos — chega lá já transcrito, numa
lista com o caminho de onde veio. O trilho da esquerda mostra quanto há em cada
módulo; a visão geral responde "o que tenho pela frente" de relance; a busca
acha pelo texto ou pelo caminho, **sem acento e sem caixa** (procurar "duvida"
acha "Dúvida").

Em cada linha você marca como concluída, troca o tipo (o seu tipo fica; a zona
não o desfaz), arquiva o que não era item, ou toca no texto pra abrir a página
onde ele nasceu.

O mesmo item aparece na folha e na Central: concluir num lugar risca no outro.

Filtro, busca e contagem ficam em `src/items/central.ts`, puros.
Verificação: `npm run test:central`.

---

## As faixas da folha

A faixa é a régua: ela diz o que a escrita dentro dela significa. Por isso ela é
sua pra ajustar.

**A faixa ficou pequena no meio da escrita?** Puxe a bolinha **⇕** na margem
direita, na divisa entre duas faixas. Ela funciona **em qualquer ferramenta**,
sem trocar de modo: a faixa de cima cresce, a de baixo dá o espaço, e você
continua escrevendo. As duas continuam coladas — crescer sem tirar de ninguém
faria as faixas se sobreporem, e aí a mesma linha pertenceria a duas.

Para mexidas maiores, a ferramenta **Zonas** (▣):

- **Toque numa faixa** para escolhê-la; ela ganha borda cheia e cantos
- **Arraste o meio** para mover, **os cantos** para redimensionar livremente
  (aqui a faixa anda por cima das outras; a divisa ⇕ é a que respeita vizinho)
- **+ Nova faixa** cria uma no meio do que está à vista — arraste-a pro lugar
- Troque o **nome** e o **significado** (Pauta, Tarefas, Dúvidas, Pendências,
  Documentos, Tópicos, ou "não vira item")
- **Excluir** tira a faixa; a tinta escrita nela continua onde está

Duas coisas acontecem quando uma faixa muda:

- **A tinta é reclassificada.** Arrastar "Tarefas" por cima de uma anotação
  antiga transforma aquilo em tarefa — a divisão da folha manda, e ela acabou de
  mudar
- **Os itens seguem o novo significado**, exceto os que você tipou à mão no
  painel: sua escolha fica

A divisão **se repete a cada folha** conforme a página cresce para baixo, e é
desenhada assim. Antes ela era esticada pela altura inteira da página enquanto a
escrita era classificada pela repetição — o que estava desenhado como "Tarefas"
na segunda tela de folha não era a faixa de tarefas de verdade.

---

## A transcrição

Quem lê a sua letra é o **ML Kit Digital Ink**, dentro do aparelho. Ele recebe
os **traços** — pontos e tempos —, não uma foto da tela; é exatamente o que o
app já guarda de cada linha. Depois de baixar o modelo do idioma uma vez (única
parte que precisa de internet), tudo roda offline e de graça: nenhuma anotação
sai do tablet.

O texto aparece embaixo da linha, pequeno e apagado: a sua letra é o conteúdo, o
texto é a legenda dela. Segure o dedo numa linha para corrigir — o que você
escrever vira "texto seu" e nunca mais é substituído, nem quando você acrescenta
palavras na mesma linha depois.

No navegador não existe nada equivalente que rode offline, então lá a
transcrição automática não aparece — só a escrita à mão no mesmo editor.

Código: `src/ocr/handwriting.ts` (lado web) e
`android/app/src/main/java/com/leomerets/organizador/InkRecognitionPlugin.java`
(lado Android).

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
  items/       identificação dos campos escritos e o filtro da Central
  ocr/         transcrição da letra (ponte com o plugin Android)
  zones/       em que zona um ponto caiu, e a edição das faixas
  db/          persistência local (IndexedDB)
  state/       estado do app e todas as ações que mudam dados
  audio/       gravação
  components/  a folha, a navegação, as barras, o painel
  lib/         geometria e utilidades
tools/         testes do rabisco, da borracha, dos campos, das zonas e da Central
```

Regra da casa: **componente não fala com o banco**. Ele chama uma ação de
`state/store.ts`, que atualiza a memória primeiro (a tela responde na hora) e
grava no banco em seguida. É isso que mantém a escrita fluida.

---

## Próximas etapas

1. **Exportar as anotações** para arquivo — hoje elas só existem dentro do
   tablet, e limpar os dados do navegador as apaga
2. **Salvar a folha com as faixas ajustadas como modelo seu** — hoje a edição
   vale só para a página em que foi feita
3. **Áudio ligado à tinta** — tocar num traço e ouvir o trecho da gravação
   daquele momento. Os dados necessários já estão sendo guardados.
4. **Ícones personalizados** — você cria os seus carimbos, com os seus
   significados.
5. ~~Transcrição da letra (OCR)~~ — feito, no APK, com ML Kit offline.
6. ~~Zonas editáveis na folha~~ — feito.
7. ~~Empacotar como app Android~~ — feito.
