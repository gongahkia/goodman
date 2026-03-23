export const STORAGE_VERSION = 1;
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const MAX_VERSIONS_PER_DOMAIN = 20;
export const DEBOUNCE_MS = 500;
export const MAX_OVERLAY_WIDTH = 380;
export const MAX_OVERLAY_HEIGHT = 500;
export const DEFAULT_MAX_TOKENS = 2048;
export const DEFAULT_TEMPERATURE = 0.2;
export const DEFAULT_CHUNK_MAX_TOKENS = 4000;
export const DEFAULT_CHUNK_OVERLAP_TOKENS = 200;
export const SENSITIVITY_THRESHOLDS = {
  aggressive: 0.4,
  normal: 0.65,
  conservative: 0.8,
} as const;
