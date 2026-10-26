# Seções personalizadas na sidebar (fork)

<!-- updated: 2026-10-25 -->

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
  clique direito › **Subir na seção** / **Descer na seção**. Arrastar de uma
  seção para outra entra numa segunda entrega.
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

## Limitações conhecidas

- Arrastar um card de uma seção para outra, ou da lista para uma seção, fica
  para a segunda entrega; hoje isso reordena só o grupo de origem, como no
  upstream.
- Folder workspaces não têm o menu de seção nesta entrega.
- O fallback de `worktree-reveal-group-keys` não conhece as seções.
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

| Arquivo                                                               | Papel                                                                            |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/shared/custom-sidebar-sections/custom-sidebar-sections-state.ts` | Tipos, normalização e edições puras (criar, mover, apagar, reconciliar o Pinned) |
| `src/shared/custom-sidebar-sections/custom-section-plan.ts`           | Encaixe na montagem da lista: posição das seções, ordem fixa e linhagem          |
| `src/shared/custom-sidebar-sections/custom-section-order.ts`          | Ordem dentro de uma seção: posição salva, filhos por criação, ordem de tela      |
| `src/renderer/src/store/slices/custom-sidebar-sections.ts`            | Slice do store, ativação no primeiro uso, gravação e Pin/Unpin                   |
| `src/renderer/src/components/sidebar/custom-sections/`                | Botão, diálogos, menu ⋯ da seção, menu do card e arrasto dentro da seção         |

Pontos de encaixe em arquivos do upstream (conferir em todo sync que mexer neles):

| Arquivo                                                                          | Encaixe                                                                                                                                  |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/sidebar-list/sidebar-row-plan.ts`                                    | `customSidebarSections` nas entradas, `createCustomSectionPlan`, `place()` em `sectionsOf`, `emitSections` em volta de `emitPinnedGroup` |
| `src/renderer/src/components/sidebar/worktree-list/listing/use-section-rows.ts`  | `useCustomSidebarSectionsInput` e repasse ao `planSidebarRows`                                                                           |
| `src/renderer/src/components/sidebar/rendered-sidebar-worktree-order.ts`         | Mesma entrada, para a ordem dos atalhos de teclado                                                                                       |
| `src/renderer/src/components/sidebar/worktree-list/rows/SectionHeader.tsx`       | `CustomSectionHeaderMenu` e seta de recolher das seções                                                                                  |
| `src/renderer/src/components/sidebar/sidebar-header-actions.tsx`                 | `CustomSectionHeaderSlot` antes de "Adicionar projeto"                                                                                   |
| `src/renderer/src/components/sidebar/WorktreeContextMenuView.tsx`                | `CustomSectionCardMenuItems` depois de Pin/Unpin                                                                                         |
| `src/renderer/src/components/sidebar/worktree-list/drag/use-status-mutations.ts` | `reorderCustomSectionByDrag` no início do `reorderWorktrees`                                                                             |
| `src/renderer/src/components/sidebar/ProjectGroupNameDialog.tsx`                 | Prop opcional `nameLabel`; sem ela o rótulo continua "Group Name"                                                                        |
| `src/renderer/src/store/index.ts`, `types.ts`, `slices/store-test-helpers.ts`    | Registro do slice                                                                                                                        |
| `src/renderer/src/store/slices/ui/ui-slice-hydration-actions.ts`                 | Hidratação do campo                                                                                                                      |
| `src/shared/persisted-ui-state-types.ts`, `pairing-local-ui-fields.ts`           | Campo persistido e bloqueio para pareados                                                                                                |
| `src/main/runtime/rpc/methods/ui-state-schema-parity-checks.ts`                  | Campo fora do schema do RPC                                                                                                              |
| `src/shared/wsl-move/wsl-move-ui-dispositions.ts`                                | Classificação do campo na migração para o WSL                                                                                            |
| `src/renderer/src/i18n/locales/en.json`, `pt.json`                               | Bloco `customSections`                                                                                                                   |

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
  arrasto assumido só nas seções; eco de sincronização durante escrita;
  bloqueio no cliente web.
- `src/main/runtime/rpc/methods/client-ui-fork-local-fields.test.ts`: o campo
  não entra pelo `ui.set` nem sai pelo `ui.get` de clientes pareados.
- `src/renderer/src/components/sidebar/custom-sections/custom-section-drag-reorder.test.ts`:
  o arrasto resolve cada card para a chave do membro da seção, mesmo com um
  gêmeo de outro host na tela.
- `tests/e2e/custom-sidebar-sections.spec.ts`: no Orca real, com sort Recent,
  prova primeiro que a atividade reordena a lista normal e depois que a seção
  "MCF" criada pelo botão mantém a ordem escolhida; um segundo teste fecha e
  reabre o app e confere que a seção volta com o workspace.
