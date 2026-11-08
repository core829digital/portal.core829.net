# Regole UI: omogeneità prima di tutto

Se due cose stanno vicine, devono stare vicine **sempre alla stessa distanza**. Nessun titolo a contatto con ciò che segue, nessun campo incollato a un altro.

## Scala delle distanze (unica)
| Dove | Distanza | Classe |
|---|---|---|
| Tra blocchi di una pagina (indicatori, pannelli, elenchi) | 24 px | `space-y-6` (lo dà `PageIn`) |
| Tra pannelli affiancati / schede in griglia | 16 px | `gap-4` |
| Tra campi di un modulo | 16 px | `grid gap-4` |
| Etichetta ↔ campo ↔ suggerimento | 6 px | `Field` (non riscrivere a mano) |
| Elementi dentro una riga / elenco | 8–12 px | `gap-2` / `gap-3` |

Non usare altri valori (`space-y-5`, `space-y-8`, `gap-5`...) senza un motivo scritto nel codice.

## Componenti obbligatori
- Pagina: `PageHeader` + contenuto dentro `PageIn` (già nei `template.tsx` di admin e portale).
- Moduli: `Field` / `TextField` / `NativeSelect` da `components/admin/Field`.
- Indicatori: `KpiGrid` + `Kpi`; pannelli: `Panel`; caricamenti: `components/ui/page-skeletons`.
- Font: solo lo stack del brand (vedi `npm run check:fonts` nei quattro progetti).

## Controlli automatici
`e2e/ui-audit.spec.ts` misura, nel browser, su tutte le pagine di prova (desktop e telefono):
blocchi con bordo/ombra a distanza < 8 px, titoli a contatto con il contenuto, parole attaccate nei titoli, testo che esce dal proprio riquadro.
Verificato con prova di mutazione: togliendo `space-y-6` da `PageIn` il controllo fallisce.

Ogni nuova pagina va aggiunta all'elenco `PAGES` di quel file.

## Regia delle animazioni (Panoramica e pagine con schede)
Ordine fisso, perché l'occhio possa seguire ogni passaggio: **pagina** (0–450 ms) → **schede** una dopo l'altra (da 250 ms, ogni 110 ms) → **numeri** (partono quando la scheda è già comparsa) → **grafici, barre, anello** (450 ms dopo la loro scheda). Tutto finisce entro 3,5 s.
- Il ritardo delle schede è in `cardDelay()` (`components/dash/Kpi.tsx`) e deve coincidere con `.reveal` in `globals.css`.
- I numeri (`CountUp`) leggono il ritardo dalla scheda che li contiene; non impostarlo a mano.
- `e2e/animation-timeline.spec.ts` misura la sequenza reale nel browser e il conteggio dei numeri.
