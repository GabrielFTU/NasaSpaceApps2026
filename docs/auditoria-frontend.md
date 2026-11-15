# Auditoria do front-end do Semeia — novembro/2026

## A. Resumo executivo

**Estado geral.** A base é sólida: React 19 + Vite 6 + Tailwind 4, design system coerente (tokens em `src/index.css`, componentes no padrão shadcn), dados sempre marcados como real/simulado/indisponível e conteúdo da IA renderizado como texto (sem risco de XSS). Os problemas estavam concentrados em celular, acessibilidade, PWA (inexistente) e peso de download.

**Principais problemas encontrados**
- Cabeçalho mais largo que a tela em 320 e 360 px, causando rolagem horizontal em **todas** as rotas.
- Trocar "Conversando → Formulário → Conversando" apagava toda a conversa com o assistente.
- No celular, a barra de desenho de talhão cobria ¼ do mapa e os botões de zoom.
- O `Dialog` tirava o foco do campo que a pessoa estava digitando sempre que a tela de fundo atualizava.
- Cor de texto secundário com contraste 3,1:1 (WCAG pede 4,5:1), em praticamente todas as telas.
- Nenhuma configuração de PWA (manifest, ícones, service worker, modo off-line).
- Chave real da Meteored versionada no `.env.example`.
- 14,6 MB de fotos de 1280 px exibidas como miniaturas; todo o JavaScript carregado de uma vez.

**Riscos restantes:** a chave da Meteored continua no histórico do git e precisa ser revogada; o assistente não persiste a conversa ao recarregar a página; o comparativo ainda usa termos técnicos ("Instabilidade", "Ano ruim") sem explicação no próprio card; não houve teste em aparelho físico, Safari ou Firefox.

## B. Inventário de testes

| Tela | Rota | Verificado |
|---|---|---|
| Início | `/` | 9 larguras, axe, primeiros passos, previsão, ZARC |
| Clima e alertas | `/clima` | 9 larguras, axe |
| Mapa ambiental | `/mapa` | 9 larguras, axe, troca de camada, painel de talhões, desenho por mouse e por toque, diálogo de talhão |
| Propriedades | `/propriedades` | 9 larguras, axe, menu de ações, exclusão |
| Nova / editar propriedade | `/propriedades/nova`, `/:id/editar` | 9 larguras, axe, validação, clique duplo, saída sem salvar, ajuda contextual |
| Nova análise | `/analise` | 9 larguras, axe, formulário em 5 etapas, chat (simulado) |
| Comparativo | `/analise/:id` | gerado pelo fluxo; 412 e 320 px, axe |
| Estratégias salvas | `/historico` | 9 larguras, axe, recarregar a rota |
| Configurações | `/configuracoes` | 9 larguras, axe |
| 404 | qualquer outra | 9 larguras, axe, link de volta |

- **Larguras:** 320, 360, 390, 430, 768, 1024, 1280, 1440 e 1920 px.
- **Ambiente:** Chromium (Playwright 1.49), perfis "Desktop Chrome 1440×900" e "Pixel 7" (toque emulado).
- **Automação:** 61 testes de fluxo/acessibilidade (desktop + celular), varredura de 10 rotas × 9 larguras e teste de PWA no build de produção.

**Não executado (e por quê)**
- Safari/iOS e Firefox: apenas o Chromium está disponível no ambiente.
- Aparelho físico, teclado virtual real e rotação de tela: não disponíveis em modo headless.
- Leitor de tela real (NVDA/TalkBack): só houve verificação automática e manual de semântica.
- Assistente com o Gemini real: as respostas foram simuladas para não gastar cota. Não foram testadas a qualidade das respostas, a não repetição de perguntas nem culturas fora do catálogo.
- Lighthouse/Core Web Vitals: não medidos. As melhorias de peso estão abaixo.

## C. Bugs identificados

| ID | Tela | Descrição | Sev. | Causa | Correção | Status | Evidência |
|---|---|---|---|---|---|---|---|
| B01 | Todas | Rolagem horizontal em 320/360 px | P1 | Itens do cabeçalho sem `min-w-0`, logo + seletor + ícones > 320 px | Seletor encolhe com reticências; abaixo de 400 px só o símbolo da logo | Corrigido | Teste "todas as rotas… sem rolagem horizontal" + varredura |
| B02 | Nova análise | Conversa apagada ao ir para o formulário e voltar | P1 | O chat era desmontado na troca de modo | A conversa fica montada, só escondida | Corrigido | Teste "mantém a conversa ao ir para o formulário" |
| B03 | Mapa (celular) | Barra de desenho cobria o mapa e o zoom; toques no topo não marcavam pontos | P1 | Barra absoluta no topo, com quebra em 3 linhas | No celular fica embaixo e compacta (ícones com nome acessível) | Corrigido | Teste de desenho por toque na metade de cima + screenshot |
| B04 | Diálogos | Foco saía do campo durante a digitação | P1 | Efeito do `Dialog` dependia de `onClose` inline e rodava a cada renderização do pai | `onClose` guardado em ref; efeito só depende de `open` | Corrigido | Teste "dados chegando ao fundo não tiram o foco" |
| B05 | Diálogos | Sem trava de foco; conteúdo longo passava da tela; `id` fixo | P2 | Implementação mínima | Trava de Tab, `max-h` com rolagem interna, `useId`, `aria-describedby` | Corrigido | Teste do diálogo de exclusão |
| B06 | Nova propriedade | Saída sem aviso perdia o que foi preenchido | P1 | Sem bloqueio de navegação | `useBlocker` + `beforeunload`, com "Continuar editando" | Corrigido | Teste "sair com dados não salvos" |
| B07 | Nova propriedade | Clique duplo poderia cadastrar duas vezes | P2 | Sem trava durante o salvamento | Ignora envio com `saving` ativo | Corrigido | Teste de clique duplo |
| B08 | Propriedades | Menu "…" não fechava no celular | P2 | Fechava só com `onMouseLeave` | Fecha ao tocar fora e com Esc | Corrigido | Teste do menu de ações |
| B09 | Cabeçalho (celular) | Painel de alertas saía pela esquerda da tela | P2 | Ancorado no sino com largura de 320 px | Largura da tela no celular; Esc fecha | Corrigido | Revisão visual |
| B10 | Menu mobile | Esc não fechava, o fundo rolava, o foco se perdia | P2 | Sem gestão de teclado/foco | Esc, trava de rolagem, foco no primeiro link e retorno ao botão | Corrigido | Teste "fecha com Esc e devolve o foco" |
| B11 | Mapa | Legenda cobria o seletor "Satélite/Mapa" | P2 | Os dois ancorados no rodapé do mapa | Legenda sobe no celular | Corrigido | Screenshot da auditoria |
| B12 | Início | Carrossel da previsão avançava sozinho, em loop, sem pausa | P2 | Avanço automático a cada 4 s (fere WCAG 2.2.2) | Removido; setas, arrasto e teclado mantidos | Corrigido | Revisão de código |
| B13 | Segurança | Chave da Meteored no `.env.example` versionado | P1 | Arquivo de exemplo com o valor real | Trocada por placeholder | Parcial: **revogar a chave** | `git log -- .env.example` |
| B14 | Todas | Sem tela de erro quando a renderização falha ou o código de uma tela não baixa | P2 | Sem `errorElement` | Tela "Não foi possível abrir esta tela" com "Tentar de novo" | Corrigido | Teste offline (antes da correção do SW) |

## D. Melhorias de UX/UI

| Problema original | Alteração | Impacto para Agnaldo |
|---|---|---|
| Comparativo mostrava "V1 / I1 / V2 / I2" | "Verão 1 / Inverno 1…"; números das "Outras opções" ganham legenda | Lê a sequência sem precisar decifrar códigos |
| Stepper no celular mostrava só números | "Etapa 2 de 5 · Culturas · depois: Solo" | Sabe onde está e o que vem a seguir |
| Sem orientação de primeiro uso | Bloco "Primeiros passos" no Início: opcional, pode ser escondido, progresso tirado dos dados | Vê o próximo passo sem tutorial obrigatório |
| Dúvidas sem resposta no lugar | `HelpTip`: "O que é um talhão?", "Como sei se minha terra é arenosa?", "Por que precisamos saber o que você plantou antes?" | Ajuda curta por toque/teclado, sem sair da tela |
| Textos "Clique…" no celular | "Toque nos cantos…" | Instrução bate com o gesto que ele usa |
| Campos com fonte de 14 px | 16 px no celular | O iPhone não dá zoom ao tocar no campo |
| Texto do mapa citava um rótulo inexistente | "Escolha o que quer ver no campo 'Camada'…" | Instrução aponta para o controle certo |
| Troca de tela lenta em rede móvel sem resposta visual | Barra fina de carregamento no topo | Sabe que o toque funcionou |

## E. Responsividade e PWA

- **Responsividade:** varredura final sem overflow em nenhuma rota nas 9 larguras; comparativo validado em 412 e 320 px.
- **Manifest** (`public/manifest.webmanifest`): nome, nome curto, `start_url`/`scope` `/`, `standalone`, cores, ícones 192/512/maskable gerados a partir de `logo-mark.png`, atalhos para "Nova análise" e "Mapa". `index.html` recebeu `apple-touch-icon` e as metas mobile. O viewport passou a usar `interactive-widget=resizes-content`, para o teclado virtual não esconder o campo do chat.
- **Service worker** (`public/sw.js`), registrado só no build de produção:
  - Navegação: rede primeiro; sem conexão, usa o shell guardado.
  - `/assets`: cache primeiro. Na instalação baixa o código de **todas** as telas (lista gerada no build: `asset-list.json`).
  - Imagens e ZARC: usa o guardado e atualiza em segundo plano.
  - **Nunca guarda** APIs externas (NASA, GIBS, tiles), `/gemini`, `/meteored`, `/cepea` nem `/yahoo`.
  - Versão por build (`__APP_VERSION__`); caches antigos são apagados.
- **Off-line:** aviso "Sem internet" que diz o que continua disponível e o que precisa de conexão, com botão para tentar de novo.
- **Validado** (Chromium, build de produção): instalação do SW, abertura sem internet (inclusive de tela nunca visitada) e ausência de dados externos no cache.
- **Limitações:** sem botão próprio de instalação (o prompt do navegador é o caminho suportado); não foi testado no iOS; os mapas não funcionam sem conexão.

## F. Acessibilidade (referência WCAG 2.2 AA)

**Corrigido**
- 1.4.3 contraste: token `subtle-foreground` #8a958b → #667168; âmbar do comparativo → `warning`.
- 2.5.8 tamanho de alvo: link "Créditos das imagens" e botões do stepper.
- 2.1.1 teclado: regiões roláveis (calendário ZARC, chat) recebem foco.
- 2.1.2 e 2.4.3: trava e retorno de foco em diálogos e no menu mobile.
- 2.2.2: carrossel sem movimento automático.
- 2.4.2: título da aba por tela.
- 1.3.1: um `h1` por tela; `<dl>` válido.
- 4.1.2: nomes acessíveis nos vértices do mapa, nos botões só com ícone e nos esqueletos de carregamento (`role=status`).
- 4.1.3: chat como `role=log` com `aria-busy`, para que o streaming não seja lido pedaço por pedaço.

**Testes realizados:** axe-core (tags WCAG 2.0/2.1/2.2 A/AA) em todas as rotas, a 390 e a 1440 px, mais o comparativo; navegação por teclado nos fluxos críticos (Tab, Esc, Enter); semântica conferida no código.

**Pendente:** leitor de tela real; zoom de 200% e alturas reduzidas; descrição textual dos gráficos (recharts) e do mapa; navegação por setas nos grupos `role=radio` (hoje cada opção recebe Tab).

**Conformidade:** não é possível declarar conformidade WCAG apenas com essas verificações.

## G. Qualidade técnica

- `npm run typecheck` e `npm run build`: passam.
- `npm run test:e2e`: 61/61 (desktop + celular). `npm run test:e2e:audit`: 10/10, com relatório JSON e screenshots em `test-results/audit`. PWA: 2/2 contra `vite preview` (instruções no topo de `e2e/pwa-preview.spec.ts`).
- **Erros de console:** nenhum, nas 10 rotas × 9 larguras.
- **Performance:**
  - Carregamento por rota: chunk principal de 678 → 316 kB (210 → 100 kB gzip).
  - Fotos: 14,6 → 3,3 MB (máximo de 640 px, JPEG 82%).
  - Alerta restante: o chunk `charts` (recharts, 115 kB gzip) carrega com o Início.
- **Segurança:** conteúdo da IA renderizado como texto; chaves ficam no proxy do Vite, fora do bundle. **Atenção:** o proxy só existe em `vite dev`/`preview`; em hospedagem estática, o assistente e a previsão precisam de um backend próprio.

## H. Pendências (por impacto)

1. **Revogar a chave da Meteored** exposta no histórico do git e gerar outra.
2. Definir um backend/proxy de produção para `/gemini`, `/meteored`, `/cepea` e `/yahoo`. Sem isso, o assistente e a previsão não funcionam fora do `vite`.
3. Persistir a conversa do assistente (por exemplo, em `sessionStorage`), para que recarregar a página não a apague. Reiniciar o chat também deveria limpar o "O que entendi até agora".
4. Comparativo: explicar "Instabilidade" e "Ano ruim" no próprio card (hoje só via `title`, que não aparece no toque).
5. Testar em Safari/iOS, Firefox e aparelho físico (teclado virtual, rotação, gestos no mapa).
6. Descrições textuais para gráficos e mapa; teste com NVDA/TalkBack.
7. Lighthouse/Web Vitals em rede móvel; avaliar carregar o recharts só quando o gráfico aparece.
8. O aviso de mensagem rápida demais no chat (limite de 1,5 s) descarta o envio sem dar retorno.
