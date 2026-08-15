# Instalar o Organizador no tablet

Tudo dentro do tablet. Sem computador, sem nuvem, sem conta em lugar nenhum.

São 6 passos. Você faz isso **uma vez**. Depois, o app abre pelo ícone na tela
inicial como qualquer outro aplicativo.

> Os comandos abaixo são digitados no Termux. Pode copiar e colar: segure o
> dedo na tela do Termux para aparecer "Colar".

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

De volta ao Termux:

```bash
cd ~
```

```bash
unzip -o ~/storage/downloads/App-organizador*.zip -d organizador
```

Vai passar um monte de linha na tela — é normal, é ele extraindo os arquivos.

---

## 5. Ligar o app

```bash
cd ~/organizador/*/tablet && bash iniciar.sh
```

Deve aparecer:

```
  Organizador ligado.

  Abra no Chrome do tablet:  http://localhost:8080
```

**Deixe o Termux aberto nesse estado.** Ele fica parado assim de propósito — é
o app funcionando.

---

## 6. Instalar na tela inicial

1. Abra o **Chrome** no tablet
2. Digite na barra de endereço: **localhost:8080**
3. O Organizador abre
4. Toque no menu do Chrome (os três pontinhos ⋮)
5. Toque em **Instalar aplicativo** (ou "Adicionar à tela inicial")

Pronto. O ícone do Organizador aparece na sua tela inicial.

**Espere uns 10 segundos com o app aberto na primeira vez.** É o tempo dele
guardar tudo dentro do tablet.

---

## Depois disso

**Você não precisa mais do Termux para usar o app.** Ele fica guardado dentro
do tablet e abre pelo ícone, offline, em qualquer lugar. Pode fechar o Termux.

Se um dia o app não abrir pelo ícone (o Android às vezes limpa coisas guardadas),
é só ligar o Termux de novo e abrir o app uma vez.

### Atalho para ligar o Termux mais rápido

Rode isto uma vez:

```bash
echo 'alias organizador="cd ~/organizador/*/tablet && bash iniciar.sh"' >> ~/.bashrc
```

Feche e abra o Termux. A partir daí, para ligar basta digitar:

```bash
organizador
```

---

## Quando eu melhorar o app

Você repete só os passos **3, 4 e 5** (baixar o ZIP novo, descompactar, ligar).
Depois abra o app pelo ícone e ele se atualiza sozinho.

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
