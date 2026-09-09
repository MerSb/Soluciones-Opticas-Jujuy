import { Link } from "react-router-dom";
import type { AdminDashboardAlertProduct } from "@soluciones-opticas/shared";
import { StatusMessage } from "../../components/ui/StatusMessage";
import { AdminMetricCard } from "../../components/admin/AdminMetricCard";
import { useAdminDashboardQuery } from "../../services/queries/admin-dashboard";

const METRIC_SKELETON_KEYS = ["m1", "m2", "m3", "m4", "m5", "m6"];

const QUICK_ACTIONS = [
  { to: "/admin/products", label: "Productos", helperText: "Ver y editar el catálogo." },
  { to: "/admin/products/new", label: "Crear producto", helperText: "Cargar un modelo nuevo." },
  { to: "/admin/brands", label: "Marcas", helperText: "Gestionar marcas." },
  { to: "/admin/categories", label: "Categorías", helperText: "Gestionar categorías." },
  {
    to: "/admin/products",
    label: "Gestión de imágenes",
    helperText: "Se administran desde cada producto.",
  },
];

function AlertList({
  items,
  emptyMessage,
}: {
  items: AdminDashboardAlertProduct[];
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-text-muted">{emptyMessage}</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {items.map((product) => (
        <li key={product.id} className="flex items-center justify-between gap-3 py-2.5">
          <span className="min-w-0 truncate text-sm text-text">
            {product.name}
            <span className="text-text-muted"> · {product.brandName}</span>
          </span>
          <Link
            to={`/admin/products/${product.id}`}
            className="shrink-0 text-sm font-medium text-primary hover:underline"
          >
            Editar
          </Link>
        </li>
      ))}
    </ul>
  );
}

// /admin's landing page — a quick operational read (KPIs + alerts), not
// a report. Every number comes from GET /api/admin/dashboard; nothing
// here is invented client-side. See docs/ADMIN_DASHBOARD_V2.md for the
// exact definition behind each metric/alert.
export function AdminDashboardPage() {
  const { data, isLoading, isError, refetch } = useAdminDashboardQuery();

  return (
    <div>
      <p className="text-sm text-text-muted">
        Resumen operativo del catálogo: qué está activo, qué necesita atención y accesos rápidos a
        las tareas más comunes.
      </p>

      {isError && (
        <div className="mt-6">
          <StatusMessage
            variant="error"
            message="No pudimos cargar el panel. Probá de nuevo."
            action={
              <button
                type="button"
                onClick={() => refetch()}
                className="rounded-md border border-border px-4 py-2 text-sm text-text hover:border-primary"
              >
                Reintentar
              </button>
            }
          />
        </div>
      )}

      {!isError && (
        <>
          <h2 className="sr-only">Resumen</h2>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {isLoading || !data
              ? METRIC_SKELETON_KEYS.map((key) => (
                  <AdminMetricCard key={key} label="" value="" isLoading />
                ))
              : [
                  { label: "Productos activos", value: data.metrics.activeProducts },
                  {
                    label: "Productos sin stock",
                    value: data.metrics.outOfStockProducts,
                    helperText: "Sin ninguna variante con stock disponible.",
                  },
                  {
                    label: "Productos sin imagen",
                    value: data.metrics.productsWithoutImages,
                    helperText: "Sin ninguna foto cargada en ninguna variante.",
                  },
                  { label: "Marcas activas", value: data.metrics.activeBrands },
                  { label: "Categorías activas", value: data.metrics.activeCategories },
                  { label: "Usuarios registrados", value: data.metrics.registeredUsers },
                ].map((metric) => <AdminMetricCard key={metric.label} {...metric} />)}
          </div>

          <section className="mt-10">
            <h2 className="font-display text-lg text-text">Alertas operativas</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-border bg-surface-muted p-5 shadow-soft">
                <h3 className="text-sm font-semibold text-text">Productos sin stock</h3>
                <div className="mt-3">
                  {isLoading || !data ? (
                    <div
                      className="h-20 animate-pulse rounded bg-surface-sunken"
                      aria-hidden="true"
                    />
                  ) : (
                    <AlertList
                      items={data.alerts.outOfStock}
                      emptyMessage="No hay productos sin stock."
                    />
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-surface-muted p-5 shadow-soft">
                <h3 className="text-sm font-semibold text-text">Productos sin imagen</h3>
                <div className="mt-3">
                  {isLoading || !data ? (
                    <div
                      className="h-20 animate-pulse rounded bg-surface-sunken"
                      aria-hidden="true"
                    />
                  ) : (
                    <AlertList
                      items={data.alerts.withoutImages}
                      emptyMessage="Todos los productos tienen imagen."
                    />
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="mt-10">
            <h2 className="font-display text-lg text-text">Accesos rápidos</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {QUICK_ACTIONS.map((action) => (
                <Link
                  key={action.label}
                  to={action.to}
                  className="rounded-lg border border-border bg-surface-muted p-5 shadow-soft transition-colors hover:border-primary focus-visible:border-primary"
                >
                  <p className="font-medium text-text">{action.label}</p>
                  <p className="mt-1 text-sm text-text-muted">{action.helperText}</p>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
