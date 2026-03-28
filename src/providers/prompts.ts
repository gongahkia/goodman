import type { RedFlagCategory } from './types';

export const SYSTEM_PROMPT = `You are a legal text analyzer specializing in Terms & Conditions documents.
Analyze the following T&C text and return a JSON object with this exact structure:
{
  "tldr": "single sentence (max 15 words) capturing the essence of what the user agrees to",
  "summary": "2-3 sentence plain-English summary of what the user is agreeing to",
  "keyPoints": ["array of 3-7 key points in plain English"],
  "redFlags": [
    {
      "category": "one of the categories listed below",
      "description": "plain English explanation of why this is concerning",
      "severity": "low | medium | high",
      "quote": "exact quote from the T&C text that triggered this flag"
    }
  ],
  "severity": "low | medium | high | critical"
}

Red flag categories and their typical severity:
- data_selling (HIGH): User data sold to third parties for profit
- arbitration_clause (HIGH): Mandatory binding arbitration, waiver of jury trial
- class_action_waiver (HIGH): Cannot join class action lawsuits against the company
- automatic_renewal (MEDIUM): Auto-renewing subscriptions, difficult cancellation
- biometric_data (HIGH): Collection of biometric data (fingerprints, face scans, voice prints)
- third_party_sharing (MEDIUM): Data shared with third-party companies (not sold)
- jurisdiction_change (MEDIUM): Disputes resolved in a specific/foreign jurisdiction
- liability_limitation (LOW): Company limits its own liability for damages
- content_ownership_transfer (HIGH): User grants perpetual/irrevocable license to their content
- unilateral_changes (MEDIUM): Company can change terms without notice
- no_deletion_right (HIGH): No right to have data deleted
- location_tracking (MEDIUM): Continuous location tracking
- data_retention (HIGH): Indefinite data retention after account deletion
- ai_training (HIGH): User content used for AI/ML model training
- government_disclosure (MEDIUM): Broad government/law enforcement data sharing clauses

Assign severity based on the specific language in the document, not just the category.
If you cannot find an exact verbatim quote, set quote to an empty string.
Return ONLY valid JSON. Do not wrap the JSON in markdown code fences or backticks. No additional text.`;

/**
 * Red flag category descriptions for UI display.
 *
 * Each category describes a specific legal concern that users should be aware of
 * when agreeing to Terms & Conditions.
 *
 * - data_selling: "The company sells your personal data to third parties for profit."
 * - arbitration_clause: "You waive your right to a jury trial and must resolve disputes through private arbitration."
 * - class_action_waiver: "You cannot join a class action lawsuit against the company."
 * - automatic_renewal: "Your subscription auto-renews, potentially making cancellation difficult."
 * - biometric_data: "The company collects biometric data such as fingerprints, face scans, or voice prints."
 * - third_party_sharing: "Your data is shared with third-party companies (partners, advertisers)."
 * - jurisdiction_change: "Legal disputes must be resolved in a specific jurisdiction (often favorable to the company)."
 * - liability_limitation: "The company limits how much they can be held liable for damages."
 * - content_ownership_transfer: "You grant the company a broad license to use your content (photos, posts, etc.)."
 * - unilateral_changes: "The company can change the terms at any time without notifying you."
 * - no_deletion_right: "You may not have the right to have your data deleted."
 * - location_tracking: "The company tracks your physical location continuously."
 */
export const RED_FLAG_DESCRIPTIONS: Record<RedFlagCategory, string> = {
  data_selling: 'The company sells your personal data to third parties for profit.',
  arbitration_clause:
    'You waive your right to a jury trial and must resolve disputes through private arbitration.',
  class_action_waiver: 'You cannot join a class action lawsuit against the company.',
  automatic_renewal:
    'Your subscription auto-renews, potentially making cancellation difficult.',
  biometric_data:
    'The company collects biometric data such as fingerprints, face scans, or voice prints.',
  third_party_sharing: 'Your data is shared with third-party companies (partners, advertisers).',
  jurisdiction_change:
    'Legal disputes must be resolved in a specific jurisdiction (often favorable to the company).',
  liability_limitation: 'The company limits how much they can be held liable for damages.',
  content_ownership_transfer:
    'You grant the company a broad license to use your content (photos, posts, etc.).',
  unilateral_changes: 'The company can change the terms at any time without notifying you.',
  no_deletion_right: 'You may not have the right to have your data deleted.',
  location_tracking: 'The company tracks your physical location continuously.',
  data_retention: 'Your data may be retained indefinitely even after you delete your account.',
  ai_training: 'Your content may be used to train AI or machine learning models.',
  government_disclosure: 'Your data may be broadly shared with government or law enforcement agencies.',
};

export function buildUserPrompt(text: string): string {
  return `Analyze the following Terms & Conditions document:
---BEGIN T&C---
${text}
---END T&C---`;
}
