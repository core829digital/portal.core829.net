export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold tracking-widest text-muted-foreground">CORE829</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Portale clienti</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          Per accedere apri il link personale che ti abbiamo inviato via email o WhatsApp. Non
          serve nessun account né nessuna password.
        </p>
        <p className="mt-6 text-sm text-muted-foreground">
          Non trovi il link? Scrivici e te ne invieremo uno nuovo.
        </p>
      </div>
    </main>
  );
}
