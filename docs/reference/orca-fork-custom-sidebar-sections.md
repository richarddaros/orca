# Seções personalizadas na sidebar (fork)

<!-- updated: 2026-11-02 -->

Recurso só do fork `richarddaros/orca` (issue #10). Na lista **Projects** da
sidebar, o usuário cria seções com nome (por exemplo, "MCF") e coloca nelas
workspaces inteiros, na ordem que quiser. A atividade dos agentes nunca muda
essa ordem; os status continuam atualizando normalmente.

## Como usar

- **Criar uma seção:** botão `ListPlus` no topo da lista, antes de "Adicionar
  projeto". Ele não aparece na visão Activity, mas o espaço continua
  reservado para nenhum botão mudar de lugar.
- **Pôr um workspace numa seção:** clique direito no card › **Mover para
  seção**, ou **Nova seção com este workspace**.
- **Ordenar dentro da seção:** arraste o card dentro da própria seção, ou
  clique direito › **Subir na seção** / **Descer na seção**.
- **Arrastar para uma seção:** arraste o card de qualquer grupo (a lista, o
  Pinned ou outra seção) e solte entre os cards da seção, onde aparece a linha
  de inserção, ou sobre o título dela, para entrar no topo.
- **Arrastar para fora:** soltar um card de uma seção sobre a lista normal tira
  ele da seção.
- **Tirar da seção:** clique direito › **Tirar da seção**. O workspace volta
  para a lista normal.
- **Seção:** menu ⋯ do título › renomear, subir, descer ou apagar. Apagar não
  apaga nenhum workspace.

## Regras

- **Nada muda até o primeiro uso.** Enquanto ninguém cria seção nem mexe numa
  delas, o campo não existe no disco e a lista é a do upstream, inclusive o
  arrasto no Pinned. A primeira ação de seção lê o estado salvo do disco antes
  de gravar qualquer coisa.
- O **Pinned** é a primeira seção. Pin e Unpin continuam iguais e decidem quem
  está nele (`isPinned`). Depois do primeiro uso, a ordem dele passa a ser
  fixa: ele guarda a ordem que estava na tela, um Pin novo (inclusive por
  **Mover para seção › Pinned**) entra no fim, e
  arrastar dentro dele reordena o Pinned sem trocar o sort para Manual. Dá para
  renomear e mudar de lugar, mas não apagar. Renomear com o próprio nome padrão
  volta ao rótulo traduzido.
- Cada workspace fica em no máximo uma seção. Mover para uma seção personalizada
  um workspace fixado faz **Unpin** dele, porque o `isPinned` é compartilhado
  com o web e o celular.
- Um workspace criado a partir de outro (linhagem) aparece aninhado embaixo do
  de origem, dentro da mesma seção, sem virar membro. Os filhos ficam na ordem
  de criação, inclusive no Pinned depois do primeiro uso: nesse momento, dois
  filhos do mesmo pai podem trocar de lugar. Arrastar um filho dentro da seção
  não muda nada.
- Workspace arquivado ou escondido por filtro some da seção e volta para o
  mesmo lugar quando aparece de novo. Subir e descer pulam os escondidos.
- Seção vazia continua visível. Uma seção aceita até 500 workspaces; numa seção
  cheia, mover não faz Unpin nem muda nada. Com o Pinned cheio, um Pin novo
  aparece depois dos guardados, mas sem posição fixa.
- Workspaces apagados continuam como chaves guardadas na seção; não aparecem e
  não atrapalham a ordem.
- **Arrasto entre grupos** (só depois do primeiro uso; antes disso o arrasto é o
  do upstream):
  - Soltar numa seção põe o card na posição da linha de inserção; no título, no
    topo. Vale também para seção vazia ou recolhida. Com vários cards
    selecionados, entram todos, na ordem do arrasto. Os filhos de linhagem vão
    junto com o pai, sem virar membros.
  - Entrar numa seção personalizada faz **Unpin**; entrar no Pinned faz **Pin**
    pelo mesmo caminho do upstream (vale também para folder workspaces e para o
    Pinned cheio) e guarda a posição solta.
  - Soltar um card de uma seção personalizada sobre um card ou título da lista
    normal tira ele da seção. No agrupamento por status, se o status de destino
    for outro, o status também muda, como já acontecia. Arrastar para fora do
    Pinned continua igual ao upstream: não faz Unpin, nem para os cards fixados
    que vierem numa seleção múltipla.
  - Entre dois cards, só vale a seção cujo card está a até 8 px do ponteiro; o
    vão logo abaixo do título de outro grupo continua desse grupo.
  - Soltar sobre os cards de uma seção ou do Pinned vale como drop na seção,
    mesmo no agrupamento por status, em que antes isso mudava o status para o
    do card de baixo. Soltar no meio de um card continua aninhando
    (linhagem), e os grupos de status continuam mudando o status.
  - Uma seção cheia (500) não aceita o drop e nada muda.
  - Uma seleção só de folder workspaces não mostra a linha de inserção nas
    seções personalizadas e o drop segue o upstream; no Pinned também não mostra
    a linha (a posição não é guardada) e continua sendo fixada pelo upstream.
  - Soltar onde não há linha sob o ponteiro, a até 6 px do último destino
    mostrado na prévia, usa esse destino.
  - Um filho de linhagem arrastado ou selecionado sozinho é um card como os
    outros: entra na seção como membro.
  - Soltar na lista uma seleção que saiu de uma seção tira da seção, entre os
    cards arrastados, todo membro de qualquer seção personalizada, nunca os
    fixados.
- Os cards de uma seção mostram o chip do projeto antes do título, como os do
  Pinned, porque uma seção mistura projetos mesmo no agrupamento por projeto.

## Pasta do worktree no card

Todo card de worktree git mostra um ícone de pasta e o nome da pasta do
checkout (por exemplo, `pinfish`). O caminho completo aparece ao passar o mouse.
Onde o nome entra depende do layout do card:

- **Layout padrão** (não compacto, sem o estilo experimental): na linha de baixo
  do título, antes do branch ou do "Detached HEAD". Um card que não tinha nada
  nessa linha passa a ter a linha só com a pasta. Quando falta espaço, a pasta e
  o branch truncam juntos, e a pasta encolhe mais depressa (peso 3 contra 1): ela
  perde mais em proporção, mas o branch também perde espaço.
- **Estilo experimental de card** (`experimentalNewWorktreeCardStyle`): na linha
  do título, depois do chip do projeto e antes do título. O estilo novo não tem a
  linha de baixo para um card sem identidade (o upstream centraliza o título
  nesse caso e testa isso), então a pasta não cria linha nem aumenta o card. O
  chip não encolhe: o nome cresce até 6rem e, se for maior, corta com `…`. Quem
  trunca primeiro é o título.

Ao contrário do resto deste doc, isso não depende das seções: vale desde a
primeira abertura, em todo card git dos dois layouts, mesmo para quem nunca
criou uma seção.

- Vale para todo lugar que usa o mesmo card: a lista inteira (não só as
  seções), o quadro de status (board) e a lista de worktrees do painel de
  folder workspace.
- Folder workspaces já mostravam a pasta e continuam iguais nos dois layouts. O
  layout compacto não muda e não mostra a pasta.
- O app do celular tem cards próprios e não muda. As seções chegam a ele pelas
  respostas do host (ver "No celular do próprio computador").

## No celular do próprio computador

O app do celular não muda. Ele agrupa as linhas do `worktree.ps` pelo `repoId` e
lê a lista de projetos de `mobileRelay.projectSections`; por isso o host serve
cada seção como um **projeto de mentira**. Só o celular deste computador
(`clientKind` `mobile` sem `pairedDeviceParentId`, o mesmo critério de
`isHostOwnPhone`) recebe isso. `repo.list`, o web pareado, os celulares
delegados, os desktops pareados e a CLI continuam como antes.

- `mobileRelay.projectSections` lista um projeto por seção com nome, antes dos
  projetos reais e na ordem guardada (`id` `custom-section:<id>`, com `path`
  próprio). Seção vazia aparece como cabeçalho vazio. Projetos e setups do
  catálogo não mudam.
- `worktree.ps` troca `repoId` e `repo` das linhas membros pelo projeto da seção
  e põe `manualOrder` pela posição guardada (o primeiro membro tem o maior
  rank, porque o sort Manual do celular ordena do maior para o menor). Os filhos
  de linhagem acompanham o pai, como no desktop; membro fixado continua no
  Pinned; a cópia de mesmo id em outro host não se move. A troca vem antes do
  cálculo do snapshot e do delta de linhas, então o celular compara o que ele vê.
- O host casa a linha com o membro de duas formas, com e sem `local` como host,
  porque o `worktree.ps` omite o host de worktrees locais. Quando as duas
  grafias existem em seções diferentes, vale a que não tem host.
- Folder workspaces: o `worktree.ps` não manda o host das pastas, então só casam
  as pastas cuja chave guardada é `local|…` ou sem host. Uma pasta em outro host
  (`ssh:…|folder:…`) continua sob o projeto no celular.

O que não é igual ao desktop, **lido no código do app e não testado no
aparelho**:

- A ordem dentro da seção só vale com o sort Manual do celular; os outros sorts
  reordenam como em qualquer lista. Com a ordem de projetos por atividade
  (`recent`) as seções se misturam com os projetos reais. O Pinned do celular
  fica sempre primeiro, mesmo quando no desktop uma seção vem antes dele.
- Um projeto cujos workspaces estão todos em seções continua na lista como
  cabeçalho vazio. Os cards da seção não mostram o nome do projeto de origem, e a
  cor e o ícone do projeto no card e no cabeçalho ficam no padrão.
- **Excluir pelo celular um workspace que está numa seção.** O app lê o script de
  archive do projeto por `repo.hooks` com `id:<repoId>`, não acha o projeto da
  seção (`repo_not_found`) e, sozinho, pularia o script e excluiria. O host
  impede isso: o `worktree.rm` do próprio celular, sem rodar nem dispensar o
  script, é recusado com a falha de archive (`worktree_archive_hook_failed`,
  "outcome unverifiable") quando o projeto real tem script de archive, ou quando o
  host não consegue ler os hooks dele. O app mostra a falha e oferece "Delete
  Anyway", que dispensa o script de propósito (`allowFailedArchiveHook`). Projeto
  sem script exclui direto, e para rodar o script exclua pelo desktop. A guarda é
  `mobile-custom-section-removal.ts`, chamada no começo do `worktree.rm`.
  Limites da guarda, lidos no código e não testados no aparelho:
  - Ela decide pelas seções guardadas no momento do `worktree.rm`, e o
    `worktree.rm` não leva o `repoId` que o app mostrou. Se o card sai da seção no
    desktop com a confirmação já aberta no celular, o app ainda pergunta pelo
    projeto de mentira (`repo.hooks` com `id:custom-section:<id>`), pula o script
    e chama o `worktree.rm`; a guarda deixa passar porque o card já não está numa
    seção, e o script é pulado sem aviso para o usuário (o host só registra o
    aviso "archive hook skipped" no log). Há defesa possível: guardar por conexão,
    por poucos segundos, que o celular leu `repo.hooks` com um id `custom-section:`
    e recusar nesse intervalo. Não foi feita: exige um terceiro encaixe no
    upstream (`repo.hooks`) e estado em memória por conexão, não se verificou que a
    conexão do celular é estável entre as duas chamadas, e a janela pede que o
    próprio usuário tire o card da seção no desktop enquanto confirma a exclusão
    no celular. Outra defesa, sem encaixe novo no upstream nem estado por conexão:
    guardar em memória, por alguns minutos, a identidade de cada linha servida ao
    celular próprio sob uma seção (em `projectWorktreePsCustomSections`) e recusar
    também o card que não está numa seção agora mas foi servido como tal nesse
    intervalo; o falso positivo cai em "Delete Anyway". Também não foi feita.
  - O inverso também ocorre: um card posto numa seção depois de listado no projeto
    real, excluído com "Skip", é recusado com o texto de "não deu para verificar",
    e um toque em "Delete Anyway" resolve.
  - A mensagem que o app mostra começa com o texto genérico "Archive hook failed",
    mas o script não rodou; a nota do fork, no fim, diz o motivo.
  - `repo.hooks` não aceita host (nem o do app envia um). Um `repoId` registrado em
    dois hosts dá `selector_ambiguous`, e a guarda recusa o card de seção desse
    projeto mesmo que ele não tenha script; "Delete Anyway" resolve. Repo `ssh:`
    informa sem hooks, então passa.
  - Se o app da loja não tiver "Delete Anyway", o card de seção com script de
    archive só se exclui pelo desktop.
- Novo workspace: o composer do celular decide se um branch está ocupado pelos
  `repoId` das linhas que recebe, então o branch de um card de seção não conta
  como ocupado no projeto real. Quem barra é o host, que lista os worktrees do
  projeto (`runtime-worktree-create-git.ts`): com o reuso explícito do branch ele
  recusa com "Branch … is already checked out at …"; sem reuso ele considera o
  branch ocupado. Lido no código, não testado no aparelho.
- O detalhe do workspace casa o PR vinculado pelo `repoId`; num card de seção o PR
  do branch pode aparecer duas vezes. A issue vinculada não muda.
- Histórico de agentes: a aba do projeto de um card de seção cobre os workspaces
  da seção, não os do projeto real, e as sessões antigas de um workspace
  renomeado ou movido que esteja numa seção não casam (o app compara o `repoId`
  dos ids anteriores com o da linha).
- O filtro "Projetos" do celular passa a listar as seções e grava o id delas no
  filtro compartilhado com o desktop (`filterRepoIds`); o desktop descarta o id
  ao hidratar, então o filtro não volta igual. Filtrar um projeto real no
  celular esconde os membros dele que estão em seções.
- Recolher o cabeçalho de uma seção no celular grava `repo:custom-section:<id>`
  nos grupos recolhidos compartilhados com o desktop, que usa `custom-section:<id>`:
  o recolhido não vale nos dois lados, e a chave do celular fica guardada sem uso
  no desktop.
- O celular que monta a lista pelo feed da sidebar (`ORCA_SIDEBAR_INPUTS=main`)
  não recebe as linhas nas seções.

## Limitações conhecidas

- Arrastar para fora de uma seção não mostra linha de inserção: o card sai da
  seção ao soltar. Soltar num vão da lista, fora de qualquer card ou título,
  mantém o card na seção. O arrasto pelo board (HTML5) não conhece as seções.
- Uma seção cheia (500) ainda mostra a linha de inserção, mas o drop não muda
  nada.
- Com a opção que repete os fixados nos grupos, ou com a mesma seção em dois
  hosts, soltar sobre um card que fica fora dos grupos de arrasto segue o
  upstream (no agrupamento por status, muda o status).
- Folder workspaces não têm o menu de seção nesta entrega. Soltos no Pinned,
  são fixados pelo upstream mas não guardam a posição: entram no fim do Pinned.
- O fallback de `worktree-reveal-group-keys` não conhece as seções.
- Quanto a pasta e o branch truncam no card estreito não tem teste: depende de
  layout real, que o teste unitário não calcula e o e2e não mede. No estilo
  experimental, o chip da pasta foi conferido por captura de fixture (larguras
  de 288 e 440 px, temas claro e escuro, título longo e pasta longa), sem
  fixture versionada. O primeiro desenho do chip deixava encolher até o ícone e
  o título passava por cima; por isso ele não encolhe.
- Recolher uma seção vale para todos os hosts.
- Mover e subir uma seção contam o Pinned mesmo quando ele está escondido por
  não ter nenhum workspace fixado.

## Onde fica salvo

Só neste computador, no estado de interface do Orca desktop
(`customSidebarSections` em `PersistedUIState`, por perfil). O campo é local do
desktop: `FORK_LOCAL_UI_FIELDS` o tira do `ui.get` e do `ui.set` de clientes
pareados. O web pareado e os celulares delegados continuam mostrando o Pinned e
a lista normal de sempre; o celular do próprio computador recebe as seções (ver
a seção seguinte). O contrato do RPC `worktree.set` e o feed não mudam.

Mover um workspace para o WSL muda a chave dele; ele sai da seção e volta
para a lista normal.

## Código

Módulos do fork:

| Arquivo                                                                      | Papel                                                                                       |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/shared/custom-sidebar-sections/custom-sidebar-sections-state.ts`        | Tipos, normalização e edições puras (criar, mover, apagar, reconciliar o Pinned)            |
| `src/shared/custom-sidebar-sections/custom-section-plan.ts`                  | Encaixe na montagem da lista: posição das seções, ordem fixa e linhagem                     |
| `src/shared/custom-sidebar-sections/custom-section-order.ts`                 | Ordem dentro de uma seção: posição salva, filhos por criação, ordem de tela                 |
| `src/renderer/src/store/slices/custom-sidebar-sections.ts`                   | Slice do store, ativação no primeiro uso, gravação e Pin/Unpin                              |
| `src/renderer/src/components/sidebar/custom-sections/`                       | Botão, diálogos, menu ⋯ da seção, menu do card e arrasto dentro da seção                    |
| `src/renderer/src/components/sidebar/worktree-card-folder-label.tsx`         | Ícone e nome da pasta do worktree, sob o título (padrão) ou ao lado dele (estilo novo)      |
| `src/renderer/src/components/sidebar/custom-sections/custom-section-drop.ts` | Arrasto entre grupos: alvo sob o ponteiro, linha de inserção, drop e saída para a lista     |
| `src/shared/custom-sidebar-sections/mobile-section-projection.ts`            | Projeção pura: projeto de mentira por seção e troca do `repoId` das linhas                  |
| `src/main/runtime/rpc/mobile-custom-sections.ts`                             | Lê as seções e aplica a projeção só ao celular do próprio computador                        |
| `src/main/runtime/rpc/mobile-custom-section-removal.ts`                      | Recusa a exclusão pelo celular de card de seção sem rodar nem dispensar o script de archive |

Pontos de encaixe em arquivos do upstream (conferir em todo sync que mexer neles):

| Arquivo                                                                                                       | Encaixe                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/sidebar-list/sidebar-row-plan.ts`                                                                 | `customSidebarSections` nas entradas, `createCustomSectionPlan`, `place()` em `sectionsOf`, `emitSections` em volta de `emitPinnedGroup` |
| `src/renderer/src/components/sidebar/worktree-list/listing/use-section-rows.ts`                               | `useCustomSidebarSectionsInput` e repasse ao `planSidebarRows`                                                                           |
| `src/renderer/src/components/sidebar/rendered-sidebar-worktree-order.ts`                                      | Mesma entrada, para a ordem dos atalhos de teclado                                                                                       |
| `src/renderer/src/components/sidebar/worktree-list/rows/SectionHeader.tsx`                                    | `CustomSectionHeaderMenu` e seta de recolher das seções                                                                                  |
| `src/renderer/src/components/sidebar/sidebar-header-actions.tsx`                                              | `CustomSectionHeaderSlot` antes de "Adicionar projeto"                                                                                   |
| `src/renderer/src/components/sidebar/WorktreeContextMenuView.tsx`                                             | `CustomSectionCardMenuItems` depois de Pin/Unpin                                                                                         |
| `src/renderer/src/components/sidebar/worktree-list/drag/use-status-mutations.ts`                              | `reorderCustomSectionByDrag` no início do `reorderWorktrees`                                                                             |
| `src/renderer/src/components/sidebar/worktree-list/drag/pointer-flush.ts`                                     | `previewCustomSectionDrop` logo depois da linhagem                                                                                       |
| `src/renderer/src/components/sidebar/worktree-list/drag/pointer-commit.ts`                                    | `commitCustomSectionDrop` logo depois da linhagem                                                                                        |
| `src/renderer/src/components/sidebar/worktree-list/drag/use-session.ts`                                       | `computeWorktreeGroupDrop` (qualquer grupo); `computeWorktreeStatusDrop` delega para ele                                                 |
| `src/renderer/src/components/sidebar/worktree-list/drag/drop-commit-context.ts`, `use-drop-commit-context.ts` | Campo opcional `computeWorktreeGroupDrop` no contexto do drop                                                                            |
| `src/renderer/src/components/sidebar/ProjectGroupNameDialog.tsx`                                              | Prop opcional `nameLabel`; sem ela o rótulo continua "Group Name"                                                                        |
| `src/renderer/src/components/sidebar/worktree-list/rows/item-row.tsx`                                         | `inPinnedSection` também nas seções `custom-section:*`, para o chip do projeto                                                           |
| `src/renderer/src/components/sidebar/worktree-card-presentation.tsx`                                          | `showWorktreeFolder` (layout padrão, conta como conteúdo da linha de baixo) e `showTitleRowFolder` (estilo novo)                         |
| `src/renderer/src/components/sidebar/worktree-card-meta-row.tsx`                                              | `WorktreeCardFolderLabel` antes do branch ou do "Detached HEAD"                                                                          |
| `src/renderer/src/components/sidebar/worktree-card-header.tsx`                                                | `WorktreeCardFolderLabel` na linha do título do estilo novo, depois do chip do projeto                                                   |
| `src/renderer/src/store/index.ts`, `types.ts`, `slices/store-test-helpers.ts`                                 | Registro do slice                                                                                                                        |
| `src/renderer/src/store/slices/ui/ui-slice-hydration-actions.ts`                                              | Hidratação do campo                                                                                                                      |
| `src/main/runtime/rpc/methods/worktree-catalog-methods.ts`, `mobile-project-sections.ts`, `worktree.ts`       | Chamam a projeção em `worktree.ps` e `mobileRelay.projectSections` e a guarda no `worktree.rm`                                           |
| `src/shared/persisted-ui-state-types.ts`, `pairing-local-ui-fields.ts`                                        | Campo persistido e bloqueio para pareados                                                                                                |
| `src/main/runtime/rpc/methods/ui-state-schema-parity-checks.ts`                                               | Campo fora do schema do RPC                                                                                                              |
| `src/shared/wsl-move/wsl-move-ui-dispositions.ts`                                                             | Classificação do campo na migração para o WSL                                                                                            |
| `src/renderer/src/i18n/locales/en.json`, `pt.json`                                                            | Bloco `customSections`                                                                                                                   |

O modo `ORCA_SIDEBAR_INPUTS=main` (chave escura, barrada no empacotamento) não
recebe as seções nas linhas da sidebar. O celular só as recebe pelo caminho
`worktree.ps` mais `mobileRelay.projectSections` (ver acima).

## Testes

- `src/shared/custom-sidebar-sections/*.test.ts`: ativar as seções não move
  nenhuma linha, em todos os agrupamentos; ordem fixa do Pinned; posição das
  seções; linhagem e irmãos por criação; membros escondidos; seção recolhida;
  seção cheia; arrasto dentro da seção e as edições puras.
- `src/renderer/src/store/slices/custom-sidebar-sections.test.ts`: nada é
  gravado antes do primeiro uso; leitura do disco antes da primeira gravação, e
  nenhuma gravação se ela falhar; Pin/Unpin ao mover; Pinned não apagável;
  arrasto assumido só nas seções; seção cheia não faz Unpin; eco de
  sincronização durante escrita; bloqueio no cliente web.
- `src/shared/custom-sidebar-sections/mobile-section-projection.test.ts`:
  membro, host local com e sem `local`, cópia em outro host, fixado, filhos de
  linhagem, seção em branco e sem membro (mesmo objeto de volta) e o catálogo
  que o celular lê com o schema dele.
- `mobile/src/worktree/custom-sections-phone-list.test.ts`: o `buildSections`
  real do app com as duas respostas projetadas (ordem do sort Manual, seção
  vazia, filho sob o pai). Roda com o vitest de `mobile/`, não com o da raiz.
- `src/main/runtime/rpc/mobile-custom-section-removal.test.ts`: a guarda recusa o
  card de seção (membro ou filho de linhagem) quando o projeto real tem script de
  archive ou os hooks não leem (também o card que está além da página padrão de
  200 linhas da listagem), e deixa passar com waiver, com `runHooks`, sem
  script, fora de seção, fixado, seletor que não é id, celular delegado, web e
  sem cliente; com `hostId` informado ela escolhe a cópia certa (e lê `local`
  como a linha sem host); o `worktree.rm` recusa antes de remover, remove depois
  do "Delete Anyway" e remove para web, delegado e sem cliente sem ler as linhas.
- `src/main/runtime/rpc/mobile-custom-sections.test.ts`: só o celular do próprio
  computador recebe a projeção; delegado, web e sem cliente não; os dois métodos
  RPC passam pela projeção.
- `src/main/runtime/rpc/methods/client-ui-fork-local-fields.test.ts`: o campo
  não entra pelo `ui.set` nem sai pelo `ui.get` de clientes pareados.
- `src/renderer/src/components/sidebar/custom-sections/custom-section-drop.test.ts`:
  drop num card de outra seção (antes do próximo membro guardado sob a linha,
  sem trocar pelo gêmeo de outro host), no título (topo, com a linha embaixo do
  título, inclusive com host no título), no título do Pinned (Pin pelo upstream)
  e não num status chamado "pinned", título de seção recolhida ou vazia, folder
  fora da seção (só o Pin do upstream), vão de outro grupo, ponteiro fora da
  sidebar (também acima ou abaixo dela), dentro da origem e antes do primeiro
  uso (fica com o upstream, sem linha de inserção), da seção para a lista (sai
  da seção, nunca um fixado), filhos de linhagem que não viram membros, drop no
  board (fica com o upstream), linhagem antes da seção, o limite exato de 8 px
  do vão, o alvo da prévia a até 6 px quando não há linha sob o ponteiro e a
  ordem de uma seleção múltipla, com filho de linhagem arrastado sozinho, drop em
  card do Pinned (fixa e guarda a posição sem mudar o status do card), título da
  lista (tira da seção), membro de outra seção numa seleção solta na lista,
  seção sem unidades de arrasto e seleção só de folder workspaces.
- `src/renderer/src/components/sidebar/custom-sections/custom-section-drag-reorder.test.ts`:
  o arrasto reordena por chave host-qualified (seção e Pinned) e move só a cópia
  arrastada, com o gêmeo de outro host no lugar; antes do primeiro uso e fora das
  seções, o arrasto fica com o upstream.
- `tests/e2e/custom-sidebar-sections-drag.spec.ts`: no Orca real, com o mouse,
  arrasta da lista para o vão entre dois cards de uma seção, entre seções pelo
  título, do Pinned para uma seção (Unpin), da seção para a lista e para o
  Pinned entre dois fixados (Pin naquela posição), e confere o estado salvo; um
  segundo teste, no agrupamento por status, mostra que soltar sobre um card da
  seção não muda o status nem troca o sort para Manual, e que voltar para um card de outro status tira da
  seção e muda o status. Os testes emulam `prefers-reduced-motion`: na janela
  escondida, a animação de linhas do upstream congela e deixa cards sob o
  ponteiro.
- `src/renderer/src/components/sidebar/WorktreeCard.worktree-folder.test.tsx`:
  o card padrão mostra a pasta antes do branch e do "Detached HEAD" e cria a
  linha de baixo num card que não tinha nada nela; o estilo experimental mostra
  a pasta antes do título, sem linha de meta; compacto e folder workspace não
  mostram a pasta.
- `tests/e2e/custom-sidebar-sections.spec.ts`: no Orca real, com sort Recent,
  prova primeiro que a atividade reordena a lista normal e depois que a seção
  "MCF" criada pelo botão mantém a ordem escolhida; um segundo teste fecha e
  reabre o app e confere que a seção volta com o workspace; um terceiro, no
  agrupamento por projeto, confere que o card sem chip embaixo do projeto ganha
  o chip na seção e mostra o nome da pasta do worktree.
