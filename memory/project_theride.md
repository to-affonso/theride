---
name: The Ride — Project Context
description: Cycling simulator app context, stack, and current development state
type: project
---

The Ride é um simulador de ciclismo indoor (como Zwift/Rouvy) conectando dispositivos BLE.

**Stack:** Next.js 16 App Router + TypeScript + Zustand + Supabase + Vercel

**Why:** MVP em HTML/JSX funcionou bem com BLE real; agora migrando para estrutura com DB e auth.

**How to apply:** Toda nova feature deve seguir a estrutura App Router, usar o bleStore (Zustand) para estado BLE, e persistir dados no Supabase.

---

**Pasta do projeto:** `/Users/antonioaffonso/Desktop/WAM/theRide`
**MVP de referência:** `/Users/antonioaffonso/Desktop/WAM/cycleSimulator/app`

**Fase atual:** Setup completo da Fase 0 concluído. Build passando sem erros.

**Próximo passo:** Configurar o Supabase (criar projeto em supabase.com, rodar o schema.sql, preencher o .env.local).

**Arquivos-chave:**
- `src/stores/bleStore.ts` — BLE engine completo em TypeScript/Zustand (parsers FTMS, CSC, HR, CyclingPower)
- `src/proxy.ts` — auth guard (redireciona não-autenticados para /auth/login)
- `src/app/(ride)/layout.tsx` — TopBar compartilhada entre todas as 4 telas
- `supabase/schema.sql` — migration completa com RLS, trigger auto-create athlete, seed de rotas
- `.env.local` — precisa ser preenchido com URL e anon key do Supabase

**Design system:** CSS puro em globals.css (sem Tailwind), variáveis CSS do MVP preservadas. Fontes Inter + JetBrains Mono via Google Fonts. Tema dark #0A0A0A + lime #D5FF00.

**Auth:** Email/senha apenas (sem OAuth). Supabase Auth + @supabase/ssr com cookies.

**BLE suportado:** FTMS (Smart Trainers), Cycling Power Service, CSC (cadência), Heart Rate Service. Apenas Web Bluetooth (Chrome/Edge desktop). ANT+ planejado para o futuro.
