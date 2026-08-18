import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, useTheme } from "../src/app/theme";
import { ThemeSwitcher } from "../src/components/layout/ThemeSwitcher";

function stubMatchMedia(prefersDark: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("prefers-color-scheme: dark") ? prefersDark : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })),
  );
}

function ThemeProbe() {
  const { preference, resolvedTheme } = useTheme();
  return (
    <p data-testid="probe">
      {preference}:{resolvedTheme}
    </p>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  stubMatchMedia(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
});

describe("ThemeProvider / useTheme", () => {
  it("defaults to system preference and resolves it from prefers-color-scheme", () => {
    stubMatchMedia(true); // OS is dark
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("probe")).toHaveTextContent("system:dark");
    // "system" writes no explicit attribute — CSS's own
    // prefers-color-scheme handles it, per ADR-0017.
    expect(document.documentElement).not.toHaveAttribute("data-theme");
  });

  it("persists an explicit choice to localStorage and stamps data-theme", async () => {
    render(
      <ThemeProvider>
        <ThemeSwitcher />
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Tema oscuro" }));

    expect(localStorage.getItem("sopt-theme")).toBe("dark");
    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "dark"));
  });

  it("reads a previously-stored explicit preference on mount", () => {
    localStorage.setItem("sopt-theme", "light");

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("probe")).toHaveTextContent("light:light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });

  it("falls back to system if localStorage holds an unrecognized value", () => {
    localStorage.setItem("sopt-theme", "solarized");

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("probe")).toHaveTextContent("system:light");
  });
});

describe("ThemeSwitcher", () => {
  it("is keyboard- and screen-reader-accessible: a labeled group of pressed-state buttons", () => {
    render(
      <ThemeProvider>
        <ThemeSwitcher />
      </ThemeProvider>,
    );

    const group = screen.getByRole("group", { name: "Preferencia de tema" });
    expect(group).toBeInTheDocument();

    const light = screen.getByRole("button", { name: "Tema claro" });
    const system = screen.getByRole("button", { name: "Tema del sistema" });
    const dark = screen.getByRole("button", { name: "Tema oscuro" });

    // Default is "system" — reflected via aria-pressed, not just visually.
    expect(system).toHaveAttribute("aria-pressed", "true");
    expect(light).toHaveAttribute("aria-pressed", "false");
    expect(dark).toHaveAttribute("aria-pressed", "false");
  });

  it("switches the active option on click, updating aria-pressed", async () => {
    render(
      <ThemeProvider>
        <ThemeSwitcher />
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Tema claro" }));

    expect(screen.getByRole("button", { name: "Tema claro" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Tema del sistema" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
