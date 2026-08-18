import { useEffect, useRef, type ReactNode } from "react";

interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer: ReactNode;
}

// Native <dialog> + showModal(), not a dialog library (§32 asks to
// evaluate before adding one) — the browser already provides everything
// a dialog needs for free here: focus trapped inside while open, focus
// returned to the trigger on close, Escape closes it (the native
// `cancel` event, listened for below to keep React state in sync), the
// page behind it inert, and body scroll locked — all standards-based,
// zero dependencies, well-supported in current browsers.
//
// Only mounted while open — simpler than juggling ref-driven
// showModal()/close() calls for a dialog that's sitting inert in the
// DOM most of the time, and showModal() still needs to run in a mount
// effect either way. (A real, unrelated bug did briefly make it look
// like a closed <dialog> broke the page's tab order — it didn't; see
// ProductsPage's scroll-to-heading effect for the actual cause.)
export function FilterDrawer({ isOpen, onClose, title, children, footer }: FilterDrawerProps) {
  if (!isOpen) return null;
  return (
    <FilterDrawerDialog onClose={onClose} title={title} footer={footer}>
      {children}
    </FilterDrawerDialog>
  );
}

function FilterDrawerDialog({
  onClose,
  title,
  children,
  footer,
}: Omit<FilterDrawerProps, "isOpen">) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={onClose}
      aria-labelledby="filter-drawer-title"
      className="fixed inset-x-0 bottom-0 top-auto m-0 flex max-h-[85vh] w-full max-w-none flex-col rounded-t-lg border-t border-border bg-surface p-0 text-text backdrop:bg-black/70"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 id="filter-drawer-title" className="font-display text-lg text-text">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar filtros"
          className="rounded-md p-1 text-text-muted hover:text-primary"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18 18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
      <div className="border-t border-border px-4 py-3">{footer}</div>
    </dialog>
  );
}
