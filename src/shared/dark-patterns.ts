export type DarkPatternSeverity = 'low' | 'medium' | 'high';

export type DarkPatternSignalId =
  | 'accept_all_without_equal_reject'
  | 'prechecked_data_opt_in'
  | 'hidden_reject_path'
  | 'coercive_continue_copy';

export interface DarkPatternCatalogEntry {
  id: DarkPatternSignalId;
  label: string;
  description: string;
  defaultSeverity: DarkPatternSeverity;
  evidenceHint: string;
  sources: string[];
}

export interface DarkPatternFinding {
  id: DarkPatternSignalId;
  label: string;
  severity: DarkPatternSeverity;
  evidence: string;
}

export const CONSENT_DARK_PATTERN_CATALOG: DarkPatternCatalogEntry[] = [
  {
    id: 'accept_all_without_equal_reject',
    label: 'Accept all without equal reject',
    description: 'A consent surface offers a broad accept action without an equally available reject action.',
    defaultSeverity: 'high',
    evidenceHint: 'Accept action text and any visible reject/manage alternative.',
    sources: [
      'FTC Bringing Dark Patterns to Light, September 2022',
      'EDPB Guidelines 03/2022: Lacking hierarchy, Hidden in plain sight, Obstructing',
    ],
  },
  {
    id: 'prechecked_data_opt_in',
    label: 'Pre-checked data opt-in',
    description: 'Marketing, analytics, advertising, or data-sharing choices are selected before user action.',
    defaultSeverity: 'high',
    evidenceHint: 'Checked input label or nearby consent copy.',
    sources: [
      'FTC Bringing Dark Patterns to Light, September 2022',
      'EDPB Guidelines 03/2022: Deceptive snugness',
    ],
  },
  {
    id: 'hidden_reject_path',
    label: 'Hidden reject path',
    description: 'Reject or decline controls are hidden, off-screen, disabled, or otherwise hard to activate.',
    defaultSeverity: 'high',
    evidenceHint: 'Reject action text plus visibility or placement evidence.',
    sources: [
      'FTC Bringing Dark Patterns to Light, September 2022',
      'EDPB Guidelines 03/2022: Obstructing, Left in the dark',
    ],
  },
  {
    id: 'coercive_continue_copy',
    label: 'Coercive continue copy',
    description: 'The surface says users must agree or accept to continue without a visible decline path.',
    defaultSeverity: 'medium',
    evidenceHint: 'Coercive text and missing visible decline action.',
    sources: [
      'FTC Bringing Dark Patterns to Light, September 2022',
      'EDPB Guidelines 03/2022: Emotional steering, Misleading action',
    ],
  },
] as const;

export function getDarkPatternCatalogEntry(
  id: DarkPatternSignalId
): DarkPatternCatalogEntry {
  const entry = CONSENT_DARK_PATTERN_CATALOG.find((item) => item.id === id);
  if (!entry) throw new Error(`Unknown dark-pattern signal: ${id}`);
  return entry;
}
