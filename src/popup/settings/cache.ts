import { getCacheStats, clearCache } from '@summarizer/cache';

export async function renderCacheSettings(container: HTMLElement): Promise<void> {
  container.textContent = '';

  const heading = document.createElement('h3');
  heading.style.cssText = 'font-size:16px;font-weight:600;margin-bottom:16px';
  heading.textContent = 'Cache Management';
  container.appendChild(heading);

  const stats = await getCacheStats();

  const statsDiv = document.createElement('div');
  statsDiv.style.cssText = 'margin-bottom:16px;padding:12px;background:#f8f9fa;border-radius:8px';

  const countP = document.createElement('p');
  countP.style.cssText = 'font-size:13px;margin-bottom:4px';
  countP.textContent = `Cached summaries: ${stats.count}`;
  statsDiv.appendChild(countP);

  const sizeP = document.createElement('p');
  sizeP.style.cssText = 'font-size:13px;margin-bottom:4px';
  sizeP.textContent = `Approximate size: ${formatBytes(stats.sizeBytes)}`;
  statsDiv.appendChild(sizeP);

  container.appendChild(statsDiv);

  if (stats.domains.length > 0) {
    const domainHeading = document.createElement('h4');
    domainHeading.style.cssText = 'font-size:14px;font-weight:500;margin-bottom:8px';
    domainHeading.textContent = 'Cached Domains';
    container.appendChild(domainHeading);

    for (const domain of stats.domains) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #e5e7eb';

      const label = document.createElement('span');
      label.style.cssText = 'font-size:13px';
      label.textContent = domain;

      const clearBtn = document.createElement('button');
      clearBtn.style.cssText = 'border:1px solid #e5e7eb;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;background:white';
      clearBtn.textContent = 'Clear';
      clearBtn.addEventListener('click', async () => {
        await clearCache(domain);
        await renderCacheSettings(container);
      });

      row.appendChild(label);
      row.appendChild(clearBtn);
      container.appendChild(row);
    }
  }

  const clearAllBtn = document.createElement('button');
  clearAllBtn.style.cssText = 'margin-top:16px;border:none;border-radius:8px;padding:8px 16px;cursor:pointer;font-size:13px;background:#ef4444;color:white';
  clearAllBtn.textContent = 'Clear All Cache';
  clearAllBtn.addEventListener('click', async () => {
    if (confirm('Clear all cached summaries?')) {
      await clearCache();
      await renderCacheSettings(container);
    }
  });
  container.appendChild(clearAllBtn);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
