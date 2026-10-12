import type {
  IncludedAccessoriesDto,
  IncludedAccessoriesSelection,
  IncludedAccessoryOption,
} from "@soluciones-opticas/shared";

// ADR-0028 Phase 2 — the buyer's choice of included accessories. The API
// is the authority (quote validation); this mirrors its completeness rule
// only to guide the page: a case when cases are on offer, exactly one cord
// (standard or personalized) when either is on offer.

export interface AccessoryChoice {
  caseVariantId: string | null;
  /** true = personalized cord (replaces the standard one). */
  personalizedCord: boolean;
  cordVariantId: string | null;
  customCordVariantId: string | null;
}

export const EMPTY_ACCESSORY_CHOICE: AccessoryChoice = {
  caseVariantId: null,
  personalizedCord: false,
  cordVariantId: null,
  customCordVariantId: null,
};

function isSlot(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { configured?: unknown }).configured === "boolean" &&
    Array.isArray((value as { options?: unknown }).options)
  );
}

/** Shape check — an unexpected body (e.g. an API without this endpoint)
 * means "no accessories section", never a crash. */
export function isIncludedAccessoriesDto(value: unknown): value is IncludedAccessoriesDto {
  if (typeof value !== "object" || value === null) return false;
  const offer = value as Record<string, unknown>;
  return (
    isSlot(offer.case) &&
    isSlot(offer.cord) &&
    isSlot(offer.customCord) &&
    typeof (offer.customCord as { surcharge?: unknown }).surcharge === "number"
  );
}

/** Something to show at all: the store has set up a case or a cord. */
export function offersIncludedAccessories(offer: unknown): offer is IncludedAccessoriesDto {
  return (
    isIncludedAccessoriesDto(offer) &&
    (offer.case.configured || offer.cord.configured || offer.customCord.configured)
  );
}

export function isChoiceComplete(offer: IncludedAccessoriesDto, choice: AccessoryChoice): boolean {
  if (offer.case.options.length > 0 && !choice.caseVariantId) return false;
  const cordsOnOffer = offer.cord.options.length > 0 || offer.customCord.options.length > 0;
  const cordChosen = choice.personalizedCord
    ? Boolean(choice.customCordVariantId)
    : Boolean(choice.cordVariantId);
  return !cordsOnOffer || cordChosen;
}

/** Ids for the quote — the personalized cord replaces the standard one,
 * so only one of the two is ever sent. */
export function toSelection(choice: AccessoryChoice): IncludedAccessoriesSelection {
  return {
    caseVariantId: choice.caseVariantId,
    cordVariantId: choice.personalizedCord ? null : choice.cordVariantId,
    customCordVariantId: choice.personalizedCord ? choice.customCordVariantId : null,
  };
}

/** How an option is named to the buyer: its color, else its presentation. */
export function optionName(option: Pick<IncludedAccessoryOption, "color" | "label">): string {
  return option.color ?? option.label ?? "Único";
}

/** Drops choices that are no longer on offer (sold out or removed since the
 * page loaded) and the personalized-cord flag when none is offered — the
 * page never quotes or messages a stale selection. */
export function normalizeChoice(
  offer: IncludedAccessoriesDto,
  choice: AccessoryChoice,
): AccessoryChoice {
  const keep = (id: string | null, options: IncludedAccessoryOption[]) =>
    id && options.some((option) => option.variantId === id) ? id : null;
  return {
    caseVariantId: keep(choice.caseVariantId, offer.case.options),
    personalizedCord: choice.personalizedCord && offer.customCord.options.length > 0,
    cordVariantId: keep(choice.cordVariantId, offer.cord.options),
    customCordVariantId: keep(choice.customCordVariantId, offer.customCord.options),
  };
}
