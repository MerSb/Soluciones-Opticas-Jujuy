import { useId, useState } from "react";
import type { InputHTMLAttributes } from "react";

interface FormFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  error?: string;
  /** Adds a show/hide toggle — only meaningful together with type="password". */
  toggleVisibility?: boolean;
}

// Shared by Login/Register/Profile — one place wiring aria-invalid/
// aria-describedby correctly (§52: errors must be programmatically
// associated with inputs) rather than three ad hoc copies of it.
export function FormField({
  label,
  error,
  toggleVisibility,
  type,
  className,
  ...inputProps
}: FormFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const [visible, setVisible] = useState(false);
  const resolvedType = toggleVisibility ? (visible ? "text" : "password") : type;

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-text">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={resolvedType}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={`w-full rounded-md border bg-surface-muted px-4 py-2.5 text-text placeholder:text-text-muted focus-visible:border-primary ${
            error ? "border-danger" : "border-border"
          } ${toggleVisibility ? "pr-16" : ""}`}
          {...inputProps}
        />
        {toggleVisibility && (
          <button
            type="button"
            onClick={() => setVisible((prev) => !prev)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-text-muted hover:text-primary"
          >
            {visible ? "Ocultar" : "Mostrar"}
          </button>
        )}
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
