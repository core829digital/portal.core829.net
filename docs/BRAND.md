# Brand CORE829 — palette

| Nome | Valore | Uso |
|---|---|---|
| **Obsidian Black** | `#111217` | Testo, sezioni scure, icone, ombre |
| **Ice Grey** | `#DFE5EB` | Bordi, separatori, superfici secondarie (in versione schiarita `#F2F5F8`) |
| **Racing Red** | `#EF233C` | Accento: grafica, glow, grafici, superfici grandi |

## Regola di accessibilità (importante)
Il Racing Red puro ha contrasto **4,22:1** con il bianco: sotto lo standard AA (4,5:1) per il testo piccolo. Per questo:

| Dove | Colore | Contrasto |
|---|---|---|
| Superfici grandi, grafici, glow, titoli enormi | `#EF233C` | ≥ 3:1 (testo grande) |
| **Pulsanti** con testo bianco | `#E52139` | 4,56:1 |
| **Testo rosso piccolo** su bianco/Ice Grey chiaro | `#D92037` (sito, bookings) · `#B8132A` (portale) | ≥ 4,5:1 |
| Rosso scuro (hover, testo su fondi tenui) | `#B8132A` | ≥ 5:1 |
| Testo secondario | `#4A5160` | ≥ 6:1 |

Le differenze tra `#EF233C` e `#E52139` sono quasi invisibili all'occhio; la regola serve a non scrivere mai testo piccolo con un contrasto insufficiente.

## Dove vive nel codice
- **Portale:** `src/app/globals.css` (`--obsidian`, `--ice-grey`, `--racing-red`, `--primary`…). `src/lib/brandPalette.test.ts` verifica i contrasti sui token veri.
- **Sito core829.net:** `app/globals.css` (`--color-accent`, `--color-racing`, `--rgb-*`); `.text-accent` usa la variante AA.
- **Bookings:** `src/app/globals.css` (`--color-accent`, `--color-accent-text`, `--color-racing`); l'embed può sovrascrivere l'accento.
- **b2b (CRM):** `src/app/globals.css`: le scale `zinc/gray/slate/neutral/red` di Tailwind seguono la palette, quindi ogni classe esistente è già aggiornata.
- **Email:** `convex/lib/mailFrame.ts` (pulsante `#E52139`, testo `#111217`).

## Come cambiare un colore
Cambia il token in `globals.css` (mai un valore sparso nei componenti), poi lancia i test: quello dei contrasti fallisce se la leggibilità peggiora.

## Logo, icone e immagini di condivisione
Si rigenerano tutti insieme con `python3 scripts/brand/generate_assets.py <cartella-con-i-4-repository>` (Pillow + numpy; font Inter e JetBrains Mono).
- **Logo scuro** (`core829-logo.webp`, `829black trsp.webp`): marchio in Obsidian Black `#111217` (prima nero puro). Il logo bianco non cambia.
- **Icone** (favicon, `icon.png`, `apple-icon.png`, icone del manifest): tessera Obsidian con marchio bianco e margini sicuri. Le icone precedenti avevano il marchio **tagliato ai bordi**.
- **Immagini di condivisione** 1200×630: portale e sito su Obsidian con alone Racing Red e griglia Ice Grey; bookings su Racing Red con i due marchi.
- Il marchio non viene ridisegnato: si usa la maschera del logo bianco ufficiale.
- Le piattaforme (WhatsApp, LinkedIn, Facebook) tengono l'anteprima in cache: per vedere subito la nuova usa il loro «debugger» / «aggiorna anteprima».
