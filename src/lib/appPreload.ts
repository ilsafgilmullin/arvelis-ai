import { canUseDemoStorage, loadDemoWorkspace } from './demoStorage';
import { loadAppLayoutModule, loadChatModule, loadWorkspaceModule } from './appModules';
import type { DemoWorkspaceState } from '../types';

export type AppLoadProgress = {
  completed: number;
  total: number;
  label: string;
};

export type PreparedCoreModules = {
  AppLayout: Awaited<ReturnType<typeof loadAppLayoutModule>>['AppLayout'];
  WorkspaceScreen: Awaited<ReturnType<typeof loadWorkspaceModule>>['WorkspaceScreen'];
  ChatScreen: Awaited<ReturnType<typeof loadChatModule>>['ChatScreen'];
};

export type PreparedApp = {
  workspace: DemoWorkspaceState;
  persistenceAvailable: boolean;
  core: PreparedCoreModules;
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
  ]).then(([layoutModule, workspaceModule]) => {
    complete('Интерфейс готов');
    return {
      AppLayout: layoutModule.AppLayout,
      WorkspaceScreen: workspaceModule.WorkspaceScreen,
    };
  });

  const chatTask = loadChatModule().then((chatModule) => {
    complete('Диалог готов');
    return chatModule.ChatScreen;
  });

  const storageTask = Promise.resolve().then(() => {
    const workspace = loadDemoWorkspace();
    const persistenceAvailable = canUseDemoStorage();
    complete('Данные восстановлены');
    return { workspace, persistenceAvailable };
  });

  const [shell, ChatScreen, prepared] = await Promise.all([shellTask, chatTask, storageTask]);

  return {
    ...prepared,
    core: {
      ...shell,
      ChatScreen,
    },
  };
}
