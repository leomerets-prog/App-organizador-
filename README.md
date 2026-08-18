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
- Uma faixa avisa que a borracha está ligada. **Dois toques na folha** voltam
  para a caneta — ou toque na faixa
- Escrever normalmente nunca dispara o gesto (ver "O gesto do rabisco" abaixo)
- Depois de apagar, aparece **Desfazer** por 5 segundos
- Um anel vermelho mostra o alcance da borracha enquanto ela apaga, como no
  OneNote. Com a borracha ativa, a barra lateral controla o **tamanho dela**
- Toque parado com a borracha não apaga nada — só o arrasto apaga

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
npm run test:scribble  # teste do gesto do rabisco
npm run build:tablet   # regenera a pasta tablet/ (commitar junto)
```

`npm run dev` mostra dois endereços; o **Network** abre no tablet pelo Wi-Fi.

> Ao mudar qualquer coisa em `src/`, rode `npm run build:tablet` e comite a
> pasta `tablet/` junto — é dela que o tablet lê.

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
6. ~~Empacotar como app Android~~ — feito.
