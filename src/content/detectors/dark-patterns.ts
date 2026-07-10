import {
  getDarkPatternCatalogEntry,
  type DarkPatternFinding,
  type DarkPatternSeverity,
  type DarkPatternSignalId,
} from '@shared/dark-patterns';

const ACTION_SELECTOR = [
  'button',
  '[role="button"]',
  'input[type="button"]',
  'input[type="submit"]',
  'a[href]',
].join(',');

const ACCEPT_ALL_PATTERN = /\b(accept|allow|agree|enable|consent)\s+(all|everything|cookies|tracking|ads|advertising)\b/i;
const ACCEPT_PATTERN = /\b(accept|allow|agree|enable|consent|continue)\b/i;
const REJECT_PATTERN = /\b(reject|decline|deny|refuse|disagree|opt\s*out|no thanks|necessary only|essential only)\b/i;
const MANAGE_PATTERN = /\b(manage|settings|preferences|customi[sz]e|options)\b/i;
const DATA_OPT_IN_PATTERN = /\b(marketing|newsletter|promotion|promotional|analytics|tracking|personalization|personalisation|advertising|targeted ads?|partners?|third[-\s]?party|data sharing|share my data|sell my data)\b/i;
const HIGH_RISK_DATA_PATTERN = /\b(analytics|tracking|advertising|targeted ads?|partners?|third[-\s]?party|data sharing|share my data|sell my data)\b/i;
const COERCIVE_CONTINUE_PATTERN = /\b(agree|accept|consent)\s+to\s+continue\b|\b(to continue|continue).{0,60}\b(agree|accept|consent)\b|\bby continuing\b.{0,80}\b(agree|accept|consent)\b/i;

interface ConsentAction {
  element: HTMLElement;
  text: string;
  kind: 'accept' | 'reject' | 'manage' | 'other';
  visible: boolean;
  prominence: number;
}

export function detectConsentDarkPatterns(root: HTMLElement): DarkPatternFinding[] {
  const findings: DarkPatternFinding[] = [];
  const text = normalizeText(root.textContent ?? '');
  const actions = collectActions(root);
  const visibleRejects = actions.filter((action) => action.kind === 'reject' && action.visible);
  const acceptsAll = actions.filter((action) => action.kind === 'accept' && ACCEPT_ALL_PATTERN.test(action.text));

  if (acceptsAll.length > 0) {
    const strongestAccept = maxProminence(acceptsAll);
    const strongestReject = maxProminence(visibleRejects);
    if (!strongestAccept) return findings;
    if (!strongestReject) {
      findings.push(createFinding(
        'accept_all_without_equal_reject',
        hasVisibleManage(actions) ? 'medium' : 'high',
        `Found "${strongestAccept.text}" without a visible reject-all action.`
      ));
    } else if (strongestAccept.prominence - strongestReject.prominence >= 2) {
      findings.push(createFinding(
        'accept_all_without_equal_reject',
        'medium',
        `Accept action "${strongestAccept.text}" is more prominent than reject action "${strongestReject.text}".`
      ));
    }
  }

  for (const input of collectCheckedInputs(root)) {
    const evidence = normalizeText(getInputContext(input));
    if (!DATA_OPT_IN_PATTERN.test(evidence)) continue;
    findings.push(createFinding(
      'prechecked_data_opt_in',
      HIGH_RISK_DATA_PATTERN.test(evidence) ? 'high' : 'medium',
      clipEvidence(evidence)
    ));
  }

  const hiddenReject = actions.find((action) => action.kind === 'reject' && !action.visible);
  if (hiddenReject) {
    findings.push(createFinding(
      'hidden_reject_path',
      'high',
      `Reject action "${hiddenReject.text}" is hidden or outside the viewport.`
    ));
  }

  if (COERCIVE_CONTINUE_PATTERN.test(text) && visibleRejects.length === 0) {
    findings.push(createFinding(
      'coercive_continue_copy',
      acceptsAll.length > 0 ? 'high' : 'medium',
      clipEvidence(text.match(COERCIVE_CONTINUE_PATTERN)?.[0] ?? text)
    ));
  }

  return dedupeFindings(findings);
}

function collectActions(root: HTMLElement): ConsentAction[] {
  return Array.from(root.querySelectorAll(ACTION_SELECTOR))
    .map((element) => toConsentAction(element as HTMLElement))
    .filter((action) => action.text.length > 0);
}

function toConsentAction(element: HTMLElement): ConsentAction {
  const text = normalizeText(getControlText(element));
  const kind = classifyAction(text);
  const visible = isVisibleAction(element);
  const prominence = getProminence(element, visible);
  return { element, text, kind, visible, prominence };
}

function classifyAction(text: string): ConsentAction['kind'] {
  if (REJECT_PATTERN.test(text)) return 'reject';
  if (MANAGE_PATTERN.test(text)) return 'manage';
  if (ACCEPT_PATTERN.test(text)) return 'accept';
  return 'other';
}

function getControlText(element: HTMLElement): string {
  if (element instanceof HTMLInputElement) {
    return element.value || element.getAttribute('aria-label') || '';
  }
  return element.textContent || element.getAttribute('aria-label') || '';
}

function isVisibleAction(element: HTMLElement): boolean {
  if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
  if (element instanceof HTMLButtonElement && element.disabled) return false;
  if (element instanceof HTMLInputElement && element.disabled) return false;

  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return true;
  return rect.bottom >= 0 &&
    rect.right >= 0 &&
    rect.top <= window.innerHeight &&
    rect.left <= window.innerWidth;
}

function getProminence(element: HTMLElement, visible: boolean): number {
  if (!visible) return 0;
  let score = 1;
  const tag = element.tagName.toLowerCase();
  if (tag === 'button' || element.getAttribute('role') === 'button') score += 2;
  if (element instanceof HTMLInputElement && (element.type === 'button' || element.type === 'submit')) score += 2;
  if (tag === 'a') score -= 1;
  const classAndRole = `${element.className} ${element.getAttribute('class') ?? ''} ${element.getAttribute('aria-label') ?? ''}`.toLowerCase();
  if (/\b(primary|accept|allow|agree|cta)\b/.test(classAndRole)) score += 1;
  if (/\b(link|secondary|ghost|subtle)\b/.test(classAndRole)) score -= 1;
  const rect = element.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) score += Math.min(2, Math.floor((rect.width * rect.height) / 8000));
  return score;
}

function collectCheckedInputs(root: HTMLElement): HTMLInputElement[] {
  const inputs = root.querySelectorAll('input[type="checkbox"], input[type="radio"]');
  return Array.from(inputs)
    .filter((input): input is HTMLInputElement => input instanceof HTMLInputElement)
    .filter((input) => input.checked || input.getAttribute('aria-checked') === 'true');
}

function getInputContext(input: HTMLInputElement): string {
  const label = findAssociatedLabel(input);
  const parent = input.closest('label') ?? input.parentElement;
  return [
    label?.textContent ?? '',
    parent?.textContent ?? '',
    input.getAttribute('aria-label') ?? '',
  ].join(' ');
}

function findAssociatedLabel(input: HTMLInputElement): HTMLLabelElement | null {
  if (input.id) {
    const label = input.ownerDocument.querySelector(`label[for="${input.id}"]`);
    if (label) return label as HTMLLabelElement;
  }
  const parent = input.closest('label');
  return parent as HTMLLabelElement | null;
}

function hasVisibleManage(actions: ConsentAction[]): boolean {
  return actions.some((action) => action.kind === 'manage' && action.visible);
}

function maxProminence(actions: ConsentAction[]): ConsentAction | null {
  return actions.reduce<ConsentAction | null>(
    (best, action) => (!best || action.prominence > best.prominence ? action : best),
    null
  );
}

function createFinding(
  id: DarkPatternSignalId,
  severity: DarkPatternSeverity,
  evidence: string
): DarkPatternFinding {
  const entry = getDarkPatternCatalogEntry(id);
  return {
    id,
    label: entry.label,
    severity,
    evidence,
  };
}

function dedupeFindings(findings: DarkPatternFinding[]): DarkPatternFinding[] {
  const seen = new Set<DarkPatternSignalId>();
  return findings.filter((finding) => {
    if (seen.has(finding.id)) return false;
    seen.add(finding.id);
    return true;
  });
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function clipEvidence(text: string): string {
  const normalized = normalizeText(text);
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}
