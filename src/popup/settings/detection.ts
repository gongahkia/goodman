import { appendChildren, createElement, createSectionHeading } from '@popup/ui';
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

  appendChildren(
    container,
    createSectionHeading(
      'Detection sensitivity',
      'Control how aggressively TC Guard tries to interpret consent surfaces on the active page.'
    )
  );

  for (const option of SENSITIVITY_OPTIONS) {
    const label = createElement('label', 'tc-radio-card');
    const radio = createElement('input') as HTMLInputElement;
    radio.type = 'radio';
    radio.name = 'sensitivity';
    radio.value = option.value;
    radio.checked = settings.detectionSensitivity === option.value;
    radio.addEventListener('change', async () => {
      const s = await getStorage('settings');
      if (!s.ok) return;
      await setStorage('settings', { ...s.data, detectionSensitivity: option.value });
    });

    const body = createElement('div', 'tc-option-body');
    appendChildren(
      body,
      createElement('div', 'tc-option-title', option.label),
      createElement('div', 'tc-option-copy', option.description)
    );

    appendChildren(label, radio, body);
    container.appendChild(label);
  }
}
