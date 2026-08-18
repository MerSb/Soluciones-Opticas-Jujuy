// Standard Google Maps "search" URL — no API key, no embed, no invented
// coordinates. Prefers the branch's own googleMapsUrl when the API
// provides one; otherwise falls back to a maps search built from the
// address text that's already there.
export function buildMapsUrl(branch: { googleMapsUrl: string | null; address: string }): string {
  if (branch.googleMapsUrl) return branch.googleMapsUrl;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branch.address)}`;
}
