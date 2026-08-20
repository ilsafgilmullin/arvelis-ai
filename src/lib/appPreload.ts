import { canUseDemoStorage, loadDemoWorkspace } from './demoStorage';
import { loadAppLayoutModule, loadChatModule, loadWorkspaceModule } from './appModules';
import type { DemoWorkspaceState } from '../types';

export type AppLoadProgress = {
  completed: number;
  total: number;
  label: string;
};

export type PreparedApp = {
  workspace: DemoWorkspaceState;
  persistenceAvailable: boolean;
};

const TOTAL_TASKS = 3;

export async function prepareApp(onProgress: (progress: AppLoadProgress) => void): Promise<PreparedApp> {
  let completed = 0;

  const complete = (label: string) => {
    completed += 1;
    onProgress({ completed, total: TOTAL_TASKS, label });
  };

  const shellTask = Promise.all([
    loadAppLayoutModule(),
    loadWorkspaceModule(),
  ]).then(() => {
    complete('Интерфейс готов');
  });

  const chatTask = loadChatModule().then(() => {
    complete('Диалог готов');
  });

  const storageTask = Promise.resolve().then(() => {
    const workspace = loadDemoWorkspace();
    const persistenceAvailable = canUseDemoStorage();
    complete('Данные восстановлены');
    return { workspace, persistenceAvailable };
  });

  const [, , prepared] = await Promise.all([shellTask, chatTask, storageTask]);
  return prepared;
}
