# portal.core829.net

Portale clienti di CORE829 SRL: ogni cliente apre un link personale e vede stato dei progetti,
contratti, fatture, abbonamenti e importi da pagare, in sola lettura.

## Stack
Next.js (App Router) · Convex · Tailwind CSS · shadcn/ui · TypeScript strict · Zod

## Comandi
| Comando | Cosa fa |
|---|---|
| `npm run dev` | Avvia il server locale |
| `npm run lint` | Controllo stile e qualita' |
| `npm run typecheck` | Controllo dei tipi |
| `npm run build` | Build di produzione |
| `npm run check` | Lint + typecheck + build |

## Prima configurazione
Vedi [`docs/SETUP.md`](docs/SETUP.md) per login amministratore, Resend e variabili. Per la messa online, i backup e l'uso quotidiano: [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Variabili d'ambiente
Vedi `.env.example`. Non committare mai segreti.

## Stato
Fase 0 (fondamenta) in corso. Le fasi successive sono: sicurezza, modello dati, area admin,
portale cliente, widget-as-a-page, upload sicuri, webhook, performance, revisione e deploy.
