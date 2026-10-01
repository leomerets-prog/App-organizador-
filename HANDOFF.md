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

### 27. A estrutura aparece antes dos nomes

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

### 28. Fluxograma não se lê linha por linha

A zona de fluxograma é a única que `items/detect.ts` ignora (`ZONES_SEM_LINHA`).
Lá uma caixa e a seta ao lado estão na mesma altura: a identificação por linha
leria as duas como um campo só, e um desenho de dez traços viraria quatro
"tarefas" sem sentido fora do desenho.

A leitura daquela zona é outra, mora em `flow/`, e o resultado é **um** registro
— o desenho montado — em vez de um por linha.

### 29. Prazo é dia do calendário, no fuso de casa

`new Date('2026-09-30')` é lido como **UTC** e, no Brasil, volta como dia 29. Um
prazo que anda um dia pra trás sozinho destrói a confiança na lista inteira — e
é o tipo de defeito que só aparece à tarde, no aparelho do usuário.

Por isso a conversão do campo de data é feita a dedo, campo a campo, em
`components/ItemPanel.tsx` (`paraCampo`/`doCampo`), e as faixas de prazo usam
`inicioDoDia`/`fimDoDia` (em `items/central.ts`), nunca comparação de instantes
crus. **Não troque nada disso por `toISOString()` nem por `Date.parse`.**

---

## Mapa do código

```
src/
  domain/      modelo de dados, modelos de folha, medidas e constantes
  ink/         captura da caneta, desenho, gesto do rabisco, zoom, borracha,
               pilha de voltar/avançar (history)
  items/       identificação dos campos (detect) e a lógica da Central —
               filtro, busca, resumo, ordem e faixas de prazo (central)
  audio/       gravação, contas do tocador (playback) e salvar pra fora (export)
  flow/        leitura do fluxograma: formas (shapes), grafo (graph), arranjo (layout)
  ocr/         transcrição da letra (ponte com o plugin Android)
  zones/       em que zona um ponto caiu, e a edição das faixas
  db/          IndexedDB (versão 3: traços, zonas, itens, áudio, imagens,
               fluxogramas)
  state/       estado e todas as ações que mudam dados; preferências
  update/      verificação de versão
  components/  folha, navegação, barras, painel
  lib/         geometria
tools/         testes de rabisco, borracha, campos, zonas, Central, áudio,
               fluxograma, voltar/avançar, e o roteiro que abre o app num
               Android de verdade
android/       projeto Capacitor (gerado, mas versionado)
keystore/      chave de assinatura — não trocar
```

**Regra da casa:** componente não fala com o banco. Chama uma ação de
`state/store.ts`, que atualiza a memória primeiro (a tela responde na hora) e
grava depois. É isso que mantém a escrita fluida.

**O que é puro e testável:** `ink/erase.ts`, `ink/scribble.ts`,
`ink/viewport.ts`, `items/detect.ts`, `items/central.ts`, `audio/playback.ts`,
`flow/shapes.ts`, `flow/graph.ts`, `flow/layout.ts`, `ink/history.ts`,
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
