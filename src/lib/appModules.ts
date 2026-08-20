export const loadAppLayoutModule = () => import('../components/AppLayout');
export const loadWorkspaceModule = () => import('../screens/WorkspaceScreen');
export const loadChatModule = () => import('../screens/ChatScreen');
export const loadHistoryModule = () => import('../screens/HistoryScreen');
export const loadProfileModule = () => import('../screens/ProfileScreen');
export const loadStatesModule = () => import('../screens/StatesScreen');

type IdleCapableWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
};

function warmSecondaryModules(): void {
  void Promise.allSettled([
    loadHistoryModule(),
    loadProfileModule(),
    loadStatesModule(),
  ]);
}

export function preloadSecondaryAppModules(): void {
  if (typeof window === 'undefined') return;

  const idleWindow = window as IdleCapableWindow;
  if (idleWindow.requestIdleCallback) {
    idleWindow.requestIdleCallback(warmSecondaryModules, { timeout: 1200 });
    return;
  }

  window.setTimeout(warmSecondaryModules, 120);
}
