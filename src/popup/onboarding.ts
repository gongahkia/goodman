import {
  appendChildren,
  createButton,
  createElement,
} from '@popup/ui';
import { HostedProvider } from '@providers/hosted';
import { getStorage, setStorage } from '@shared/storage';

export function renderOnboarding(
  container: HTMLElement,
  onComplete: () => void
): void {
  container.className = 'tc-page';
  container.textContent = '';
  renderStep1(container, onComplete);
}

function renderStep1(container: HTMLElement, onComplete: () => void): void {
  container.textContent = '';
  const card = createElement('section', 'tc-state-card');
  const kicker = createElement('p', 'tc-state-kicker', 'Welcome');
  const title = createElement('h2', 'tc-state-title', 'Goodman');
  const copy = createElement(
    'p',
    'tc-state-copy',
    'Goodman reads the Terms & Conditions on web pages, summarizes them in plain English, highlights legally concerning clauses, and tracks changes over time so you know when companies silently update their terms.'
  );
  const actions = createElement('div', 'tc-state-actions');
  actions.appendChild(
    createButton('Get Started', 'primary', () => renderStep2(container, onComplete))
  );
  appendChildren(card, kicker, title, copy, actions);
  container.appendChild(card);
}

function renderStep2(container: HTMLElement, onComplete: () => void): void {
  container.textContent = '';
  const card = createElement('section', 'tc-state-card');
  const kicker = createElement('p', 'tc-state-kicker', 'Setup');
  const title = createElement('h2', 'tc-state-title', 'Choose a Provider');
  const copy = createElement(
    'p',
    'tc-state-copy',
    'Goodman needs an AI provider to analyze legal text. You can use Goodman Cloud (if available) or bring your own API key from OpenAI, Claude, Gemini, or a local Ollama instance.'
  );

  const hostedStatus = createElement('p', 'tc-state-copy', 'Checking Goodman Cloud...');
  const actions = createElement('div', 'tc-state-actions');

  const settingsBtn = createButton('Open Settings to Configure', 'primary', () => {
    void completeOnboarding(onComplete).catch(e => console.warn('[Goodman] onboarding completion failed:', e));
  });

  appendChildren(card, kicker, title, copy, hostedStatus, actions);

  void checkHostedAndRender(hostedStatus, actions, settingsBtn, onComplete).catch(e => console.warn('[Goodman] hosted check failed:', e));

  container.appendChild(card);
}

async function checkHostedAndRender(
  statusEl: HTMLElement,
  actionsEl: HTMLElement,
  settingsBtn: HTMLButtonElement,
  onComplete: () => void
): Promise<void> {
  const settingsResult = await getStorage('settings');
  const baseUrl = settingsResult.ok ? settingsResult.data.providers['hosted']?.baseUrl : undefined;
  const hosted = new HostedProvider(baseUrl);
  const online = await hosted.checkHealth();

  if (online) {
    statusEl.textContent = 'Goodman Cloud is online and ready to use.';
    actionsEl.textContent = '';
    appendChildren(
      actionsEl,
      createButton('Use Goodman Cloud', 'primary', () => {
        void acceptHostedAndComplete(onComplete).catch(e => console.warn('[Goodman] hosted accept failed:', e));
      }),
      settingsBtn
    );
  } else {
    statusEl.textContent = 'Goodman Cloud is unreachable. Configure an API provider in Settings.';
    actionsEl.textContent = '';
    actionsEl.appendChild(settingsBtn);
  }
}

async function acceptHostedAndComplete(onComplete: () => void): Promise<void> {
  const settingsResult = await getStorage('settings');
  if (settingsResult.ok) {
    await setStorage('settings', {
      ...settingsResult.data,
      activeProvider: 'hosted',
      hostedConsentAccepted: true,
    });
  }
  await completeOnboarding(onComplete);
}

async function completeOnboarding(onComplete: () => void): Promise<void> {
  await setStorage('onboardingCompleted', true);
  onComplete();
}
