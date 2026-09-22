import { state, render } from './state.js';

// Lógica de PWA (instalação/prompt e registro do service worker) extraída do
// monólito application.js. Código apenas MOVIDO: comportamento idêntico.
// Os helpers de UI (openNotice, friendlyError) permanecem em application.js e
// são injetados via initPwa(deps) para evitar dependência circular.

let deferredInstallPrompt = null;
let pwaListenersInstalled = false;
let installPromptWaiters = [];

let deps = {
  openNotice: () => {},
  friendlyError: (error) => String(error?.message || error || '')
};

export function initPwa(injected = {}) {
  deps = { ...deps, ...injected };
}

export function setupPwaFeatures() {
  if (pwaListenersInstalled || typeof window === 'undefined') return;
  pwaListenersInstalled = true;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((error) => console.warn('Service worker não registrado:', error));
    });
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    state.canInstallApp = true;
    const waiters = installPromptWaiters;
    installPromptWaiters = [];
    waiters.forEach((resolve) => resolve(event));
    render();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    state.canInstallApp = false;
    state.isStandaloneApp = true;
    deps.openNotice('success', 'Aplicativo instalado', 'O sistema foi instalado e poderá ser aberto pelo ícone na tela inicial do aparelho.');
    render();
  });
}

export function waitForInstallPrompt(timeout = 1400) {
  if (deferredInstallPrompt) return Promise.resolve(deferredInstallPrompt);
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      installPromptWaiters = installPromptWaiters.filter((item) => item !== resolver);
      resolve(null);
    }, timeout);
    function resolver(event) {
      window.clearTimeout(timer);
      resolve(event);
    }
    installPromptWaiters.push(resolver);
  });
}

export function getInstallContext() {
  const ua = navigator.userAgent || '';
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(ua);
  const isChromium = /chrome|crios|edg|opr|samsungbrowser/i.test(ua);
  const isSecure = window.isSecureContext || ['localhost', '127.0.0.1'].includes(window.location.hostname);
  return { isIOS, isAndroid, isChromium, isSecure };
}

export async function handleInstallApp() {
  if (state.isStandaloneApp) {
    deps.openNotice('info', 'Aplicativo já instalado', 'Você já está usando o sistema no modo aplicativo.');
    render();
    return;
  }

  const promptEvent = deferredInstallPrompt || await waitForInstallPrompt();

  if (promptEvent) {
    deferredInstallPrompt = promptEvent;
    try {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice.catch(() => null);
      deferredInstallPrompt = null;
      state.canInstallApp = false;
      if (choice?.outcome === 'accepted') {
        deps.openNotice('success', 'Instalação iniciada', 'Conclua a instalação pelo navegador. Depois, abra o sistema pelo ícone criado no aparelho.');
      } else {
        state.modal = { type: 'installApp', reason: 'cancelled' };
      }
    } catch (error) {
      deferredInstallPrompt = null;
      state.modal = { type: 'installApp', reason: 'blocked', message: deps.friendlyError(error) };
    }
    render();
    return;
  }

  const context = getInstallContext();
  state.modal = {
    type: 'installApp',
    reason: context.isIOS ? 'ios' : context.isSecure ? 'manual' : 'insecure',
    canTryAgain: context.isAndroid || context.isChromium
  };
  render();
}
