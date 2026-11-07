/**
 * Invio email tramite l'API HTTP di Resend, con `fetch` (nessuna libreria: meno dipendenze e
 * funziona nel runtime standard di Convex). La chiave API arriva dal chiamante e non viene mai
 * scritta nei log.
 */

export type EmailMessage = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Invia un'email. Lancia un errore GENERICO se l'invio fallisce: i dettagli (che potrebbero
 * contenere indirizzi o frammenti della risposta) non devono finire nei log o arrivare al browser.
 */
export async function sendEmail(apiKey: string, message: EmailMessage): Promise<void> {
  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: message.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
  } catch {
    throw new Error("Invio dell'email non riuscito.");
  }
  if (!response.ok) throw new Error(`Invio dell'email non riuscito (${response.status}).`);
}
