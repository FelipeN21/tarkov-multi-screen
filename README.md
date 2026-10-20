# 📺 Tela

Compartilhamento de tela entre amigos pelo navegador, com baixo atraso. Funciona direto do GitHub Pages, sem servidor.

O vídeo vai **direto do seu PC para o PC de cada amigo** (WebRTC P2P). Para as pessoas da sala se encontrarem, o site usa o [Trystero](https://github.com/dmotz/trystero), que troca as mensagens de conexão por relays públicos Nostr. Essas mensagens são criptografadas com o nome da sala. Nenhum vídeo passa por esses relays.

## Usar

1. Abra o site, digite seu nome, o nome de uma sala e, se quiser, uma **senha**.
2. Clique em **Copiar link** e mande para os amigos. A senha não vai no link: mande ela por outro meio.
3. Clique em **Compartilhar tela**.

### Senha da sala

Sem senha, qualquer pessoa que souber o nome da sala entra. Com senha, a negociação entre os PCs é criptografada com o nome da sala + a senha. Quem digitar uma senha diferente não consegue se conectar com ninguém e vê um aviso. O mesmo aviso aparece para quem já está na sala quando alguém tenta entrar com a senha errada. A sala com senha mostra um 🔒 ao lado do nome.

Antes de virar chave, a senha passa por PBKDF2 (600 mil rodadas). Isso deixa cada tentativa de adivinhar a senha muito mais cara para quem copiar as mensagens criptografadas dos relays públicos. Mesmo assim, use uma senha boa: 3 ou 4 palavras aleatórias ou 12+ caracteres. Todos na sala precisam estar com a versão atual do site; se alguém estiver com uma versão antiga em cache, aparece o aviso de senha diferente (resolve com Ctrl+F5).

Sem senha, o nome da sala é o único segredo. Por isso o nome sugerido é aleatório e longo (ex.: `k3fp-x2qm-7hzw-a9rd`), e a barra de cima mostra **⚠ Sala sem senha**.

O site lembra a última senha usada em cada sala, só no seu navegador.

### Cuidados

- Compartilhe a **janela do jogo** em vez da tela inteira: a tela inteira mostra notificações, mensagens e o que você digitar em outros programas.
- Todos na sala veem o IP público uns dos outros (o vídeo vai direto de PC para PC). Só entre em salas com quem você conhece.
- Ative a verificação em duas etapas na conta do GitHub que publica o site: quem controla a conta controla o código.

## Janela PiP (telas dos amigos por cima do jogo)

O botão **Abrir PiP** abre uma janela pequena que fica por cima de todos os programas, com as telas de quem está compartilhando. Funciona no **Chrome e no Edge** do computador.

- **Abra antes de entrar no jogo.** Quando você troca de aba, o navegador pode abrir o PiP sozinho (como no Google Meet). Ao trocar de programa (Alt+Tab), ele não abre sozinho.
- **O jogo precisa estar em modo sem bordas (Borderless / Janela sem bordas).** Nenhuma janela fica por cima de um jogo em tela cheia exclusiva.
- Passe o mouse sobre o PiP para ver as opções:
  - **Grade**, **Destaque** ou **Faixa**: como as telas ficam arrumadas. A Faixa fica boa numa janela larga e baixa, no topo do monitor.
  - **Nomes**: clique para mostrar ou esconder alguém. A sua própria tela começa escondida.
  - **Clique numa tela** para destacar ela; clique de novo para voltar.
  - **✂ Recortar**: arraste sobre uma parte da tela de um amigo (ex.: a bússola) para ver só ela. **↺** volta a mostrar a tela inteira.
  - **🔇/🔊 e barra de volume**: liga, desliga e ajusta o som daquele amigo.
- O tamanho da janela, o layout, quem aparece e os recortes ficam salvos para a próxima vez.

## Segurança

- **Dados de outros PCs** (nomes, Jams, wishlist) aparecem sempre como texto, nunca como HTML. Antes disso, nomes e itens são limpos: sem `<` `>`, sem caracteres de controle e sem caracteres invisíveis ou de inversão de direção (usados para disfarçar nomes). Links de Jam são validados e remontados (veja *Spotify Jams*).
- **Limite contra spam:** cada pessoa pode mandar no máximo uma atualização por segundo de estado (nome, transmissão, Jam) e de wishlist. Se mandar mais, vale só a última. Mensagens com formato errado são descartadas.
- **Política de segurança (CSP)** no `index.html`: o navegador só roda scripts do próprio site e só carrega dados da tarkov.dev, ícones de `assets.tarkov.dev` e as conexões com os relays da lista abaixo. Mesmo que um erro futuro deixasse passar HTML de alguém, um script injetado não rodaria.
  - O pequeno script do tema dentro do `<head>` é autorizado pela "impressão digital" (hash `sha256`) dele, que está na CSP. **Se mudar qualquer caractere desse script, o hash precisa ser recalculado**, senão o tema salvo deixa de ser aplicado ao abrir a página (o navegador mostra o hash certo no console).
  - Se um dia usar outro serviço (por exemplo, uma API nova), o endereço dele precisa entrar na CSP.

### Relays

As pessoas da sala se encontram por relays Nostr públicos (só para a "apresentação"; vídeo, nomes e listas vão direto entre os PCs). O site usa uma lista fixa de relays conhecidos e testados: `nostr-pub.wellorder.net`, `nos.lol`, `relay.nostr.net`, `nostr.mom`, `relay.primal.net`, `nostr.oxtr.dev`, `relay.snort.social`. Todos precisam estar na mesma versão do site: quem estiver com outra lista de relays não encontra os demais (peça Ctrl+F5 depois de publicar). Para mudar a lista, altere `RELAYS` no `app.js` **e** o `connect-src` da CSP no `index.html`.

A senha ignora espaços no começo e no fim (maiúsculas e minúsculas continuam diferentes).

## Publicar no GitHub Pages

1. Suba esta pasta para um repositório público.
2. No repositório, vá em **Settings → Pages → Build and deployment**.
3. Em **Source**, escolha *Deploy from a branch*, depois a branch `main` e a pasta `/ (root)`, e clique em **Save**.
4. Em cerca de 1 minuto o site fica no ar em `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.

## Spotify Jams

Na lateral, embaixo de **Na sala**, a seção **Spotify Jams** (abre e fecha) mostra as Jams do Spotify de quem está na sala. Para cadastrar a sua: no Spotify, inicie uma Jam, toque em **Compartilhar**, copie o link e cole no campo. Pode colar a mensagem inteira que o Spotify gera; o site acha o link. Cada Jam tem os botões **Entrar** (abre o link, que leva ao app do Spotify) e **Copiar**, e a sua tem **Remover**. No rodapé da seção ficam **Abrir o Spotify** (abre o app instalado) e **Como criar uma Jam** (passo a passo oficial); o Spotify não tem um link que já crie a Jam, ela é iniciada dentro do app. A Jam de alguém some da lista quando a pessoa sai da sala.

Por segurança, só são aceitos links `https` de `spotify.link` (o link curto do Compartilhar) ou `open.spotify.com/socialsession/…`, com o domínio exatamente igual. O link é validado de novo quando chega de outro PC e remontado só com o código, então endereços parecidos (ex.: `spotify.link.golpe.com`), `http`, links com usuário/porta ou qualquer outra coisa são recusados.

## Ferramentas do Tarkov (grupo na barra)

O grupo **Tarkov** da barra reúne a busca rápida, Itens, Players, Tasks, Mapas, Munição e Wishlist. Clique em **Tarkov** para recolher ou mostrar o grupo (fica salvo; o Ctrl+K funciona mesmo recolhido). Em telas mais estreitas, os botões ficam só com o ícone (o nome aparece ao passar o mouse).

### Wishlist do squad
Cada um lista os itens que precisa (quests, hideout) e todos da sala veem, para pegar para o amigo na raid. Dá para adicionar:
- no próprio painel **Wishlist** (busque o item; marque **Precisa ser FIR** se for o caso);
- com **+ Wishlist** nos cartões de **Itens**;
- em **Tasks**, com **+ Adicionar os itens à wishlist** embaixo dos itens necessários (todos de uma vez, com a quantidade e o FIR da tarefa), ou com **+** ao lado de um item;
- com **+** na tabela de **Munição**.

Adicionar de novo o mesmo item soma a quantidade; use **− / +** e **×** para ajustar. A sua lista fica salva neste navegador; a dos outros aparece enquanto eles estão na sala ("Ana precisa: …"). O número no botão mostra quantos itens há no total. Por segurança, as listas que chegam dos outros PCs são validadas (até 60 itens, nome até 80 caracteres, quantidade até 999).

### Munição
Escolha o calibre e veja cada munição com **dano, penetração, dano na blindagem e preço** (menor oferta no mercado ou, sem oferta, a média de 24 h), ordenadas pela penetração. As classes de blindagem 1–6 aparecem em verde (fura bem), laranja (às vezes) ou cinza (não fura). É uma aproximação pela penetração: fura bem quando a penetração passa de classe × 10. Usa a mesma lista e o mesmo modo (Season/PvP/PvE) do painel de Itens.

### Chefes e Goons nos mapas
No painel **Mapas**, embaixo da lista de mapas, aparecem os **chefes daquele mapa com a chance de spawn** e **onde os Goons foram vistos por último** (relatos da comunidade no tarkov.dev), com o seletor **Season / PvP / PvE**.

## Instalar como app

No Chrome ou Edge, o site pode ser instalado como app: janela própria, sem barra do navegador e com ícone na barra de tarefas. Use o ícone de instalar na barra de endereço ou **Instalar app** (no rodapé da entrada ou nos Ajustes, quando o navegador permitir). O app sempre busca a versão nova do site primeiro; a cópia guardada só é usada sem internet.

## Busca rápida (Ctrl+K)

Dentro da sala, **Ctrl+K** (ou a lupa no grupo *Tarkov* da barra) abre uma busca única: digite parte do nome e aparecem mapas, itens (com o preço), tarefas (com o trader) e o atalho para o perfil de um jogador. Use **↑ ↓** e **Enter**, ou clique: o painel certo abre já com a busca feita. A filtragem roda no navegador, em cima das mesmas listas dos painéis; digitar não faz requisições.

A versão do site aparece no rodapé da entrada, nos Ajustes e na janela **Sobre** (atalhos e créditos). Se ela não bater com a dos amigos, aperte Ctrl+F5.

## Busca de preços (Escape from Tarkov)

O botão **🔎 Itens** abre um painel para consultar o preço de um item sem sair da sala.

- Digite parte do nome, em inglês ou português (ex.: `ledx`, `gpu`, `salewa`, `transiluminador`), e aperte **Enter**.
- Para cada item aparecem a menor oferta atual no mercado (com a variação em 48 h), a média de 24 h, quanto o melhor comerciante paga e, em itens com mais de um slot, o valor por slot. O nome leva para a wiki.
- **Season / PvP / PvE**: cada modo tem preços próprios. O **Season** é o padrão; o site lembra o último modo que você escolheu.

Os dados vêm dos arquivos públicos da [tarkov.dev](https://tarkov.dev), os mesmos que o site deles usa. A API GraphQL da tarkov.dev estava fora do ar quando isto foi feito. A lista (~2 MB) é baixada uma vez quando você abre o painel, e a busca roda no seu navegador: digitar e buscar não fazem novas requisições, e a lista só é baixada de novo depois de 10 minutos. Esses arquivos não têm documentação oficial; se mudarem, o painel avisa que não conseguiu baixar os preços.

## Perfil de jogadores (Escape from Tarkov)

O botão **👤 Players** abre o perfil de um jogador no [tarkov.dev](https://tarkov.dev/players), numa aba nova (nível, facção, estatísticas de PMC, conquistas e equipamento), em **Season / PvP / PvE**.

- **Pelo nome:** o site copia o nome e abre a busca do tarkov.dev. Lá, aperte **Ctrl+V**, clique em **Search** e no jogador.
- **Pelo ID ou link:** cole o endereço do perfil (ex.: `https://tarkov.dev/players/pvp-season/1234567`) ou só o número da conta, e o perfil abre direto. Colando o link logo depois de buscar um nome, o jogador fica salvo com nome e ID nos recentes (marca **ID**) e passa a abrir com um clique. Também dá para digitar `nome ID` juntos.

Por que não abre direto pelo nome: não existe API pública de perfis, e a do tarkov.dev exige um captcha que só funciona no site deles. Só a busca do tarkov.dev consegue trocar o nome pelo ID da conta; abrir o perfil pelo nome no endereço falha com “Turnstile token expired”, porque o captcha só vale uma vez.

## Tarefas (Escape from Tarkov)

O botão **📋 Tasks** busca uma tarefa pelo nome (inglês ou português), pelo trader (`prapor`) ou pelo mapa. Cada cartão mostra só o essencial:

- trader, mapa, nível mínimo e se é necessária para **Kappa** ou **Lightkeeper**;
- **Objectives**: os objetivos;
- **Required items**: o que entregar ou plantar, com quantidade e a marca **FIR** quando precisa ser encontrado em incursão, além de itens da missão e chaves;
- **Open wiki**: link para a página completa da tarefa.

Os cartões ficam em inglês, como no jogo e na wiki. A busca aceita o nome em inglês ou português.

Também tem **Season / PvP / PvE** (o Season é o padrão). Os dados vêm dos mesmos arquivos públicos da tarkov.dev usados na busca de itens.

## Mapas (Escape from Tarkov)

O botão **🗺️ Mapas** abre os mapas com os nomes das extrações (PMC, Scav e compartilhadas), spawns, chaves e loot desenhados. Arraste para mover; use a roda do mouse, duplo clique ou os botões **+ / −** para o zoom e **⤢** para ver o mapa inteiro. No celular, use a pinça. O site lembra o último mapa aberto.

As imagens são mapas 2D da comunidade, com crédito no rodapé de cada um: monkimonkimonk (Customs, The Lab), re3mr (Factory, The Labyrinth, Terminal, Icebreaker, Transições), xTycho (Ground Zero), Lorathor (Interchange) e Jindouz (Lighthouse, Reserve, Shoreline, Streets, Woods). Foram baixadas do tarkov.dev e ficam na pasta `maps/` do site, então não dependem de nenhum serviço externo.

Alguns mapas são mais antigos que outros (a data aparece na própria imagem; o de Customs, por exemplo, é de 2022). **Para atualizar um mapa:** baixe a imagem nova (o tarkov.dev serve em `https://tarkov.dev/maps/<nome>-2d.jpg`, ex.: `customs-2d.jpg`), converta para WebP (qualquer conversor online serve; ex.: squoosh.app) e salve por cima do arquivo em `maps/`, com o mesmo nome (ex.: `maps/customs.webp`). Se mudar o autor, ajuste o crédito na lista no começo do `maps.js`.

## Áudio

- **Áudio**: o que vai junto depende do que você escolhe na hora de compartilhar.
  - **Tela inteira**: todo o áudio do PC.
  - **Janela**: só o áudio daquela janela.
  - **Aba**: só o áudio da aba.

  Na janela de escolha do navegador, deixe marcada a opção de compartilhar o áudio. O áudio de uma janela só funciona nas versões recentes do Chrome/Edge. Se o seu não suportar, o site avisa e a janela vai sem som; nesse caso, compartilhe a tela inteira.
- **Áudio extra**: mistura outra entrada de áudio na transmissão.

Quem assiste começa com o som desligado (regra dos navegadores). Passe o mouse sobre o vídeo e clique no 🔇 ou mexa na barra de volume. O volume de cada amigo fica salvo para as próximas vezes.

### Áudio do TeamSpeak

**Jeito simples:** compartilhe a **Tela inteira** com **Áudio do PC** ligado. O TeamSpeak já vai junto.

**Jeito separado** (para compartilhar só uma janela, ou para controlar o TeamSpeak à parte):

1. Instale o [VB-Cable](https://vb-audio.com/Cable/), que é grátis, e reinicie o PC.
2. No TeamSpeak, vá em **Ferramentas → Opções → Reprodução** e escolha **CABLE Input** como dispositivo de saída.
3. Para você continuar ouvindo o TeamSpeak, abra no Windows **Configurações de som → Mais configurações de som → Gravação**. Clique em **CABLE Output** → **Propriedades** → aba **Escutar**, marque **Escutar este dispositivo** e escolha seu fone.
4. No site, em **Áudio extra**, escolha **CABLE Output**. Na primeira vez, o navegador pede permissão de microfone para mostrar os nomes dos dispositivos.

Os controles de áudio valem a partir da próxima vez que você clicar em **Compartilhar tela**.

## Rodar localmente

Abrir o `index.html` direto pelo arquivo não funciona. Use qualquer servidor estático, por exemplo:

```bash
npx serve .
```

## Dicas para ter o menor atraso

- Use **Chrome ou Edge**. São os que têm os ajustes de baixa latência e capturam o áudio do sistema.
- Prefira cabo de rede a Wi-Fi, principalmente no PC de quem transmite.
- Modo **Fluidez** para jogos e vídeos; modo **Nitidez** para texto e código.
- Quem transmite envia uma cópia para cada amigo. Com muitos espectadores, baixe a qualidade (por exemplo, 5 amigos × 12 Mbps = 60 Mbps de upload).
- Com todo mundo compartilhando ao mesmo tempo, use **Squad** (720p · 60 fps · 4 Mbps): com 4 pessoas, cada uma envia e recebe cerca de 12 Mbps. Se o upload de alguém não aguentar, essa pessoa usa **Leve** (720p · 30 fps · 2,5 Mbps).
- Use o codec **H.264**. Ele é codificado pela placa de vídeo; os outros costumam ser codificados pelo processador, que já está ocupado com o jogo.
- O canto do vídeo mostra fps, Mbps, ping e buffer. O atraso real fica em torno de ping/2 + buffer + ~30 ms de codificação/decodificação. **⚠ travou N×** indica que o vídeo congelou.
- Na sua prévia aparece como a tela está saindo para cada amigo:
  - **⚠ upload no limite**: sua internet não está dando conta. Baixe a qualidade ou use cabo.
  - **⚠ PC sobrecarregado**: o computador não está dando conta de codificar. Use H.264, baixe a qualidade ou limite o FPS do jogo (deixar a placa de vídeo em 100% atrasa a captura e a codificação).
- Placas NVIDIA têm um limite de codificações ao mesmo tempo. Gravação em segundo plano (ShadowPlay/Instant Replay), OBS e Discord ocupam vagas. Quando acaba a vaga, o navegador passa a codificar no processador e a transmissão fica travando.

## Quando um amigo não consegue conectar

Algumas redes (4G, redes de empresa ou faculdade) bloqueiam a conexão direta. Nesse caso você precisa de um servidor TURN, que retransmite o vídeo. Adicione-o em `RTC_CONFIG`, no começo do `app.js`:

```js
{ urls: 'turn:servidor:3478', username: 'usuario', credential: 'senha' }
```

Algumas opções são o Metered.ca (tem plano grátis), o Cloudflare Calls TURN ou um coturn próprio.

## Arquivos

- `index.html`, `style.css`: interface.
- `app.js`: captura da tela, conexões WebRTC e ajustes de latência.
- `pip.js`: janela PiP com layouts e recortes.
- `items.js`: busca de preços de itens do Escape from Tarkov.
- `players.js`: atalho para o perfil de jogadores no tarkov.dev.
- `tasks.js`: busca de tarefas (o que fazer e itens necessários).
- `tarkov-data.js`: partes comuns dos painéis do Escape from Tarkov.
- `maps.js` e `maps/`: mapas com as extrações.
- `palette.js`: busca rápida (Ctrl+K).
- `jams.js`: Spotify Jams da sala (com o validador de links).
- `wishlist.js`: wishlist do squad.
- `ammo.js`: tabela de munição.
- `sanitize.js`: limpeza de nomes e textos vindos de outros PCs.
- `manifest.webmanifest`, `sw.js`, `icon-*.png`: instalar como app (PWA).
- `icons.js` e `logo.svg`: ícones e logo.
- `vendor/trystero.js`: Trystero 0.26.0 (estratégia Nostr) empacotado num arquivo só, licença MIT.
