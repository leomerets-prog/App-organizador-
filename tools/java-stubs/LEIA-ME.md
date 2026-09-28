# Sombras das bibliotecas do Android

Estas classes **não vão pro app**. Elas existem só pra que o `javac` consiga
conferir o plugin nativo aqui, sem SDK do Android e sem baixar nada.

Por que: o plugin Java só era compilado na esteira do GitHub. Um `catch` de
exceção que ninguém lança — erro que o `javac` pega em um segundo — custou uma
volta inteira de esteira e mais espera do usuário com o app quebrado.

**Elas copiam as assinaturas reais das bibliotecas.** Se a esteira reclamar de
algo que passou aqui, a sombra é que está errada: corrija a sombra junto, senão
a conferência vira mentira.

## O que ela NÃO pega

Só o que é do tipo: nome, assinatura, exceção declarada. **Contrato de execução
ela não vê** — e foi um contrato de execução que segurou a transcrição inteira:
o construtor de `RecognitionContext` exige que todos os campos sejam
preenchidos, e deixar um de fora estoura só no aparelho, com "Missing required
properties". Quando uma sombra tiver uma regra dessas, ela está escrita no
comentário da própria sombra.
