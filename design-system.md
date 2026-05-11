# The Ride — Design System

> **Fonte canônica única** para tokens, componentes e padrões.  
> Antes de criar qualquer coisa nova: **consulte este documento**.  
> Se algo aqui está desatualizado, atualize antes do PR seguir.

---

## Princípios

1. **Um número herói por contexto.** Cada tela tem UMA métrica protagonista. Demais são suporte.
2. **Disclosure progressiva.** Simples → Detalhado → Avançado. O usuário escolhe profundidade.
3. **Narrativa antes de gráfico.** Toda análise técnica precedida por frase em linguagem natural.
4. **Beleza editorial, não gamificada.** Apple Fitness, não Pokémon Go. Sem confetes, sem badges infantis.
5. **Performance é parte do design.** Render >60fps em tablet médio. Pesar bundle a cada decisão.

---

## Regras de Desenvolvimento Front-end

### Reuso é obrigatório, não opcional

1. **Antes de criar componente novo**, busque um existente:
   - `grep -r "className=\"card\"" src/` → tem card?
   - Consulte o catálogo neste documento.
2. **Se um padrão visual aparece 2+ vezes**, promova a componente reutilizável.
3. **Se você está duplicando CSS**, pare. Use token ou classe utility existente.
4. **Componente novo precisa caber em uma categoria** deste documento. Se não cabe, abra discussão antes.

### Tokens vs valores literais

- ❌ `color: #D5FF00`
- ✅ `color: var(--accent)`
- ❌ `padding: 14px 22px` (a menos que seja específico do componente)
- ✅ Padding usando escala de 4 (8, 12, 16, 24...)

### Estrutura de componentes

```
src/components/
  primitives/         ← Atoms reutilizáveis (Button, Card, Pill)
  composites/         ← Compostos de primitives (HeroStat, MetricCard)
  charts/             ← Wrappers de uPlot/visx (TimeSeriesChart, Scatter)
  features/           ← Específicos de feature (LiveMap, DeviceModal)
  icons/              ← Já existe — manter
```

### Padrões React

- **Use 'use client' apenas onde precisa.** Padrão é Server Component.
- **Props com defaults** > prop drilling.
- **Composição** > prop explosão. Em vez de `<Card title icon action body footer/>`, prefira `<Card><CardHeader/>...</Card>`.
- **Pure components** primeiro. Lógica de negócio em stores Zustand ou hooks.
- **Co-locate styles** quando estritamente do componente. Promove a `globals.css` ao 2º uso.

### Convenções de naming

- Componentes: `PascalCase.tsx`
- Hooks: `useNomeCamelCase.ts`
- Stores: `nomeStore.ts`
- Utils: `kebab-case.ts` ou `camelCase.ts`
- CSS classes: `kebab-case` (manter padrão existente)

### Imports

```typescript
// Ordem: externos → internos absolutos → relativos → tipos
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useBleStore } from '@/stores/bleStore';
import { Icons } from '@/components/icons';

import { LocalThing } from './local-thing';

import type { Athlete } from '@/types';
```

### Quando perguntar antes de codar

- Adicionar dependência nova (sempre).
- Mudar token existente (sempre).
- Criar componente que poderia ser usado por outras features (geralmente).
- Mudar schema Supabase (sempre).

---

## Tokens

### Cores

```css
/* Backgrounds (escuro → mais claro) */
--bg:         #0A0A0A   /* fundo da app */
--bg-2:       #141414   /* cards e elevações */
--bg-3:       #1F1F1F   /* inputs, hovers, cards aninhados */

/* Linhas e bordas */
--line:       #2A2A2A   /* bordas em hover/foco */
--line-soft:  #1F1F1F   /* bordas padrão */

/* Texto */
--fg:         #FAFAFA   /* primário */
--fg-2:       #B8B8B8   /* secundário */
--fg-3:       #6B6B6B   /* terciário (labels, metadados) */

/* Accents */
--accent:        #D5FF00   /* lime — CTAs, valores positivos, brand */
--accent-deep:   #B8DD00   /* hover do accent */
--accent-2:      #FF5A1F   /* laranja — FC, alertas, gradientes positivos */
--accent-3:      #E91E63   /* magenta — uso raro, dados de destaque */
--accent-4:      #00D4E0   /* cyan — velocidade, dados técnicos */

/* Status */
--ok:            #D5FF00   /* (igual ao accent) */
--warn:          #FF5A1F   /* (igual ao accent-2) */
--on-accent:     #0A0A0A   /* texto sobre fundo accent */
```

### Zonas de Potência (Coggan)

**Fonte única**: importar de `@/lib/zones.ts` (a ser criado). Nunca redefinir inline.

```typescript
// 5 zonas no MVP (expansível para 7 no futuro)
export const POWER_ZONES = [
  { id: 'z1', label: 'Z1', name: 'Recuperação', color: 'oklch(0.5 0.05 250)',  max: 0.55 },
  { id: 'z2', label: 'Z2', name: 'Endurance',   color: 'oklch(0.7 0.14 180)',  max: 0.75 },
  { id: 'z3', label: 'Z3', name: 'Tempo',       color: 'oklch(0.78 0.18 60)',  max: 0.90 },
  { id: 'z4', label: 'Z4', name: 'Limiar',      color: 'oklch(0.7 0.2 340)',   max: 1.05 },
  { id: 'z5', label: 'Z5', name: 'VO2 Máx',    color: 'oklch(0.65 0.22 25)',  max: 99   },
] as const;

export function getPowerZone(power: number, ftp: number) {
  const pct = power / ftp;
  return POWER_ZONES.find(z => pct < z.max) ?? POWER_ZONES[4];
}
```

### Tipografia

**Famílias**:
- `'Inter'` — corpo geral, headlines, UI
- `'JetBrains Mono'` — números, labels técnicas, dados

**Escala** (em uso pelo projeto):

| Token / classe | Tamanho | Peso | Uso |
|---|---|---|---|
| `.h1` | 44px | 800 | Título de tela ("Escolha sua rota.") |
| `.h2` | 24px | 700 | Títulos de seção |
| Display | 64px | 800 | HUD durante ride (potência) |
| Title | 30px | 800 | Stat cards de pós-treino |
| Body | 14px | 400 | Corpo padrão |
| `.lede` | 14px | 400 | Texto explicativo, max 560px |
| Caption mono | 10.5-11px | 500 | Labels (uppercase, letter-spacing .12em) |
| Mono-tabular | varia | 400-600 | Números técnicos |

**Letter-spacing** :
- Headlines grandes: `-0.035em` a `-0.02em`
- Body: padrão
- Labels caption: `+0.12em` a `+0.22em` (uppercase)

### Espaçamento

Escala em múltiplos de 4: **`4, 8, 10, 12, 14, 18, 24, 28, 36, 48, 64`**

(notar que o projeto usa 10/14/18 também — não é estritamente 4-base, mantém-se a flexibilidade)

### Border radius

```
6px   — buttons pequenos, chips internos
8px   — inputs, chips, pop-links
10px  — botões padrão, pills, summary-items
12px  — cards de conteúdo, devices, route-items
14px  — popovers, metrics
16px  — auth-card
999px — pills puras (não usado atualmente, evitar)
```

### Sombras e elevação

Layout flat, dark. Sombras só em overlays:
```
box-shadow: 0 20px 60px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.02) inset;
```
Backdrop blur em overlays:
```
backdrop-filter: blur(12px-18px);
```

### Animações

- **Microinteração padrão**: 150ms ease
- **State transitions** (cor por zona): 200-300ms ease
- **Loading shimmer**: 1.6s linear infinite
- **Scanning bar**: 1.6s linear infinite

Respeitar `prefers-reduced-motion`:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

---

## Catálogo de Componentes Existentes

### Layout

| Classe | Uso | Notas |
|---|---|---|
| `.stage` | Container raiz fixo 1440px | Avaliar responsivo no futuro |
| `.chrome` | Barra superior 64px | Logo, status, avatar |
| `.screen` | Conteúdo abaixo do chrome | `inset: 64px 0 0 0` |

### Tipografia

| Classe | Uso |
|---|---|
| `.h1` | Título de tela |
| `.h2` | Título de seção |
| `.lede` | Texto explicativo abaixo de h1 |
| `.crumb` | Breadcrumb / step indicator |
| `.mono` | Texto em JetBrains Mono com tabular-nums |

### Primitivas reutilizáveis

| Classe | Variantes | Uso |
|---|---|---|
| `.card` | — | Container padrão (bg-2, line-soft, radius 12) |
| `.btn` | `.primary`, `.ghost`, `.lg` | Botão padrão. **`.primary` é o CTA principal.** |
| `.pill` | — | Chip estático informativo |
| `.chip` | `.on`, `.avatar-chip` | Botão pílula (filtros, toggles) |
| `.dot` | `.warn`, `.off` | Indicador status (verde/laranja/cinza) |
| `.avatar` | — | 32×32 com iniciais |
| `.field` | — | Wrapper de label + input |

### Estatística / dados

| Classe | Uso |
|---|---|
| `.metric` | Card grande de número durante ride (HUD) |
| `.stat-cell` | Card pequeno de stat (preview de rota) |
| `.sum-stat` | Card de stat do pós-treino |
| `.readout` | Pill de dado flutuante (durante ride) |
| `.zone-pip` | Indicador de zona (5 barrinhas) |

### Gráficos atuais

| Classe | Uso |
|---|---|
| `.chart-card` | Container de gráfico no pós-treino |
| `.chart-head` | Cabeçalho do gráfico |
| `.zones` | Grid de zonas com barras |
| `.zone-row` | Linha de zona (nome + barra + %) |
| `.zone-bar` | Barra horizontal preenchida |
| `.preview-elev` | Mini gráfico de elevação na seleção |
| `.preview-map` | Mini-mapa na seleção |

### Tela ativa (LIVE)

| Classe | Uso |
|---|---|
| `.live` | Container da tela ativa |
| `.live-top` | Overlays superiores (nome, tempo) |
| `.ride-tag` | Pill flutuante com info |
| `.hud-rail` | Linha de 4 métricas grandes (rodapé) |
| `.metric` | Card de métrica grande |
| `.elev-track` | Faixa de perfil de elevação flutuante |
| `.play-strip` | Botões de pause/stop/settings na lateral |

### Pareamento (PAIR)

| Classe | Uso |
|---|---|
| `.pair` | Grid 1fr + 460px |
| `.pair-left`, `.pair-right` | Lados |
| `.device-grid` | Grid 2x2 de cards de dispositivos |
| `.device` | Card de dispositivo (estados: scanning, connected) |
| `.device-head`, `.device-icon`, `.device-name`, `.device-sub` | Anatomia do device |
| `.device-status`, `.device-meta`, `.device-actions` | — |
| `.protocol` | Badges BLE/FTMS/CSC/HR |
| `.scanning-bar` | Animação de scan |
| `.summary-list`, `.summary-item` | Lista de dados do perfil (lateral direita) |
| `.footer-actions` | Footer com botões de ação |

### Rotas (ROUTE)

| Classe | Uso |
|---|---|
| `.route` | Grid 1fr + 480px |
| `.route-left`, `.route-right` | Lados |
| `.route-list` | Lista vertical de rotas |
| `.route-item` | Item de rota (`.active` quando selecionada) |
| `.route-thumb` | Thumbnail 120×80 |
| `.route-info`, `.route-stats` | Anatomia do item |
| `.route-detail` | Painel direito de detalhe |
| `.stat-grid`, `.stat-cell` | Grid de 4 stats do detalhe |
| `.difficulty` | Indicador `.d1`...`.d5` |

### Popovers / menus

| Classe | Uso |
|---|---|
| `.popover` | Container de overlay |
| `.pop-head`, `.pop-body`, `.pop-foot` | Anatomia |
| `.pop-x` | Botão fechar |
| `.pop-dev` | Item de dispositivo no popover |
| `.pop-link` | Item clicável (ícone + texto + chevron) |
| `.pop-anchor` | Posicionamento absoluto abaixo de gatilho |

### Auth

| Classe | Uso |
|---|---|
| `.auth-stage` | Container centralizado |
| `.auth-card` | Card 400px |
| `.field` | Wrapper de label + input |
| `.auth-error` | Banner de erro |

---

## Componentes a Criar (Sprints 1-7)

Quando construir, seguir as regras de reuso. Para cada componente novo, validar:
- [ ] Reusa primitivas existentes?
- [ ] Token de cor/espaçamento (nunca literal)?
- [ ] Documentado abaixo após criar?

### `<HeroStat>` — Sprint 2

Número gigante + label + comparação contextual. Usado no topo do pós-treino e no dashboard.

```tsx
<HeroStat 
  value={82}
  label="TSS"
  meta="IF 0.81 · NP 246W"
  classification="Treino moderado-alto"
  recovery="Recuperação 36-48h"
  highlight="↑ 4W melhor que sua última tentativa"
/>
```

### `<SparkLine>` — Sprint 1

Mini-gráfico de potência inline na lista de histórico. ~120×24px, sem eixos.

```tsx
<SparkLine 
  data={powerSeriesDownsampled}
  color="var(--accent)"
  width={120}
  height={24}
/>
```

### `<TimeSeriesChart>` — Sprint 2 (wrapper uPlot)

Gráfico unificado de múltiplas séries temporais com toggles e tooltip sincronizado.

```tsx
<TimeSeriesChart 
  series={[
    { name: 'Potência', data: power, color: 'var(--accent)', yAxis: 'left' },
    { name: 'FC',       data: hr,    color: 'var(--accent-2)', yAxis: 'right' },
    { name: 'Cadência', data: cad,   color: 'var(--accent-4)', yAxis: 'left2' },
  ]}
  background={{ name: 'Gradiente', data: grad, type: 'area-gray' }}
  height={280}
/>
```

### `<ScatterCard>` — Sprint 2

Card pequeno com scatter + frase interpretativa. Usado nas análises cruzadas.

```tsx
<ScatterCard 
  title="Potência × Gradiente"
  data={pointsArray}
  xLabel="Gradiente (%)"
  yLabel="Potência (W)"
  insight="Você atinge média de 285W em rampas >5%"
/>
```

### `<ZoneDistribution>` — refatorar do existente (Sprint 2)

Componentizar o `.zones` existente. Aceitar arrays e renderizar barras.

```tsx
<ZoneDistribution 
  zones={POWER_ZONES}
  data={powerZoneSeconds}
  totalSeconds={duration}
  showTimeInTarget="z3"
/>
```

### `<InsightItem>` — Sprint 2

Bullet de insight textual com ícone opcional.

```tsx
<InsightItem 
  icon="🎯"
  text="Você passou 24min em Z4 — bom estímulo de FTP."
  variant="positive" // ou "neutral", "alert"
/>
```

### `<PowerCurve>` — Sprint 2

Curva MMP com escala log no X, atual vs histórico.

```tsx
<PowerCurve 
  current={bestPowerThisRide}
  historical={bestPowerAllTime}
  ftp={302}
  prMarkers={['5min', '1min']}
/>
```

### `<FormChart>` — Sprint 3

Gráfico CTL/ATL/TSB últimos 90 dias.

```tsx
<FormChart 
  dailyLoad={daily90}
  highlightToday={true}
/>
```

### `<WorkoutListItem>` — Sprint 1

Linha de treino no histórico.

```tsx
<WorkoutListItem 
  session={session}
  onClick={navigate}
  showPRs={true}
/>
```

### `<QuickStartCard>` — Sprint 3

Card de "refazer último" + "pedalar agora".

### `<FtpBadge>` — Sprint 3

Número de FTP com delta vs 30d.

---

## Charts Stack

### Decisão: uPlot + Visx

**uPlot** para:
- Séries temporais densas (>500 pontos)
- Pós-treino: gráfico unificado Pot+FC+Cad+Gradiente
- Dashboard: CTL/ATL/TSB últimos 90 dias
- History: sparklines

**Visx** para:
- Scatter plots (cross-data analysis)
- Distribuições de barras
- Curva MMP (eixo X log)
- Quaisquer SVG customizados que não sejam time series

### Wrappers

Todos os usos de uPlot e visx devem passar por wrappers em `src/components/charts/` que aplicam **theme do design system** automaticamente. Componentes feature **nunca importam uPlot/visx diretamente**.

```typescript
// src/components/charts/theme.ts
export const chartTheme = {
  background: 'transparent',
  text: { primary: '#FAFAFA', secondary: '#B8B8B8', tertiary: '#6B6B6B' },
  grid: { color: '#2A2A2A', width: 0.5 },
  axis: { color: '#6B6B6B', fontFamily: 'JetBrains Mono', fontSize: 10 },
  series: {
    power:    '#D5FF00',
    hr:       '#FF5A1F',
    cadence:  '#00D4E0',
    gradient: '#6B6B6B',
  },
  zones: POWER_ZONES.map(z => z.color),
};
```

### Performance budgets

- **Render inicial**: <100ms para gráficos de pós-treino
- **Interação** (hover, zoom): <16ms (60fps)
- **Bundle adicional**: <100 KB gzipped (uPlot ~45 + visx tree-shaked)
- **Pontos máximos sem downsample**: 10.000

---

## Acessibilidade

### Mínimos obrigatórios

- **Contraste**: AA mínimo (4.5:1 para texto normal, 3:1 para texto grande)
  - `--fg` (#FAFAFA) sobre `--bg` (#0A0A0A) = 18.6:1 ✅
  - `--fg-2` (#B8B8B8) sobre `--bg` = 9.1:1 ✅
  - `--fg-3` (#6B6B6B) sobre `--bg` = 3.5:1 ⚠️ (apenas labels grandes)
  - `--accent` (#D5FF00) sobre `--bg` = 16.2:1 ✅
- **Touch targets**: mínimo 44×44px em UI interativa principal
- **Focus visible**: usar `outline` ou ring com `--accent`. Nunca remover sem substituir.
- **Reduced motion**: respeitar `prefers-reduced-motion`.
- **Aria labels**: em todo botão sem texto visível (ícone-only).
- **Semantic HTML**: `<button>` para ações, `<a>` para navegação. Não confundir.

### Específicos para dados densos

- Gráficos têm **resumo textual** acessível por screen reader.
- Cores **nunca** são o único canal de informação (sempre texto + cor).
- Tooltips devem ser keyboard-accessible (hover + focus).

---

## Padrões de Estado

### Estados vazios

Toda lista/gráfico tem 3 estados explícitos:
1. **Vazio** — sem dados, com call-to-action ("Pedale para registrar")
2. **Carregando** — skeleton ou spinner, nunca tela em branco
3. **Erro** — mensagem + ação de retry quando aplicável

### Erros de sensor durante ride

Quando um sensor desconecta:
- Banner discreto no topo
- Valor da métrica vira `—` com cor `--fg-3`
- Botão de reconectar opcional

---

## Convenções para Cálculos / Métricas

Cálculos canônicos vivem em `src/lib/metrics/`. Cada métrica tem:
1. Função pura exportada
2. Documentação inline com fórmula
3. Teste unitário com caso conhecido

```typescript
// src/lib/metrics/np.ts

/**
 * Normalized Power (Coggan)
 * 1. Rolling 30s average of power
 * 2. Each value^4
 * 3. Mean of those
 * 4. 4th root
 */
export function normalizedPower(powerSeries: number[]): number {
  if (powerSeries.length < 30) return 0;
  // ... implementação
}
```

Nunca recalcular métrica inline em componente. **Sempre importar de `@/lib/metrics`**.

---

## Manutenção deste documento

- **Quem altera código que afeta DS, altera o DS.** Mesma PR.
- **Revisão mensal** de tokens não-usados para purgar.
- **Adições requerem discussão** antes de virar PR.
- **Este arquivo é canônico.** Conflito entre código e doc → doc vence até decisão consciente.

---

## Próximos passos para alinhamento

- [ ] Criar `src/lib/zones.ts` com `POWER_ZONES` e `getPowerZone()` — extrair do live e summary.
- [ ] Criar `src/lib/metrics/` com NP, TSS, IF, VI, MMP — corrigir TSS atual para usar NP.
- [ ] Criar `src/components/charts/` com wrappers uPlot e visx.
- [ ] Criar `src/components/primitives/` e migrar gradualmente classes em uso.
- [ ] Atualizar schema Supabase com colunas estendidas (ver migration no plano).
