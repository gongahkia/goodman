import type { VersionEntry } from '@shared/storage';
import { getVersionHistory } from './schema';
import { computeTextHash } from '@summarizer/cache';

export interface ChangeResult {
  changed: boolean;
  previousVersion: VersionEntry | null;
  currentHash: string;
}

export async function checkForChanges(
  domain: string,
  currentText: string
): Promise<ChangeResult> {
  const currentHash = await computeTextHash(currentText);
  const history = await getVersionHistory(domain);

  if (history.length === 0) {
    return { changed: false, previousVersion: null, currentHash };
  }

  const latest = history[history.length - 1]!;

  if (latest.textHash === currentHash) {
    return { changed: false, previousVersion: latest, currentHash };
  }

  return { changed: true, previousVersion: latest, currentHash };
}
