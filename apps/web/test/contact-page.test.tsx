import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContactPage } from "../src/pages/ContactPage";
import { renderWithProviders } from "./test-utils";

describe("ContactPage", () => {
  it("shows WhatsApp as pending rather than linking to an invented number", () => {
    renderWithProviders(<ContactPage />);

    const whatsapp = screen.getByTitle(/número de whatsapp a confirmar/i);
    expect(whatsapp.tagName).toBe("SPAN"); // not a real link when unconfigured
    expect(whatsapp).toHaveAttribute("aria-disabled", "true");
  });

  it("shows phone and email as pending rather than inventing values", () => {
    renderWithProviders(<ContactPage />);

    const pending = screen.getAllByText(/a confirmar/i);
    expect(pending.length).toBeGreaterThanOrEqual(2); // phone + email
  });

  it("has an accessible, labeled contact form that discloses it isn't wired to a backend yet", async () => {
    renderWithProviders(<ContactPage />);

    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mensaje/i)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/nombre/i), "Test User");
    await user.type(screen.getByLabelText(/^email$/i), "test@example.com");
    await user.type(screen.getByLabelText(/mensaje/i), "Hola");
    await user.click(screen.getByRole("button", { name: /enviar mensaje/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(/todavía no está conectado/i);
  });
});
