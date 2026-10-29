// Explicitly supported consent vocabulary. A manual path remains available for other languages.
export const LEGAL_PHRASES = [
  'terms',
  'conditions',
  'privacy',
  'policy',
  'agreement',
  'eula',
  'tos',
  '服务条款',
  '服務條款',
  '隐私',
  '隱私',
  '使用条款',
  '使用條款',
  'condiciones',
  'términos',
  'privacidad',
  'confidentialité',
  'conditions générales',
  'nutzungsbedingungen',
  'datenschutz',
];
export const AGREEMENT_PHRASES = [
  'agree',
  'accept',
  'consent',
  'acknowledge',
  'by checking',
  'by continuing',
  'i have read',
  'i understand',
  '同意',
  '接受',
  'acepto',
  'aceptar',
  'al continuar',
  'j’accepte',
  "j'accepte",
  'en continuant',
  'accepter',
  'zustimmen',
  'akzeptieren',
];
export const CONSENT_ACTION =
  /\b(?:accept|agree|reject|manage|close|decline|allow|deny|got it|i understand|aceptar|rechazar|accepter|refuser|akzeptieren|ablehnen)\b|同意|接受|拒绝|拒絕/i;
export function isLegalText(text: string): boolean {
  const lower = text.toLowerCase();
  return LEGAL_PHRASES.some((word) => lower.includes(word));
}
export function isAgreementText(text: string): boolean {
  const lower = text.toLowerCase();
  return AGREEMENT_PHRASES.some((word) => lower.includes(word));
}
