import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";
import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { buildCsp, generateNonce } from "@/lib/security/csp";

/** Metodi HTTP che il portale accetta. Tutto il resto e' rifiutato prima di arrivare all'app. */
const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST", "OPTIONS"]);

const isAdminArea = createRouteMatcher(["/admin", "/admin/(.*)"]);
const isLoginPage = createRouteMatcher(["/admin/login"]);

/**
 * Gestisce i cookie di sessione e protegge l'area /admin: chi non ha una sessione valida viene
 * mandato al login. Questo e' solo il primo filtro (comodita'): la protezione vera dei dati e' in
 * `requireAdmin`, dentro ogni funzione Convex, e non dipende da questa guardia.
 */
const authMiddleware = convexAuthNextjsMiddleware(
  async (request, { convexAuth }) => {
    if (!isAdminArea(request)) return;
    const authenticated = await convexAuth.isAuthenticated();
    if (isLoginPage(request)) {
      if (authenticated) return nextjsMiddlewareRedirect(request, "/admin");
      return;
    }
    if (!authenticated) return nextjsMiddlewareRedirect(request, "/admin/login");
  },
  // La sessione del browser dura al massimo 12 ore, come quella lato server.
  { cookieConfig: { maxAge: 12 * 60 * 60 } },
);

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!ALLOWED_METHODS.has(request.method)) {
    return new NextResponse(null, {
      status: 405,
      headers: { Allow: "GET, HEAD, POST, OPTIONS" },
    });
  }

  const nonce = generateNonce();
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === "development",
    convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL,
  });

  // Next.js legge il nonce dall'header CSP della richiesta e lo applica ai propri script.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const forwarded = new NextRequest(request, { headers: requestHeaders });

  const result = await authMiddleware(forwarded, event);
  const response =
    result instanceof Response ? result : NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Tutte le pagine tranne asset statici e ottimizzazione immagini.
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
