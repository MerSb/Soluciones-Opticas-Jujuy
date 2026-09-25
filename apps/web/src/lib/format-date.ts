const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeStyle: "short",
});
const dateFormatter = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" });

/** An ISO timestamp from the API, in the buyer's local time. */
export function formatOrderDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

export function formatOrderDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}
