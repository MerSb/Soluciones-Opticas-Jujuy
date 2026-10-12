import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { PublicLensTypeDto } from "@soluciones-opticas/shared";
import { IncludedAccessoriesSection } from "./IncludedAccessoriesSection";
import {
  includedAccessoriesQueryKey,
  useEyewearQuoteQuery,
  useIncludedAccessoriesQuery,
} from "../../services/queries/products";
import { ApiClientError } from "../../services/api-client";
import { toConfigurationInput, type LensSelection } from "../../lib/lens-configuration";
import {
  isChoiceComplete,
  normalizeChoice,
  offersIncludedAccessories,
  optionDisplayName,
  toSelection,
  type AccessoryChoice,
} from "../../lib/included-accessories";
import type { WhatsAppProductContext } from "../../lib/whatsapp";

export type IncludedAccessoriesSummary = NonNullable<WhatsAppProductContext["includedAccessories"]>;

// ADR-0028 Phase 2 — frame pages only. Owns its queries so the page's
// early returns keep a stable hook order; reports the server-quoted
// summary up for the WhatsApp message (null until the choice is complete
// and quoted, so the message never promises an accessory).
export function FrameIncludedAccessories({
  slug,
  variantId,
  lensTypes,
  lensSelection,
  choice,
  onChange,
  onSummary,
}: {
  slug: string;
  variantId: string;
  lensTypes: PublicLensTypeDto[];
  lensSelection: LensSelection;
  choice: AccessoryChoice;
  onChange: (choice: AccessoryChoice) => void;
  onSummary: (summary: IncludedAccessoriesSummary | null) => void;
}) {
  const queryClient = useQueryClient();
  const offerQuery = useIncludedAccessoriesQuery();
  const offer = offersIncludedAccessories(offerQuery.data) ? offerQuery.data : null;
  const effective = offer ? normalizeChoice(offer, choice) : choice;
  const complete = Boolean(offer && isChoiceComplete(offer, effective));
  const lensInput = toConfigurationInput(variantId, lensSelection, lensTypes);
  const lensComplete = lensInput !== null;
  const quote = useEyewearQuoteQuery(
    slug,
    complete ? lensInput : null,
    complete ? toSelection(effective) : null,
  );

  // Only a quote fetched for exactly the current selection counts.
  // keepPreviousData hands back the previous selection's quote while a new
  // one loads — and while the query is disabled because the lens choice is
  // incomplete — so the summary and the WhatsApp message would otherwise
  // show a total for something the buyer no longer has selected.
  const current =
    complete &&
    lensComplete &&
    !quote.isPlaceholderData &&
    !quote.isError &&
    quote.data?.accessories &&
    quote.data.totalWithAccessories !== undefined
      ? quote.data
      : undefined;

  // An accessory sold out after the offer was loaded (409): refresh the
  // offer once — normalizeChoice then drops the sold-out color — and keep
  // the reason on screen until the buyer picks again. The quote itself is
  // not retried, so this can't loop.
  const [notice, setNotice] = useState<string | null>(null);
  const conflict =
    quote.isError && quote.error instanceof ApiClientError && quote.error.status === 409
      ? quote.error
      : null;
  useEffect(() => {
    if (!conflict) return;
    setNotice(conflict.message);
    void queryClient.invalidateQueries({ queryKey: includedAccessoriesQueryKey });
    // One run per failed request: the error object is stable per failure.
  }, [conflict]);

  // Keep the page's choice in step with the offer, so a color that stopped
  // being offered is dropped for good (not revived if it comes back).
  const effectiveKey = JSON.stringify(effective);
  useEffect(() => {
    if (offer && effectiveKey !== JSON.stringify(choice)) onChange(effective);
    // effectiveKey serializes the only value that matters here.
  }, [effectiveKey]);

  const accessories = current?.accessories;
  const summary: IncludedAccessoriesSummary | null =
    offer && accessories && current?.totalWithAccessories !== undefined
      ? {
          caseName: accessories.case
            ? optionDisplayName(accessories.case, offer.case.options)
            : null,
          cordName: accessories.cord
            ? optionDisplayName(accessories.cord, offer.cord.options)
            : null,
          personalizedCordName: accessories.customCord
            ? optionDisplayName(accessories.customCord, offer.customCord.options)
            : null,
          surcharge: accessories.surcharge,
          estimatedTotal: current.totalWithAccessories,
        }
      : null;
  const summaryKey = JSON.stringify(summary);
  useEffect(() => {
    onSummary(summary);
    // summaryKey serializes the summary itself, so it alone decides when
    // it changes (onSummary is a stable state setter).
  }, [summaryKey]);

  if (!offer) return null;

  return (
    <IncludedAccessoriesSection
      offer={offer}
      choice={effective}
      onChange={(next) => {
        setNotice(null);
        onChange(next);
      }}
      complete={complete}
      lensIncomplete={complete && !lensComplete}
      notice={notice}
      quote={{ data: current, isError: quote.isError, error: quote.error }}
    />
  );
}
