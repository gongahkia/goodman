import {
  appendChildren,
  createButton,
  createElement,
  createEmptyMessage,
  createSectionHeading,
} from '@popup/ui';
import { clearCache, getCacheStats } from '@summarizer/cache';

export async function renderCacheSettings(container: HTMLElement): Promise<void> {
  container.textContent = '';
  container.appendChild(
    createSectionHeading(
      'Cache management',
      'Inspect saved summaries and clear stored entries when you want Goodman to analyze from scratch.'
    )
  );

  const stats = await getCacheStats();
  const statsCard = createElement('section', 'tc-callout');
  appendChildren(
    statsCard,
    createElement('div', 'tc-callout-title', 'Saved analysis footprint'),
    createElement('p', 'tc-callout-copy', `Cached summaries: ${stats.count}`),
    createElement(
      'p',
      'tc-callout-copy',
      `Approximate size: ${formatBytes(stats.sizeBytes)}`
    )
  );
  container.appendChild(statsCard);

  container.appendChild(
    createSectionHeading(
      'Cached domains',
      'Clear individual domains if you only want to invalidate a specific source.'
    )
  );

  if (stats.domains.length === 0) {
    container.appendChild(createEmptyMessage('No cached domains yet.'));
  } else {
    for (const domain of stats.domains) {
      const row = createElement('div', 'tc-domain-row');
      const label = createElement('div', 'tc-domain-label');
      appendChildren(
        label,
        createElement('div', 'tc-domain-name', domain),
        createElement('div', 'tc-option-copy', 'Remove cached summaries for this domain only.')
      );

      const clearButton = createButton('Clear', 'secondary', () => {
        void clearCache(domain).then(async () => {
          await renderCacheSettings(container);
        });
      });

      appendChildren(row, label, clearButton);
      container.appendChild(row);
    }
  }

  container.appendChild(
    createButton('Clear All Cache', 'danger', () => {
      if (confirm('Clear all cached summaries?')) {
        void clearCache().then(async () => {
          await renderCacheSettings(container);
        });
      }
    })
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
