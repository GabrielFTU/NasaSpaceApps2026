# Semeia — MVP

Plataforma de apoio à decisão agrícola: indicadores climáticos (NASA POWER), umidade do solo (NASA SMAP) e comparação demonstrativa de rotações de culturas.

## Executar

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + build de produção
```

## Estrutura

```
src/
  app/            roteamento, layout e store (Zustand + localStorage)
  components/     ui/ (padrão shadcn/ui), mapas, gráficos, componentes compartilhados
  features/
    dashboard/    painel, KPIs, gráficos, regras de alerta (alerts.ts)
    properties/   cadastro com mapa, validação, edição e exclusão
    analysis/     assistente em 5 etapas + resumo climático por estação
    rotations/    motor de regras (engine.ts) e tela de comparação
    history/      histórico de análises
    settings/     perfil, preferências, fontes de dados, sincronização
  services/nasa/  camada de dados desacoplada da interface
  data/           catálogo de culturas e propriedades de exemplo
  types/          tipos de domínio
  lib/            utilitários e formatação pt-BR
```

## Dados

| Fonte | Modo padrão | Alternativa |
|---|---|---|
| NASA POWER (T2M, T2M_MAX, T2M_MIN, PRECTOTCORR, RH2M, ALLSKY_SFC_SW_DWN) | Mock documentado (`power.mock.ts`) | API pública real (`power.api.ts`), ativada em Configurações → Fontes de dados |
| NASA SMAP (superficial e zona das raízes) | Mock documentado (`smap.mock.ts`) | Integração real pendente (requer Earthdata, via backend) |

| ZARC — Zoneamento Agrícola de Risco Climático (MAPA), Tábua de Risco da safra vigente, sequeiro | Dado oficial pré-processado em `public/zarc/<UF>.json` (`npm run zarc:sync`) | — |

### ZARC

```bash
npm run zarc:sync    # baixa a tábua oficial (~220 MB + perenes), filtra e grava public/zarc/
```

O CSV do MAPA não permite acesso direto do navegador (tamanho e ausência de CORS), por isso é convertido em JSONs compactos por UF, carregados sob demanda:

- `public/zarc/<UF>.json` — as 31 culturas anuais do catálogo de rotação (`data/crops.ts`, campo `zarc`), sequeiro. Quando a tábua usa um nome só para as duas épocas (girassol, amendoim, algodão…), cada janela vai para verão (ago–dez) ou 2ª safra/inverno (jan–jul) conforme onde está a maior parte dela.
- `public/zarc/<UF>-outras.json` — todas as demais culturas zoneadas (perenes, frutíferas, cana, olerícolas, forrageiras), sequeiro ou irrigado. Só consulta, na aba "Outras culturas" do painel; não entram na comparação de rotações.
Rode de novo quando o MAPA publicar novas portarias (o dataset é atualizado semanalmente); para trocar de safra, ajuste `SOURCES` em `scripts/zarc-sync.mjs`.

- `services/zarc/` acha o município pelo nome/UF da propriedade, escolhe a classe de solo pela textura (arenosa → AD1, média → AD3, argilosa → AD4, muito argilosa → AD6 — **aproximação**), usa o menor nível de manejo (NM) publicado e resume as janelas de plantio por decêndio (riscos de 20/30/40%).
- O motor de rotações (`engine.ts`, versão `regras-demo-0.2-zarc`) penaliza cultura comercial fora do ZARC (compatibilidade baixa) ou só com janelas de 40% de risco. Milho/feijão/sorgo no inverno usam o zoneamento de 2ª safra.
- Painel e tela de comparação mostram o calendário de plantio do município.

Toda a interface consome apenas `services/nasa/index.ts`; trocar mock por API real, Supabase ou uma API .NET acontece somente ali.
Cada valor exibido é marcado como **Dado real**, **Simulado** ou **Indisponível**.

## Limites deliberados

- Indicadores de rotação são **índices simulados** (0–100) gerados por regras explícitas em `features/rotations/engine.ts`, exibidas na própria tela. Não estimam produtividade nem são recomendação agronômica validada.
- Necessidades hídricas: faixas gerais da FAO 33/56 quando indicado; demais valores são estimativas demonstrativas.
- Dados são históricos observados, nunca previsão. Valores de satélite representam a célula de grade, não um ponto da propriedade.
- Persistência apenas local (localStorage).
