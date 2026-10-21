export type PublishedConsentVersion = {
  id: string;
  requiresReconsent: boolean;
};

export function validConsentVersionIds(
  versions: PublishedConsentVersion[],
): string[] {
  const ids: string[] = [];
  for (const version of versions) {
    ids.push(version.id);
    if (version.requiresReconsent) break;
  }
  return ids;
}
