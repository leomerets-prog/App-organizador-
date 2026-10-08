# Handoff — Organizador

Estado do projeto, decisões que já foram tomadas e as armadilhas que esperam
quem continuar. Escrito para ser lido inteiro antes do primeiro commit.

---

## O que é

Caderno de trabalho com caneta, para tablet Android (feito para um Lenovo Idea
Tab). O usuário escreve à mão numa folha dividida em **zonas** que classificam
o que cai dentro delas: **toda** linha escrita vira um **registro** sozinha
(tarefa, pauta, dúvida, pendência… e `nota` no corpo da folha) e é
**transcrita**. As zonas são **editáveis na folha**: arrastar, redimensionar,
criar, renomear e trocar o significado. O que a zona não pegar, ele marca com
**carimbo** usando o laço.

O destino de tudo isso é a **Central**: *"como se fosse um CRM profissional
onde eu vejo minha central, dúvidas, ações etc"*, nas palavras dele. Trilho de
módulos, visão geral, busca no texto, filtro por caderno, e — pedido depois —
uma **ficha por registro**, onde se põe prazo, prioridade, com quem e uma
observação, com a lista se organizando sozinha por isso: *"assim eu consigo me
organizar sem precisar voltar nas anotações"*. O texto também fica na folha,
embaixo da letra — os dois lugares mostram o MESMO registro, e marcar concluído
num risca no outro.

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

**O plugin nativo é conferido aqui, antes da esteira.** `npm test` roda o
`javac` contra as sombras em `tools/java-stubs` — cópias das assinaturas das
bibliotecas do Android. Não substitui a compilação de verdade, mas pega o erro
bobo em um segundo, em vez de dez minutos de esteira com o usuário esperando de
app quebrado (aconteceu: um `catch` de exceção que ninguém lançava). Se a
esteira reclamar de algo que passou aqui, **a sombra é que está errada** —
corrija a sombra junto.

**A esteira abre o app antes de publicar.** Compilar não prova que o app abre:
a versão 8 saiu verde e fechava no tablet. Hoje o `apk.yml` instala a versão
publicada num emulador, instala a nova POR CIMA (que é o que o usuário faz) e
só publica se o app abrir, montar a tela e continuar de pé
(`tools/smoke-android.sh`). O log do Android fica guardado como anexo da
execução — é por ele que se descobre o que quebrou.

O roteiro escreve um **veredito em arquivo**, e o passo seguinte é quem reprova
a esteira. Isso separa duas coisas que não podem ser confundidas: *o app
quebrou* (segura a publicação) e *o aparelho virtual não ligou* (avisa e
publica assim mesmo). Já aconteceu de o emulador não subir na esteira; deixar
isso segurar a correção que o usuário está esperando seria trocar um problema
por outro.

```bash
npm install
npm run dev            # servidor de desenvolvimento
npm test               # rabisco, borracha, campos, zonas, Central, áudio,
                       # fluxograma e voltar/avançar
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

### 7. Laço que anda folha a folha precisa de teto

A escala de exibição tem um piso minúsculo (1e-4), de propósito — é ele que
impede a matriz degenerada da armadilha 4. Só que com escala mínima a altura
visível em px de página vira **milhões**, e qualquer laço que ande de folha em
folha (zonas repetidas, alças de divisa) ou de linha em linha (as pautas) passa
a rodar dezenas de milhares de vezes **por quadro**. O desenho engasga, o
Android acha que o app travou e fecha.

Foi isso que derrubou a versão 8 no tablet do usuário, junto com o service
worker velho. Hoje `visibleSheets()` (em `zones/edit.ts`, testado) limita a
`MAX_SHEETS`, e `drawRules` tem `MAX_RULES`.

**Toda vez que aparecer um `for` que anda pela altura da página: ele tem teto?**

### 8. Service worker não entra no APK

Duas medições, as duas guardadas aqui porque a segunda corrige a leitura da
primeira:

- **No navegador**, o service worker segurava a atualização: depois de trocar os
  arquivos, a primeira abertura ainda rodava o código VELHO; só a segunda trazia
  o novo.
- **Dentro do APK**, ele nunca chegou a existir. O log do Android mostra
  `Failed to register a ServiceWorker ... unknown error` em toda abertura,
  porque quem serve os arquivos é a ponte do Capacitor, não um servidor comum.
  Ou seja: ele nunca serviu versão velha no app — produzia só um erro por
  abertura, que é o tipo de ruído que engana quem procura defeito de verdade.

Hoje: `selfDestroying: true` (quem tinha um recebe um que se apaga) e
`injectRegister: false` (ninguém mais tenta registrar). `limparCacheAntigo()`,
no `main.tsx`, varre registros e caches na abertura.

**Não volte a ligar o service worker** — nem para o caminho por navegador — sem
resolver antes o que acontece com quem atualiza.

### 9. Desenho e classificação das zonas têm que concordar

A divisão em zonas **se repete a cada folha padrão** (1754px) conforme a página
cresce pra baixo — é assim que `zones/hit.ts` classifica a escrita, com o resto
da divisão. O desenho, porém, esticava as faixas pela altura inteira da página:
o que aparecia como "Tarefas" na segunda tela de folha não era a faixa de
tarefas de verdade, e a escrita dali caía em outro lugar do painel.

Hoje `drawZones` desenha uma repetição por folha. **Mexeu num dos dois lados,
mexa no outro** — e role a página até a segunda folha pra conferir.

### 10. Recurso que falha calado é recurso que não existe

O usuário instalou, escreveu, e nenhum texto apareceu. Nada na tela dizia por
quê: se o modelo ainda não tinha baixado, se o aparelho não tem reconhecedor,
se a leitura falhou. Tudo o que havia era estado interno.

Hoje o estado da transcrição está em três lugares — faixa na folha, aviso na
Central e o botão **Transcrever** na barra — sempre com o motivo escrito e um
toque que manda tentar de novo (`forcar: true` refaz o preparo e reprocessa até
as linhas que falharam).

Vale como regra pro resto: **todo caminho que pode não acontecer precisa de um
lugar na tela onde ele conta que não aconteceu.**

### 11. O contexto do reconhecedor é tudo ou nada

**Isto segurou a transcrição inteira, do primeiro APK até a versão 17.** O erro
era sempre o mesmo, e chegava na tela como se fosse outra coisa:

    Missing required properties: preContext

Não é a ponte do Capacitor, nem o modelo, nem a letra: é o construtor de
`RecognitionContext` (ML Kit), que **exige todos os campos**. O código só
chamava `setPreContext` quando havia texto anterior — e nunca há — então
`build()` estourava ANTES de o reconhecedor ver a tinta. Nenhuma linha foi lida
até isso ser corrigido.

Hoje: com área de escrita, o contexto vai completo (com `preContext` vazio);
sem área, não se monta contexto nenhum e usa-se `recognize(ink)` direto.

Duas lições que valem além deste caso:

- **Contrato de execução não aparece na conferência de tipos.** `npm test`
  compila o plugin contra as sombras, e nenhuma sombra pode impor "preencha
  todos os campos". Quando existir uma regra dessas, ela fica escrita no
  comentário da sombra (foi feito em `RecognitionContext`)
- **Erro de recurso acessório precisa chegar à tela com o texto original.**
  Enquanto o app dizia "não consegui ler", a investigação foi para escala da
  letra, área de escrita e idioma do modelo — três rodadas no lado errado. O
  caso virou quando a mensagem do aparelho apareceu inteira no aviso

### 12. Transcrição é plugin nativo; o navegador não tem

Quem lê a letra é o ML Kit Digital Ink, num plugin Android
(`InkRecognitionPlugin.java`). Três coisas a saber:

- `registerPlugin` **antes** do `super.onCreate` no `MainActivity` — depois
  dele a ponte com a página já foi montada e o plugin não existe pro JavaScript
- O modelo do idioma é baixado **uma vez** e precisa de internet nessa vez; daí
  em diante roda offline
- Tudo no plugin pega `Throwable`, não `Exception`: aparelho sem o reconhecedor
  devolve `NoClassDefFoundError`/`VerifyError`, que são `Error`. A transcrição é
  acessório; derrubar o caderno por causa dela é inaceitável
- O idioma **não** é pedido só pelo nome exato: `fromLanguageTag("pt-BR")` pode
  devolver nulo conforme o catálogo do aparelho, e aí a transcrição morre
  inteira. `resolveIdentifier()` varre `allModelIdentifiers()` atrás de qualquer
  português e devolve pro app qual foi escolhido, pra aparecer na tela
- No navegador não há equivalente offline. A ponte (`src/ocr/handwriting.ts`)
  detecta isso e devolve "indisponível" — o texto escrito à mão continua sendo
  o caminho que funciona em todo lugar, e **nunca é sobrescrito** pela leitura
  automática (é o `ocr.status === 'manual'`)

### 13. Editar zona reclassifica a tinta

O traço guarda a zona em que caiu quando foi escrito. Arrastar uma faixa por
cima de anotação antiga precisa transformar aquilo — a divisão da folha manda, e
ela acabou de mudar (`reclassifyStrokes`). Pela mesma razão, trocar o
significado da faixa re-tipa os itens que vieram dela, **exceto** os que o
usuário tipou à mão no painel (`Item.kindByUser`).

### 14. A identificação mede o vão em alturas de escrita — com piso

O que separa duas colunas na mesma faixa é um vão horizontal medido em alturas
da escrita. Sem piso, uma linha rasa (letra toda baixa, um traço, um
sublinhado) dá um limite minúsculo e o **espaço normal entre duas palavras
vira "duas colunas"** — duas tarefas onde havia uma. Aconteceu num teste no
navegador, com traços de 4px de altura.

Hoje a referência é a maior entre a altura da linha, a altura típica da zona e
`MIN_WRITING_HEIGHT`. Ao mexer nas medidas de `items/detect.ts`, teste com
escrita **baixa e miúda**, não só com letra graúda.

### 15. Item automático é reconhecido pela tinta que contém

Enquanto sobrar um traço em comum, o item continua sendo o mesmo — e mantém o
tipo que o usuário escolheu, o concluído que ele marcou e o arquivado de quando
ele disse que aquilo não era item. Se a reconciliação passar a casar por
posição, ou a recriar itens do zero a cada passada, **cada palavra acrescentada
à linha apagaria uma decisão do usuário**. `planFieldSync` existe pra isso e
`tools/fields-test.ts` cerca esse comportamento.

### 16. Itens carimbados precisam sobreviver ao corte

A borracha é de ponta: corta o traço em pedaços. Um item que apontava para o
traço original passa a apontar para os pedaços — senão apagar um naco da tinta
de uma tarefa a faria sumir do painel. A linhagem sobrevive a cortes sucessivos
(ver `reconcileItems` em `state/store.ts`).

### 17. Toda zona vira registro — e `nota` é registro que não é trabalho

Até a versão 17, Anotação e folha Livre **não geravam item**: quem escrevesse
ali não via texto nenhum na Central nem embaixo da própria letra, porque só
linha virada item é transcrita. O usuário pediu o contrário em uma frase —
*"transcreve tudo, inclusive a anotação"*.

Hoje `ZONE_ITEM_KIND` cobre **todas** as zonas, e o corpo da folha produz itens
de tipo `nota`. O risco original (encher o painel de lixo e matar a confiança no
número de cima) foi resolvido separando as contas, não voltando a ignorar:

- `nota` **não entra** no `open` do resumo — sai em `notas`, contado à parte
- `drawItemMarkers` **não** desenha carimbo na margem pra `nota`: a folha
  ficaria listrada de símbolo em cada linha de anotação

Ao criar um tipo novo de registro, decida as duas coisas junto: **ele conta como
trabalho em aberto? ele merece um símbolo na margem?**

### 18. O áudio gravado pelo navegador não sabe quanto dura

`MediaRecorder` escreve o arquivo em fluxo e nunca volta ao começo pra anotar a
duração no cabeçalho. O elemento `<audio>` então informa `duration = Infinity`
— e tudo que depende disso morre em silêncio: a barra de posição fica parada em
zero, o tempo na tela vira `Infinity` ou `NaN`, e o navegador recusa pular pro
meio. Nada disso dá erro; simplesmente não anda.

Duas defesas, as duas necessárias:

- **A medida certa está no app.** `Recording.durationMs` vem do cronômetro da
  gravação, marcado pelo relógio. `reliableDuration()` usa a do elemento só
  quando ela é finita e positiva, e cai pra essa
- **`destravarDuracao()`** (em `AudioBar.tsx`) manda o áudio pra um ponto
  absurdamente à frente. O navegador percorre o arquivo pra descobrir que
  aquilo não existe e, no caminho, aprende o tamanho de verdade. Tem prazo de 2
  segundos: barra travada é ruim, ficar esperando sem tocar nada é pior

A posição trunca (`formatPosition`) e a duração arredonda (`formatLength`), de
propósito: o cronômetro (6,0s) e a medida do arquivo (5,9s) nunca batem no
décimo, e truncando os dois o total pulava de `0:06` pra `0:05` no instante em
que se apertava tocar.

### 19. Arquivo grande não atravessa a ponte de uma vez

A ponte do Capacitor carrega texto. Uma gravação de uma hora vira dezenas de
megabytes de base64 — mandar isso numa chamada só é o caminho conhecido pra
derrubar a WebView por falta de memória, e derrubar a WebView aqui significa
derrubar o caderno.

Por isso `FileSaverPlugin` é `abrir` → `escrever` (em pedaços de 192 KB) →
`fechar`. Enquanto não fecha, o arquivo fica marcado como **pendente** no
Android e nenhum outro app o enxerga pela metade; se algo falhar no meio,
`cancelar` apaga o pedaço já escrito. Arquivo pela metade é pior que nenhum:
parece salvo e não toca.

Vale pra qualquer coisa que venha depois (exportar as anotações, por exemplo):
**se o tamanho depende do que o usuário produziu, não cabe numa chamada só.**

### 20. Salvar arquivo no Android: a pasta certa mudou de regra

Do Android 10 em diante não se escreve mais em pasta pública por caminho: é o
**MediaStore** que abre o arquivo, e aí não é preciso permissão nenhuma — o app
só mexe no que ele mesmo criou. Pedir `WRITE_EXTERNAL_STORAGE` num aparelho
novo seria pedir acesso ao armazenamento inteiro por causa de um botão de
salvar; por isso a permissão no manifesto tem `maxSdkVersion="28"`.

`FileSaverPlugin.criar()` tenta três caminhos, nessa ordem, e o app **sempre
diz na tela qual deles pegou**: MediaStore → pasta Downloads direta (Android
antigo) → pasta do próprio app. A última some se o app for desinstalado, e é
por isso que ela é a última — mas devolver "não deu" e deixar o usuário sem
cópia nenhuma seria pior.

### 21. A altura da folha é da PÁGINA, não uma constante

`SHEET` (1754, o A4) era constante, e por isso a divisão em zonas se repetia a
cada 1754px — o que também queria dizer que **nenhuma faixa podia passar do fim
da folha**. O usuário bateu nisso: *"não consegui estender ele muito pra
baixo"*.

A saída NÃO foi deixar a faixa vazar da folha. Isso quebraria a repetição e a
escrita passaria a cair numa faixa diferente da desenhada — a armadilha 9, que
já custou uma volta. A saída foi a folha esticar: `Page.sheetHeight` (opcional,
sem migração), e `extendDown()` recalcula TODAS as frações pra altura nova.

Três coisas acontecem juntas e **precisam** acontecer juntas: a faixa puxada
fica maior, as de baixo descem com o mesmo tamanho (em vez de serem cobertas —
faixa sobreposta faz a mesma linha pertencer a duas), e a página guarda a
altura nova. Gravar uma sem a outra deixa o desenho e a classificação
discordando.

Por isso tudo que mede a folha passou a receber a altura: `pageToFrac`,
`deltaToFrac`, `visibleSheets`, `zoneAtPoint`, `drawZones`, `detectFields`,
`writingArea`. **Se aparecer um lugar novo que divide por 1754, está errado** —
pega a altura da página.

### 22. Voltar e avançar guardam os DOIS lados

O desfazer antigo era uma faixa que aparecia por cinco segundos depois de
apagar. Virou pilha de verdade (`ink/history.ts`), com botões sempre à vista.

Cada passo guarda o que a folha tinha antes **e** o que passou a ter. Voltar
aplica um lado, avançar o outro — nada é recalculado ao contrário, que é onde
esse tipo de código erra e devolve a folha num estado que nunca existiu.

Dois detalhes que não são enfeite:

- `applyPatch` **não duplica** traço que já está lá. Dois toques no voltar
  (acontece, com pressa) devolveriam a mesma tinta duas vezes
- a borrachada carrega a **lista de itens inteira** nos dois sentidos. A
  borracha corta traços em pedaços e os itens são religados por linhagem, uma
  conta que não se faz ao contrário

A pilha cobre a TINTA (traço e borracha) e é esvaziada ao trocar de página.
Zona, item e ficha não entram: são mudanças que a própria tela desfaz num
toque, e misturá-las faria "voltar" significar coisas diferentes a cada vez.

### 23. Área não separa retângulo de redondo — canto separa

A primeira ideia pra ler a forma de uma caixa desenhada à mão é comparar a
área do traço com a da caixa envolvente. Não funciona: um círculo preenche 78%
e um retângulo de canto arredondado (que é como todo mundo desenha) preenche
uns 88%. Dez pontos de diferença, com a mão tremendo no meio.

O que separa é o **giro**: no círculo ele é o mesmo em toda a volta; no
retângulo está todo concentrado em quatro pontos. `countCorners()` reamostra o
traço e conta só os PICOS de giro — contar cada ponto acima do limite daria
doze cantos num retângulo, porque um canto feito à mão espalha o giro por
vários pontos.

A área ainda serve, mas pra outra pergunta: losango preenche ~50%, e isso sim
é categórico. Daí a ordem das perguntas em `classifyShape()`: magro demais →
não é caixa; preenche pouco → losango; tem canto → retângulo; não tem →
redondo. **Começar pelos cantos faria todo losango virar retângulo**, porque
os dois têm quatro.

### 24. A direção da seta é um palpite, a não ser que haja ponta

Sem cabeça desenhada, a única pista de pra onde a seta aponta é a ordem em que
a mão fez o traço — e muita gente desenha a seta de trás pra frente. O leitor
usa a ordem, mas marca a ligação como `direcao: 'ordem'`, e o painel diz na
tela quantas setas estão nesse caso. Quando existe uma cabeça desenhada
(traço pequeno largado perto de uma das pontas), **ela ganha da ordem** e a
ligação vira `direcao: 'ponta'`.

Vale a regra geral: **palpite que não se anuncia vira erro silencioso.** Um
fluxograma com uma seta invertida parece certo e está errado — e quem recebe
não tem como saber.

### 25. O fluxograma lê a FOLHA, nunca uma zona

A primeira versão lia só a tinta da zona de fluxograma. Falhou no primeiro
desenho de verdade do usuário, e por três motivos somados — cada um sozinho já
bastava:

- **o desenho passa de uma folha.** Catorze caixas em cadeia deram 1871px, e a
  divisão em zonas se repete a cada 1754: as caixas de baixo eram classificadas
  na faixa do TOPO da folha seguinte e sumiam da leitura
- **o traço guarda a zona de quando foi escrito.** Ele desenhou primeiro e
  criou a zona depois; `addZone` reclassifica, mas pelo resto da divisão — numa
  zona menor que o desenho, parte dos traços nunca entrava nela
- **o botão só existia se a folha tivesse a zona.** Quem desenhou num modelo
  qualquer não via botão nenhum, e acabava tocando em "Transcrever"

Hoje `buildFlowchart()` lê **todos os traços da página**, sem zona nenhuma no
caminho, e o botão está sempre na barra. Não faz falta: caixa, seta e letra se
distinguem pela geometria, e o que não é do desenho (o título escrito à mão, as
notas da margem) vira traço solto, é contado e dito na tela.

A leitura em si nunca foi a culpada — o desenho dele, reconstruído da foto, sai
com 14 caixas e 13 setas. Esse caso está em `tools/flow-test.ts`, com as
medidas reais, justamente pra que ninguém volte a estreitar a entrada.

**Regra que vale além deste caso:** quando um recurso precisa de uma condição
que o usuário não sabe que existe (ter escolhido o modelo certo, ter criado a
zona ANTES de desenhar), a condição é o defeito.

### 26. Quase ninguém desenha um retângulo sem levantar a caneta

A leitura só aceitava caixa feita de UM traço fechado. Com caneta na mão, o
normal é dois "L" encaixados, ou os quatro lados soltos — e aí nenhum traço
sozinho é caixa nenhuma. O fluxograma inteiro do usuário não devolvia uma
única caixa por causa disso, e o teste não pegava porque todos os desenhos de
teste eram feitos de uma tacada só.

`chainOpenStrokes()` junta traços abertos cujas pontas se encontram (até 30px).
Três regras que não são enfeite, e cada uma veio de um erro medido:

- **para assim que FECHA.** Sem isso a junção continuava e soldava a letra de
  dentro da caixa no lado dela: de 14 caixas, 3 se perdiam
- **o menor vão ganha.** O lado seguinte encosta de perto; a letra, que às
  vezes também está perto, encosta de longe
- **cadeia que não fecha devolve tudo.** Uma tentativa frustrada não pode
  consumir os lados de uma caixa que daria certo logo adiante

Só entram traços com mais de 34px: letra é curta, e deixá-la entrar faria
palavras virarem caixas (há caso de teste pra isso).

**Lição que vale pro resto:** *todo* desenho sintético deste repositório era
feito do jeito mais limpo possível — e foi exatamente por onde o recurso
quebrou com gente de verdade. Teste de desenho precisa imitar a MÃO, não a
geometria.

### 27. Ponta de seta errada INVERTE a seta — e vira a leitura do avesso

O caso mais caro desta série, e o mais difícil de ver. O painel do usuário
dizia: 15 caixas, 13 setas, **2 setas sem ponta desenhada**. Ou seja, o leitor
achou ponta em ONZE — num desenho que quase não tinha ponta nenhuma.

O que estava sendo pego era a **letra** da caixa vizinha: pequena, e a poucos
píxeis da ponta do traço. E como é a ponta que decide a direção, metade das
setas saía invertida. Uma corrente de catorze caixas virou uma árvore de cinco
raízes — o desenho montado não se parecia nada com o desenhado, e de fora
parecia "não funcionou" de novo.

Hoje uma ponta de seta precisa parecer uma: **não mora dentro de uma caixa**
(letra mora), **não é fechada**, e **tem bico** — um ou dois cantos vivos.

Duas lições, as duas caras:

- **Sinal que inverte sentido precisa ser muito mais exigente que sinal que
  só acrescenta.** Uma caixa a mais é um erro visível e local; uma seta
  invertida reorganiza o desenho inteiro
- **O número que denunciou foi o que ninguém pediu.** "2 setas sem ponta"
  parecia detalhe; foi o que apontou o defeito. Diagnóstico na tela paga
  rodadas de adivinhação

### 28. "Como eu li": a vista que acaba com a adivinhação

Foram cinco rodadas de "não funcionou" em que os números na tela diziam QUE a
leitura errava, mas não ONDE. Caro pra todo mundo.

O painel tem um segundo modo: as caixas reconhecidas desenhadas **nas posições
em que foram desenhadas**, numeradas, com cada ligação entendida saindo como
uma seta de centro a centro. Comparando com a folha, vê-se de relance qual seta
grudou na caixa errada, qual caixa não foi vista e qual foi vista onde não
havia nada.

Um print dessa tela responde, de uma vez, o que três rodadas de números não
responderam. **Quando um recurso interpreta o que o usuário fez, ele precisa
saber MOSTRAR o que entendeu — não só o resultado.**

### 29. Limite fixo não serve a desenho de gente — a régua é o próprio desenho

Último defeito da série, e o mais instrutivo. A vista "Como eu li" mostrou que
TODAS as ligações encontradas estavam certas; só que quatro não eram
encontradas. Sempre as mesmas: as mais curtas, entre caixas quase encostadas,
onde o tiquinho que liga tem uns quinze píxeis. Cada uma partia a corrente num
pedaço novo, e cada pedaço virava uma raiz a mais no desenho montado — o que de
fora parecia "ele entendeu tudo errado".

A causa era um `MIN_EDGE_LENGTH = 26` fixo. Esse número tem que servir a um vão
de 30px e a um de 300, e não serve: alto demais perde as ligações curtas, baixo
demais aceita qualquer rabisco.

Hoje a régua é a geometria do próprio desenho (`atravessaOVao`): o traço precisa
cobrir **metade do vão entre as duas caixas**. Quem liga duas caixas encostadas
precisa de pouco; quem liga duas distantes precisa percorrer o caminho.

**Vale pra todo limite deste app:** antes de escrever um número fixo, pergunte
em que medida do desenho ele deveria estar expresso. `MIN_WRITING_HEIGHT`
(armadilha 14) é do mesmo tipo — e teve o mesmo defeito.

### 30. Remontar não pode apagar o que foi editado — e isso é um módulo puro

O painel virou editor: arrastar caixa, ligar, ramificar, criar caixa, trocar
forma e cor. E aí "Ler de novo" deixou de ser inofensivo: quem corrigiu quinze
nomes, arrastou tudo pro lugar, criou duas ramificações e escolheu as cores não
pode perder nada disso por tocar num botão — e vai tocar, porque desenhar mais
na folha é o normal.

Por isso a junção mora em `flow/merge.ts`, **pura e testada**, e não solta no
store. As regras, em ordem:

1. **O que o usuário fez à mão nunca some.** Caixa e ligação criadas no painel
   não têm tinta por trás; a leitura jamais as encontraria
2. **O que ele editou vence a leitura.** Nome, forma, posição, cor e direção
   invertida sobrevivem
3. **O que ele NÃO tocou segue a tinta.** Caixa apagada do desenho sai; caixa
   nova entra — senão o fluxograma congela e para de acompanhar a folha

Seis casos de teste cercam isso, inclusive os dois lados: o que sobrevive e o
que tem que sair.

### 31. Arrastar numa tela que se ajusta sozinha é um laço

O app travou (sem fechar) no primeiro arrasto de verdade. A causa é um laço de
realimentação que não aparece em teste nenhum com o mouse:

> a caixa anda pra fora → a tela cresce pra caber → o SVG encolhe pra caber na
> largura → **o mesmo dedo passa a valer mais píxeis de desenho** → a caixa anda
> mais → a tela cresce de novo

A régua se mexia no meio do movimento. Hoje o tamanho da tela é **congelado**
enquanto o dedo anda (`telaCongelada`), com folga pra onde arrastar, e o
desenho se ajusta de uma vez quando solta.

E o toque não abria a barra de edição por um parente do mesmo erro: o limite
de "andou ou não andou" era medido em píxeis DO DESENHO. Com o fluxograma
reduzido pra caber na largura, seis píxeis de desenho viram dois de dedo — e
aí nenhum toque de gente conta como toque, tudo vira arrasto. Agora a medida é
em píxeis DE TELA.

**A regra:** num gesto, toda medida que decide o comportamento tem que estar em
píxeis de tela, e nenhuma régua pode mudar enquanto o dedo está encostado.

### 32. A estrutura aparece antes dos nomes

O fluxograma só era mostrado depois de passar o reconhecedor em CADA caixa.
Com quinze caixas isso é mais de um minuto de tela parada escrito "lendo os
nomes" — o usuário esperou, não apareceu nada, e a conclusão razoável foi que
não funcionou. A leitura estava certa o tempo todo.

Hoje o desenho é gravado e mostrado primeiro; os nomes chegam depois, caixa por
caixa, atualizando o que já está na tela. Com dois prazos, porque o
reconhecedor pode demorar muito ou não voltar nunca: 25s pro conjunto e 6s por
caixa (`Promise.race`). Estourou, o resto fica em branco e a tela diz o que
fazer — nunca "lendo" pra sempre.

**Regra geral:** o que o usuário pediu pra ver é a ESTRUTURA. Tudo que é
enfeite — nome, texto, enriquecimento — chega depois, com a tela já montada.
Segurar a tela inteira pelo acessório mais lento é o jeito mais fácil de
transformar um recurso que funciona num recurso que "não foi".

### 33. Fluxograma não se lê linha por linha

A zona de fluxograma é a única que `items/detect.ts` ignora (`ZONES_SEM_LINHA`).
Lá uma caixa e a seta ao lado estão na mesma altura: a identificação por linha
leria as duas como um campo só, e um desenho de dez traços viraria quatro
"tarefas" sem sentido fora do desenho.

A leitura daquela zona é outra, mora em `flow/`, e o resultado é **um** registro
— o desenho montado — em vez de um por linha.

### 34. Prazo é dia do calendário, no fuso de casa

`new Date('2026-09-30')` é lido como **UTC** e, no Brasil, volta como dia 29. Um
prazo que anda um dia pra trás sozinho destrói a confiança na lista inteira — e
é o tipo de defeito que só aparece à tarde, no aparelho do usuário.

Por isso a conversão do campo de data é feita a dedo, campo a campo, em
`components/ItemPanel.tsx` (`paraCampo`/`doCampo`), e as faixas de prazo usam
`inicioDoDia`/`fimDoDia` (em `items/central.ts`), nunca comparação de instantes
crus. **Não troque nada disso por `toISOString()` nem por `Date.parse`.**

### 35. Medida de gesto tirada ANTES da régua mudar

Parente da armadilha 31, e foi o que sobrou dela. O arrasto congelava a tela
num tamanho **maior** que o atual (`+700`) pra ter onde soltar a caixa. Isso
trocava a régua no instante do toque: a distância entre o dedo e o canto da
caixa tinha sido medida com a régua velha e passava a ser usada com a nova. A
caixa não ficava lenta nem rápida — ela **pulava** no primeiro movimento e
seguia o dedo dali em diante, deslocada. De fora, "não consigo arrastar
livremente pra onde eu quero".

Dois consertos, e os dois valem como regra:

1. **A folga de arrastar existe o tempo todo** (`FOLGA`, na conta do tamanho da
   tela), e não só durante o arrasto. Congelar passa a congelar no tamanho que
   a tela já tem — nada muda no instante do toque
2. **A distância dedo↔caixa é medida no PRIMEIRO MOVIMENTO**, com a régua que
   está valendo, e não no `pointerdown`

**A regra:** nenhuma medida de gesto pode atravessar uma troca de régua. Ou se
mede depois da troca, ou não se troca.

O caso do navegador mede o passeio **com o dedo ainda encostado** — depois de
soltar, a tela se reajusta e a conta deixaria de falar do que está sendo
testado — e a folga é de 8px de propósito: com o defeito o pulo era de uns
24px, e uma folga generosa deixaria passar justamente o que o usuário sentia.

### 36. Desfazer do painel é FOTOGRAFIA, não remendo

A tinta (`ink/history.ts`) guarda os dois lados de cada passo porque um traço
pesa. O fluxograma é outra coisa: uma dúzia de caixas e uma dúzia de setas — o
desenho inteiro é menor que UM traço. Então cada passo guarda o fluxograma
inteiro (`flow/undo.ts`).

Isso compra o que importa: **"Ler de novo" vira um passo como qualquer outro.**
Remontar a partir da tinta não tem operação inversa pra calcular; com a
fotografia, voltar é devolver a que está guardada. E é o passo que mais precisa
disso — a remontagem respeita o que foi editado, mas o resto acompanha a folha,
e quem tocar no botão sem querer perderia o arranjo.

Duas coisas que parecem detalhe e não são:

- **Passo que não muda nada não entra na pilha.** Tocar em "azul" numa caixa
  que já era azul e depois apertar ↶ mostraria o botão piscar e a tela parada —
  e a conclusão é que o desfazer não funciona. Quem grava compara a
  `assinatura` dos dois lados (que ignora `updatedAt` de propósito: ele muda a
  cada gravação e faria toda gravação parecer mudança)
- **O ↶ grava pelo caminho que NÃO registra passo** (`gravarChart`). Se
  registrasse, voltar empilharia um passo novo e o ↷ nunca sairia do lugar

Toda edição do painel passa por `salvarChart`, e é por isso que nenhuma precisa
lembrar de registrar o passo — nem de se nomear: o nome do passo ("caixa
movida", "cor") sai da comparação das duas fotografias.

### 36b. `touch-action` no SVG: tem que estar no `<svg>`, não no que está dentro

A armadilha mais cara desta sequência inteira, porque **passou em todos os
casos de teste**. O arrasto da caixa funcionava com mouse e não funcionava com
a caneta: a caixa andava uns dez píxeis e parava. De fora, "ainda não consigo
arrastar pra onde eu quero" — três versões seguidas.

Duas coisas se somavam:

1. A tela do painel **rola** (o desenho é mais alto que o painel). Rolagem é
   algo que o navegador quer fazer sozinho, e pra isso ele ROUBA o gesto: deixa
   o dedo andar alguns píxeis, decide que aquilo é rolagem e manda
   `pointercancel`
2. O `touch-action: none` que impediria isso estava no `<g>` da caixa — e **o
   navegador ignora `touch-action` em elemento de dentro de um SVG**, que não
   tem caixa de layout própria. A declaração não fazia nada

Hoje ela está no `.flow-svg`, com a mesma frase que já estava no `.canvas` da
folha desde o começo: *"sem isto o navegador rouba os eventos da caneta pra
rolar a página"*. O mesmo defeito, no mesmo app, duas vezes.

Duas consequências que vieram junto:

- **Quem passeia pelo desenho é o painel** (`passear`), porque a rolagem do
  navegador foi tirada: dedo no vazio arrasta a tela. É o que todo editor de
  fluxograma faz
- **`pointercancel` ABANDONA o arrasto**, em vez de gravar onde a caixa parou.
  Com o gesto roubado, gravar era o pior dos dois mundos: o arrasto não
  acontecia E a caixa saía do lugar um tiquinho

**A regra, e vale pro roteiro de teste mais do que pro código:** `touch-action`
só existe pra toque. Arrastar com `page.mouse` **nunca** exercita essa disputa,
então um arrasto que só é testado com mouse não está testado. O roteiro agora
manda toque de verdade (`Input.dispatchTouchEvent`, pelo CDP) nos dois casos
que importam — a caixa e o fundo.

### 36c. O laço do arrasto fechava ENTRE um arrasto e o seguinte

Assim que arrastar passou a funcionar com a caneta (36b), o app travou de novo.
Mesma família da 31, um nível acima — e, desta vez, medido:

| arrasto | largura do desenho | régua |
|---|---|---|
| — | 650 | 1,00 |
| 1 | 911 | 0,841 |
| 4 | 2193 | 0,349 |
| 8 | 7078 | 0,108 |

Cada arrasto multiplicava a largura por **1,34**. O caminho:

> a caixa é solta mais pra fora → a tela cresce pra caber → em "Caber" o desenho
> encolhe pra caber na largura → o mesmo passeio de dedo passa a valer mais
> píxeis de desenho → o arrasto seguinte leva a caixa mais longe ainda

Congelar o tamanho DURANTE o arrasto (31) fecha a porta de dentro; não fecha a
de fora. Dois cortes, e os dois são necessários:

1. **Piso de escala em "Caber"** (`ESCALA_MINIMA = 0.4`): abaixo disso o desenho
   para de encolher e a tela passa a rolar. Em CSS é uma linha — `min-width`
   ganha de `max-width`, então não é preciso medir nada em JavaScript. Com zoom
   escolhido pelo usuário não há laço, porque a régua é a que ele mandou e não
   depende do tamanho do desenho
2. **A caixa é presa dentro da folha de trabalho visível** (a do arranjo mais
   `FOLGA`): a folha passa a crescer de pedaço em pedaço, e não num múltiplo

Depois: a régua para em 0,4 e a largura em 2741, em vez de 7078 e caindo.

**A regra:** quando o tamanho do desenho decide a escala E a escala decide o
tamanho, o laço não se fecha só dentro de um gesto. Pergunte o que acontece no
DÉCIMO gesto, não no primeiro.

### 36d. Dois dedos não podem dirigir o mesmo gesto

Num tablet, encostar dois dedos é o normal: a palma da mão toca a tela antes da
ponta da caneta. Sem dono do gesto, cada toque começava um gesto próprio, e os
dois disputavam a mesma tela — um passeando o desenho, o outro arrastando a
caixa.

Medido, com a palma apoiada no desenho: a caixa ia pra `150×-107` em vez de
`150×110`, e **o arrasto seguinte, de um dedo só, não fazia mais nada
(`0×0`)**. É palavra por palavra o que o usuário relatou: "travou e congelou a
tela, não consigo mais arrastar".

Hoje há um dono (`gesto`), cada manipulador só escuta o ponteiro que o iniciou,
e a regra de quem ganha é: **a caneta não é interrompida por um dedo; todo o
resto é interrompido por quem chega.** O "quem chega ganha" é de propósito — um
gesto que ficou preso (o dedo saiu da tela sem o navegador avisar) trancaria o
painel pra sempre, que é justamente o defeito que se está consertando.

### 36e. Dono de gesto que não morre é o próprio defeito que ele conserta

A 36d pôs um dono no gesto, e o dono criou um jeito novo de travar: **a caneta
nem sempre manda `pointerup`.** Ela sai do alcance do digitalizador e o gesto
fica aberto. Com o dono valendo pra sempre, todo toque seguinte era recusado e
o painel ficava morto. O relato foi "consigo arrastar livremente mas ao soltar
ele travou" — e é literal: trava no instante de soltar, porque é aí que o dono
preso nasce.

Medido: com a caneta sumindo sem soltar, o arrasto seguinte, de dedo, andava
`0×0`. Com a guarda, `-88×70` de `-100×70` pedidos.

Três fechos, e nenhum sozinho basta:

- **`lostpointercapture` desliga o gesto.** É o aviso que chega quando o
  `pointerup` não chega
- **Dono parado não vale.** Cada movimento renova o gesto (`quando`); passado
  `GESTO_PARADO` sem notícias, quem chega assume, caneta ou não
- **Fora isso, quem chega ganha.** Só a caneta viva tem direito de não ser
  interrompida

**A regra:** toda exclusividade precisa de uma data de validade. Se um estado
seu pode recusar a entrada de alguém, pergunte quem o apaga quando o dono
desaparece sem avisar — porque ele vai desaparecer.

### 36f. Função de `setState` tem que ser pura — inclusive na hora de gravar

O soltar gravava a posição de dentro de um `setArrastando(atual => { grava;
return null })`. Parece prático: a posição está ali, na mão.

Mas essa função é chamada pelo React, **durante a renderização**. Gravar lá
dentro é mexer na loja no meio de uma renderização; quando o React descarta e
refaz essa renderização — coisa que ele faz, e mais num aparelho lento —, a
gravação acontece de novo, muda a loja de novo, e a renderização é descartada
de novo. O laço fecha no instante exato de soltar, e só em quem tem o aparelho
mais lento.

Hoje a posição viva mora num `useRef` (`ondeParou`), e o soltar lê de lá. Não
consegui reproduzir este no navegador do computador — ele é de temporização, e
a máquina daqui é rápida demais. Foi achado lendo o código, não medindo, e está
anotado aqui por isso.

### 36g. Um botão que ABRE uma coisa não pode refazê-la

O botão "Fluxograma" relia a folha inteira e remontava o desenho a cada toque.
O relato: *"ele fica lendo o fluxo várias vezes; eu saio pra olhar na folha e
volto a editar, ele já mexeu em várias coisas"*. E mexia mesmo — a junção guarda
o que foi editado, mas o que não foi acompanha a tinta, e os nomes são lidos de
novo caixa por caixa. Tudo isso porque ele quis dar uma olhada na folha.

Um fluxograma montado é uma COISA que existe. Hoje o botão abre a que existe, e
reler virou o que sempre devia ter sido: um pedido explícito, no "↻ Ler de
novo" de dentro do painel.

**O preço de "só abrir" é nunca atualizar**, e é por isso que o painel ganhou um
aviso: *"você desenhou nesta folha depois que o fluxograma foi montado"*. Ele
compara com `lidoAte` — o traço mais novo que entrou na leitura, gravado junto
com o fluxograma — e **não** com `updatedAt`, que muda a cada edição do painel e
faria o aviso sumir justamente depois de trabalhar nele.

**A regra:** quando um botão tanto abre quanto recalcula, separe os dois. E ao
separar, pergunte quem avisa que o recálculo ficou pendente.

### 36h. O app abria sempre na primeira folha

*"Quando eu salvo, eu não consigo retomar o projeto de onde eu estava."*

O arranque era `notebooks[0] → sections[0] → pages[0]`, sempre. Quem tem o
trabalho na folha vinte reencontrava o começo de tudo a cada vez.

Hoje o lugar (caderno + aba + folha) fica em `prefs.ultimoLugar`, no
localStorage — e não no banco — porque é do APARELHO, não do caderno: é a
resposta pra "onde eu parei aqui". Os três ids juntos, porque a folha sozinha
não diz em que aba ela está. Cada um é conferido antes de ser usado; qualquer um
que tenha sumido derruba pro caminho de sempre, e o app nunca fica sem lugar
nenhum.

É gravado **depois** de a folha abrir de verdade, nunca antes: anotar na
intenção faria o app tentar voltar pra uma folha que não chegou a carregar.

### 36i. A caixa cresce pelo texto, e quem mede é quem desenha

*"Queria alterar o tamanho do bloco e também a largura, pois escrevi muito e
está ficando oculto."*

A quebra do nome cortava em três linhas e o resto sumia — sem aviso nenhum.
Hoje:

- **o tamanho escolhido é um MÍNIMO**, nunca uma camisa de força. Uma caixa que
  recusasse crescer esconderia o nome, que é o defeito que o tamanho ajustável
  veio consertar
- **`quebrarTexto` devolve TODAS as linhas**, e parte a palavra que não cabe
  em vez de deixá-la vazar

E a parte que não pode ser esquecida: **a mesma função que mede é a que
desenha.** `quebrarTexto`/`limiteDeLetras` moram em `flow/layout.ts` e o painel
as importa. Se fossem duas contas parecidas, o dia em que uma mudasse a caixa
voltaria a ter altura de menos — e o texto, a sumir.

Largura e altura entram por BOTÃO, e não por alça no canto da caixa. A alça é o
jeito bonito e seria pequena demais: com o fluxograma reduzido pra caber na
largura, um canto de 30px do desenho vira doze de dedo. Isso já custou três
versões neste painel (36b).

### 36j. Numa grade, `auto` é max-content

A lista de setas na lateral é `display: grid`. Com um nome comprido, a coluna
`auto` cresceu até o tamanho do conteúdo e empurrou o ⇄ e o ✕ pra fora da
lateral — e a lateral inteira passou a rolar pro lado, escondendo as formas.

Dois fechos, porque um só não basta: `grid-template-columns: minmax(0, 1fr)` na
lista, e `overflow-x: hidden` na lateral. O primeiro é a causa; o segundo é a
garantia de que nenhum conteúdo futuro repita o truque.

**A regra:** numa coluna de grade que deve caber num espaço fixo, escreva
`minmax(0, 1fr)`. `1fr` sozinho também não segura — o mínimo automático de um
item de grade é `min-content`.

### 36k. Linha fina precisa de faixa larga

*"Queria tipo assim clicar na linha das intersecções e mexer nelas, ou tirar a
intersecção sem apagar a forma toda."*

A seta tem dois píxeis de largura. Dois píxeis não são alvo de toque pra
ninguém — e a resposta que eu tinha dado pra isso era ESCONDER a seta numa
lista na lateral, o que resolve o alvo e cria outro problema: o usuário quer
tocar na coisa que ele está vendo.

Hoje cada seta tem, por cima da linha fina, **um segundo caminho invisível de
26px** (`TOQUE_SETA`), com o manipulador de toque. Medido: um toque nove píxeis
ao lado da linha escolhe a seta; sem a faixa, não faz nada.

Três detalhes que não são detalhe:

- a faixa fica **antes das caixas** no desenho, pra que as caixas continuem por
  cima e a faixa larga nunca roube o toque de uma caixa vizinha
- o caso de teste toca **ao lado** da linha, na perpendicular, e não em cima:
  um toque em cima passa mesmo sem faixa, e o caso não provaria nada
- tirar a ligação é botão próprio, e a frase dele diz o que sobrevive — *"✕
  Tirar só a ligação"*. O medo de apagar a caixa junto era o que estava
  impedindo de usar

### 36l. A dobra da seta é uma FRAÇÃO, não um ponto

A seta se mexe pelos mesmos dois gestos das caixas: toca pra escolher, arrasta
pra mover. O que se arrasta é a **dobra** — o degrau do caminho.

Ela é guardada como fração do vão entre as duas pontas (`dobra`, 0,08 a 0,92), e
não como uma coordenada. É o que faz a dobra continuar onde deve quando as
caixas se mexem depois: coordenada guardada vira lixo no primeiro arrasto de
caixa. O mesmo vale pro ponto onde a seta ENCOSTA na borda (`saidaDesvio`,
`entradaDesvio`), que é fração do lado.

E a alça só aparece quando há degrau de verdade (caminho de quatro pontos). Numa
reta, ou num cotovelo único, não há o que mover — e uma alça que não faz nada é
pior que alça nenhuma.

### 36m. Texto solto é uma FORMA, não uma coisa à parte

*"Faltou apenas uma coisa: eu conseguir colocar título no fluxograma, adicionar
texto em si."*

O texto solto entrou como mais um valor de `FlowShape` (`'texto'`), e não como
uma lista de bilhetes ao lado das caixas. Com isso ele herdou de graça tudo que
já funciona numa caixa: arrastar, mudar largura e altura, crescer pelo texto,
escolher cor, desfazer, e sobreviver a "Ler de novo". Uma lista própria seria
código novo repetindo o que já existe — com os defeitos próprios dele.

Ele desenha um retângulo transparente com traço pontilhado fraco: o retângulo
existe porque é ele que recebe o toque e o arrasto; o traço quase invisível
mostra onde ele está sem competir com o desenho. Na lateral, o ícone ganha duas
linhas de letra desenhadas à parte — **um botão invisível não se reconhece.**

### 36n. O título mora em y NEGATIVO

O título é do fluxograma inteiro (`Flowchart.titulo`), aparece no desenho — não
só na barra — e por isso vai junto na imagem salva, que é o ponto: quem recebe o
PNG precisa saber do que ele é.

A faixa dele é feita **esticando o `viewBox` pra cima** (`0 -72 w h+72`), e não
empurrando o desenho pra baixo com um `transform`. Parece a mesma coisa e não é:
com o desenho deslocado, toda conta de arrasto passaria a precisar descontar o
deslocamento, e a primeira que esquecesse jogaria a caixa pra longe do dedo
(armadilhas 31, 35). Em y negativo, as coordenadas do desenho continuam as
mesmas que sempre foram.

O cabeçalho do painel É o botão do título: quem quer dar nome a uma coisa toca
no nome dela.

### 36o. Acento no nome do arquivo faz o navegador descartar o nome INTEIRO

Medido, não suposto: com `a.download = "Fluxo de aprovação.png"`, o Chrome salva
o arquivo como **"download"**. Sem o acento, salva com o nome certo. Em
português o acento é o caso normal — o título de um fluxograma quase sempre tem
um.

Por isso `limpar()` (em `audio/export.ts`, que serve ao áudio e à imagem) agora
separa a letra do acento (`normalize('NFD')`) e joga fora só o acento: "Fluxo de
aprovacao", que se lê igual e atravessa qualquer sistema de arquivos.

**A regra:** nome de arquivo é uma interface com o sistema operacional, não com
quem lê. Tudo que não for ASCII simples é risco de perder o nome todo — e perder
o nome todo é pior que perder a cedilha.

### 36p. A revisão por agentes: o que ela achou, e a raiz comum

Pedido dele: *"faça os agentes revisarem tudo que fazemos e melhorar buracos que
ficaram"*. Os revisores do everything-claude-code (code-reviewer,
silent-failure-hunter, react/typescript/security-reviewer, pr-test-analyzer)
rodaram por área — dados, áudio e ata, tinta, fluxograma — e cada achado só
contou depois de reproduzido no navegador. Foram 35 confirmados. Quase todos
eram o MESMO defeito com roupas diferentes: **código automático tratando como
descartável algo que o usuário fez**.

- **A ficha do item sumia** por quatro caminhos: o ↶ da borracha repunha a
  lista inteira de itens como estava; a leitura da letra gravava por cima a
  cópia de antes da espera; mudar a zona apagava itens com tinta na folha; e o
  carimbo do laço criava um item novo sem o prazo nem o responsável do
  automático. Tudo isso agora passa por `items/preservar.ts` — puro, com a
  regra de cada caminho escrita uma vez.
- **A Central editava a folha errada.** Mudar a ficha de um item de OUTRA folha
  procurava o item só na memória (que tem só a folha aberta) e não gravava
  nada, sem erro. `editarItem` procura na memória e, se não achar, no banco.
- **A gravação vivia só na memória até o Parar.** Uma hora de reunião e o app
  fechando sozinho = uma hora perdida. Agora cada segundo de áudio vai pro
  banco enquanto grava (`recordingBlobs`, chave `id#0000001`), com um rascunho
  `emAndamento`; ao abrir, `recuperarGravacoes()` remonta o que ficou e marca
  `recuperada`. O Parar troca os pedaços pelo arquivo inteiro numa transação
  só. O microfone que cai (ligação, outro app) também termina e guarda.
- **Transcrição e marca chegavam com outra folha aberta** e gravavam na folha
  errada, ou não gravavam. `editarGravacao` grava no banco pelo id, seja qual
  for a folha aberta, e diz se gravou, se recusou ou se a gravação sumiu.
- **Dois editores da mesma transcrição** (a barra e a Ata) guardavam a foto
  inteira e o segundo apagava o primeiro. `comTrechosEditados` grava só os
  tópicos que AQUELE editor mudou, e recusa se alguém mexeu no mesmo tópico.
- **Falha de gravação no banco era silêncio.** Armazenamento cheio: a tela
  mostrava a tinta, o banco não tinha nada, e ninguém avisava. `db/falhas.ts`
  reconhece a falha e a faixa vermelha diz o que fazer, com o botão "Guardar de
  novo" que regrava a folha aberta.
- **Tinta**: a palma que encosta depois da caneta virava gesto; a caneta que não
  manda `pointerup` deixava o traço sem gravar; traço acima do topo da folha
  caía na última zona (`-19 % altura` em JS é negativo).
- **Fluxograma**: sair do painel sem apertar Pronto perdia o nome digitado; um
  arrasto da dobra da seta virava dezenas de passos de ↶; a releitura apagava o
  nome digitado de caixa que tinha nome vazio de propósito.

- **A ficha gravava o registro A por cima do B.** Na Central deitada, com a
  ficha de A aberta, tocar na linha de B trocava o cabeçalho mas não os campos
  (estado local iniciado uma vez, sem `key`); sair do campo gravava texto, com
  quem e observação de A EM B. E tocar no campo e sair sem digitar gravava o
  texto da tela por cima de uma leitura da letra chegada no meio tempo. Agora
  cada registro tem a sua ficha, só se grava o que foi digitado, e o que foi
  digitado vai pro banco sozinho (600 ms depois da última tecla, ao fechar, ao
  ir pro fundo) — `useCampoDaFicha` em `ItemPanel.tsx`.
- **A tela de tropeço não tinha saída** quando é a última folha aberta que
  derruba o desenho: o app reabre nela e cai de novo. "Abrir na primeira
  folha" esquece o último lugar e recarrega, sem tocar em dado nenhum.

- **Apagar a última seção ou o último bloco** deixava a tinta, os itens e o
  passo de ↶ da folha apagada na memória — e um ↶ podia regravá-los no banco.
  `semFolhaAberta()` no store zera tudo o que é da folha, nos cinco lugares em
  que o app fica sem folha aberta.

**A regra:** todo caminho automático (leitura, sincronização, voltar, remontar)
mexe SÓ no que é dele. O resto do registro vem do estado de AGORA, nunca de uma
cópia tirada antes da espera. `tools/buracos-test.ts` tem um caso por regra, e
cada um foi conferido dos dois lados: com o conserto apagado, ele falha.

**O lado Android e a esteira** (revisor de segurança):

- **A esteira publicava de QUALQUER ramo.** O tablet baixa da Release
  "ultimo" o que estiver lá; um ramo velho (banco versão 2) ou a repetição de
  uma execução antiga punha por cima um app que não abre o banco do aparelho
  — e o caminho óbvio dali, desinstalar, apaga tudo. Agora a publicação é um
  trabalho à parte (`publicar`) que só publica se o commit publicado estiver
  no histórico deste e o banco não tiver versão menor. O corpo da Release
  carrega `commit <sha> (banco N)` e é isso que a próxima execução confere —
  não mude o formato sem mudar a conferência. Depois de um squash ou de
  reescrever o histórico de propósito: rodar a esteira à mão com `forcar`.
- **Tela apagada grava silêncio.** App que sai da frente tem o microfone
  silenciado pelo Android, sem erro nenhum. A tela fica acesa enquanto grava
  (Wake Lock), e se o app saiu da frente mesmo assim (botão de desligar), a
  barra avisa que aquele trecho pode estar mudo. Não foi visto no tablet.
- **Ações de terceiros presas a commit**, não a etiqueta: elas rodam com a
  chave de assinatura no disco. Só o trabalho de publicar pode escrever no
  repositório.
- **Salvar que não liberou o arquivo agora FALHA**, em vez de dizer "salvo":
  arquivo pendente é invisível e o Android o apaga em uma semana. E a tela diz
  o nome que o arquivo ganhou de verdade ("nome (1).txt" quando já havia um).
- O texto lido da letra saiu do log do Android; o reconhecedor de fala e o
  decodificador são soltos também quando falham no meio.

**Os testes foram testados.** Um agente plantou 166 defeitos realistas, um de
cada vez (trocar `<` por `<=`, esquecer um campo, perder um byte por pedaço do
áudio salvo), e rodou os testes contra cada um. 73 passavam despercebidos;
agora 164 são pegos e os 2 restantes não mudam nada observável. Vieram daí
quatro suítes novas — `prefs`, `viewport` (onde a tinta cai em relação à
caneta), `geometry` e `export` (o arquivo salvo é conferido byte a byte, com um
Android de mentira em `tools/capacitor-fake.ts`). O roteiro de mutação fica fora
do repositório; o jeito de refazer: uma lista `[arquivo, trecho, troca]`,
aplicar numa cópia, rodar as suítes, desfazer.

**Sobre os agentes**: rodar oito de uma vez estoura o limite de uso da sessão
no meio do trabalho — duas vezes. Em ondas de até três, termina. O modelo vai
pela tarefa, como o `model-route` do ECC: o mais forte pra revisão funda e
ambígua (dados, áudio), o médio pra área de regra clara (tinta, fluxograma), o
leve pra tarefa mecânica.

`ShapeKind` (`flow/shapes.ts`) são as três formas que a leitura sabe reconhecer
num rabisco: retângulo, losango e cantos redondos se separam pela geometria do
traço. `FlowShape` (`domain/types.ts`) é maior — tem também paralelogramo,
documento e cilindro, que são convenção de fluxograma mas que **ninguém desenha
à mão de um jeito que dê pra separar de um retângulo torto**.

Por isso as duas listas são diferentes, e `flow/layout.ts` fala a maior. Não
tente ensinar a leitura a adivinhar as três novas: o preço de errar uma forma é
alto (ela muda o sentido do passo) e o ganho é zero — escolher na lateral custa
um toque.

---

## Mapa do código

```
src/
  domain/      modelo de dados, modelos de folha, medidas e constantes
  ink/         captura da caneta, desenho, gesto do rabisco, zoom, borracha,
               pilha de voltar/avançar (history)
  items/       identificação dos campos (detect) e a lógica da Central —
               filtro, busca, resumo, ordem e faixas de prazo (central); o que
               é dado do usuário e como cada caminho automático o preserva
               (preservar)
  audio/       gravação, contas do tocador (playback), salvar pra fora
               (export), marcas de momento (marcas), transcrição da reunião —
               ponte com o reconhecedor (fala), escolha das palavras-dica
               (dicas) e a regra que protege a correção à mão (transcricao)
  flow/        leitura do fluxograma: formas (shapes), grafo (graph), arranjo
               (layout), a junção com o que foi editado (merge) e o voltar/
               avançar do painel (undo)
  ata/         a ata da reunião: onde partir a gravação nas marcas e casar
               cada pedaço com a sua marca (trechos), e a ata montada da
               folha — seções pelas zonas, tópicos pelas marcas (ata)
  ocr/         transcrição da letra (ponte com o plugin Android)
  zones/       em que zona um ponto caiu, e a edição das faixas
  db/          IndexedDB (versão 3: traços, zonas, itens, áudio, imagens,
               fluxogramas); a gravação em pedaços e a recuperação dela
               (repo); que falha é do banco e como avisar (falhas)
  state/       estado e todas as ações que mudam dados; preferências
  update/      verificação de versão
  components/  folha, navegação, barras, painel
  lib/         geometria
tools/         testes de rabisco, borracha, campos, zonas, Central, áudio,
               preferências, janela (zoom/rolagem), geometria, salvar arquivo,
               fluxograma, voltar/avançar; a compilação do plugin nativo contra
               sombras (check-java) e a medição do caminho do áudio com tom
               puro (resample-test + ReamostraTest); e o roteiro que abre o app
               num Android de verdade
android/       projeto Capacitor (gerado, mas versionado)
keystore/      chave de assinatura — não trocar
```

**Regra da casa:** componente não fala com o banco. Chama uma ação de
`state/store.ts`, que atualiza a memória primeiro (a tela responde na hora) e
grava depois. É isso que mantém a escrita fluida.

**O que é puro e testável:** `ink/erase.ts`, `ink/scribble.ts`,
`ink/viewport.ts`, `items/detect.ts`, `items/central.ts`, `audio/playback.ts`,
`flow/shapes.ts`, `flow/graph.ts`, `flow/layout.ts`, `flow/merge.ts`,
`ink/history.ts`, `items/preservar.ts`,
`zones/edit.ts` e `lib/geometry.ts` não sabem nada de React nem de banco. Lógica nova de tinta, de
identificação, de zona ou de filtro deve nascer ali.

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
| ~~Anotação e folha Livre não geram item~~ → **toda zona gera registro** | Pedido direto: *"transcreve tudo, inclusive a anotação"*. O medo antigo (encher o painel) virou separação de contas: `nota` não entra no "em aberto" e não ganha carimbo na margem |
| A ficha é onde entra o que a letra não disse | Prazo, prioridade, com quem e observação não se escrevem à mão numa faixa; e é por eles que a lista se organiza sozinha — *"sem precisar voltar nas anotações"* |
| Clicar na linha abre a FICHA, não a folha | Voltar à folha continua existindo, num botão dentro da ficha. Era o contrário antes, e obrigava a sair da Central pra ver um registro |
| Ficha é terceira coluna deitado, tela cheia em pé | Passar de um registro ao outro sem perder o lugar na lista; em pé não cabe coluna nenhuma |
| Tocar de novo na prioridade marcada tira a prioridade | Sem isso, escolher errado vira um estado do qual não se sai |
| A ordem da lista nunca empata solto | Sem prazo (ou sem prioridade) vai pro fim, e o desempate final é sempre o mais recente. Lista que dança a cada abertura não dá pra confiar |
| Esticar a faixa estica a FOLHA, não deixa a faixa vazar | A divisão se repete a cada folha; faixa vazando faria a escrita cair numa faixa diferente da desenhada |
| Esticar empurra as de baixo, não as cobre | Faixa sobreposta faz a mesma linha pertencer a duas, e aí o painel começa a mentir |
| Voltar/avançar cobrem só a tinta | Zona, item e ficha a tela já desfaz num toque. "Voltar" precisa significar a mesma coisa toda vez |
| A pilha é esvaziada ao trocar de página | Voltar numa folha e ver sumir algo de outra seria pior que não ter voltar |
| Caixa pode ser feita de vários traços | Com caneta, levantar a mão num canto é o normal. Exigir um traço fechado era exigir um jeito de desenhar que ninguém usa |
| Ponta de seta tem que parecer ponta de seta | Ela decide a DIREÇÃO: errar uma inverte a seta e reorganiza o desenho inteiro. Letra pequena perto da ponta do traço não serve |
| Nenhuma régua muda enquanto o dedo está encostado | A tela que se ajusta sozinha + arrasto = laço de realimentação. Travou o app no primeiro arrasto de verdade |
| Limite de gesto se mede em píxeis DE TELA | Em píxeis do desenho, um fluxograma reduzido faz seis píxeis virarem dois de dedo, e nenhum toque conta como toque |
| Tocar escolhe, arrastar move — o mesmo gesto | Separar em dois modos obrigaria a escolher o modo antes de saber o que se quer fazer. Quem solta sem andar escolheu; quem andou, moveu |
| `touch-action: none` vai no `<svg>`, nunca no que está dentro dele | O navegador ignora a propriedade em elemento de dentro de um SVG. Estava no `<g>` da caixa, não fazia nada, e o gesto da caneta era roubado pra rolar a tela |
| Um gesto de cada vez, e a caneta não cede ao dedo | A palma encosta antes da ponta. Dois gestos disputando a mesma tela levavam a caixa pro lado errado e depois travavam o painel |
| A ata não adivinha assunto | Tópico vem de marca ⚑ ou de linha escrita, nunca de palpite. Uma ata que inventa tópico parece certa — e é pior que nenhuma |
| A fala é cortada ANTES de ser ouvida | O reconhecedor não diz em que segundo cada frase foi dita. Partindo o áudio nas marcas e ouvindo cada pedaço numa sessão, a fala de cada tópico é exata por construção |
| O corte anda até o silêncio, e só até ele | A marca é tocada com alguém falando; cortar ali parte a palavra. ±1,5 s até a pausa mais perto — sem o desempate pelo mais perto, o corte ia parar a 1,5 s da marca |
| Casar trecho com marca é por id, nunca por posição | A primeira versão do caso passava casando por posição: com todas as marcas tendo trecho, posição e id coincidem por acaso. Marca no começo ou feita depois da transcrição desalinha tudo |
| Contagem que não bate não casa nada | O plugin devolve sempre cortes + 1 pedaços. Se vier outra coisa, melhor ata sem fala separada que ata com a fala do vizinho |
| A ata é uma vista, não uma cópia | Montada na hora, do que está na folha. Corrigir a marca, a ficha ou a fala corrige a ata — não existe versão velha esperando reconciliação |
| Nada na barra de cima pode crescer sem teto | Ela é irmã da folha num flex em coluna: cada píxel que toma é um píxel que a folha perde. A transcrição aberta levou a folha de 677px pra 202px — "assim eu não consigo usar nada" |
| Caixa de texto nasce FECHADA | Ele abre o caderno pra escrever, não pra reler a transcrição de ontem. Aberta por padrão, ela é um estorvo; fechada, é uma linha que ele abre quando quer |
| A folha precisa mostrar onde COMEÇA | A primeira zona nascia colada em y=0, com o tracejado partido pela borda — parecia folha cortada. A margem é vista, não espaço: nenhuma coordenada guardada mudou |
| O que o reconhecedor erra já está escrito na folha | Ele troca nome próprio, sigla, nome de setor — e o usuário escreveu isso à mão durante a reunião. `EXTRA_BIASING_STRINGS` entrega essas palavras e puxa o resultado pra elas |
| Jogar amostra fora sem filtrar é piorar o áudio | Reamostrar pegando uma a cada três dobra o agudo pra dentro da voz: medido, um tom de 15 kHz chega com pico 30000, tão alto quanto a fala. Tirando a média, 2346 |
| Transcrição é rascunho, e a tela precisa dizer isso | Texto bonito sem aviso nenhum convida a copiar errado pra dentro de uma ata. O selo "rascunho do reconhecedor" é a informação mais importante da caixa |
| Correção à mão nunca é sobrescrita — nem pela transcrição | Meia hora de reunião revisada palavra por palavra é o trabalho mais caro do app, e um toque em "Transcrever de novo" apagaria tudo em silêncio |
| Tela parada é indistinguível de tela travada | Reunião longa leva minutos pro reconhecedor. O texto chega aos pedaços (`notifyListeners`) justamente pra que dê pra ver que está andando |
| Caractere combinante literal no código é armadilha | Um `[\u0300-\u036f]` escrito com os caracteres de verdade fica invisível no editor e some numa edição qualquer, sem erro nenhum |
| Sonda que cala não decide nada | "Não transcreveu" sem número nenhum não diz se a culpa é do áudio ou do serviço de fala. Segundos, pico da onda, formato e trilha dos avisos |
| Conferência de VERSÃO não é conferência de capacidade | "Aceita ler um arquivo: sim" era só `SDK_INT >= 31`; o serviço do aparelho pode ignorar mesmo no Android 16 |
| A emenda entre folhas é pintura, nunca espaço | Abrir um vão de verdade mexeria em todas as coordenadas já gravadas — o jeito mais fácil de perder o caderno de alguém |
| Medir a coisa errada é pior que não medir | O primeiro caso da emenda passava SEM a emenda: sempre há algo escuro na folha. Apague o conserto e veja o caso falhar |
| Quando o produto é um ARQUIVO, o caso abre o arquivo | Conferir a tela que gerou a imagem é conferir outra coisa: a imagem tem moldura própria, e moldura errada corta sem avisar |
| O app diz o que foi salvo, não só onde | Quem não abre o arquivo pra conferir fica na dúvida — e foi essa dúvida que gerou um pedido de coisa que já existia |
| Elemento que já existia não vira botão só porque ganhou onClick | O cabeçalho virou botão do título e ninguém achou: ele continua parecendo o cabeçalho que sempre foi |
| Quando o bonito e o achável divergem, ganha o achável | Terceira vez: os ícones de tamanho, o texto solto sem nome, o título no cabeçalho |
| Degrau que não se vê é botão quebrado | Com 2% de folga o zoom ia de 0,96 a 1,00 — respondia sem mudar nada. Agora exige 15% |
| Antes de construir o caro e incerto, meça | Transcrever depende do aparelho, não do código. A sonda tenta de verdade e devolve TUDO que descobriu, inclusive em que etapa parou |
| O app não entende a reunião; quem entende é quem está nela | As marcas de momento dão a linha do tempo sem exigir que o app compreenda nada — e não prometem o que não dá pra cumprir offline |
| Marca nasce sem nome | Quem está na reunião não para pra escrever. Exigir o nome na hora é garantir que ninguém marque nada |
| Botão que não se vê não existe | Cada botão novo numa linha de largura fixa empurra o anterior pra fora; já aconteceu três vezes. O caso pergunta se algum controle saiu da caixa |
| Texto solto é uma FORMA, não uma lista à parte | Herda arrastar, tamanho, cor, desfazer e remontagem de graça. Uma lista própria repetiria tudo isso, com defeitos novos |
| Botão invisível não se reconhece | O texto solto é quase invisível no desenho, de propósito — mas o ícone dele na lateral precisa mostrar linhas de letra |
| O título estica o viewBox pra cima, não empurra o desenho | Com `transform`, toda conta de arrasto passaria a precisar descontar o deslocamento, e a primeira que esquecesse jogaria a caixa pra longe do dedo |
| Nome de arquivo é interface com o SISTEMA, não com quem lê | Medido: um acento faz o Chrome descartar o nome inteiro e salvar como "download". Perder a cedilha é melhor que perder o nome |
| Linha fina ganha faixa de toque invisível | Dois píxeis não são alvo de toque. Esconder a seta numa lista resolve o alvo e cria outro problema: o usuário quer tocar na coisa que está vendo |
| O caso de toque numa linha toca AO LADO dela | Em cima passa mesmo sem faixa — e aí o caso não prova nada |
| Botão de apagar diz o que SOBREVIVE | "Tirar só a ligação": o medo de levar a caixa junto era o que impedia de usar |
| Posição de seta é fração, nunca coordenada | Coordenada guardada vira lixo no primeiro arrasto de caixa |
| O tamanho da caixa é um mínimo; o texto pode pedir mais | Esconder o nome é pior que ficar grande. Uma caixa que recusasse crescer refaria o defeito que o tamanho ajustável veio consertar |
| Quem MEDE o texto é quem DESENHA o texto | Duas contas parecidas em dois lugares: no dia em que uma mudar, o nome volta a ser cortado |
| A seta pode ter o lado escolhido à mão | "Em geral certo" não é sempre certo; quem monta o desenho sabe de que lado a seta fica legível. E dá pra voltar pro automático |
| A seta escolhe a porta pela POSIÇÃO do destino, não pelo sentido | Toda seta pra frente saía por baixo e entrava por cima; com as caixas arrastadas pro lado, ela descia, atravessava e entrava pelo telhado da vizinha |
| Dois dedos podem o que um dedo não pode | A pinça foi recusada antes por brigar com o arrasto — brigaria se fosse o mesmo dedo. Um move, dois aproximam, e não há ambiguidade |
| Botão que ABRE não recalcula | "Eu saio pra olhar na folha e volto, ele já mexeu em várias coisas". E ao separar, alguém tem que avisar que o recálculo ficou pendente |
| O app reabre onde o usuário parou | Abria sempre na primeira folha. Quem trabalha na folha vinte reencontrava o começo de tudo a cada vez |
| Toda exclusividade tem data de validade | A caneta nem sempre manda `pointerup`. Dono de gesto sem prazo recusava todo toque seguinte e matava o painel — o defeito que o dono existia pra evitar |
| Gravar nunca acontece dentro de uma função de `setState` | Ela roda durante a renderização; mexer na loja ali fecha um laço quando o React refaz a renderização, e só aparece no aparelho mais lento |
| Gesto preso nunca tranca o painel: quem chega ganha | Se o dedo sai da tela sem o navegador avisar, um dono eterno seria o próprio defeito que se quer evitar |
| "Caber" tem piso; abaixo dele a tela ROLA | Sem piso, cada arrasto encolhia o desenho e o seguinte ia mais longe — 1,34× por arrasto, medido. E um fluxograma a 10% não se lê de qualquer jeito |
| A caixa só pode ser solta dentro da folha visível | Faz a folha crescer de pedaço em pedaço, em vez de num múltiplo a cada arrasto — e ninguém solta uma caixa onde não dá pra ver |
| Pergunte o que acontece no DÉCIMO gesto | Congelar a régua dentro do arrasto fecha a porta de dentro; o laço se fechava entre um arrasto e o seguinte |
| Arrasto testado só com mouse não está testado | `touch-action` só existe pra toque; com mouse a disputa pelo gesto nunca acontece. Passou em todos os casos e não funcionava no tablet |
| Gesto interrompido ABANDONA, não grava | Gravar onde a caixa parou quando o navegador rouba o gesto é o pior dos dois mundos: o arrasto não aconteceu e a caixa saiu do lugar |
| Dedo no vazio passeia pelo desenho | É o que paga a conta de ter tirado a rolagem do navegador — e é o que todo editor de fluxograma faz |
| Nenhuma medida de gesto atravessa uma troca de régua | Medir a distância dedo↔caixa antes de congelar a tela e usá-la depois fazia a caixa pular no primeiro movimento. A folga de arrastar existe o tempo todo, pra que nada mude no instante do toque |
| O desfazer do painel guarda o fluxograma INTEIRO | Ele é menor que um traço, e assim "Ler de novo" vira um passo como os outros — remontar não tem operação inversa pra calcular |
| Edição que não muda nada não vira passo | ↶ que pisca sem mexer na tela é pior que ↶ nenhum: quem vê conclui que o desfazer não funciona |
| Zoom em degraus, não em pinça | No tablet a pinça briga com o arrasto da caixa; o mesmo dedo não pode significar as duas coisas |
| O degrau do zoom sai do tamanho MEDIDO na tela | Em "Caber" não existe número escolhido, e supor um fazia o + não mudar nada num fluxograma que já cabia em tamanho real |
| As formas moram numa lateral, como num editor de fluxograma | Pedido com a tela do draw.io na mão. Escolher pela figura, e não pelo nome, é o que faz a lateral funcionar sem ler nada |
| A lista de setas é da lateral, e nasce fechada | Embaixo do desenho ela comia o espaço de mexer no fluxo, que é o que o painel existe pra fazer |
| Painel em COLUNA, não em grade de linhas contadas | `grid-template-rows` com cinco linhas pra um painel que mostra de quatro a dez filhos faz "quem fica com a sobra" depender de quantos avisos apareceram |
| "Ligar" é a única ação de dois tempos, e se anuncia | Toda ação que espera um segundo toque precisa dizer na tela o que está esperando, senão vira um modo invisível |
| Posição arrastada manda no arranjo automático | O arranjo acerta a estrutura; quem sabe o que fica bem ao lado de quê é quem desenhou |
| Seta se mede pelo VÃO que atravessa, não por um comprimento fixo | Um número fixo tem que servir a um vão de 30px e a um de 300; alto perde as ligações curtas, baixo aceita qualquer rabisco |
| O painel sabe mostrar o que ENTENDEU, não só o resultado | Cinco rodadas de "não funcionou" com números que diziam que errava, mas não onde. Um print da vista "Como eu li" responde de uma vez |
| Encaixe de seta curto, com guardas em vez de folga apertada | Folga grande fazia a área de encaixe de uma caixa encostar na da vizinha; apertar demais perdeu ligações de verdade. Quem segura o falso positivo são as guardas (traço dentro de caixa nunca é seta, traço curto também não) |
| A estrutura aparece antes dos nomes | Esperar o reconhecedor passar em 15 caixas é mais de um minuto de tela parada; o que se quer ver é o desenho, e o nome é enfeite que chega depois |
| A leitura mostra os números do que viu | "Não achei caixa nenhuma" é um beco. Com os números, uma foto da tela diz onde parou — e poupa rodadas de adivinhação de parte a parte |
| O fluxograma lê a folha inteira, não uma zona | O desenho passa de uma folha, o traço guarda a zona de quando foi escrito, e ninguém escolhe o modelo certo antes de desenhar. Geometria basta pra separar caixa, seta e letra |
| O fluxograma montado é OUTRA coisa, ao lado do desenho | A tinta na folha nunca é apagada nem substituída. Quem desenhou quer poder continuar desenhando, e o leitor erra — se ele comesse o original, errar custaria o trabalho |
| Nome corrigido à mão sobrevive à remontagem | Mesmo motivo da transcrição: ver a própria correção sumir é o que faz alguém parar de confiar no recurso |
| O fluxograma sai como PNG, não SVG | Vai ser aberto por outra pessoa, provavelmente no celular. PNG abre em qualquer lugar; SVG abre numa tela de código em metade dos aparelhos |
| A ordem esquerda/direita do desenho é mantida | Quem desenhou o "sim" à esquerda espera encontrá-lo à esquerda. Arranjo que troca os lados obriga a reler tudo |
| O acelerador do áudio vai até 2x, sem 0,5x | Acima de 2x a fala vira ruído; e ninguém pediu mais devagar — cada parada a mais no ciclo é um toque a mais pra voltar ao normal |
| Campo novo em registro já existente nasce OPCIONAL | `positionMs`, `dueAt`, `priority` entraram assim: `DB_VERSION` não sobe, nenhuma migração roda e o que o usuário já tinha continua exatamente como estava. Migração é o lugar onde se perde o caderno de alguém |
| A posição da escuta vive no BANCO, não na tela | Uma conversa de uma hora se ouve em pedaços, ao longo de dias. Guardar só em memória perderia a posição ao trocar de página, que é justamente quando ela importa |
| Parado no fim, ▶ recomeça do zero | "Continuar de onde parou" a 200ms do fim é não tocar nada; quem aperta ▶ ali quer ouvir de novo |
| A posição também é gravada de 5 em 5 segundos | Se o app fechar sozinho no meio da escuta, a posição não volta pro começo |
| O áudio salvo vai pra pasta Downloads | É onde o gerenciador de arquivos vê, o backup do Android pega e outro app consegue abrir pra mandar adiante — dentro do app, o arquivo morre com o app |
| O app sempre diz ONDE salvou | São três caminhos possíveis conforme a versão do Android, e um deles (a pasta do app) some na desinstalação. "Salvo" sem lugar não dá ao usuário como conferir |
| Identificação só depois que a mão para (800ms) | Rodar no meio da frase criaria e apagaria um item por palavra |
| "Não era item" arquiva, não apaga | Nenhum caminho novo pode custar tinta do usuário; e o arquivado impede que a identificação recrie o campo |
| A Central é o destino do que foi escrito | Pedido direto do usuário: uma tela tipo CRM com visão geral, dúvidas e ações. A folha é onde se escreve; a Central é onde se trabalha |
| A transcrição TAMBÉM aparece na folha | Reconhecer a anotação no lugar onde ela foi feita, sem abrir outra tela pra saber o que está escrito ali |
| Busca sem acento e sem caixa | Ninguém digita acento com pressa no teclado do tablet, e a transcrição às vezes erra o acento |
| Texto escrito à mão nunca é sobrescrito | Corrigir uma transcrição errada e vê-la voltar ao errado na palavra seguinte destruiria a confiança no recurso |
| Divisa ⇕ funciona em qualquer ferramenta | "Se a aba ficou pequena, eu expando e continuo escrevendo" — trocar de modo pra isso quebraria o fluxo |
| Divisa tira de uma pra dar à outra | Crescer sem tirar de ninguém sobreporia faixas, e a mesma linha pertenceria a duas |
| ML Kit Digital Ink, não OCR de imagem | Ele lê traços com tempo, que é o que o app já guarda; e roda offline depois do primeiro download |
| A esteira abre o app antes de publicar | Compilar não prova que abre. A versão 8 saiu verde e fechava no tablet; cada volta dessas custa uma instalação do usuário |
| A verificação instala a versão publicada e a nova POR CIMA | Instalação limpa não reproduz o que quebra em quem atualiza: banco antigo e service worker já registrado |
| Erro de JavaScript vira tela legível | Tela branca não dá ao usuário nem o que contar pra quem vai consertar |
| Promessa rejeitada com o app já de pé é AVISO, não tela de erro | Cobrir um app que está funcionando por causa de uma falha de fundo transforma um problema pequeno num grande. Antes de montar, o mesmo erro é fatal na prática e vira tela |
| Caminho automático mexe só no que é dele | Leitura, sincronização, voltar e remontar gravavam a cópia inteira do item e levavam junto o que o usuário fez no meio tempo. Quatro defeitos, uma raiz (armadilha 36p) |
| Gravação vai pro banco ENQUANTO grava | Uma hora de reunião só na memória até o Parar é uma hora perdida se o app fechar. Um pedaço por segundo; o Parar troca os pedaços pelo arquivo numa transação só |
| Ação que espera grava pelo ID, não pela folha aberta | Transcrição leva minutos; ele troca de folha no meio. Gravar "na folha aberta" gravava na errada ou em lugar nenhum |
| Editor guarda só o que ELE mudou | Dois editores da mesma transcrição: guardar a foto inteira faz o segundo apagar o primeiro sem aviso |
| Falha do banco aparece na tela, com o que fazer | Tinta na tela e nada no banco é o pior defeito possível: parece salvo. A faixa vermelha diz e oferece "Guardar de novo" |
| Campo de formulário grava sozinho, e só o que foi digitado | Gravar só ao sair do campo perde o que estava sendo digitado se o app fechar; gravar o valor da tela ao sair sem digitar escreve texto velho por cima do novo |
| Componente com estado local recebe `key` de quem ele mostra | Sem isso, trocar o registro troca o cabeçalho e mantém os campos — e o próximo blur grava um registro no outro |
| Tela de erro sempre tem uma saída que não depende do que quebrou | "Tentar de novo" reabre a mesma folha; se é ela que quebra, é um laço |
| Só publica o que SUCEDE a versão publicada | O tablet instala o que estiver na Release. Versão mais velha por cima = banco que o app não lê, e daí a desinstalar é um passo |
| Gravando, a tela não apaga | O Android silencia o microfone de app fora da frente, sem erro: a reunião voltaria com trechos mudos |
| Agentes em ondas de até três | Oito ao mesmo tempo estouraram o limite de uso da sessão no meio da revisão, duas vezes |

---

## Limites conhecidos

**Só o áudio tem saída.** O botão **Salvar** de cada gravação escreve o arquivo
na pasta Downloads do tablet, fora do aplicativo. A tinta, o texto transcrito e
os itens continuam só dentro do app: desinstalar apaga tudo isso. É o item 1 da
lista de próximas etapas por esse motivo.

**O leitor de fluxograma depende de o desenho ser desenhado assim.** Caixa tem
que FECHAR (o traço voltando ao começo) e seta tem que ENCOSTAR nas duas
caixas. Não depende mais de zona, de modelo nem da ordem em que as coisas
foram feitas. Traço que não entrou em nada é contado e dito na tela, mas o app não
adivinha o que o usuário quis. A leitura foi verificada no navegador com um
processo de cinco caixas (início, decisão, dois caminhos, fim) e um retorno;
com a mão de verdade num tablet, os limites de `flow/shapes.ts` ainda podem
precisar de ajuste — estão todos nomeados no topo do arquivo, pra isso.

**O nome das caixas depende do reconhecedor.** No navegador elas saem vazias
(aparece "…") e o usuário escreve no painel. No APK, a letra de dentro de cada
caixa vai pro ML Kit como qualquer outra — com a mesma qualidade, e as mesmas
limitações, da transcrição da folha.

**Salvar no Android não foi visto funcionando.** O caminho do navegador (o
download comum) foi verificado; o `FileSaverPlugin` compila contra as sombras e
é montado pela esteira, mas quem prova que ele escreve na pasta Downloads do
aparelho é o usuário. A esteira só abre o app — ela não toca em botão nenhum.

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

**A transcrição da REUNIÃO foi vista funcionando — uma vez, com 60 segundos.**
O tablet dele (Android 16) transcreveu áudio de arquivo, sem internet, pelo
caminho de sessão segmentada, com texto legível. O relato dele sobre a
qualidade foi *"ele trocou palavras"*, e é o esperado de reconhecedor de
aparelho. O que ainda não foi visto: uma reunião INTEIRA de uma vez (o limite
de um minuto era da sonda e saiu), e se as palavras-dica do caderno melhoram o
resultado na prática — `EXTRA_BIASING_STRINGS` é documentado, mas o serviço de
fala do aparelho pode ignorar sem reclamar, exatamente como ignorou o arquivo
antes do modo segmentado. A tela relata quantas dicas foram entregues; quem
responde se adiantou é comparar duas transcrições da mesma gravação.

**A ata por tópicos ainda não foi vista no tablet.** O corte nas marcas foi
medido com sinal sintético (`tools/CorteTest.java`, pelo método de verdade), e a
montagem da ata está coberta em `tools/ata-test.ts`. O que só o aparelho
responde: se o serviço de fala aceita várias sessões seguidas sem dar
"ocupado" (há um respiro de 300 ms e uma nova tentativa), e se um tópico curto
(dez, quinze segundos) é ouvido tão bem quanto a reunião inteira.

**A identificação depende de o usuário escrever dentro das faixas.** Quem
escreve uma tarefa no meio da zona de anotação vê ela chegar como `nota` — e aí
troca o tipo na ficha (a escolha à mão sobrevive às passadas seguintes, pelo
`kindByUser`). Para cercar várias linhas de uma vez continua existindo o laço.

**A ficha foi verificada no navegador, não no tablet.** Abrir pela linha, gravar
prazo pelos atalhos e pelo calendário, prioridade, com quem e observação, os
selos aparecendo na linha, as faixas de prazo e a tela estreita — tudo em
`chromium`, com traços simulados. Com a caneta e o teclado do tablet, o campo de
data do Android pode se comportar diferente do `input[type=date]` do navegador.

**A edição de zonas vale só pra página onde foi feita.** Não há como salvar a
folha ajustada como modelo — é a próxima etapa 2.

**A tela de erro ainda cobre a gravação.** Se outro componente quebrar no meio
de uma gravação, a tela de tropeço cobre o botão Parar. O áudio não se perde —
os pedaços já estão no banco e "Tentar de novo" recupera a gravação — mas a
gravação para ali.

**O APK publicado é de depuração** (`assembleDebug`). Com o cabo e a depuração
USB ligada, dá pra copiar os dados do app sem root. Trocar pra
`assembleRelease` usa a mesma chave e atualiza por cima sem perder nada — mas
muda o tipo de compilação de tudo de uma vez, então fica pra uma rodada própria,
com a verificação no aparelho virtual conferindo a atualização antes.

**A gravação em pedaços não foi vista no tablet.** Gravar pedaço por pedaço,
recuperar depois de recarregar e o microfone que cai foram medidos no Chromium.
No aparelho, o `MediaRecorder` da WebView pode entregar o primeiro pedaço com
atraso — e o que ainda não chegou ao banco não volta.

**A busca da Central não acha o que ainda não tem texto.** Linha sem
transcrição só é encontrada pelo recorte da letra, olhando. É mais um motivo
pra transcrição importar.

---

## Próximas etapas

1. **Exportar as anotações** — o áudio já sai (botão Salvar); a tinta, o texto e
   os itens continuam sem saída nenhuma, e é aí que a perda seria real
2. **Salvar a folha ajustada como modelo do usuário** — hoje a edição de zonas
   vale só pra página onde foi feita
3. **Áudio ligado à tinta** — tocar num traço e ouvir o momento; os instantes
   já são gravados em cada ponto, e agora o tocador já sabe pular pra uma
   posição qualquer (`seekTarget`), que era a peça que faltava
4. **Ícones personalizados** — o usuário cria seus próprios carimbos
5. ~~Transcrição da letra (OCR)~~ — feita, com ML Kit offline, no APK
6. ~~Zonas editáveis na folha~~ — feitas
7. ~~Ficha por registro, com prazo e prioridade~~ — feita
8. **Lembrete de prazo** — hoje o prazo só ordena e colore; nada avisa o usuário
   no dia. É o passo natural depois da ficha
9. ~~Acelerador do áudio e barra de posição~~ — feitos
10. ~~Zona de fluxograma, lida e remontada~~ — feita
11. ~~Voltar e avançar~~ — feitos, cobrindo a tinta
12. ~~Faixa que estica além do fim da folha~~ — feita, esticando a folha junto

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
