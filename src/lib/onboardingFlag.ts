/**
 * Scheda introduttiva: chi l'ha gia' chiusa non deve vederla comparire e sparire.
 *
 * Il server disegna sempre la scheda; uno script minuscolo, eseguito PRIMA che il browser disegni la
 * pagina, mette un attributo su <html> se nel browser c'e' gia' il segno "letto", e uno stile la nasconde.
 * Cosi' non c'e' ne' lampeggio ne' salto del contenuto (CLS). Lo script e' una costante scritta qui:
 * nessun dato esterno entra mai al suo interno.
 */
export const ONBOARDING_FLAG_KEY = "portal-onboarding-v1";
export const ONBOARDING_SEEN_ATTRIBUTE = "data-onboarding-seen";

export const ONBOARDING_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(ONBOARDING_FLAG_KEY)})==="1")document.documentElement.setAttribute(${JSON.stringify(ONBOARDING_SEEN_ATTRIBUTE)},"")}catch(e){}`;
