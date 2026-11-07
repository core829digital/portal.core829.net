# Collegamento b2b.core829.net → portale

Quando un agente di vendita chiude una trattativa su **b2b.core829.net**, il B2B la passa al portale con una richiesta **firmata**.
Il portale crea il cliente (stato *In avvio*), avvisa gli amministratori via email con il link per creare il contratto, e da lì
si gestisce tutto (contratto dai modelli, fatture, abbonamenti, documenti).

## Configurazione (una volta)

1. Genera un segreto: `openssl rand -base64 32` e anteponi `whsec_` (es. `whsec_AbC...=`).
2. Nel deployment Convex di produzione imposta `B2B_WEBHOOK_SECRET` con quel valore (e lo stesso, in segreto, nel B2B).
3. Indirizzo da chiamare: `https://<deployment>.convex.site/integrations/b2b/deals` (lo stesso dominio dei download).

## Richiesta (POST, JSON)

```json
{
  "dealId": "D-2026-014",
  "client": { "displayName": "Caffè Rosso Srl", "contactName": "Mario Rossi", "email": "mario@caffe.it",
              "phone": "+39 333 1112223", "vatId": "IT01234567890",
              "address": "Via Roma 1, 52048 Monte San Savino (AR)", "pec": "caffe@pec.it", "legalRep": "Mario Rossi, amministratore",
              "website": "caffe.it", "packageType": "standard|advanced|custom" },
  "notes": "Testo libero per l'amministratore",
  "salesAgent": "Giulia"
}
```

Intestazioni (standard *Standard Webhooks*): `webhook-id` (unico per messaggio), `webhook-timestamp` (secondi, entro 5 minuti) e
`webhook-signature` = `v1,` + base64(HMAC-SHA256(`<id>.<timestamp>.<corpo esatto>`, chiave = base64 decodificato del segreto senza `whsec_`)).

Esempio (Node, lato B2B):

```js
import { createHmac, randomUUID } from "node:crypto";
const secret = process.env.B2B_WEBHOOK_SECRET; // whsec_...
const body = JSON.stringify(deal);
const id = `deal_${randomUUID()}`;
const ts = Math.floor(Date.now() / 1000);
const sig = createHmac("sha256", Buffer.from(secret.replace(/^whsec_/, ""), "base64")).update(`${id}.${ts}.${body}`).digest("base64");
await fetch(URL, { method: "POST", headers: { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": `v1,${sig}` }, body });
```

## Risposte

`200 {ok:true,status:"created"|"exists"|"duplicate"}` · `400` dati non validi · `401` firma non valida · `413` corpo troppo grande ·
`503` segreto non configurato. Ogni messaggio ha un `webhook-id` e si elabora una sola volta (si può ritentare senza duplicati).
Se esiste già un cliente con quell'email non si modifica: si usa quello e si avvisa comunque l'amministratore.
