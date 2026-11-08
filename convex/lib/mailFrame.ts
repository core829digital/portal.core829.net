import { COMPANY } from "./autofill";
import { escapeHtml } from "./text";

/**
 * Cornice grafica delle email del portale (stesso stile di tutte le comunicazioni CORE829).
 * Il testo libero arriva sempre COME TESTO: qui viene escapato, mai interpretato come HTML.
 */

/** Indirizzo ufficiale pubblicato nel footer di core829.net: e' l'unico a cui i clienti devono rispondere. */
export const OFFICIAL_EMAIL = "hello@core829.net";
export const DEFAULT_CLIENTS_FROM = "CORE829 <clients@core829.net>";

export const REPLY_NOTE = `Questa email è stata inviata da un indirizzo di sola uscita (clients@core829.net) che non viene letto. Per rispondere scrivi a ${OFFICIAL_EMAIL}, l'indirizzo ufficiale di CORE829 che trovi anche nel footer di core829.net.`;

const FONT = "Inter,Arial,Helvetica,sans-serif";

export function brandedEmail(opts: { heading?: string; bodyText: string; cta?: { label: string; url: string }; note?: string }): { html: string; text: string } {
  const paragraphs = opts.bodyText
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:24px;color:#111217;white-space:pre-wrap">${escapeHtml(p.trim())}</p>`)
    .join("");
  const cta = opts.cta ? `<p style="margin:20px 0"><a href="${escapeHtml(opts.cta.url)}" style="display:inline-block;background:#e52139;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:999px">${escapeHtml(opts.cta.label)}</a></p>` : "";
  const note = opts.note ? `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #dfe5eb;font-size:12.5px;line-height:19px;color:#4a5160">${escapeHtml(opts.note)}</p>` : "";
  const html =
    `<div style="font-family:${FONT};max-width:580px;margin:0 auto;padding:28px 24px;color:#111217">` +
    `<p style="margin:0 0 20px;font-size:13px;letter-spacing:3px;color:#b8132a;font-weight:700">CORE829</p>` +
    (opts.heading ? `<h1 style="margin:0 0 16px;font-size:20px;line-height:28px;font-weight:600;color:#111217">${escapeHtml(opts.heading)}</h1>` : "") +
    paragraphs +
    cta +
    note +
    `<p style="margin:20px 0 0;font-size:12px;line-height:18px;color:#4a5160">${escapeHtml(COMPANY.name)} · ${escapeHtml(COMPANY.address)} · CUI/CIF ${escapeHtml(COMPANY.cui)}<br/>${escapeHtml(OFFICIAL_EMAIL)} · ${escapeHtml(COMPANY.phoneIt)}</p>` +
    `</div>`;
  const text = [opts.heading, opts.bodyText, opts.cta ? `${opts.cta.label}: ${opts.cta.url}` : "", opts.note ?? "", `${COMPANY.name} · ${COMPANY.address} · CUI/CIF ${COMPANY.cui}`].filter(Boolean).join("\n\n");
  return { html, text };
}
