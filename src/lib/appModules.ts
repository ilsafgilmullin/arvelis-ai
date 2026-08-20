export const loadAppLayoutModule = () => import('../components/AppLayout');
export const loadWorkspaceModule = () => import('../screens/WorkspaceScreen');
export const loadChatModule = () => import('../screens/ChatScreen');
export const loadHistoryModule = () => import('../screens/HistoryScreen');
export const loadProfileModule = () => import('../screens/ProfileScreen');
export const loadStatesModule = () => import('../screens/StatesScreen');

export async function preloadCoreAppModules(): Promise<void> {
  await Promise.all([
    loadAppLayoutModule(),
    loadWorkspaceModule(),
    loadChatModule(),
  ]);
}

export function preloadSecondaryAppModules(): void {
  if (typeof window === 'undefined') return;

  window.setTimeout(() => {
    void Promise.allSettled([
      loadHistoryModule(),
      loadProfileModule(),
      loadStatesModule(),
    ]);
  }, 0);
}
