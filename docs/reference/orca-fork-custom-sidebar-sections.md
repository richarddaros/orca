# Seções personalizadas na sidebar (fork)

<!-- updated: 2026-10-28 -->

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
    seções personalizadas e o drop segue o upstream; no Pinned continua sendo
    fixada pelo upstream.
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

No layout padrão (não compacto, sem o estilo experimental de card), todo card
de worktree git mostra, na linha de baixo do título, um ícone de pasta e o nome
da pasta do checkout (por exemplo, `pinfish`), antes do branch ou do "Detached
HEAD". O caminho completo aparece ao passar o mouse. Um card que não tinha nada
nessa linha passa a ter a linha só com a pasta. Quando falta espaço, a pasta e
o branch truncam juntos, e a pasta encolhe mais depressa (peso 3 contra 1): ela
perde mais em proporção, mas o branch também perde espaço.

Ao contrário do resto deste doc, isso não depende das seções: vale desde a
primeira abertura, em todo card git do layout padrão, mesmo para quem nunca
criou uma seção.

- Vale para todo lugar que usa o mesmo card: a lista inteira (não só as
  seções), o quadro de status (board) e a lista de worktrees do painel de
  folder workspace.
- Folder workspaces já mostravam a pasta e continuam iguais. O layout compacto
  e o estilo experimental não mudam.
- O app do celular tem cards próprios e não muda.

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
  layout real, que o teste unitário não calcula e o e2e não mede.
- Recolher uma seção vale para todos os hosts.
- Mover e subir uma seção contam o Pinned mesmo quando ele está escondido por
  não ter nenhum workspace fixado.

## Onde fica salvo

Só neste computador, no estado de interface do Orca desktop
(`customSidebarSections` em `PersistedUIState`, por perfil). O campo é local do
desktop: `FORK_LOCAL_UI_FIELDS` o tira do `ui.get` e do `ui.set` de clientes
pareados. O web pareado e o celular continuam mostrando o Pinned e a lista
normal de sempre. O contrato do RPC `worktree.set` e o feed não mudam.

Mover um workspace para o WSL muda a chave dele; ele sai da seção e volta
para a lista normal.

## Código

Módulos do fork:

| Arquivo                                                                      | Papel                                                                                   |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/shared/custom-sidebar-sections/custom-sidebar-sections-state.ts`        | Tipos, normalização e edições puras (criar, mover, apagar, reconciliar o Pinned)        |
| `src/shared/custom-sidebar-sections/custom-section-plan.ts`                  | Encaixe na montagem da lista: posição das seções, ordem fixa e linhagem                 |
| `src/shared/custom-sidebar-sections/custom-section-order.ts`                 | Ordem dentro de uma seção: posição salva, filhos por criação, ordem de tela             |
| `src/renderer/src/store/slices/custom-sidebar-sections.ts`                   | Slice do store, ativação no primeiro uso, gravação e Pin/Unpin                          |
| `src/renderer/src/components/sidebar/custom-sections/`                       | Botão, diálogos, menu ⋯ da seção, menu do card e arrasto dentro da seção                |
| `src/renderer/src/components/sidebar/worktree-card-folder-label.tsx`         | Ícone e nome da pasta do worktree na linha de baixo do título do card                   |
| `src/renderer/src/components/sidebar/custom-sections/custom-section-drop.ts` | Arrasto entre grupos: alvo sob o ponteiro, linha de inserção, drop e saída para a lista |

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
| `src/renderer/src/components/sidebar/worktree-card-presentation.tsx`                                          | `showWorktreeFolder`, que também conta como conteúdo da linha de baixo do título                                                         |
| `src/renderer/src/components/sidebar/worktree-card-meta-row.tsx`                                              | `WorktreeCardFolderLabel` antes do branch ou do "Detached HEAD"                                                                          |
| `src/renderer/src/store/index.ts`, `types.ts`, `slices/store-test-helpers.ts`                                 | Registro do slice                                                                                                                        |
| `src/renderer/src/store/slices/ui/ui-slice-hydration-actions.ts`                                              | Hidratação do campo                                                                                                                      |
| `src/shared/persisted-ui-state-types.ts`, `pairing-local-ui-fields.ts`                                        | Campo persistido e bloqueio para pareados                                                                                                |
| `src/main/runtime/rpc/methods/ui-state-schema-parity-checks.ts`                                               | Campo fora do schema do RPC                                                                                                              |
| `src/shared/wsl-move/wsl-move-ui-dispositions.ts`                                                             | Classificação do campo na migração para o WSL                                                                                            |
| `src/renderer/src/i18n/locales/en.json`, `pt.json`                                                            | Bloco `customSections`                                                                                                                   |

O modo `ORCA_SIDEBAR_INPUTS=main` (chave escura, barrada no empacotamento) não
recebe as seções. O app do celular também não.

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
  o arrasto resolve cada card para a chave do membro da seção, mesmo com um
  gêmeo de outro host na tela.
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
  linha de baixo num card que não tinha nada nela; compacto, estilo experimental e folder
  workspace não mudam.
- `tests/e2e/custom-sidebar-sections.spec.ts`: no Orca real, com sort Recent,
  prova primeiro que a atividade reordena a lista normal e depois que a seção
  "MCF" criada pelo botão mantém a ordem escolhida; um segundo teste fecha e
  reabre o app e confere que a seção volta com o workspace; um terceiro, no
  agrupamento por projeto, confere que o card sem chip embaixo do projeto ganha
  o chip na seção e mostra o nome da pasta do worktree.
