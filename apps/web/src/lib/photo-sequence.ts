// Click-to-number photo selection (docs/IMAGE_PIPELINE.md, "Choosing the
// order"). The native file picker can't tell us the order the admin
// clicked files in — FileList order depends on the OS and on how the
// files were selected — so the order is chosen afterwards, in our own
// thumbnail grid: each click appends a photo to the sequence, clicking it
// again takes it out and the rest close the gap.

/** Same file picked twice (same folder opened again, or dropped twice). */
export function photoFileKey(file: File): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

/** Appends the key, or removes it so the later ones move up one number. */
export function toggleInSequence(order: readonly string[], key: string): string[] {
  return order.includes(key) ? order.filter((k) => k !== key) : [...order, key];
}

/**
 * Full order to send to PUT …/images/order after a retry: the photos that
 * were already on the variant keep their place (the primary among them
 * stays first), then the new ones in the chosen sequence. Only needed when
 * a retry registered a photo after one that comes later in the sequence.
 */
export function orderWithNewPhotosLast(
  currentIds: readonly string[],
  newIdsInSequence: readonly string[],
): string[] {
  const added = new Set(newIdsInSequence);
  return [
    ...currentIds.filter((id) => !added.has(id)),
    ...newIdsInSequence.filter((id) => currentIds.includes(id)),
  ];
}
