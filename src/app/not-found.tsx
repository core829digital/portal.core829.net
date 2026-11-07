export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <h1 className="text-2xl tracking-tight">Pagina non trovata</h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          Il link che hai aperto non esiste o non è più valido. Contattaci e ti invieremo un
          nuovo link.
        </p>
      </div>
    </main>
  );
}
