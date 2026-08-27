import type { ReactNode } from "react";
import { useTheme, type ThemePreference } from "../../app/theme";

const OPTIONS: { value: ThemePreference; label: string; icon: ReactNode }[] = [
  {
    value: "light",
    label: "Tema claro",
    icon: (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
      >
        <circle cx="12" cy="12" r="4.5" strokeWidth="1.5" />
        <path
          strokeWidth="1.5"
          strokeLinecap="round"
          d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"
        />
      </svg>
    ),
  },
  {
    value: "system",
    label: "Tema del sistema",
    icon: (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
      >
        <rect x="3" y="4.5" width="18" height="12" rx="1.5" strokeWidth="1.5" />
        <path strokeWidth="1.5" strokeLinecap="round" d="M8.5 20h7M12 16.5V20" />
      </svg>
    ),
  },
  {
    value: "dark",
    label: "Tema oscuro",
    icon: (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
      >
        <path
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a7 7 0 0 0 10.7 10.7Z"
        />
      </svg>
    ),
  },
];

// A 3-way toggle-button group, not a native <select> (explicitly ruled
// out) and not a strict role="radiogroup" (which needs manual
// roving-tabindex to be keyboard-correct) — three `aria-pressed`
// buttons in a `role="group"` is simpler to get right and is a
// well-established accessible pattern for a small icon toggle set. Each
// button carries its own accessible name via `aria-label`; the icon
// alone is `aria-hidden`.
export function ThemeSwitcher() {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="group"
      aria-label="Preferencia de tema"
      className="flex items-center gap-0.5 rounded-full border border-border bg-surface-muted p-0.5"
    >
      {OPTIONS.map((option) => {
        const isActive = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            aria-label={option.label}
            title={option.label}
            onClick={() => setPreference(option.value)}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-200 ${
              isActive ? "bg-primary text-surface-muted" : "text-text-muted hover:text-text"
            }`}
          >
            {option.icon}
          </button>
        );
      })}
    </div>
  );
}
