# Instalar o Organizador no tablet

Tudo dentro do tablet. Sem computador, sem nuvem, sem conta em lugar nenhum.

São 6 passos. Você faz isso **uma vez**. Depois, o app abre pelo ícone na tela
inicial como qualquer outro aplicativo.

### Como ler este guia — leia isto antes

Há dois tipos de bloco cinza aqui. Confundir os dois gera erro:

**1. COMANDO** — vem logo depois de "digite", "rode" ou de um título de passo.
Esses você copia e cola no Termux.

```bash
exemplo de comando
```

**2. TELA** — vem sempre com o aviso `📺 O QUE APARECE (não digite)`. É só o
resultado esperado, para você conferir se deu certo.

`📺 O QUE APARECE (não digite):`
```
exemplo de resultado na tela
```

> Se você colar um bloco de TELA no Termux, ele responde
> `command not found`. **Isso é inofensivo** — nada é alterado, nada quebra.
> É só ignorar e seguir com o comando certo.

Para colar no Termux: segure o dedo na tela até aparecer "Colar".

---

## 1. Instalar o Termux

O Termux é um terminal para Android. Ele é o que vai "servir" o app dentro do
tablet.

**Baixe pelo F-Droid, não pela Play Store.** A versão da Play Store foi
abandonada e não funciona mais.

1. No Chrome do tablet, abra: **https://f-droid.org/packages/com.termux/**
2. Toque em **Download APK**
3. Abra o arquivo baixado e instale
   - O Android vai avisar sobre "fontes desconhecidas" — aceite, é normal para
     apps fora da Play Store

---

## 2. Preparar o Termux

Abra o Termux e digite estes comandos, um de cada vez, apertando Enter e
esperando cada um terminar:

```bash
pkg update -y && pkg upgrade -y
```

> Se aparecer alguma pergunta com `[Y/n]`, aperte Enter.

```bash
pkg install python unzip -y
```

```bash
termux-setup-storage
```

> Este último faz o Android pedir permissão de arquivos. Toque em **Permitir**.
> É o que deixa o Termux enxergar sua pasta de Downloads.

---

## 3. Baixar o app

Ainda no tablet, **no Chrome** (não no Termux):

1. Abra: **https://github.com/leomerets-prog/App-organizador-**
   - Se pedir login, entre na sua conta do GitHub — o repositório é privado e
     só você enxerga
2. Toque no botão verde **Code**
3. Toque em **Download ZIP**

O arquivo cai na pasta Downloads do tablet.

---

## 4. Descompactar

O arquivo que você baixou é um pacote fechado (ZIP). Este passo abre o pacote.

Volte ao **Termux**.

### 4.1 — Confira que o Termux está enxergando o download

Digite:

```bash
ls ~/storage/downloads/
```

Deve aparecer uma lista dos seus downloads, e no meio dela um nome parecido
com:

`📺 O QUE APARECE (não digite):`
```
App-organizador--claude-tablet-notes-app-g0ho90.zip
```

> **Não apareceu nada, ou deu erro?** O `termux-setup-storage` do passo 2 não
> foi autorizado. Rode ele de novo e toque em **Permitir**:
> ```bash
> termux-setup-storage
> ```
>
> **Apareceu a lista mas sem nenhum `App-organizador`?** O download do passo 3
> não completou. Refaça o passo 3.

### 4.2 — Ir para a sua pasta pessoal

```bash
cd ~
```

O `~` é a sua pasta pessoal dentro do Termux. É onde o app vai morar.
Este comando não mostra nada na tela — é normal.

### 4.3 — Abrir o pacote

```bash
unzip -o ~/storage/downloads/App-organizador*.zip -d organizador
```

Lendo o comando: *"abra o pacote que começa com `App-organizador` que está nos
meus downloads, e coloque o conteúdo numa pasta chamada `organizador`"*.

O `*` existe para você não precisar digitar o nome comprido e exato.
O `-o` significa "pode substituir arquivos antigos" — é o que faz as
atualizações futuras funcionarem sem reclamação.

**Vão passar umas 60 linhas na tela.** Você NÃO digita nada disso — é o
Termux trabalhando:

`📺 O QUE APARECE (não digite):`
```
Archive:  /data/data/com.termux/files/home/storage/downloads/App-organizador--claude-...zip
   creating: organizador/App-organizador--claude-tablet-notes-app-g0ho90/
   creating: organizador/App-organizador--claude-tablet-notes-app-g0ho90/tablet/
  inflating: organizador/App-organizador--claude-tablet-notes-app-g0ho90/tablet/index.html
  inflating: organizador/App-organizador--claude-tablet-notes-app-g0ho90/tablet/manifest.json
  ... (mais um monte de linhas assim)
```

Isso é o certo. `inflating` quer dizer "extraindo arquivo".

### 4.4 — Confirmar que deu certo

```bash
ls ~/organizador/*/tablet/
```

Tem que aparecer exatamente esta lista:

`📺 O QUE APARECE (não digite):`
```
assets  favicon.svg  icon-192.png  icon-512.png  index.html
iniciar.sh  manifest.json  registerSW.js  sw.js  workbox-9c191d2f.js
```

Se apareceu isso, **o app está dentro do seu tablet**. Pode seguir.

> Se der `No such file or directory`, o passo 4.3 não completou. Repita-o e
> leia se apareceu alguma mensagem de erro no meio das linhas.

---

## 5. Ligar o app

### 5.1 — O comando

```bash
cd ~/organizador/*/tablet && bash iniciar.sh
```

São duas coisas numa linha só: *"entre na pasta do app"* **e** *"ligue"*.

### 5.2 — O que tem que aparecer

`📺 O QUE APARECE (não digite):`
```
  ============================================
    O Organizador está ligado.

    Abra no Chrome do tablet:
    http://localhost:8080

    Para desligar: Ctrl+C
  ============================================

  (as linhas abaixo são normais — é o app sendo aberto)

Serving HTTP on 0.0.0.0 port 8080 (http://0.0.0.0:8080/) ...
```

### 5.3 — E agora ele trava. É proposital.

Depois dessa última linha o Termux **para e não aceita mais comandos**. Isso
não é travamento: é o app no ar. Enquanto essa tela estiver assim, o app
funciona.

**Deixe o Termux exatamente assim e vá para o passo 6.** Não feche, não aperte
nada. Use o botão de trocar de app do Android para ir ao Chrome.

Conforme você usar o app, vão aparecendo linhas novas aqui (`GET /index.html
200`). São o Termux entregando os arquivos. É sinal de que está funcionando.

### Se algo der errado no passo 5

| O que apareceu | O que é | O que fazer |
|---|---|---|
| `ERRO: não achei os arquivos do app nesta pasta` | Você está na pasta errada | Rode o comando 5.1 inteiro, incluindo a parte do `cd` |
| `ERRO: o Python não está instalado` | O passo 2 não completou | `pkg install python -y` |
| `Address already in use` | O app já está ligado em outra aba | Não precisa fazer nada, vá para o passo 6 |
| `No such file or directory` | O passo 4 não completou | Volte ao passo 4.4 e confira |

---

## 6. Abrir e instalar na tela inicial

### 6.1 — Abrir

1. Vá para o **Chrome** (deixe o Termux rodando atrás)
2. Na barra de endereço, digite exatamente: **`localhost:8080`**
3. Aperte Enter

O Organizador abre: barra escura à esquerda com "Bloco de Anotações", a folha
com as zonas TÓPICOS / ANOTAÇÃO / DÚVIDAS, e as ferramentas à direita.

> **Precisa ser `localhost`.** Se você usar o IP da rede, o Chrome trata o app
> como site desconhecido: não oferece instalar e **não libera o microfone**
> (a gravação de áudio para de funcionar).

### 6.2 — Deixe aberto uns 10 segundos

Nesse tempo o app copia a si mesmo para dentro do tablet. É o que faz ele
funcionar depois sem o Termux. Não pule esta parte.

### 6.3 — Instalar

1. Toque no menu do Chrome (três pontinhos **⋮**, canto superior direito)
2. Procure **Instalar aplicativo**
   - Pode aparecer como **Adicionar à tela inicial** — é a mesma coisa
3. Confirme

O ícone do Organizador (roxo, com um traço branco) aparece na sua tela inicial.

> **Não achou a opção no menu?** Quase sempre é o endereço: confira que está em
> `localhost:8080` e não em outra coisa. Recarregue a página e tente de novo.

### 6.4 — Testar de verdade

O teste que mostra que deu tudo certo:

1. Feche o Chrome
2. **Feche o Termux** (deslize para fora dos apps recentes)
3. Toque no ícone do Organizador na tela inicial

Ele tem que abrir normalmente, em tela cheia, sem barra de navegador. Escreva
alguma coisa com a caneta e feche. Abra de novo: sua anotação continua lá.

**Se abriu, acabou.** O app é seu, roda offline, e o Termux só volta a ser
necessário quando eu mandar uma versão nova.

---

## Usando no dia a dia

Abra pelo **ícone na tela inicial**. Só isso. Não precisa de Termux, nem de
internet, nem de Wi-Fi.

Suas anotações ficam gravadas dentro do tablet, no armazenamento do próprio
app.

> **Cuidado:** não use "Limpar dados" do Chrome nem apps de limpeza que apagam
> dados de navegador — eles apagam suas anotações junto. Exportar para arquivo
> ainda não existe; é uma das próximas coisas a construir.

### Se um dia o ícone não abrir

O Android às vezes limpa apps guardados quando o armazenamento fica cheio.
Solução: ligue o Termux, rode o comando do passo 5, abra `localhost:8080` uma
vez no Chrome. Volta ao normal.

### Atalho para não digitar o comando comprido

Rode isto **uma única vez**:

```bash
echo 'alias organizador="cd ~/organizador/*/tablet && bash iniciar.sh"' >> ~/.bashrc
```

Feche e abra o Termux. A partir daí, para ligar basta digitar:

```bash
organizador
```

---

## Quando eu mandar uma versão nova

**Primeiro, no Termux, apague o ZIP antigo:**

```bash
rm -f ~/storage/downloads/App-organizador*.zip
```

Isso é importante. Se sobrarem dois ZIPs (o velho e o novo), o Chrome nomeia o
novo com `(1)` no fim, o `*` do comando passa a encontrar dois arquivos, e o
`unzip` não sabe qual usar — ele reclama e não extrai nada.

**Depois:**

1. Chrome → seu repositório → **Code** → **Download ZIP**
2. Termux:
   ```bash
   cd ~
   unzip -o ~/storage/downloads/App-organizador*.zip -d organizador
   cd ~/organizador/*/tablet && bash iniciar.sh
   ```
3. Abra o app pelo ícone. Ele se atualiza sozinho.

**Suas anotações não se perdem na atualização.** Elas ficam guardadas separadas
dos arquivos do app.

---

## Se der problema

**"unzip: cannot find or open"** no passo 4
O ZIP não está na pasta Downloads ou o `termux-setup-storage` não foi
autorizado. Confira com:
```bash
ls ~/storage/downloads/
```
Se der erro ou vier vazio, rode `termux-setup-storage` de novo e toque em Permitir.

**"python: command not found"** no passo 5
O passo 2 não completou. Rode de novo:
```bash
pkg install python -y
```

**O Chrome não mostra "Instalar aplicativo"**
Confira que o endereço é exatamente `localhost:8080` — com outro endereço
(como o IP da rede) o Chrome não oferece instalar.

**A gravação de áudio não pede permissão do microfone**
Mesma coisa: precisa ser `localhost`. Nesse endereço o Chrome confia no app e
libera o microfone.

**O Termux fecha sozinho**
O Android pode encerrar apps em segundo plano. Nas configurações do Android, em
Bateria, marque o Termux como "sem restrição". Mas lembre: depois de instalado,
o app não precisa mais do Termux.

---

## O que foi testado e o que não foi

Testei o caminho inteiro num Chrome de verdade, servindo os arquivos com o
**mesmo** `python -m http.server` que o Termux usa: o manifesto é entregue
corretamente, o Chrome aceita instalar, o app se guarda sozinho e **abre com a
rede totalmente desligada**.

O que não pude testar daqui: o Termux rodando no seu Lenovo Idea Tab, e a sua
caneta. Se algum passo travar, me diga em qual número e o que apareceu na tela.
