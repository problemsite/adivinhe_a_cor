# Adivinhe a COR 🎨

Jogo para 2 jogadores (cada um no seu PC): uma parte do personagem/local fica escondida e cada um tenta acertar a cor original. Quem chegar mais perto ganha 1 ponto por round.

- **Jogo:** `index.html` (raiz do site)
- **ADM:** pasta `ADM/` → `seusite.github.io/SEU-REPO/ADM/`
- **Exemplo pronto:** `rodadas-exemplo/bob-esponja.json` (importar pelo ADM)

---

## 1. Testar sem Firebase (modo teste local)
Enquanto o `js/firebase-config.js` estiver com `COLE_AQUI`, o jogo roda **só no seu navegador**:
1. Rode um servidorzinho na pasta (ex.: extensão *Live Server* do VS Code, ou `python -m http.server`) e abra `/ADM/`.
2. Clique em **📥 Importar .json** e escolha `rodadas-exemplo/bob-esponja.json`.
3. Abra o jogo em **2 abas** — cada aba é um jogador.

## 2. Ligar o Firebase (para jogar em 2 PCs)
1. No Console do Firebase (pode usar o mesmo projeto dos outros jogos): **Realtime Database** criado.
2. **Authentication → Método de login → Anônimo → Ativar.**
3. Regras do Realtime Database (adicione o nó `adivinheacor` às suas regras):
```json
{
  "rules": {
    "adivinheacor": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```
4. Cole o config do app web em `js/firebase-config.js` (substitua tudo que tem `COLE_AQUI` / `SEU-PROJETO`).
5. Suba a pasta no GitHub Pages. Abra `/ADM/` e importe o `bob-esponja.json` de novo (agora vai pro Firebase).

## 3. Como funciona
- **Lobby:** clique em *ENTRAR COMO J1/J2*, coloque nome e foto (arraste + zoom para recortar). Sem foto = inicial do nome; sem nome = J1/J2.
- Quando os dois clicam **ESTOU PRONTO!**, a partida começa sozinha (ou o ADM clica em *Iniciar*).
- Cada round: pingos de tinta → "ROUND X de N" → placar e quem está na frente → escolher a cor (muda a imagem em tempo real) → **PRONTO!** → suspense → revelação com HEX/RGB → +1 pro mais perto.
- A distância é medida com **ΔE 2000** (a fórmula padrão de "quão diferente o olho humano vê duas cores"). Precisão = 100% − 2×ΔE. Na tela dos jogadores aparece só a % e um texto ("quase igual!", "bem perto"…); o ΔE fica visível só no ADM.
- O canto **inferior direito** da tela fica livre para a câmera.

## 4. ADM
- **Expulsar J1/J2:** apaga a vaga do jogador no Firebase **e** apaga o progresso (todo mundo volta ao lobby).
- **Voltar todos ao lobby:** mantém os jogadores e apaga pontos/rodadas.
- **Revelar agora / Próximo round:** força o andamento se alguém travar.
- **Ao vivo:** vê a cor que cada jogador está escolhendo em tempo real (a cor original fica borrada; clique pra ver).
- **Imagens:** ＋ Nova imagem → marque a parte que vai ser pintada:
  - 🪄 **Varinha**: clica numa cor e pega a área conectada parecida.
  - 🎯 **Cor parecida**: pega aquela cor na imagem inteira.
  - 🖌️ Pincel / 🧽 Borracha para ajustar. *Shift* = remover. *Preencher buracos* fecha manchinhas pequenas.
  - **Cor original**: *Detectar* pega a cor mais comum da seleção (ou use o conta-gotas / digite o HEX).
  - **Cor inicial**: *Automática* sorteia, a cada partida, uma cor bem longe da original — **a mesma para os dois jogadores**. Ou desmarque e escolha/sorteie uma fixa.
  - Marque **todas** as partes que entregam a cor (no Bob: frente e lado do rosto, nariz, manchas, braços, mãos e pernas).
  - ⬇ exporta cada rodada em .json (backup), 📤 exporta todas.


## 5. Segurança (chave do ADM + liberar/bloquear jogo)
A proteção fica nas **regras do Firebase** — não adianta alguém mexer no site, o banco recusa.

1. Firebase → **Authentication → Método de login → E-mail/senha → Ativar**.
2. Authentication → **Usuários → Adicionar usuário**: e-mail e senha que estão no arquivo `chave-adm.json` (abra no Bloco de Notas e copie).
3. Realtime Database → **Regras**: cole o conteúdo de `regras-firebase.json` e **Publicar**.
4. Abra `/ADM/`, arraste a `chave-adm.json`. Pronto: o navegador fica logado (botão 🔐 *Trancar ADM* para sair).
5. No ADM, **Liberar jogo / Bloquear jogo**. Fica salvo no Firebase — vale mesmo com o ADM fechado.

⚠️ **Nunca** suba a `chave-adm.json` no GitHub. Guarde só no seu PC (e um backup).
