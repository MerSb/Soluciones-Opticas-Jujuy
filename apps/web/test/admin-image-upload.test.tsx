import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AdminImageDto, AdminVariantDto } from "@soluciones-opticas/shared";
import { AdminVariantsEditor } from "../src/pages/admin/AdminVariantsEditor";
import { renderWithProviders } from "./test-utils";

// Click-to-number photo upload (docs/IMAGE_PIPELINE.md, "Choosing the
// order"). Fictional data only; Cloudinary is never reached.

const PRODUCT_ID = "product-1";
const VARIANT: AdminVariantDto = {
  id: "variant-1",
  productId: PRODUCT_ID,
  color: "Negro",
  material: "Metal",
  label: null,
  sku: "SKU-1",
  stock: 5,
  priceOverride: null,
  images: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const EXISTING_IMAGE: AdminImageDto = {
  id: "image-0",
  variantId: VARIANT.id,
  cloudinaryPublicId: "soluciones-opticas/test/existing",
  alt: "Foto existente",
  sortOrder: 0,
  isPrimary: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const jpg = (name: string, sizeBytes = 1000) =>
  new File([new Uint8Array(sizeBytes)], name, { type: "image/jpeg", lastModified: 1 });

interface Backend {
  /** File names in the order Cloudinary stored them. */
  cloudinary: string[];
  /** Every registration the API saved, in order (with the file it points to). */
  registered: { file: string; alt: string; isPrimary: boolean }[];
  /** Bodies of every PUT …/images/order. */
  reorders: string[][];
  /** Files stored in Cloudinary that no saved photo points to. */
  orphans: string[];
  signatures: number;
  maxParallelUploads: number;
}

/**
 * Sign → Cloudinary → register, like the real API: the signature fixes the
 * public_id, Cloudinary stores the file under it, and a registered photo
 * goes last. `slow` delays a file's Cloudinary upload (ms) so uploads
 * finish out of order. Fault injection, each once per file:
 * `failOnce` — Cloudinary rejects the file; `loseCloudinaryAnswer` — the
 * file is stored but the browser never gets the answer; `loseRegisterAnswer`
 * — the API saves the photo but the browser never gets the answer.
 * `failCheck` makes the product read used before a retry fail.
 */
function stubBackend({
  existing = [] as AdminImageDto[],
  slow = {} as Record<string, number>,
  failOnce = [] as string[],
  loseCloudinaryAnswer = [] as string[],
  loseRegisterAnswer = [] as string[],
  failCheck = false,
  networkDown = false,
} = {}) {
  const backend: Backend = {
    cloudinary: [],
    registered: [],
    reorders: [],
    orphans: [],
    signatures: 0,
    maxParallelUploads: 0,
  };
  let images = [...existing];
  let inFlight = 0;
  const stored = new Map<string, string>(); // public_id → file name
  const failing = new Set(failOnce);
  const losingCloudinary = new Set(loseCloudinaryAnswer);
  const losingRegister = new Set(loseRegisterAnswer);
  const json = (status: number, body: unknown) =>
    Promise.resolve({ ok: status < 400, status, json: async () => body });

  const fetchMock = vi.fn(async (raw: string | URL, init?: RequestInit) => {
    const url = String(raw);
    const method = init?.method ?? "GET";
    if (url.includes("/images/sign-upload")) {
      backend.signatures += 1;
      return json(200, {
        cloudName: "demo",
        apiKey: "key",
        timestamp: 1,
        signature: "sig",
        publicId: `pub/s${backend.signatures}`,
        allowedFormats: "jpg,jpeg,png,webp",
        maxFileSizeBytes: 8 * 1024 * 1024,
      });
    }
    if (url.startsWith("https://api.cloudinary.com/")) {
      const form = init!.body as FormData;
      const file = form.get("file") as File;
      const publicId = form.get("public_id") as string;
      inFlight += 1;
      backend.maxParallelUploads = Math.max(backend.maxParallelUploads, inFlight);
      await new Promise((resolve) => setTimeout(resolve, slow[file.name] ?? 0));
      inFlight -= 1;
      if (networkDown) throw new TypeError("Failed to fetch");
      if (failing.delete(file.name)) {
        return json(400, { error: { message: "Invalid image file" } });
      }
      stored.set(publicId, file.name);
      backend.cloudinary.push(file.name);
      if (losingCloudinary.delete(file.name)) throw new TypeError("Failed to fetch");
      return json(200, { public_id: publicId });
    }
    if (url.endsWith(`/variants/${VARIANT.id}/images`) && method === "POST") {
      const body = JSON.parse(init!.body as string);
      const file = stored.get(body.cloudinaryPublicId)!;
      backend.registered.push({ file, alt: body.alt, isPrimary: body.isPrimary });
      const image: AdminImageDto = {
        id: `img-${file}`,
        variantId: VARIANT.id,
        cloudinaryPublicId: body.cloudinaryPublicId,
        alt: body.alt,
        sortOrder: images.length,
        isPrimary: body.isPrimary || images.length === 0,
        createdAt: "2026-01-01T00:00:00.000Z",
      };
      images = image.isPrimary
        ? [image, ...images.map((i) => ({ ...i, isPrimary: false }))]
        : [...images, image];
      if (losingRegister.delete(file)) throw new TypeError("Failed to fetch");
      return json(201, image);
    }
    if (url.endsWith(`/api/admin/products/${PRODUCT_ID}`) && method === "GET") {
      if (failCheck) throw new TypeError("Failed to fetch");
      return json(200, { id: PRODUCT_ID, variants: [{ ...VARIANT, images }] });
    }
    if (url.endsWith("/images/order") && method === "PUT") {
      const { imageIds } = JSON.parse(init!.body as string) as { imageIds: string[] };
      backend.reorders.push(imageIds);
      images = imageIds.map((id) => images.find((i) => i.id === id)!);
      return json(200, images);
    }
    return Promise.reject(new Error(`Unhandled request: ${method} ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);
  const saved = () => new Set(images.map((image) => image.cloudinaryPublicId));
  const orphans = () => [...stored].filter(([id]) => !saved().has(id)).map(([, file]) => file);
  return { backend, fetchMock, orphans, images: () => images };
}

function renderEditor(variant: AdminVariantDto = VARIANT) {
  return renderWithProviders(
    <AdminVariantsEditor productId={PRODUCT_ID} productName="Modelo QA" variants={[variant]} />,
  );
}

// userEvent.upload() drops files that don't match `accept`, which would
// hide the app's own validation; setting `files` directly doesn't.
function chooseFiles(files: File[]) {
  const input = screen.getByLabelText(/^(Elegir fotos|Agregar más fotos)$/);
  Object.defineProperty(input, "files", { value: files, configurable: true });
  fireEvent.change(input);
}

const thumb = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}:`) });
const finalOrder = () =>
  within(screen.getByRole("list", { name: "Orden final" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent);

beforeEach(() => {
  let n = 0;
  // jsdom has no object URLs; keep the real URL constructor (api-client uses it).
  URL.createObjectURL = vi.fn(() => `blob:preview-${(n += 1)}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Admin photo upload — choose the order by clicking", () => {
  it("offers a multi-file picker whose visible button is the real input's label", async () => {
    renderEditor();
    const input = screen.getByLabelText("Elegir fotos");
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("multiple");
    expect(input).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
    expect(input).toHaveAccessibleDescription(/todas las de la carpeta.*hasta 8 MB/);

    const onPickerClick = vi.fn();
    input.addEventListener("click", onPickerClick);
    await userEvent.click(screen.getByText("Elegir fotos"));
    expect(onPickerClick).toHaveBeenCalledTimes(1);
  });

  it("is reachable with the keyboard", async () => {
    renderEditor();
    const input = screen.getByLabelText("Elegir fotos");
    for (let i = 0; i < 20 && document.activeElement !== input; i += 1) await userEvent.tab();
    expect(input).toHaveFocus();
  });

  it("numbers photos in click order, not in the order the picker returned them", async () => {
    const user = userEvent.setup();
    renderEditor();
    chooseFiles([jpg("a.jpg"), jpg("b.jpg"), jpg("c.jpg"), jpg("d.jpg")]);

    expect(screen.getByText(/Tocá las fotos en el orden en que se van a mostrar/)).toBeVisible();
    expect(thumb("a.jpg")).toHaveAttribute("aria-pressed", "false");

    await user.click(thumb("c.jpg"));
    await user.click(thumb("a.jpg"));
    await user.click(thumb("d.jpg"));

    expect(thumb("c.jpg")).toHaveAccessibleName("c.jpg: elegida, número 1, principal");
    expect(thumb("a.jpg")).toHaveAccessibleName("a.jpg: elegida, número 2");
    expect(thumb("d.jpg")).toHaveAccessibleName("d.jpg: elegida, número 3");
    expect(thumb("b.jpg")).toHaveAccessibleName("b.jpg: sin elegir");
    expect(within(thumb("c.jpg")).getByText("Principal")).toBeInTheDocument();
    expect(finalOrder()).toEqual(["1Principalc.jpg", "2a.jpg", "3d.jpg"]);
    expect(screen.getByText(/3 de 4 elegidas · las no elegidas no se suben/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Subir 3 fotos en este orden" })).toBeEnabled();
  });

  it("clicking a numbered photo again takes it out and renumbers the rest", async () => {
    const user = userEvent.setup();
    renderEditor();
    chooseFiles([jpg("a.jpg"), jpg("b.jpg"), jpg("c.jpg")]);
    await user.click(thumb("a.jpg"));
    await user.click(thumb("b.jpg"));
    await user.click(thumb("c.jpg"));

    await user.click(thumb("a.jpg"));

    expect(thumb("a.jpg")).toHaveAttribute("aria-pressed", "false");
    expect(thumb("b.jpg")).toHaveAccessibleName("b.jpg: elegida, número 1, principal");
    expect(thumb("c.jpg")).toHaveAccessibleName("c.jpg: elegida, número 2");
    expect(finalOrder()).toEqual(["1Principalb.jpg", "2c.jpg"]);

    // Clicked again, it goes to the end.
    await user.click(thumb("a.jpg"));
    expect(finalOrder()).toEqual(["1Principalb.jpg", "2c.jpg", "3a.jpg"]);

    await user.click(screen.getByRole("button", { name: "Desmarcar todas" }));
    expect(screen.queryByRole("list", { name: "Orden final" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Subir/ })).toBeNull();
  });

  it("rejects invalid files and repeated ones before any network call, keeping the valid ones", async () => {
    const { fetchMock } = stubBackend();
    renderEditor();
    chooseFiles([
      jpg("ok.jpg"),
      new File(["x"], "doc.pdf", { type: "application/pdf" }),
      jpg("huge.jpg", 9 * 1024 * 1024),
    ]);
    expect(screen.getByRole("alert")).toHaveTextContent(
      /«doc.pdf»: .*formato de imagen no admitido/i,
    );
    expect(thumb("ok.jpg")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^huge.jpg:/ })).toBeNull();

    chooseFiles([jpg("ok.jpg"), jpg("otra.jpg")]);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Una foto ya estaba en la lista: no se repite.",
    );
    expect(screen.getAllByRole("button", { name: /^ok.jpg:/ })).toHaveLength(1);
    expect(thumb("otra.jpg")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves exactly the clicked sequence even when the uploads finish in another order", async () => {
    const user = userEvent.setup();
    // The first photo is the slowest to reach Cloudinary, the last the fastest.
    const { backend } = stubBackend({ slow: { "c.jpg": 60, "a.jpg": 30, "e.jpg": 0 } });
    renderEditor();
    chooseFiles(["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg"].map((name) => jpg(name)));
    for (const name of ["c.jpg", "a.jpg", "e.jpg", "b.jpg", "d.jpg"]) await user.click(thumb(name));

    await user.click(screen.getByRole("button", { name: "Subir 5 fotos en este orden" }));

    expect(await screen.findByText("Se subieron 5 fotos en el orden elegido.")).toBeInTheDocument();
    expect(backend.cloudinary[0]).not.toBe("c.jpg"); // it really did finish later
    expect(backend.maxParallelUploads).toBeLessThanOrEqual(3);
    expect(backend.registered).toEqual([
      { file: "c.jpg", alt: "Modelo QA — Negro — foto 1", isPrimary: true },
      { file: "a.jpg", alt: "Modelo QA — Negro — foto 2", isPrimary: false },
      { file: "e.jpg", alt: "Modelo QA — Negro — foto 3", isPrimary: false },
      { file: "b.jpg", alt: "Modelo QA — Negro — foto 4", isPrimary: false },
      { file: "d.jpg", alt: "Modelo QA — Negro — foto 5", isPrimary: false },
    ]);
    expect(backend.reorders).toEqual([]); // nothing to fix
    // The grid is emptied for the next batch.
    expect(screen.queryByRole("list", { name: "Fotos para elegir" })).toBeNull();
  });

  it("only uploads the numbered photos", async () => {
    const user = userEvent.setup();
    const { backend } = stubBackend();
    renderEditor();
    chooseFiles([jpg("a.jpg"), jpg("b.jpg"), jpg("c.jpg")]);
    await user.click(thumb("b.jpg"));
    await user.click(screen.getByRole("button", { name: "Subir 1 foto" }));
    await screen.findByText("Se subió 1 foto.");
    expect(backend.cloudinary).toEqual(["b.jpg"]);
    // The unchosen ones are cleared with the batch.
    expect(screen.queryByRole("list", { name: "Fotos para elegir" })).toBeNull();
  });

  it("on a variant that already has photos: appends after them and never replaces the primary", async () => {
    const user = userEvent.setup();
    const { backend } = stubBackend({ existing: [EXISTING_IMAGE] });
    renderEditor({ ...VARIANT, images: [EXISTING_IMAGE] });
    chooseFiles([jpg("a.jpg"), jpg("b.jpg")]);

    expect(
      screen.getByText(/Se agregan después de la foto actual; la principal no cambia/),
    ).toBeInTheDocument();
    await user.click(thumb("b.jpg"));
    await user.click(thumb("a.jpg"));
    expect(thumb("b.jpg")).toHaveAccessibleName("b.jpg: elegida, número 1");
    expect(within(thumb("b.jpg")).queryByText("Principal")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Subir 2 fotos en este orden" }));
    await screen.findByText("Se subieron 2 fotos en el orden elegido.");
    expect(backend.registered).toEqual([
      { file: "b.jpg", alt: "Modelo QA — Negro — foto 2", isPrimary: false },
      { file: "a.jpg", alt: "Modelo QA — Negro — foto 3", isPrimary: false },
    ]);
  });

  it("a failed photo: the others are saved in order, and the retry puts it back in its number", async () => {
    const user = userEvent.setup();
    const { backend } = stubBackend({ existing: [EXISTING_IMAGE], failOnce: ["b.jpg"] });
    renderEditor({ ...VARIANT, images: [EXISTING_IMAGE] });
    chooseFiles([jpg("a.jpg"), jpg("b.jpg"), jpg("c.jpg")]);
    for (const name of ["a.jpg", "b.jpg", "c.jpg"]) await user.click(thumb(name));
    await user.click(screen.getByRole("button", { name: "Subir 3 fotos en este orden" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "No se pudo subir una foto (las demás quedaron guardadas en orden)",
    );
    expect(alert).toHaveTextContent("Foto 2 · b.jpg: no se pudo subir");
    expect(alert).not.toHaveTextContent(/invalid image file/i);
    expect(thumb("a.jpg")).toHaveAccessibleName("a.jpg: elegida, número 1, subida");
    expect(thumb("b.jpg")).toHaveAccessibleName("b.jpg: elegida, número 2, falló");
    // The sequence is fixed now: clicking does nothing.
    expect(thumb("a.jpg")).toBeDisabled();
    expect(backend.registered.map((r) => r.file)).toEqual(["a.jpg", "c.jpg"]);

    await user.click(within(alert).getByRole("button", { name: "Reintentar la que falló" }));

    expect(await screen.findByText("Se subieron 3 fotos en el orden elegido.")).toBeInTheDocument();
    expect(backend.registered.at(-1)).toEqual({
      file: "b.jpg",
      alt: "Modelo QA — Negro — foto 3",
      isPrimary: false,
    });
    // b was appended after c; the order is put back, the existing primary first.
    expect(backend.reorders).toEqual([["image-0", "img-a.jpg", "img-b.jpg", "img-c.jpg"]]);
  });

  it("the first photo of an empty variant fails: the retry still makes it the primary", async () => {
    const user = userEvent.setup();
    const { backend } = stubBackend({ failOnce: ["a.jpg"] });
    renderEditor();
    chooseFiles([jpg("a.jpg"), jpg("b.jpg")]);
    await user.click(thumb("a.jpg"));
    await user.click(thumb("b.jpg"));
    await user.click(screen.getByRole("button", { name: "Subir 2 fotos en este orden" }));
    await user.click(await screen.findByRole("button", { name: "Reintentar la que falló" }));

    await screen.findByText("Se subieron 2 fotos en el orden elegido.");
    expect(backend.registered.at(-1)).toMatchObject({
      file: "a.jpg",
      isPrimary: true,
    });
    // Registered as primary it is already first: no reorder needed.
    expect(backend.reorders).toEqual([]);
  });

  it("'No subirlas' keeps what was saved and clears the list", async () => {
    const user = userEvent.setup();
    const { backend } = stubBackend({ failOnce: ["b.jpg"] });
    renderEditor();
    chooseFiles([jpg("a.jpg"), jpg("b.jpg")]);
    await user.click(thumb("a.jpg"));
    await user.click(thumb("b.jpg"));
    await user.click(screen.getByRole("button", { name: "Subir 2 fotos en este orden" }));
    await user.click(await screen.findByRole("button", { name: "No subirlas" }));

    expect(screen.getByText("Quedaron 1 foto en el orden elegido.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Fotos para elegir" })).toBeNull();
    expect(backend.registered).toHaveLength(1);
  });

  it("explains a connection problem", async () => {
    const user = userEvent.setup();
    stubBackend({ networkDown: true });
    renderEditor();
    chooseFiles([jpg("a.jpg")]);
    await user.click(thumb("a.jpg"));
    await user.click(screen.getByRole("button", { name: "Subir 1 foto" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Foto 1 · a.jpg: sin conexión");
  });

  it("a double click uploads the batch once", async () => {
    const user = userEvent.setup();
    const { fetchMock } = stubBackend({ slow: { "a.jpg": 20 } });
    renderEditor();
    chooseFiles([jpg("a.jpg"), jpg("b.jpg")]);
    await user.click(thumb("a.jpg"));
    await user.click(thumb("b.jpg"));
    await user.dblClick(screen.getByRole("button", { name: "Subir 2 fotos en este orden" }));

    await screen.findByText("Se subieron 2 fotos en el orden elegido.");
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]).includes("sign-upload")),
    ).toHaveLength(2);
  });

  it("shows progress and locks the grid while uploading", async () => {
    const user = userEvent.setup();
    stubBackend({ slow: { "a.jpg": 30 } });
    renderEditor();
    chooseFiles([jpg("a.jpg")]);
    await user.click(thumb("a.jpg"));
    await user.click(screen.getByRole("button", { name: "Subir 1 foto" }));

    expect(screen.getByRole("status", { name: "Estado de la carga" })).toHaveTextContent(
      "Subiendo 0 de 1…",
    );
    expect(thumb("a.jpg")).toBeDisabled();
    expect(screen.getByLabelText("Agregar más fotos")).toBeDisabled();
    await waitFor(() => expect(screen.getByText("Se subió 1 foto.")).toBeInTheDocument());
  });

  it("accepts several dropped photos", () => {
    renderEditor();
    const zone = screen.getByText("Elegir fotos").closest("label")!;
    fireEvent.drop(zone, { dataTransfer: { files: [jpg("x.jpg"), jpg("y.png")] } });
    expect(thumb("x.jpg")).toBeInTheDocument();
    expect(thumb("y.png")).toBeInTheDocument();
  });
  describe("retrying never duplicates a photo that was in fact saved", () => {
    async function uploadThree(user: ReturnType<typeof userEvent.setup>) {
      chooseFiles([jpg("a.jpg"), jpg("b.jpg"), jpg("c.jpg")]);
      for (const name of ["a.jpg", "b.jpg", "c.jpg"]) await user.click(thumb(name));
      await user.click(screen.getByRole("button", { name: "Subir 3 fotos en este orden" }));
    }

    it("the API saved it but its answer was lost: the retry finds it and uploads nothing", async () => {
      const user = userEvent.setup();
      const { backend, orphans } = stubBackend({ loseRegisterAnswer: ["b.jpg"] });
      renderEditor();
      await uploadThree(user);

      expect(await screen.findByRole("alert")).toHaveTextContent("Foto 2 · b.jpg: sin conexión");
      await user.click(screen.getByRole("button", { name: "Reintentar la que falló" }));

      expect(
        await screen.findByText("Se subieron 3 fotos en el orden elegido."),
      ).toBeInTheDocument();
      expect(backend.registered.map((r) => r.file)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
      expect(backend.signatures).toBe(3); // nothing signed or uploaded again
      expect(backend.reorders).toEqual([]); // b was saved in its place
      expect(orphans()).toEqual([]);
    });

    it("Cloudinary stored it but its answer was lost: uploaded again, saved once (the first file is left unused)", async () => {
      const user = userEvent.setup();
      const { backend, orphans } = stubBackend({ loseCloudinaryAnswer: ["b.jpg"] });
      renderEditor();
      await uploadThree(user);

      await user.click(await screen.findByRole("button", { name: "Reintentar la que falló" }));

      expect(
        await screen.findByText("Se subieron 3 fotos en el orden elegido."),
      ).toBeInTheDocument();
      expect(backend.registered.map((r) => r.file)).toEqual(["a.jpg", "c.jpg", "b.jpg"]);
      expect(backend.reorders).toEqual([["img-a.jpg", "img-b.jpg", "img-c.jpg"]]);
      // Not a duplicate photo, but a file nobody points to (documented limit).
      expect(orphans()).toEqual(["b.jpg"]);
    });

    it("if the check itself fails, nothing is uploaded again", async () => {
      const user = userEvent.setup();
      const { backend } = stubBackend({ loseRegisterAnswer: ["b.jpg"], failCheck: true });
      renderEditor();
      await uploadThree(user);

      await user.click(await screen.findByRole("button", { name: "Reintentar la que falló" }));

      expect(
        await screen.findByText(/No pudimos comprobar qué fotos ya quedaron guardadas/),
      ).toBeInTheDocument();
      expect(backend.signatures).toBe(3);
      expect(backend.registered).toHaveLength(3);
      expect(screen.getByRole("button", { name: "Reintentar la que falló" })).toBeEnabled();
    });

    it("Cloudinary rejected it: the API is checked first, then it is uploaded again", async () => {
      const user = userEvent.setup();
      const { backend, fetchMock } = stubBackend({ failOnce: ["b.jpg"] });
      renderEditor();
      await uploadThree(user);
      await user.click(await screen.findByRole("button", { name: "Reintentar la que falló" }));
      await screen.findByText("Se subieron 3 fotos en el orden elegido.");
      expect(backend.registered.map((r) => r.file)).toEqual(["a.jpg", "c.jpg", "b.jpg"]);
      expect(backend.signatures).toBe(4);
      // One read to check before uploading, one to put b back in its place.
      const reads = fetchMock.mock.calls.filter(
        ([url, init]) => String(url).endsWith(`/products/${PRODUCT_ID}`) && init?.method !== "POST",
      );
      expect(reads).toHaveLength(2);
      expect(backend.reorders).toEqual([["img-a.jpg", "img-b.jpg", "img-c.jpg"]]);
    });
  });
});
