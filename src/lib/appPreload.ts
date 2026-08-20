import { canUseDemoStorage, loadDemoWorkspace } from './demoStorage';
import { loadAppLayoutModule, loadChatModule, loadWorkspaceModule } from './appModules';
import type { DemoWorkspaceState } from '../types';

export const APP_LOAD_TASKS = [
  { id: 'shell', label: 'Интерфейс' },
  { id: 'chat', label: 'Диалог' },
  { id: 'storage', label: 'Данные' },
] as const;

export type AppLoadTaskId = (typeof APP_LOAD_TASKS)[number]['id'];

export type AppLoadProgress = {
  completed: number;
  total: number;
  label: string;
  completedTasks: AppLoadTaskId[];
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

const TOTAL_TASKS = APP_LOAD_TASKS.length;

export async function prepareApp(onProgress: (progress: AppLoadProgress) => void): Promise<PreparedApp> {
  const completedTasks = new Set<AppLoadTaskId>();

  const complete = (taskId: AppLoadTaskId, label: string) => {
    if (completedTasks.has(taskId)) return;
    completedTasks.add(taskId);
    onProgress({
      completed: completedTasks.size,
      total: TOTAL_TASKS,
      label,
      completedTasks: [...completedTasks],
    });
  };

  const shellTask = Promise.all([
    loadAppLayoutModule(),
    loadWorkspaceModule(),
  ]).then(([layoutModule, workspaceModule]) => {
    complete('shell', 'Интерфейс готов');
    return {
      AppLayout: layoutModule.AppLayout,
      WorkspaceScreen: workspaceModule.WorkspaceScreen,
    };
  });

  const chatTask = loadChatModule().then((chatModule) => {
    complete('chat', 'Диалог готов');
    return chatModule.ChatScreen;
  });

  const storageTask = Promise.resolve().then(() => {
    const workspace = loadDemoWorkspace();
    const persistenceAvailable = canUseDemoStorage();
    complete('storage', 'Локальные данные готовы');
    return { workspace, persistenceAvailable };
  });

  const [shell, ChatScreen, prepared] = await Promise.all([shellTask, chatTask, storageTask]);

  onProgress({
    completed: TOTAL_TASKS,
    total: TOTAL_TASKS,
    label: 'ARVELIS AI готов',
    completedTasks: APP_LOAD_TASKS.map((task) => task.id),
  });

  return {
    ...prepared,
    core: {
      ...shell,
      ChatScreen,
    },
  };
}
