import { ShippingProviderError, type ShippingProvider } from "../lib/shipping-provider.js";

// The provider service boundary (ADR-0024): every module that needs a
// carrier goes through here, never through an adapter directly — the one
// seam `vi.mock()`'d in tests, same pattern as image-provider.service.ts,
// so test runs never touch the network or need credentials.
//
// Phase A registers no adapter: no carrier is contracted yet, so there are
// no credentials and no environment variables. The provider below is
// explicitly never configured; quote-service turns that into
// NOT_CONFIGURED instead of ever inventing a tariff. Phase B replaces
// getShippingProvider() with a selection of the real adapter.

const NOT_CONFIGURED_PROVIDER: ShippingProvider = {
  code: "NONE",
  isConfigured: () => false,
  quote: async () => {
    throw new ShippingProviderError("UNAVAILABLE", "No shipping provider is configured.");
  },
};

export function getShippingProvider(): ShippingProvider {
  return NOT_CONFIGURED_PROVIDER;
}
