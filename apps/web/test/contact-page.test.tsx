import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContactPage } from "../src/pages/ContactPage";
import { renderWithProviders } from "./test-utils";

describe("ContactPage", () => {
  it("renders a real WhatsApp link using the confirmed number", () => {
    renderWithProviders(<ContactPage />);

    const whatsapp = screen.getByRole("link", { name: /escribinos/i });
    expect(whatsapp).toHaveAttribute("href", expect.stringContaining("wa.me/5493884844442"));
  });

  it("renders the confirmed phone number as a tel: link and email as still pending", () => {
    renderWithProviders(<ContactPage />);

    const phone = screen.getByRole("link", { name: "0388 484-4442" });
    expect(phone).toHaveAttribute("href", "tel:03884844442");

    expect(screen.getByText(/a confirmar/i)).toBeInTheDocument(); // email only, now
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
