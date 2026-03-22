import { getStorage, setStorage } from '@shared/storage';

const SENSITIVITY_OPTIONS = [
  {
    value: 'aggressive' as const,
    label: 'Aggressive',
    description: 'Detect more T&C elements, may include false positives.',
  },
  {
    value: 'normal' as const,
    label: 'Normal',
    description: 'Balanced detection (recommended).',
  },
  {
    value: 'conservative' as const,
    label: 'Conservative',
    description: 'Only detect high-confidence T&C elements.',
  },
];

export async function renderDetectionSettings(container: HTMLElement): Promise<void> {
  const settingsResult = await getStorage('settings');
  if (!settingsResult.ok) return;
  const settings = settingsResult.data;

  container.textContent = '';

  const heading = document.createElement('h3');
  heading.style.cssText = 'font-size:16px;font-weight:600;margin-bottom:16px';
  heading.textContent = 'Detection Sensitivity';
  container.appendChild(heading);

  for (const option of SENSITIVITY_OPTIONS) {
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;cursor:pointer;padding:12px;border:1px solid #e5e7eb;border-radius:8px';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'sensitivity';
    radio.value = option.value;
    radio.checked = settings.detectionSensitivity === option.value;
    radio.addEventListener('change', async () => {
      const s = await getStorage('settings');
      if (!s.ok) return;
      await setStorage('settings', { ...s.data, detectionSensitivity: option.value });
    });

    const textDiv = document.createElement('div');
    const name = document.createElement('div');
    name.style.cssText = 'font-weight:500;font-size:14px';
    name.textContent = option.label;
    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:12px;color:#6b7280;margin-top:2px';
    desc.textContent = option.description;
    textDiv.appendChild(name);
    textDiv.appendChild(desc);

    label.appendChild(radio);
    label.appendChild(textDiv);
    container.appendChild(label);
  }
}
