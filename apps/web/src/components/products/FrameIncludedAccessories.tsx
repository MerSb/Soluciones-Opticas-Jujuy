import { useEffect } from "react";
import type { PublicLensTypeDto } from "@soluciones-opticas/shared";
import { IncludedAccessoriesSection } from "./IncludedAccessoriesSection";
import { useEyewearQuoteQuery, useIncludedAccessoriesQuery } from "../../services/queries/products";
import { toConfigurationInput, type LensSelection } from "../../lib/lens-configuration";
import {
  isChoiceComplete,
  normalizeChoice,
  offersIncludedAccessories,
  optionName,
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
  const offerQuery = useIncludedAccessoriesQuery();
  const offer = offersIncludedAccessories(offerQuery.data) ? offerQuery.data : null;
  const effective = offer ? normalizeChoice(offer, choice) : choice;
  const complete = Boolean(offer && isChoiceComplete(offer, effective));
  const lensInput = toConfigurationInput(variantId, lensSelection, lensTypes);
  const quote = useEyewearQuoteQuery(
    slug,
    complete ? lensInput : null,
    complete ? toSelection(effective) : null,
  );

  const quoted = !quote.isFetching && !quote.isError ? quote.data?.accessories : null;
  const total = quote.data?.totalWithAccessories;
  const summaryKey =
    complete && quoted && total !== undefined ? JSON.stringify([quoted, total]) : null;

  useEffect(() => {
    if (!summaryKey || !quoted || total === undefined) {
      onSummary(null);
      return;
    }
    onSummary({
      caseName: quoted.case ? optionName(quoted.case) : null,
      cordName: quoted.cord ? optionName(quoted.cord) : null,
      personalizedCordName: quoted.customCord ? optionName(quoted.customCord) : null,
      surcharge: quoted.surcharge,
      estimatedTotal: total,
    });
    // summaryKey serializes every value used above, so it alone decides
    // when the summary changes (onSummary is a stable state setter).
  }, [summaryKey]);

  if (!offer) return null;

  return (
    <IncludedAccessoriesSection
      offer={offer}
      choice={effective}
      onChange={onChange}
      complete={complete}
      lensIncomplete={complete && lensInput === null}
      quote={quote}
    />
  );
}
