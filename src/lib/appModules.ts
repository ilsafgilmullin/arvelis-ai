export const loadAppLayoutModule = () => import('../components/AppLayout');
export const loadWorkspaceModule = () => import('../screens/WorkspaceScreen');
export const loadChatModule = () => import('../screens/ChatScreen');
export const loadHistoryModule = () => import('../screens/HistoryScreen');
export const loadProfileModule = () => import('../screens/ProfileScreen');
export const loadStatesModule = () => import('../screens/StatesScreen');

type IdleCapableWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
};

const secondaryLoaders = [
  loadHistoryModule,
  loadProfileModule,
  loadStatesModule,
] as const;

async function warmSecondaryModules(): Promise<void> {
  // Warm secondary chunks one by one so a slower phone does not parse/evaluate
  // every non-critical screen at the same moment immediately after app entry.
  for (const loadModule of secondaryLoaders) {
    try {
      await loadModule();
    } catch {
      // Secondary warmup must never block startup. If the module is still unavailable
      // later, the existing lazy/runtime error path will surface that failure explicitly.
    }
  }
}

export function preloadSecondaryAppModules(): void {
  if (typeof window === 'undefined') return;

  const idleWindow = window as IdleCapableWindow;
  if (idleWindow.requestIdleCallback) {
    idleWindow.requestIdleCallback(() => {
      void warmSecondaryModules();
    }, { timeout: 1200 });
    return;
  }

  // Safari does not consistently expose requestIdleCallback. Two frame boundaries
  // allow the first ARVELIS AI screen to paint before background chunk evaluation.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      void warmSecondaryModules();
    });
  });
}
