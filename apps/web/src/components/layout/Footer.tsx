export function Footer() {
  return (
    <footer className="border-t border-border bg-surface-muted">
      <div className="mx-auto max-w-7xl px-4 py-8 text-sm text-text-muted sm:px-6 lg:px-8">
        <p>© {new Date().getFullYear()} Soluciones Ópticas. Todos los derechos reservados.</p>
      </div>
    </footer>
  );
}
