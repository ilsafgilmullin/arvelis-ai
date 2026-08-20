import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { AppBootScreen } from './components/AppBootScreen';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import {
  loadHistoryModule,
  loadProfileModule,
  loadStatesModule,
  preloadSecondaryAppModules,
} from './lib/appModules';
import {
  prepareApp,
  type AppLoadProgress,
  type PreparedCoreModules,
} from './lib/appPreload';
import {
  canUseDemoStorage,
  resetDemoWorkspace,
  saveDemoWorkspace,
} from './lib/demoStorage';
import { AuthScreen } from './screens/AuthScreen';
import { WelcomeScreen } from './screens/WelcomeScreen';
import type { AppScreen, DemoMessage, DemoThread, DemoWorkspaceState, EntryScreen } from './types';

const HistoryScreen = lazy(() => loadHistoryModule().then((module) => ({ default: module.HistoryScreen })));
const ProfileScreen = lazy(() => loadProfileModule().then((module) => ({ default: module.ProfileScreen })));
const StatesScreen = lazy(() => loadStatesModule().then((module) => ({ default: module.StatesScreen })));

const INITIAL_LOAD_PROGRESS: AppLoadProgress = {
  completed: 0,
  total: 3,
  label: 'Подготавливаем ARVELIS AI',
};

const makeId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function waitForBootPaint(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined' || document.visibilityState !== 'visible') {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function titleFromPrompt(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Новый диалог';
  return normalized.length > 52 ? `${normalized.slice(0, 49)}…` : normalized;
}

function createUserMessage(content: string): DemoMessage {
  return { id: makeId('msg'), role: 'user', content, createdAt: Date.now() };
}

function createSystemMessage(): DemoMessage {
  return {
    id: makeId('sys'),
    role: 'system',
    createdAt: Date.now() + 1,
    content: 'Сохранено в локальном preview. AI пока не подключён.',
  };
}

export default function App() {
  const [entry, setEntry] = useState<EntryScreen>('welcome');
  const [screen, setScreen] = useState<AppScreen>('workspace');
  const [workspace, setWorkspace] = useState<DemoWorkspaceState | null>(null);
  const [core, setCore] = useState<PreparedCoreModules | null>(null);
  const [persistenceAvailable, setPersistenceAvailable] = useState(true);
  const [loadProgress, setLoadProgress] = useState<AppLoadProgress>(INITIAL_LOAD_PROGRESS);
  const [loadError, setLoadError] = useState(false);
  const [pendingProfileName, setPendingProfileName] = useState<string | undefined>();
  const online = useOnlineStatus();

  useEffect(() => {
    if (!workspace) return;
    setPersistenceAvailable(saveDemoWorkspace(workspace));
  }, [workspace]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [entry, screen]);

  const activeThread = useMemo(
    () => workspace?.threads.find((thread) => thread.id === workspace.activeThreadId) ?? null,
    [workspace],
  );

  const launchApp = async (profileName?: string) => {
    const normalizedName = profileName?.trim() || undefined;
    setPendingProfileName(normalizedName);
    setLoadProgress(INITIAL_LOAD_PROGRESS);
    setLoadError(false);
    setCore(null);
    setEntry('boot');

    await waitForBootPaint();

    try {
      const prepared = await prepareApp(setLoadProgress);
      const nextWorkspace = normalizedName
        ? { ...prepared.workspace, profileName: normalizedName }
        : prepared.workspace;

      setCore(prepared.core);
      setWorkspace(nextWorkspace);
      setPersistenceAvailable(prepared.persistenceAvailable);
      setScreen('workspace');
      setEntry('app');
      preloadSecondaryAppModules();
    } catch {
      setLoadError(true);
    }
  };

  const openThread = (threadId: string) => {
    setWorkspace((current) => current ? { ...current, activeThreadId: threadId } : current);
    setScreen('chat');
  };

  const newChat = () => {
    setWorkspace((current) => current ? { ...current, activeThreadId: null } : current);
    setScreen('chat');
  };

  const createThreadFromPrompt = (prompt: string) => {
    const timestamp = Date.now();
    const thread: DemoThread = {
      id: makeId('thread'),
      title: titleFromPrompt(prompt),
      createdAt: timestamp,
      updatedAt: timestamp,
      messages: [createUserMessage(prompt), createSystemMessage()],
    };

    setWorkspace((current) => current ? {
      ...current,
      activeThreadId: thread.id,
      threads: [thread, ...current.threads],
    } : current);
    setScreen('chat');
  };

  const sendMessage = (content: string) => {
    if (!workspace) return;
    if (!activeThread) {
      createThreadFromPrompt(content);
      return;
    }

    const userMessage = createUserMessage(content);
    const systemMessage = createSystemMessage();
    const timestamp = Date.now();

    setWorkspace((current) => current ? {
      ...current,
      threads: current.threads.map((thread) => thread.id === activeThread.id ? {
        ...thread,
        updatedAt: timestamp,
        messages: [...thread.messages, userMessage, systemMessage],
      } : thread).sort((a, b) => b.updatedAt - a.updatedAt),
    } : current);
  };

  const deleteThread = (threadId: string) => {
    setWorkspace((current) => {
      if (!current) return current;
      const threads = current.threads.filter((thread) => thread.id !== threadId);
      return { ...current, threads, activeThreadId: current.activeThreadId === threadId ? threads[0]?.id ?? null : current.activeThreadId };
    });
  };

  const saveProfileName = (profileName: string) => {
    setWorkspace((current) => current ? { ...current, profileName } : current);
  };

  const resetPreview = () => {
    const next = resetDemoWorkspace();
    setWorkspace(next);
    setPersistenceAvailable(canUseDemoStorage());
    setScreen('workspace');
  };

  if (entry === 'welcome') {
    return <WelcomeScreen onDemo={() => { void launchApp(); }} onAuth={() => setEntry('auth')} />;
  }

  if (entry === 'auth') {
    return (
      <AuthScreen
        initialName={workspace?.profileName ?? 'Пользователь ARVELIS'}
        onBack={() => setEntry('welcome')}
        onContinue={(name) => { void launchApp(name); }}
      />
    );
  }

  if (entry === 'boot') {
    return (
      <AppBootScreen
        progress={loadProgress}
        profileName={pendingProfileName}
        error={loadError}
        onRetry={() => { void launchApp(pendingProfileName); }}
      />
    );
  }

  if (!workspace || !core) {
    return <AppBootScreen error onRetry={() => { void launchApp(pendingProfileName); }} />;
  }

  const { AppLayout, WorkspaceScreen, ChatScreen } = core;
  const secondaryFallback = (
    <section className="module-loading" role="status" aria-live="polite">
      <span className="module-loading__pulse" aria-hidden="true" />
      <div>
        <strong>Открываем раздел</strong>
        <p>Подгружаем интерфейс в фоне.</p>
      </div>
    </section>
  );

  return (
    <AppLayout
      screen={screen}
      onNavigate={setScreen}
      onNewChat={newChat}
      online={online}
      persistenceAvailable={persistenceAvailable}
    >
      {screen === 'workspace' ? <WorkspaceScreen profileName={workspace.profileName} threads={workspace.threads} onSubmit={createThreadFromPrompt} onOpenThread={openThread} /> : null}
      {screen === 'chat' ? <ChatScreen thread={activeThread} onNewChat={newChat} onSend={sendMessage} /> : null}
      {screen === 'history' ? (
        <Suspense fallback={secondaryFallback}>
          <HistoryScreen threads={workspace.threads} onOpen={openThread} onDelete={deleteThread} />
        </Suspense>
      ) : null}
      {screen === 'profile' ? (
        <Suspense fallback={secondaryFallback}>
          <ProfileScreen profileName={workspace.profileName} onSaveName={saveProfileName} onOpenStates={() => setScreen('states')} onReset={resetPreview} />
        </Suspense>
      ) : null}
      {screen === 'states' ? (
        <Suspense fallback={secondaryFallback}>
          <StatesScreen />
        </Suspense>
      ) : null}
    </AppLayout>
  );
}
