interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

// Simple previous/next + "Página X de Y" — deliberately the same
// pattern at every breakpoint rather than a numbered page-link list on
// desktop. It already satisfies both the desktop and mobile
// requirements (§31) without a second implementation to keep in sync.
export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Paginación de resultados"
      className="mt-10 flex items-center justify-center gap-4"
    >
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label="Página anterior"
        className="rounded-md border border-border px-4 py-2 text-sm text-text hover:border-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        Anterior
      </button>
      <span aria-current="page" className="text-sm text-text-muted">
        Página {page} de {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Página siguiente"
        className="rounded-md border border-border px-4 py-2 text-sm text-text hover:border-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        Siguiente
      </button>
    </nav>
  );
}
