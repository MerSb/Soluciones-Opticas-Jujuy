import { CHECKOUT_IVA_CONDITIONS, CONSUMIDOR_FINAL } from "../lib/tax-id";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Container } from "../components/ui/Container";
import { SeoHead } from "../components/ui/SeoHead";
import { StatusMessage } from "../components/ui/StatusMessage";
import { FormField } from "../components/forms/FormField";
import { CartLineDetails } from "../components/cart/CartLineSummary";
import { useCart } from "../lib/cart/cart-store";
import { cartActions } from "../lib/cart/cart-store";
import { formatPrice } from "../lib/format-price";
import { ARGENTINE_PROVINCES } from "../lib/argentina-provinces";
import {
  CHECKOUT_FIELD_ORDER,
  EMPTY_CHECKOUT_FORM,
  buildCheckoutInput,
  validateCheckoutForm,
  type CheckoutFormErrors,
  type CheckoutFormValues,
} from "../lib/checkout-form";
import { presentCheckoutError, type CheckoutErrorPresentation } from "../lib/checkout-errors";
import { saveOrderAccessToken } from "../lib/order-access";
import { useCurrentUserQuery } from "../services/queries/auth";
import { useBranchesQuery } from "../services/queries/branches";
import { useCreateOrderMutation } from "../services/queries/orders";

// Payments V1 — Phase C checkout (docs/PAYMENTS.md). Guest or account —
// never a forced login. Sends only ids, contact data and quantities; the
// API re-prices everything, reserves stock and creates a PENDING_PAYMENT
// order. The cart is emptied only after a 201: any failure keeps both
// the cart and everything typed in the form. No payment UI yet (Phase D).

export function CheckoutPage() {
  const cart = useCart();
  const navigate = useNavigate();
  const { data: user } = useCurrentUserQuery();
  const branches = useBranchesQuery();
  const createOrder = useCreateOrderMutation();

  const [values, setValues] = useState<CheckoutFormValues>(EMPTY_CHECKOUT_FORM);
  const [errors, setErrors] = useState<CheckoutFormErrors>({});
  const [submitError, setSubmitError] = useState<CheckoutErrorPresentation | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const submitting = useRef(false);
  const completed = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const prefilled = useRef(false);

  // Account: prefill only what the account already holds and the buyer
  // can see and edit (never the optical profile). Only empty fields.
  useEffect(() => {
    if (!user || prefilled.current) return;
    prefilled.current = true;
    setValues((current) => ({
      ...current,
      firstName: current.firstName || user.firstName,
      lastName: current.lastName || user.lastName,
      email: current.email || user.email,
      phone: current.phone || (user.phone ?? ""),
    }));
  }, [user]);

  // A single pickup branch is the obvious choice.
  const branchList = branches.data ?? [];
  const onlyBranchId = branchList.length === 1 ? branchList[0]!.id : null;
  useEffect(() => {
    if (onlyBranchId)
      setValues((current) => (current.branchId ? current : { ...current, branchId: onlyBranchId }));
  }, [onlyBranchId]);

  useEffect(() => {
    if (focusRequest === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusRequest]);

  if (cart.lines.length === 0 && !completed.current) {
    return (
      <Container className="py-16">
        <SeoHead title="Checkout" />
        <StatusMessage
          variant="empty"
          heading="No hay productos para comprar"
          message="Tu carrito está vacío. Agregá un producto para iniciar tu pedido."
          action={
            <Link
              to="/products"
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-surface hover:bg-primary-dark"
            >
              Ver catálogo
            </Link>
          }
        />
      </Container>
    );
  }

  function update<K extends keyof CheckoutFormValues>(field: K, value: CheckoutFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // Double-submit guard (a click racing the disabled state). The future
    // payment step still needs its own server-side idempotency.
    if (submitting.current) return;
    setSubmitError(null);

    const found = validateCheckoutForm(values);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      setFocusRequest((n) => n + 1);
      return;
    }

    submitting.current = true;
    createOrder.mutate(buildCheckoutInput(values, cart.lines), {
      onSuccess: (order) => {
        completed.current = true;
        if (order.accessToken) saveOrderAccessToken(order.orderNumber, order.accessToken);
        navigate(`/order/${order.orderNumber}`, { replace: true });
        cartActions.clear();
      },
      onError: (error) => {
        submitting.current = false;
        setSubmitError(presentCheckoutError(error));
      },
    });
  }

  const orderedErrors = CHECKOUT_FIELD_ORDER.filter((field) => errors[field]);
  const pending = createOrder.isPending;

  return (
    <Container className="py-12">
      <SeoHead title="Checkout" />
      <h1 className="font-display text-2xl font-semibold text-text sm:text-3xl">
        Finalizar pedido
      </h1>
      {!user && (
        <p className="mt-2 text-sm text-text-muted">
          Podés comprar sin cuenta.{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Ingresá
          </Link>{" "}
          si querés ver el pedido en tu historial.
        </p>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_24rem]">
        <form
          ref={formRef}
          noValidate
          onSubmit={handleSubmit}
          aria-describedby="checkout-errors"
          className="space-y-10"
        >
          <div id="checkout-errors" aria-live="assertive">
            {orderedErrors.length > 0 && (
              <p
                role="alert"
                className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger"
              >
                Revisá{" "}
                {orderedErrors.length === 1
                  ? "el campo marcado"
                  : `los ${orderedErrors.length} campos marcados`}{" "}
                para continuar.
              </p>
            )}
            {submitError && (
              <div
                role="alert"
                className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger"
              >
                <p>{submitError.message}</p>
                {submitError.fix === "cart" && (
                  <Link to="/cart" className="mt-2 inline-block font-semibold underline">
                    Revisar el carrito
                  </Link>
                )}
              </div>
            )}
          </div>

          <Fieldset legend="Contacto">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Nombre"
                name="firstName"
                autoComplete="given-name"
                required
                value={values.firstName}
                error={errors.firstName}
                onChange={(e) => update("firstName", e.target.value)}
              />
              <FormField
                label="Apellido"
                name="lastName"
                autoComplete="family-name"
                required
                value={values.lastName}
                error={errors.lastName}
                onChange={(e) => update("lastName", e.target.value)}
              />
              <FormField
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={values.email}
                error={errors.email}
                onChange={(e) => update("email", e.target.value)}
              />
              <FormField
                label="Teléfono"
                name="phone"
                type="tel"
                autoComplete="tel"
                required
                value={values.phone}
                error={errors.phone}
                onChange={(e) => update("phone", e.target.value)}
              />
            </div>
            <p className="mt-2 text-xs text-text-muted">
              Usamos tu teléfono solo para coordinar este pedido.
            </p>
          </Fieldset>

          <Fieldset legend="Entrega">
            <div
              role="radiogroup"
              aria-label="Método de entrega"
              className="grid gap-3 sm:grid-cols-2"
            >
              <ChoiceCard
                name="deliveryMethod"
                checked={values.deliveryMethod === "PICKUP"}
                onChange={() => update("deliveryMethod", "PICKUP")}
                title="Retiro en el local"
                subtitle="Gratis"
              />
              <ChoiceCard
                name="deliveryMethod"
                checked={values.deliveryMethod === "DELIVERY"}
                onChange={() => update("deliveryMethod", "DELIVERY")}
                title="Envío a domicilio"
                subtitle="Gratis a todo el país"
              />
            </div>

            {values.deliveryMethod === "PICKUP" ? (
              <PickupBranches
                branches={branchList}
                loading={branches.isLoading}
                failed={branches.isError}
                value={values.branchId}
                error={errors.branchId}
                onChange={(id) => update("branchId", id)}
              />
            ) : (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <FormField
                  className="sm:col-span-2"
                  label="Nombre de quien recibe"
                  name="recipientName"
                  autoComplete="name"
                  required
                  value={values.recipientName}
                  error={errors.recipientName}
                  onChange={(e) => update("recipientName", e.target.value)}
                />
                <FormField
                  label="Calle"
                  name="streetName"
                  autoComplete="address-line1"
                  required
                  value={values.streetName}
                  error={errors.streetName}
                  onChange={(e) => update("streetName", e.target.value)}
                />
                <FormField
                  label="Número"
                  name="streetNumber"
                  required
                  value={values.streetNumber}
                  error={errors.streetNumber}
                  onChange={(e) => update("streetNumber", e.target.value)}
                />
                <FormField
                  label="Piso (opcional)"
                  name="floor"
                  value={values.floor}
                  onChange={(e) => update("floor", e.target.value)}
                />
                <FormField
                  label="Departamento (opcional)"
                  name="apartment"
                  value={values.apartment}
                  onChange={(e) => update("apartment", e.target.value)}
                />
                <FormField
                  label="Localidad"
                  name="city"
                  autoComplete="address-level2"
                  required
                  value={values.city}
                  error={errors.city}
                  onChange={(e) => update("city", e.target.value)}
                />
                <SelectField
                  label="Provincia"
                  name="provinceCode"
                  value={values.provinceCode}
                  error={errors.provinceCode}
                  onChange={(value) =>
                    update("provinceCode", value as CheckoutFormValues["provinceCode"])
                  }
                >
                  <option value="">Elegí una provincia</option>
                  {ARGENTINE_PROVINCES.map((province) => (
                    <option key={province.code} value={province.code}>
                      {province.name}
                    </option>
                  ))}
                </SelectField>
                <FormField
                  label="Código postal"
                  name="postalCode"
                  autoComplete="postal-code"
                  required
                  value={values.postalCode}
                  error={errors.postalCode}
                  onChange={(e) => update("postalCode", e.target.value)}
                />
                <FormField
                  className="sm:col-span-2"
                  label="Referencias (opcional)"
                  name="references"
                  value={values.references}
                  onChange={(e) => update("references", e.target.value)}
                />
              </div>
            )}
          </Fieldset>

          <Fieldset legend="Facturación">
            <p className="text-sm text-text-muted">
              Te enviamos la factura electrónica al email que ingresaste.
            </p>
            <label className="mt-4 flex max-w-sm flex-col gap-1.5 text-sm font-medium text-text">
              Condición frente al IVA
              <select
                name="ivaConditionCode"
                value={values.ivaConditionCode}
                onChange={(e) => update("ivaConditionCode", Number(e.target.value))}
                className="rounded-md border border-border bg-surface-muted px-3 py-2.5 font-normal text-text"
              >
                {CHECKOUT_IVA_CONDITIONS.map((condition) => (
                  <option key={condition.code} value={condition.code}>
                    {condition.label}
                  </option>
                ))}
              </select>
            </label>
            {values.ivaConditionCode === CONSUMIDOR_FINAL && (
              <label className="mt-4 flex items-center gap-3 text-sm text-text">
                <input
                  type="checkbox"
                  checked={values.invoiceRequested}
                  onChange={(e) => update("invoiceRequested", e.target.checked)}
                  className="h-4 w-4 accent-[var(--color-primary)]"
                />
                Quiero la factura con mi nombre y DNI o CUIL
              </label>
            )}
            {(values.ivaConditionCode !== CONSUMIDOR_FINAL || values.invoiceRequested) && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <FormField
                  label={
                    values.ivaConditionCode === CONSUMIDOR_FINAL
                      ? "Nombre completo"
                      : "Razón social"
                  }
                  name="billingName"
                  required
                  value={values.billingName}
                  error={errors.billingName}
                  onChange={(e) => update("billingName", e.target.value)}
                />
                <FormField
                  label={values.ivaConditionCode === CONSUMIDOR_FINAL ? "DNI o CUIL" : "CUIT"}
                  name="billingTaxId"
                  inputMode="numeric"
                  required
                  value={values.billingTaxId}
                  error={errors.billingTaxId}
                  onChange={(e) => update("billingTaxId", e.target.value)}
                />
                <FormField
                  className="sm:col-span-2"
                  label="Domicilio de facturación (opcional)"
                  name="billingAddressLine"
                  value={values.billingAddressLine}
                  onChange={(e) => update("billingAddressLine", e.target.value)}
                />
              </div>
            )}
          </Fieldset>

          <div className="space-y-3">
            <button
              type="submit"
              disabled={pending}
              aria-disabled={pending}
              className="w-full rounded-md bg-primary px-6 py-3 text-base font-semibold text-surface transition hover:bg-primary-dark disabled:cursor-wait disabled:opacity-60 sm:w-auto"
            >
              {pending ? "Creando tu pedido…" : "Confirmar pedido"}
            </button>
            <p className="text-sm text-text-muted">
              Al confirmar reservamos tus productos por un tiempo limitado. El pago online se
              habilitará en el siguiente paso.
            </p>
          </div>
        </form>

        <OrderSummary />
      </div>
    </Container>
  );
}

function OrderSummary() {
  const cart = useCart();
  return (
    <aside
      aria-labelledby="checkout-summary-heading"
      className="h-fit rounded-lg border border-border p-5 lg:sticky lg:top-6"
    >
      <h2 id="checkout-summary-heading" className="font-display text-lg font-semibold text-text">
        Tu pedido
      </h2>
      <ul className="mt-4 divide-y divide-border">
        {cart.lines.map((line) => (
          <li key={line.key} className="flex justify-between gap-3 py-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-text">
                {line.quantity} × {line.productName}
              </p>
              <CartLineDetails line={line} />
            </div>
            <p className="shrink-0 text-text">
              {formatPrice(Math.round(line.unitPrice * 100 * line.quantity) / 100)}
            </p>
          </li>
        ))}
      </ul>
      <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-text-muted">Subtotal estimado</dt>
          <dd className="text-text">{formatPrice(cart.estimatedSubtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text-muted">Envío</dt>
          <dd className="font-semibold text-success">GRATIS</dd>
        </div>
        <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
          <dt className="text-text">Total estimado</dt>
          <dd className="text-primary">{formatPrice(cart.estimatedSubtotal)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-text-muted">
        Los precios y la disponibilidad se verifican al confirmar el pedido.
      </p>
      <Link
        to="/cart"
        className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
      >
        Editar carrito
      </Link>
    </aside>
  );
}

function Fieldset({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-4 font-display text-lg font-semibold text-text">{legend}</legend>
      {children}
    </fieldset>
  );
}

function ChoiceCard({
  name,
  checked,
  onChange,
  title,
  subtitle,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-md border px-4 py-3 text-sm transition focus-within:ring-2 focus-within:ring-primary ${
        checked ? "border-primary bg-primary/5" : "border-border hover:border-primary/60"
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 accent-[var(--color-primary)]"
      />
      <span>
        <span className="block font-medium text-text">{title}</span>
        <span className="block text-text-muted">{subtitle}</span>
      </span>
    </label>
  );
}

function PickupBranches({
  branches,
  loading,
  failed,
  value,
  error,
  onChange,
}: {
  branches: { id: string; name: string; address: string }[];
  loading: boolean;
  failed: boolean;
  value: string;
  error?: string;
  onChange: (id: string) => void;
}) {
  const errorId = useId();
  if (loading) return <p className="mt-5 text-sm text-text-muted">Cargando sucursales…</p>;
  if (failed || branches.length === 0) {
    return (
      <p role="alert" className="mt-5 text-sm text-danger">
        No pudimos cargar las sucursales para retiro. Probá de nuevo o elegí envío a domicilio.
      </p>
    );
  }
  return (
    <div className="mt-5">
      <p className="mb-2 text-sm font-medium text-text" id={`${errorId}-label`}>
        Retirás en
      </p>
      <div
        role="radiogroup"
        aria-labelledby={`${errorId}-label`}
        aria-describedby={error ? errorId : undefined}
        className="space-y-2"
      >
        {branches.map((branch) => (
          <label
            key={branch.id}
            className={`flex cursor-pointer items-start gap-3 rounded-md border px-4 py-3 text-sm ${value === branch.id ? "border-primary bg-primary/5" : "border-border"}`}
          >
            <input
              type="radio"
              name="branchId"
              value={branch.id}
              checked={value === branch.id}
              onChange={() => onChange(branch.id)}
              aria-invalid={Boolean(error) && !value}
              className="mt-0.5 accent-[var(--color-primary)]"
            />
            <span>
              <span className="block font-medium text-text">{branch.name}</span>
              <span className="block text-text-muted">{branch.address}</span>
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function SelectField({
  label,
  name,
  value,
  error,
  onChange,
  children,
}: {
  label: string;
  name: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-text">
        {label}
      </label>
      <select
        id={id}
        name={name}
        value={value}
        required
        autoComplete="address-level1"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-md border bg-surface-muted px-4 py-2.5 text-text focus-visible:border-primary ${error ? "border-danger" : "border-border"}`}
      >
        {children}
      </select>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
