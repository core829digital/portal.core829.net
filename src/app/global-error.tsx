"use client";

// Ultima rete di sicurezza: sostituisce anche il layout principale. Nessun dettaglio tecnico.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="it">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <main style={{ maxWidth: 420, margin: "20vh auto", padding: "0 16px", textAlign: "center" }}>
          <h1 style={{ fontSize: 24 }}>Qualcosa è andato storto</h1>
          <p style={{ color: "#555", lineHeight: 1.6 }}>
            Non siamo riusciti a caricare la pagina. Riprova tra un momento: se il problema
            continua, contattaci.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{ marginTop: 16, padding: "10px 20px", borderRadius: 8, border: 0, background: "#111", color: "#fff", cursor: "pointer" }}
          >
            Riprova
          </button>
        </main>
      </body>
    </html>
  );
}
