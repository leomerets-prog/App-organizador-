# Handoff — Organizador

Estado do projeto, decisões que já foram tomadas e as armadilhas que esperam
quem continuar. Escrito para ser lido inteiro antes do primeiro commit.

---

## O que é

Caderno de trabalho com caneta, para tablet Android (feito para um Lenovo Idea
Tab). O usuário escreve à mão numa folha dividida em **zonas** que classificam
o que cai dentro delas: cada linha escrita numa zona com significado vira um
**item** sozinha (tarefa, pauta, dúvida, pendência…) e é **transcrita ali
mesmo**, embaixo da própria letra, na folha. As zonas são **editáveis na
folha**: arrastar, redimensionar, criar, renomear e trocar o significado. O que
a zona não pegar, ele marca com **carimbo** usando o laço. Um **painel com
abas** reúne tudo, de todos os cadernos, como resumo — o conteúdo continua na
página onde foi escrito, que é o pedido explícito do usuário: *"é pra sempre
ficar lá e não ir saindo e caindo em outra tela"*.

Hierarquia igual OneNote: **Bloco de Anotações → Seção → Página**.

O usuário não é programador. Ele descreve o que quer em português; as decisões
técnicas são de quem implementa.

---

## Como está funcionando

Instalado como **APK Android**, montado pelo GitHub a cada envio e publicado na
release fixa [`ultimo`](../../releases/tag/ultimo). Atualizar é baixar e tocar.

Existe também o caminho por navegador (pasta `tablet/` + Termux), documentado
em [GUIA-TABLET.md](GUIA-TABLET.md). É legado útil, mas o APK é o caminho real.

**Tudo offline.** As anotações vivem em IndexedDB, dentro do armazenamento
privado do app. Nada sai do aparelho.

---

## Rodando

```bash
npm install
npm run dev            # servidor de desenvolvimento
npm test               # rabisco + borracha + campos + zonas (rode sempre)
npm run build:tablet   # regenera tablet/ — COMITAR JUNTO
npx cap sync android   # leva tablet/ para o projeto Android
```

Não há SDK do Android neste ambiente e o download dele é bloqueado; **o APK só
é montado no GitHub**. O `.github/workflows/apk.yml` faz tudo.

---

## Armadilhas — leia antes de mexer

### 1. A chave de assinatura não pode mudar

`keystore/organizador.jks` está versionado de propósito. O Android só instala
uma atualização por cima quando a assinatura confere; trocar a chave obrigaria
a desinstalar o app, **apagando todas as anotações do usuário**. A senha está
no `android/app/build.gradle`, com a contrapartida comentada ali.

### 2. `tablet/` é build versionado

O `webDir` do Capacitor aponta para `tablet/`. Mudou algo em `src/`? Rode
`npm run build:tablet` e comite a pasta junto, senão o APK sai com o app velho.

### 3. Java 17, nunca 21

O Gradle 8.2 que o Capacitor traz não roda em Java 21. Já quebrou uma vez.

### 4. A folha nunca pode ter largura zero

Já derrubou o processo do navegador duas vezes (tela branca ao girar o tablet e
ao tocar no ☰). A causa: com a barra lateral fora do fluxo, a área principal
caía numa coluna de largura zero → escala zero → matriz degenerada no canvas.

Três defesas hoje, todas necessárias:

- CSS: `.app` usa **uma coluna** quando a lateral não está no fluxo, nunca
  `0 1fr`
- `resize()` descarta medidas não positivas
- `computeMetrics()` tem piso de escala e `clamp()` trata NaN

Ao mexer em layout, teste **girando o tablet e alternando o ☰**.

### 5. Auto-cruzamento NÃO serve para detectar rabisco

Parece o sinal óbvio e é armadilha: letra cursiva fecha um laço em quase toda
letra (g, ç, o, e, l), e uma palavra de seis letras produz tantos cruzamentos
quanto três voltas rabiscadas. Isso ligava a borracha no meio da escrita do
usuário — foi um defeito real, relatado por ele.

A densidade também não separa: cursiva com laços dá densidade **maior** que
rabiscos legítimos.

O único sinal usado é **quantas vezes o traço vai e volta no próprio eixo**:
escrita fica em 0–1, rabisco em 5–9. `npm run test:scribble` guarda essa
fronteira, com casos de cursiva que reproduzem o defeito antigo.

### 6. Apagar é o único lugar onde se perde trabalho

Não existe exportação. Se a borracha errar e não houver como desfazer, o
trabalho foi. Por isso existe o passo de desfazer, e por isso o toque parado
com a borracha **não apaga** (só o arrasto apaga).

### 7. Desenho e classificação das zonas têm que concordar

A divisão em zonas **se repete a cada folha padrão** (1754px) conforme a página
cresce pra baixo — é assim que `zones/hit.ts` classifica a escrita, com o resto
da divisão. O desenho, porém, esticava as faixas pela altura inteira da página:
o que aparecia como "Tarefas" na segunda tela de folha não era a faixa de
tarefas de verdade, e a escrita dali caía em outro lugar do painel.

Hoje `drawZones` desenha uma repetição por folha. **Mexeu num dos dois lados,
mexa no outro** — e role a página até a segunda folha pra conferir.

### 8. Transcrição é plugin nativo; o navegador não tem

Quem lê a letra é o ML Kit Digital Ink, num plugin Android
(`InkRecognitionPlugin.java`). Três coisas a saber:

- `registerPlugin` **antes** do `super.onCreate` no `MainActivity` — depois
  dele a ponte com a página já foi montada e o plugin não existe pro JavaScript
- O modelo do idioma é baixado **uma vez** e precisa de internet nessa vez; daí
  em diante roda offline
- No navegador não há equivalente offline. A ponte (`src/ocr/handwriting.ts`)
  detecta isso e devolve "indisponível" — o texto escrito à mão continua sendo
  o caminho que funciona em todo lugar, e **nunca é sobrescrito** pela leitura
  automática (é o `ocr.status === 'manual'`)

### 9. Editar zona reclassifica a tinta

O traço guarda a zona em que caiu quando foi escrito. Arrastar uma faixa por
cima de anotação antiga precisa transformar aquilo — a divisão da folha manda, e
ela acabou de mudar (`reclassifyStrokes`). Pela mesma razão, trocar o
significado da faixa re-tipa os itens que vieram dela, **exceto** os que o
usuário tipou à mão no painel (`Item.kindByUser`).

### 10. A identificação mede o vão em alturas de escrita — com piso

O que separa duas colunas na mesma faixa é um vão horizontal medido em alturas
da escrita. Sem piso, uma linha rasa (letra toda baixa, um traço, um
sublinhado) dá um limite minúsculo e o **espaço normal entre duas palavras
vira "duas colunas"** — duas tarefas onde havia uma. Aconteceu num teste no
navegador, com traços de 4px de altura.

Hoje a referência é a maior entre a altura da linha, a altura típica da zona e
`MIN_WRITING_HEIGHT`. Ao mexer nas medidas de `items/detect.ts`, teste com
escrita **baixa e miúda**, não só com letra graúda.

### 11. Item automático é reconhecido pela tinta que contém

Enquanto sobrar um traço em comum, o item continua sendo o mesmo — e mantém o
tipo que o usuário escolheu, o concluído que ele marcou e o arquivado de quando
ele disse que aquilo não era item. Se a reconciliação passar a casar por
posição, ou a recriar itens do zero a cada passada, **cada palavra acrescentada
à linha apagaria uma decisão do usuário**. `planFieldSync` existe pra isso e
`tools/fields-test.ts` cerca esse comportamento.

### 12. Itens carimbados precisam sobreviver ao corte

A borracha é de ponta: corta o traço em pedaços. Um item que apontava para o
traço original passa a apontar para os pedaços — senão apagar um naco da tinta
de uma tarefa a faria sumir do painel. A linhagem sobrevive a cortes sucessivos
(ver `reconcileItems` em `state/store.ts`).

---

## Mapa do código

```
src/
  domain/      modelo de dados, modelos de folha, medidas e constantes
  ink/         captura da caneta, desenho, gesto do rabisco, zoom, borracha
  items/       identificação dos campos escritos nas zonas
  ocr/         transcrição da letra (ponte com o plugin Android)
  zones/       em que zona um ponto caiu, e a edição das faixas
  db/          IndexedDB (versão 2: traços, zonas, itens, áudio, imagens)
  state/       estado e todas as ações que mudam dados; preferências
  update/      verificação de versão
  components/  folha, navegação, barras, painel
  lib/         geometria
tools/         testes de rabisco, de borracha, de campos e de zonas
android/       projeto Capacitor (gerado, mas versionado)
keystore/      chave de assinatura — não trocar
```

**Regra da casa:** componente não fala com o banco. Chama uma ação de
`state/store.ts`, que atualiza a memória primeiro (a tela responde na hora) e
grava depois. É isso que mantém a escrita fluida.

**O que é puro e testável:** `ink/erase.ts`, `ink/scribble.ts`,
`ink/viewport.ts`, `items/detect.ts`, `zones/edit.ts` e `lib/geometry.ts` não
sabem nada de React nem de banco. Lógica nova de tinta, de identificação ou de
zona deve nascer ali.

**Caminho quente:** o traço em andamento e o estado da janela (zoom/rolagem)
vivem em refs, fora do ciclo do React, e o canvas é redesenhado por
`requestAnimationFrame`. Mover isso para estado do React engasga a caneta.

---

## Decisões já tomadas (não refazer sem motivo)

| Decisão | Por quê |
|---|---|
| PWA embrulhada em Capacitor, não app nativo | Mesmo código, iteração rápida; o usuário recebe APK |
| Anotações só no aparelho | Escolha explícita do usuário: sem nuvem |
| Rabisco **liga a borracha**, não apaga | Reconhecer errado custa um toque, não tinta perdida |
| Borracha de ponta, não de traço | Corrigir uma letra sem perder a palavra |
| Cor padrão da caneta é símbolo, não valor | Anotação escrita no escuro continua legível no claro |
| Zoom em módulo isolado | Zoom toca em tudo que envolve posição |
| Uma linha escrita = um campo | Numa faixa de tarefas se escreve uma por linha; juntar linhas faria uma tarefa gigante que não dá pra concluir em separado |
| Anotação e folha Livre não geram item | Ali a escrita é a anotação em si; item por linha encheria o painel de lixo e mataria a confiança nele |
| Identificação só depois que a mão para (800ms) | Rodar no meio da frase criaria e apagaria um item por palavra |
| "Não era item" arquiva, não apaga | Nenhum caminho novo pode custar tinta do usuário; e o arquivado impede que a identificação recrie o campo |
| Transcrição aparece NA FOLHA, embaixo da letra | Pedido direto do usuário: o conteúdo não pode migrar pra outra tela. O painel é resumo, não destino |
| Texto escrito à mão nunca é sobrescrito | Corrigir uma transcrição errada e vê-la voltar ao errado na palavra seguinte destruiria a confiança no recurso |
| Divisa ⇕ funciona em qualquer ferramenta | "Se a aba ficou pequena, eu expando e continuo escrevendo" — trocar de modo pra isso quebraria o fluxo |
| Divisa tira de uma pra dar à outra | Crescer sem tirar de ninguém sobreporia faixas, e a mesma linha pertenceria a duas |
| ML Kit Digital Ink, não OCR de imagem | Ele lê traços com tempo, que é o que o app já guarda; e roda offline depois do primeiro download |

---

## Limites conhecidos

**Não há exportação.** As anotações só existem dentro do app. Desinstalar apaga
tudo. É o item 1 da lista de próximas etapas por esse motivo.

**A verificação de atualização não funciona automaticamente.** O repositório é
privado e a API do GitHub responde 404 para quem não está autenticado. O app
detecta isso e explica, oferecendo o caminho manual (abrir a página de versões
no navegador, onde o usuário está logado). Para automatizar seria preciso
tornar pública a origem das versões — decisão do usuário, ainda em aberto.
Guardar um token dentro do APK está fora de cogitação.

**Não testado em aparelho real por quem desenvolve:** microfone e seletor de
galeria dentro da WebView do Capacitor. As permissões estão declaradas no
`AndroidManifest.xml`, mas a confirmação depende do tablet do usuário.

A identificação de campos e a edição de zonas foram verificadas **no
navegador**, com traços simulados (linha escrita, palavra acrescentada na mesma
linha, arquivar, apagar, mover e redimensionar faixa, puxar a divisa ⇕, escrever
o texto à mão pelo toque longo) e pelos casos de `tools/fields-test.ts` e
`tools/zones-test.ts`. Com letra de gente, num tablet, os limites de agrupamento
ainda podem precisar de ajuste — eles estão todos nomeados no topo de
`items/detect.ts`, justamente para isso.

**A transcrição não foi vista funcionando.** O plugin Java não compila neste
ambiente (não há SDK do Android aqui) e não há tablet pra testar: quem prova que
ele compila é a esteira do GitHub, e quem prova que ele LÊ é o usuário. A
qualidade do reconhecimento com a letra dele é desconhecida.

**A identificação depende de o usuário escrever dentro das faixas.** Quem
escreve uma tarefa no meio da zona de anotação não vê nada no painel; para esse
caso continua existindo o laço.

**A edição de zonas vale só pra página onde foi feita.** Não há como salvar a
folha ajustada como modelo — é a próxima etapa 2.

---

## Próximas etapas

1. **Exportar as anotações** — único caminho de perda real de trabalho
2. **Salvar a folha ajustada como modelo do usuário** — hoje a edição de zonas
   vale só pra página onde foi feita
3. **Áudio ligado à tinta** — tocar num traço e ouvir o momento; os instantes
   já são gravados em cada ponto
4. **Ícones personalizados** — o usuário cria seus próprios carimbos
5. ~~Transcrição da letra (OCR)~~ — feita, com ML Kit offline, no APK
6. ~~Zonas editáveis na folha~~ — feitas

---

## Como o usuário trabalha

Ele reporta em português, muitas vezes por voz, com descrições do efeito e não
da causa ("a borracha está apagando minha palavra", "fica tudo branco a tela").
Duas coisas ajudaram sempre:

- **Reproduzir antes de corrigir.** Os dois travamentos de tela branca eram o
  mesmo defeito de layout, e só ficou claro medindo — não lendo o código.
- **Dizer o que não foi verificado.** Nada aqui foi testado no tablet dele por
  quem escreveu; o que foi testado, foi no navegador. Vale repetir isso a cada
  entrega em vez de deixar implícito.
