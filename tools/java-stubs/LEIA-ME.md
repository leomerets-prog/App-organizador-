# Sombras das bibliotecas do Android

Estas classes **não vão pro app**. Elas existem só pra que o `javac` consiga
conferir o plugin nativo aqui, sem SDK do Android e sem baixar nada.

Por que: o plugin Java só era compilado na esteira do GitHub. Um `catch` de
exceção que ninguém lança — erro que o `javac` pega em um segundo — custou uma
volta inteira de esteira e mais espera do usuário com o app quebrado.

**Elas copiam as assinaturas reais das bibliotecas.** Se a esteira reclamar de
algo que passou aqui, a sombra é que está errada: corrija a sombra junto, senão
a conferência vira mentira.
