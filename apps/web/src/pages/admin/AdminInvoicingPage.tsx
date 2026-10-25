import { useState } from "react";
import { Link } from "react-router-dom";
import type {
  FiscalDocumentStatus,
  FiscalIssuerDto,
  InvoicingStatusDto,
  OnlineInvoiceRequestDto,
} from "@soluciones-opticas/shared";
import { SeoHead } from "../../components/ui/SeoHead";
import { StatusMessage } from "../../components/ui/StatusMessage";
import { FormField } from "../../components/forms/FormField";
import { ApiClientError } from "../../services/api-client";
import { formatPrice } from "../../lib/format-price";
import {
  useCompleteRequestMutation,
  useConfirmTaxConditionMutation,
  useInvoiceRequestsQuery,
  useInvoicesQuery,
  useInvoicingStatusQuery,
  useRunInvoicingMutation,
  useSaveIssuerMutation,
  useSavePointOfSaleMutation,
  type IssuerForm,
} from "../../services/queries/admin-invoicing";
import {
  EMAIL_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  InvoiceStatusBadge,
  formatVoucherNumber,
} from "./invoice-status";

// Online invoicing (ADR-0036): only purchases made on the website, once
// their payment is verified. In-store sales keep being invoiced from
// ARCA's portal — there is no manual invoicing here. The fiscal setup is
// never assumed: the screen says what is missing until the accountant
// confirms it.

function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback;
}

const primaryButton =
  "rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark disabled:opacity-60";
const secondaryButton =
  "rounded-md border border-border px-3 py-2 text-sm font-medium text-text hover:bg-surface-muted disabled:opacity-60";
const selectClass = "rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-text";

type Tab = "invoices" | "requests" | "settings";

export function AdminInvoicingPage() {
  const status = useInvoicingStatusQuery();
  const [tab, setTab] = useState<Tab>("invoices");

  return (
    <div>
      <SeoHead title="Facturación online — Administración" />
      <p className="max-w-3xl text-sm text-text-muted">
        Facturas electrónicas de las <strong className="text-text">compras online</strong> con el
        pago confirmado. Las ventas en el local se siguen facturando desde el portal de ARCA.
      </p>
      {status.isLoading && <p className="mt-4 text-sm text-text-muted">Cargando…</p>}
      {status.isError && (
        <StatusMessage variant="error" message="No pudimos cargar la facturación." />
      )}
      {status.data && (
        <>
          <EnvironmentNotice status={status.data} />
          <div role="tablist" aria-label="Facturación" className="mt-6 flex flex-wrap gap-2">
            {(
              [
                ["invoices", "Facturas online"],
                ["requests", "Pedidos por completar"],
                ["settings", "Configuración fiscal"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={
                  tab === value
                    ? "rounded-md bg-primary/10 px-3 py-2 text-sm font-semibold text-primary"
                    : "rounded-md px-3 py-2 text-sm font-medium text-text-muted hover:text-text"
                }
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-6">
            {tab === "invoices" && <InvoiceList />}
            {tab === "requests" && <WaitingRequests status={status.data} />}
            {tab === "settings" && <FiscalSettings status={status.data} />}
          </div>
        </>
      )}
    </div>
  );
}

function EnvironmentNotice({ status }: { status: InvoicingStatusDto }) {
  const environment =
    status.environment === "mock"
      ? "Modo simulado: no se envía nada a ARCA y los comprobantes no tienen validez fiscal."
      : status.environment === "homologacion"
        ? "Homologación de ARCA: comprobantes de prueba, sin validez fiscal."
        : null;
  return (
    <div className="mt-4 space-y-3">
      {environment && (
        <p className="rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-text">
          {environment}
        </p>
      )}
      {!status.emailEnabled && (
        <p className="text-sm text-text-muted">
          El envío de facturas por correo está desactivado: los correos quedan pendientes.
        </p>
      )}
      {status.blockers.length > 0 && (
        <div className="rounded-md border border-border bg-surface-muted px-4 py-3 text-sm text-text">
          <p className="font-semibold">Todavía no se emiten facturas online:</p>
          <ul className="mt-1 list-disc pl-5">
            {status.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function InvoiceList() {
  const [status, setStatus] = useState<FiscalDocumentStatus | "">("");
  const [page, setPage] = useState(1);
  const invoices = useInvoicesQuery(status || undefined, page);
  const run = useRunInvoicingMutation();

  return (
    <section aria-labelledby="invoices-heading">
      <h2 id="invoices-heading" className="font-display text-lg font-semibold text-text">
        Facturas online
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-text">
          Estado
          <select
            className={selectClass}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as FiscalDocumentStatus | "");
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {Object.entries(INVOICE_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={secondaryButton}
          disabled={run.isPending}
          onClick={() => run.mutate()}
        >
          {run.isPending ? "Procesando…" : "Procesar pendientes"}
        </button>
      </div>
      {run.data && (
        <p role="status" className="mt-2 text-sm text-text">
          Emitidas: {run.data.emitted} · Verificadas en ARCA: {run.data.verified} · Correos
          enviados: {run.data.emailsSent}
          {run.data.failed + run.data.emailsFailed > 0 &&
            ` · Con problemas: ${run.data.failed + run.data.emailsFailed}`}
        </p>
      )}
      {run.isError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {errorText(run.error, "No pudimos procesar los pendientes.")}
        </p>
      )}
      {invoices.isLoading && <p className="mt-3 text-sm text-text-muted">Cargando…</p>}
      {invoices.isError && (
        <StatusMessage variant="error" message="No pudimos cargar las facturas." />
      )}
      {invoices.data && invoices.data.data.length === 0 && (
        <p className="mt-4 text-sm text-text-muted">Todavía no hay facturas online.</p>
      )}
      {invoices.data && invoices.data.data.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="py-2 pr-4 font-medium">Comprobante</th>
                <th className="py-2 pr-4 font-medium">Pedido</th>
                <th className="py-2 pr-4 font-medium">Comprador</th>
                <th className="py-2 pr-4 font-medium">Total</th>
                <th className="py-2 pr-4 font-medium">ARCA</th>
                <th className="py-2 font-medium">Correo</th>
              </tr>
            </thead>
            <tbody>
              {invoices.data.data.map((invoice) => (
                <tr key={invoice.id} className="border-b border-border">
                  <td className="py-2 pr-4">
                    <Link
                      to={`/admin/invoicing/${invoice.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {invoice.voucherName} {formatVoucherNumber(invoice)}
                    </Link>
                    <span className="block text-xs text-text-muted">{invoice.issueDate}</span>
                  </td>
                  <td className="py-2 pr-4 text-text">{invoice.orderNumber}</td>
                  <td className="py-2 pr-4 text-text">{invoice.receptorName ?? "—"}</td>
                  <td className="py-2 pr-4 text-text">{formatPrice(invoice.totalAmount)}</td>
                  <td className="py-2 pr-4">
                    <InvoiceStatusBadge status={invoice.status} />
                  </td>
                  <td className="py-2 text-text">
                    {invoice.emailStatus ? EMAIL_STATUS_LABELS[invoice.emailStatus] : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {invoices.data.pagination.totalPages > 1 && (
            <div className="mt-3 flex items-center gap-3 text-sm">
              <button
                type="button"
                className={secondaryButton}
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Anterior
              </button>
              <span className="text-text-muted">
                Página {page} de {invoices.data.pagination.totalPages}
              </span>
              <button
                type="button"
                className={secondaryButton}
                disabled={page >= invoices.data.pagination.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function WaitingRequests({ status }: { status: InvoicingStatusDto }) {
  const requests = useInvoiceRequestsQuery("WAITING_DATA");
  return (
    <section aria-labelledby="requests-heading">
      <h2 id="requests-heading" className="font-display text-lg font-semibold text-text">
        Pedidos pagados que esperan datos
      </h2>
      <p className="mt-1 text-sm text-text-muted">
        Pedidos online con el pago confirmado a los que les falta algo para facturarse. No se emite
        nada hasta completarlo.
      </p>
      {requests.isLoading && <p className="mt-3 text-sm text-text-muted">Cargando…</p>}
      {requests.data && requests.data.length === 0 && (
        <p className="mt-4 text-sm text-text-muted">No hay pedidos esperando datos.</p>
      )}
      <ul className="mt-4 space-y-4">
        {requests.data?.map((request) => (
          <WaitingRequest key={request.id} request={request} status={status} />
        ))}
      </ul>
    </section>
  );
}

function WaitingRequest({
  request,
  status,
}: {
  request: OnlineInvoiceRequestDto;
  status: InvoicingStatusDto;
}) {
  const complete = useCompleteRequestMutation();
  const [condition, setCondition] = useState<number | "">("");
  const [docType, setDocType] = useState<80 | 86>(80);
  const needsCondition = request.billingTaxId?.replace(/\D/g, "").length === 11;

  return (
    <li className="rounded-md border border-border p-4 text-sm text-text">
      <p className="font-semibold">
        Pedido {request.orderNumber} · {formatPrice(request.total)}
      </p>
      <p className="text-text-muted">
        {request.buyerName} · {request.buyerEmail}
        {request.billingTaxId && <> · Documento: {request.billingTaxId}</>}
      </p>
      <p className="mt-2">{request.blockerReason}</p>
      {needsCondition && (
        <form
          noValidate
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (condition === "") return;
            complete.mutate({
              id: request.id,
              receptorIvaConditionCode: condition,
              receptorDocType: docType,
            });
          }}
        >
          <label className="flex flex-col gap-1">
            El número es
            <select
              className={selectClass}
              value={docType}
              onChange={(event) => setDocType(Number(event.target.value) as 80 | 86)}
            >
              <option value={80}>CUIT</option>
              <option value={86}>CUIL</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Condición frente al IVA del comprador
            <select
              className={selectClass}
              value={condition}
              onChange={(event) =>
                setCondition(event.target.value ? Number(event.target.value) : "")
              }
            >
              <option value="">Elegir…</option>
              {status.catalog.receptorConditions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className={primaryButton}
            disabled={condition === "" || complete.isPending}
          >
            Completar y facturar
          </button>
        </form>
      )}
      {complete.isError && (
        <p role="alert" className="mt-2 text-danger">
          {errorText(complete.error, "No pudimos completar los datos.")}
        </p>
      )}
    </li>
  );
}

function FiscalSettings({ status }: { status: InvoicingStatusDto }) {
  return (
    <div className="max-w-4xl space-y-10">
      <p className="text-sm text-text-muted">
        La condición fiscal, el punto de venta, los tipos de comprobante y las alícuotas los
        confirma el contador. El sistema no los supone: mientras falten, los pedidos esperan.
      </p>
      <IssuerSection issuer={status.issuer} status={status} />
      {status.issuer && <TaxConditionSection status={status} />}
      {status.issuer && <PointsOfSaleSection status={status} />}
    </div>
  );
}

const vatOptions = (status: InvoicingStatusDto) => [
  <option key="" value="">
    Sin confirmar
  </option>,
  ...status.catalog.vatRates.map((rate) => (
    <option key={rate.code} value={rate.code}>
      {rate.name}
    </option>
  )),
];

function IssuerSection({
  issuer,
  status,
}: {
  issuer: FiscalIssuerDto | null;
  status: InvoicingStatusDto;
}) {
  const saveIssuer = useSaveIssuerMutation();
  const [form, setForm] = useState<IssuerForm>({
    cuit: issuer?.cuit ?? "",
    legalName: issuer?.legalName ?? "",
    commercialAddress: issuer?.commercialAddress ?? "",
    grossIncomeNumber: issuer?.grossIncomeNumber ?? "",
    activityStartDate: issuer?.activityStartDate ?? "",
    finalConsumerIdThreshold:
      issuer?.finalConsumerIdThreshold === null || issuer?.finalConsumerIdThreshold === undefined
        ? ""
        : String(issuer.finalConsumerIdThreshold),
    frameVatRateCode: issuer?.frameVatRateCode ?? null,
    lensVatRateCode: issuer?.lensVatRateCode ?? null,
    accessoryVatRateCode: issuer?.accessoryVatRateCode ?? null,
  });
  const vatSelect = (
    label: string,
    key: "frameVatRateCode" | "lensVatRateCode" | "accessoryVatRateCode",
  ) => (
    <label className="flex flex-col gap-1 text-sm text-text">
      {label}
      <select
        className={selectClass}
        value={form[key] ?? ""}
        onChange={(event) =>
          setForm({ ...form, [key]: event.target.value ? Number(event.target.value) : null })
        }
      >
        {vatOptions(status)}
      </select>
    </label>
  );

  return (
    <section aria-labelledby="issuer-heading">
      <h2 id="issuer-heading" className="font-display text-lg font-semibold text-text">
        Emisor
      </h2>
      <form
        noValidate
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          saveIssuer.mutate(form);
        }}
      >
        <FormField
          label="CUIT (11 dígitos)"
          inputMode="numeric"
          value={form.cuit}
          onChange={(e) => setForm({ ...form, cuit: e.target.value.replace(/\D/g, "") })}
          className="w-44"
        />
        <FormField
          label="Razón social"
          value={form.legalName}
          onChange={(e) => setForm({ ...form, legalName: e.target.value })}
          className="w-64"
        />
        <FormField
          label="Domicilio comercial"
          value={form.commercialAddress}
          onChange={(e) => setForm({ ...form, commercialAddress: e.target.value })}
          className="w-72"
        />
        <FormField
          label="Ingresos brutos"
          value={form.grossIncomeNumber}
          onChange={(e) => setForm({ ...form, grossIncomeNumber: e.target.value })}
          className="w-44"
        />
        <FormField
          label="Inicio de actividades"
          type="date"
          value={form.activityStartDate}
          onChange={(e) => setForm({ ...form, activityStartDate: e.target.value })}
          className="w-44"
        />
        <FormField
          label="Identificar consumidor final desde ($)"
          hint="Monto de la normativa vigente. Vacío: los pedidos sin documento esperan."
          inputMode="decimal"
          value={form.finalConsumerIdThreshold}
          onChange={(e) =>
            setForm({ ...form, finalConsumerIdThreshold: e.target.value.replace(",", ".") })
          }
          className="w-56"
        />
        <fieldset className="flex flex-wrap items-end gap-3">
          <legend className="mb-1 text-sm font-semibold text-text">
            Alícuotas de IVA de la venta online (las define el contador)
          </legend>
          {vatSelect("Armazones", "frameVatRateCode")}
          {vatSelect("Cristales", "lensVatRateCode")}
          {vatSelect("Accesorios", "accessoryVatRateCode")}
        </fieldset>
        <button type="submit" className={primaryButton} disabled={saveIssuer.isPending}>
          Guardar emisor
        </button>
      </form>
      {saveIssuer.isError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {errorText(saveIssuer.error, "No pudimos guardar el emisor.")}
        </p>
      )}
      {saveIssuer.isSuccess && <p className="mt-2 text-sm text-success">Emisor guardado.</p>}
    </section>
  );
}

function TaxConditionSection({ status }: { status: InvoicingStatusDto }) {
  const confirm = useConfirmTaxConditionMutation();
  const issuer = status.issuer!;
  const [code, setCode] = useState<number | "">(issuer.taxConditionCode ?? "");
  const current = status.catalog.receptorConditions.find(
    (condition) => condition.code === issuer.taxConditionCode,
  );

  return (
    <section aria-labelledby="tax-condition-heading">
      <h2 id="tax-condition-heading" className="font-display text-lg font-semibold text-text">
        Condición fiscal del emisor
      </h2>
      <p className="mt-1 text-sm text-text">
        {current
          ? `Confirmada: ${current.name} (${issuer.taxConditionConfirmedAt?.slice(0, 10)}).`
          : "Sin confirmar."}
      </p>
      <form
        noValidate
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (code === "") return;
          if (window.confirm("¿El contador confirmó esta condición fiscal?")) confirm.mutate(code);
        }}
      >
        <label className="flex flex-col gap-1 text-sm text-text">
          Condición confirmada por el contador
          <select
            className={selectClass}
            value={code}
            onChange={(event) => setCode(event.target.value ? Number(event.target.value) : "")}
          >
            <option value="">Elegir…</option>
            {status.catalog.receptorConditions.map((condition) => (
              <option key={condition.code} value={condition.code}>
                {condition.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={primaryButton} disabled={code === "" || confirm.isPending}>
          Registrar confirmación
        </button>
      </form>
      {confirm.isError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {errorText(confirm.error, "No pudimos registrar la confirmación.")}
        </p>
      )}
    </section>
  );
}

function PointsOfSaleSection({ status }: { status: InvoicingStatusDto }) {
  const save = useSavePointOfSaleMutation();
  const [number, setNumber] = useState("");
  const [types, setTypes] = useState<number[]>([]);

  return (
    <section aria-labelledby="pos-heading">
      <h2 id="pos-heading" className="font-display text-lg font-semibold text-text">
        Punto de venta para la tienda online
      </h2>
      <p className="mt-1 text-sm text-text-muted">
        Un punto de venta propio, dado de alta en ARCA para «Factura electrónica – Web Services» (no
        el que se usa en el portal).
      </p>
      {status.issuer!.pointsOfSale.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-text">
          {status.issuer!.pointsOfSale.map((pos) => (
            <li key={pos.id}>
              {String(pos.number).padStart(5, "0")} —{" "}
              {pos.enabledVoucherTypes.length
                ? pos.enabledVoucherTypes
                    .map(
                      (code) =>
                        status.catalog.voucherTypes.find((type) => type.code === code)?.name ??
                        code,
                    )
                    .join(", ")
                : "sin tipos habilitados"}
              {pos.forOnlineSales && " · tienda online"}
              {!pos.active && " (inactivo)"}
            </li>
          ))}
        </ul>
      )}
      <form
        noValidate
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate({
            number: Number(number),
            enabledVoucherTypes: types,
            active: true,
            forOnlineSales: true,
          });
        }}
      >
        <FormField
          label="Número"
          inputMode="numeric"
          value={number}
          onChange={(e) => setNumber(e.target.value.replace(/\D/g, ""))}
          className="w-28"
        />
        <fieldset className="flex flex-wrap items-center gap-3 pb-3">
          <legend className="sr-only">Tipos habilitados (confirmados por el contador)</legend>
          {status.catalog.voucherTypes.map((type) => (
            <label key={type.code} className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={types.includes(type.code)}
                onChange={(event) =>
                  setTypes(
                    event.target.checked
                      ? [...types, type.code]
                      : types.filter((code) => code !== type.code),
                  )
                }
              />
              {type.name}
            </label>
          ))}
        </fieldset>
        <button type="submit" className={primaryButton} disabled={!number || save.isPending}>
          Guardar punto de venta online
        </button>
      </form>
      {save.isError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {errorText(save.error, "No pudimos guardar el punto de venta.")}
        </p>
      )}
    </section>
  );
}
