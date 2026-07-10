import {
  appendChildren,
  createButton,
  createElement,
} from '@popup/ui';
import { setStorage } from '@shared/storage';

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
    'Goodman needs your own provider credentials or a local Ollama endpoint before it can analyze legal text.'
  );

  const actions = createElement('div', 'tc-state-actions');
  actions.appendChild(createButton('Open Settings to Configure', 'primary', () => {
    void completeOnboarding(onComplete).catch(e => console.warn('[Goodman] onboarding completion failed:', e));
  }));

  appendChildren(card, kicker, title, copy, actions);
  container.appendChild(card);
}

async function completeOnboarding(onComplete: () => void): Promise<void> {
  await setStorage('onboardingCompleted', true);
  onComplete();
}
