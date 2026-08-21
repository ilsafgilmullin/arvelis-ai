import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { AuthResourceStatus, AuthSession, AuthSessionSummary } from './auth/contracts';
import { realAuthGateway } from './auth/httpTransport';
import {
  DEFAULT_PREVIEW_PROFILE_NAME,
  isDefaultPreviewProfileName,
  normalizePreviewProfileName,
  validatePreviewProfileName,
} from './auth/previewProfile';
import { AppBootScreen } from './components/AppBootScreen';
import { normalizeChatMessage, normalizeThreadTitle } from './domain/chatPolicy';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import {
  loadHistoryModule,
  loadProfileModule,
  loadStatesModule,
  preloadSecondaryAppModules,
} from './lib/appModules';
import {
  APP_LOAD_TASKS,
  prepareApp,
  type AppLoadProgress,
  type PreparedCoreModules,
} from './lib/appPreload';
import {
  chatDraftKey,
  clearChatDrafts,
  removeChatDraft,
  setChatDraftAccountScope,
} from './lib/chatDraftStorage';
import {
  DEMO_MAX_MESSAGES_PER_THREAD,
  DEMO_MAX_THREADS,
  DEMO_PREVIEW_NOTICE,
  loadDemoWorkspace,
  resetDemoWorkspace,
  saveDemoWorkspace,
} from './lib/demoStorage';
import { AuthScreen } from './screens/AuthScreen';
import { RealAuthScreen } from './screens/RealAuthScreen';
import { WelcomeScreen } from './screens/WelcomeScreen';
import type { AppScreen, DemoMessage, DemoThread, DemoWorkspaceState, EntryScreen } from './types';

const HistoryScreen = lazy(() => loadHistoryModule().then((module) => ({ default: module.HistoryScreen })));
const ProfileScreen = lazy(() => loadProfileModule().then((module) => ({ default: module.ProfileScreen })));
const StatesScreen = lazy(() => loadStatesModule().then((module) => ({ default: module.StatesScreen })));
const REAL_AUTH_ENABLED = import.meta.env.VITE_REAL_AUTH_ENABLED === 'true';

const INITIAL_LOAD_PROGRESS: AppLoadProgress = {
  completed: 0,
  total: APP_LOAD_TASKS.length,
  label: 'Подготавливаем ARVELIS AI',
  completedTasks: [],
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
    content: DEMO_PREVIEW_NOTICE,
  };
}

export default function App() {
  const [entry, setEntry] = useState<EntryScreen>('splash');
  const [screen, setScreen] = useState<AppScreen>('chat');
  const [workspace, setWorkspace] = useState<DemoWorkspaceState | null>(null);
  const [core, setCore] = useState<PreparedCoreModules | null>(null);
  const [persistenceAvailable, setPersistenceAvailable] = useState(true);
  const [loadProgress, setLoadProgress] = useState<AppLoadProgress>(INITIAL_LOAD_PROGRESS);
  const [loadError, setLoadError] = useState(false);
  const [pendingProfileName, setPendingProfileName] = useState<string | undefined>();
  const [realSession, setRealSession] = useState<AuthSession | null>(null);
  const [sessions, setSessions] = useState<AuthSessionSummary[]>([]);
  const [sessionsStatus, setSessionsStatus] = useState<AuthResourceStatus>('idle');
  const [signOutPending, setSignOutPending] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const launchSequenceRef = useRef(0);
  const storageScopeRef = useRef<string | undefined>();
  const online = useOnlineStatus();

  useEffect(() => {
    if (!workspace) return;
    setPersistenceAvailable(saveDemoWorkspace(workspace, storageScopeRef.current));
  }, [workspace]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [entry, screen]);

  useEffect(() => {
    if (!REAL_AUTH_ENABLED || entry !== 'app' || screen !== 'profile' || !realSession) return;

    let active = true;
    setSessionsStatus('loading');
    void realAuthGateway.listSessions().then((nextSessions) => {
      if (!active) return;
      setSessions(nextSessions);
      setSessionsStatus('ready');
    }).catch(() => {
      if (!active) return;
      setSessions([]);
      setSessionsStatus('error');
    });

    return () => {
      active = false;
    };
  }, [entry, realSession, screen]);

  const activeThread = useMemo(
    () => workspace?.threads.find((thread) => thread.id === workspace.activeThreadId) ?? null,
    [workspace],
  );

  const threadLimitReached = (workspace?.threads.length ?? 0) >= DEMO_MAX_THREADS;
  const messageLimitReached = Boolean(activeThread && activeThread.messages.length >= DEMO_MAX_MESSAGES_PER_THREAD);

  const launchApp = async (profileName?: string, accountScopeId?: string) => {
    if (profileName !== undefined && validatePreviewProfileName(profileName) !== null) {
      setPendingProfileName(undefined);
      setLoadError(false);
      setEntry('auth');
      return;
    }

    if (!setChatDraftAccountScope(accountScopeId)) {
      setLoadError(true);
      setEntry('auth');
      return;
    }
    storageScopeRef.current = accountScopeId;

    const launchSequence = ++launchSequenceRef.current;
    const normalizedName = profileName === undefined ? undefined : normalizePreviewProfileName(profileName);
    setPendingProfileName(normalizedName);
    setLoadProgress(INITIAL_LOAD_PROGRESS);
    setLoadError(false);
    setCore(null);
    setEntry('boot');

    await waitForBootPaint();
    if (launchSequence !== launchSequenceRef.current) return;

    try {
      const prepared = await prepareApp((progress) => {
        if (launchSequence === launchSequenceRef.current) {
          setLoadProgress(progress);
        }
      }, {
        ...(accountScopeId === undefined ? {} : { accountScopeId }),
        ...(normalizedName === undefined ? {} : { profileName: normalizedName }),
      });
      if (launchSequence !== launchSequenceRef.current) return;

      const namedWorkspace = normalizedName
        ? { ...prepared.workspace, profileName: normalizedName }
        : prepared.workspace;
      const nextWorkspace = { ...namedWorkspace, activeThreadId: null };

      if (!normalizedName && !isDefaultPreviewProfileName(nextWorkspace.profileName)) {
        setPendingProfileName(nextWorkspace.profileName);
      }

      await waitForBootPaint();
      if (launchSequence !== launchSequenceRef.current) return;

      setCore(prepared.core);
      setWorkspace(nextWorkspace);
      setPersistenceAvailable(prepared.persistenceAvailable);
      setScreen('chat');
      setEntry('app');
      preloadSecondaryAppModules();
    } catch {
      if (launchSequence === launchSequenceRef.current) {
        setLoadError(true);
      }
    }
  };

  const openAuth = () => {
    if (REAL_AUTH_ENABLED) {
      storageScopeRef.current = undefined;
      setChatDraftAccountScope(undefined);
      setPendingProfileName(undefined);
      setEntry('auth');
      return;
    }

    const storedProfileName = loadDemoWorkspace().profileName;
    setPendingProfileName(isDefaultPreviewProfileName(storedProfileName) ? undefined : storedProfileName);
    setEntry('auth');
  };

  const handleRealAuthenticated = (session: AuthSession) => {
    setRealSession(session);
    setSignOutError(false);
    void launchApp(session.account.displayName, session.account.id);
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
    const normalizedPrompt = normalizeChatMessage(prompt);
    if (!normalizedPrompt || threadLimitReached) return;

    const timestamp = Date.now();
    const thread: DemoThread = {
      id: makeId('thread'),
      title: titleFromPrompt(normalizedPrompt),
      createdAt: timestamp,
      updatedAt: timestamp,
      messages: [createUserMessage(normalizedPrompt), createSystemMessage()],
    };

    setWorkspace((current) => {
      if (!current || current.threads.length >= DEMO_MAX_THREADS) return current;
      return {
        ...current,
        activeThreadId: thread.id,
        threads: [thread, ...current.threads],
      };
    });
    setScreen('chat');
  };

  const sendMessage = (content: string) => {
    if (!workspace) return;
    const normalizedContent = normalizeChatMessage(content);
    if (!normalizedContent) return;

    if (!activeThread) {
      createThreadFromPrompt(normalizedContent);
      return;
    }
    if (activeThread.messages.length >= DEMO_MAX_MESSAGES_PER_THREAD) return;

    const userMessage = createUserMessage(normalizedContent);
    const timestamp = Date.now();

    setWorkspace((current) => current ? {
      ...current,
      threads: current.threads.map((thread) => {
        if (thread.id !== activeThread.id || thread.messages.length >= DEMO_MAX_MESSAGES_PER_THREAD) return thread;
        return {
          ...thread,
          updatedAt: timestamp,
          messages: [...thread.messages, userMessage],
        };
      }).sort((a, b) => b.updatedAt - a.updatedAt),
    } : current);
  };

  const editMessage = (threadId: string, messageId: string, content: string) => {
    const normalizedContent = normalizeChatMessage(content);
    if (!normalizedContent) return;

    const timestamp = Date.now();
    setWorkspace((current) => {
      if (!current) return current;

      const threads = current.threads.map((thread) => {
        if (thread.id !== threadId) return thread;

        let changed = false;
        const messages = thread.messages.map((message) => {
          if (message.id !== messageId || message.role !== 'user' || message.content === normalizedContent) return message;
          changed = true;
          return { ...message, content: normalizedContent, editedAt: timestamp };
        });

        return changed ? { ...thread, messages, updatedAt: timestamp } : thread;
      }).sort((a, b) => b.updatedAt - a.updatedAt);

      return { ...current, threads };
    });
  };

  const renameThread = (threadId: string, title: string) => {
    const normalizedTitle = normalizeThreadTitle(title);
    if (!normalizedTitle) return;

    setWorkspace((current) => current ? {
      ...current,
      threads: current.threads.map((thread) => thread.id === threadId && thread.title !== normalizedTitle
        ? { ...thread, title: normalizedTitle }
        : thread),
    } : current);
  };

  const deleteThread = (threadId: string) => {
    removeChatDraft(chatDraftKey(threadId));
    setWorkspace((current) => {
      if (!current) return current;
      const threads = current.threads.filter((thread) => thread.id !== threadId);
      return {
        ...current,
        threads,
        activeThreadId: current.activeThreadId === threadId ? null : current.activeThreadId,
      };
    });
  };

  const saveProfileName = (profileName: string) => {
    if (REAL_AUTH_ENABLED || validatePreviewProfileName(profileName) !== null) return;
    const normalizedName = normalizePreviewProfileName(profileName);
    setWorkspace((current) => current ? { ...current, profileName: normalizedName } : current);
  };

  const signOutPreview = () => {
    ++launchSequenceRef.current;
    const profileName = workspace?.profileName;
    setPendingProfileName(profileName && !isDefaultPreviewProfileName(profileName) ? profileName : undefined);
    setLoadError(false);
    setScreen('chat');
    setEntry('auth');
  };

  const signOutReal = async () => {
    if (!realSession || signOutPending) return;
    setSignOutPending(true);
    setSignOutError(false);
    try {
      await realAuthGateway.signOut();
      ++launchSequenceRef.current;
      setWorkspace(null);
      setCore(null);
      setRealSession(null);
      setSessions([]);
      setSessionsStatus('idle');
      storageScopeRef.current = undefined;
      setChatDraftAccountScope(undefined);
      setPendingProfileName(undefined);
      setLoadError(false);
      setScreen('chat');
      setEntry('auth');
    } catch {
      setSignOutError(true);
    } finally {
      setSignOutPending(false);
    }
  };

  const refreshRealSessions = async () => {
    if (!realSession) return;
    setSessionsStatus('loading');
    try {
      const nextSessions = await realAuthGateway.listSessions();
      setSessions(nextSessions);
      setSessionsStatus('ready');
    } catch {
      setSessions([]);
      setSessionsStatus('error');
    }
  };

  const revokeRealSession = async (sessionId: string) => {
    if (!realSession) return;
    try {
      await realAuthGateway.revokeSession(sessionId);
      await refreshRealSessions();
    } catch {
      setSessionsStatus('error');
    }
  };

  const resetLocalData = () => {
    ++launchSequenceRef.current;
    clearChatDrafts();

    if (REAL_AUTH_ENABLED && realSession) {
      const next = resetDemoWorkspace(realSession.account.id, realSession.account.displayName);
      setWorkspace(next);
      setPersistenceAvailable(saveDemoWorkspace(next, realSession.account.id));
      setLoadError(false);
      setScreen('chat');
      return;
    }

    const next = resetDemoWorkspace();
    setWorkspace(next);
    setPersistenceAvailable(saveDemoWorkspace(next));
    setPendingProfileName(undefined);
    setLoadError(false);
    setScreen('chat');
    setEntry('auth');
  };

  if (entry === 'splash') {
    return <WelcomeScreen onComplete={openAuth} />;
  }

  if (entry === 'auth') {
    if (REAL_AUTH_ENABLED) {
      return <RealAuthScreen onAuthenticated={handleRealAuthenticated} />;
    }

    return (
      <AuthScreen
        initialName={pendingProfileName ?? workspace?.profileName ?? DEFAULT_PREVIEW_PROFILE_NAME}
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
        onRetry={() => { void launchApp(pendingProfileName, realSession?.account.id); }}
      />
    );
  }

  if (!workspace || !core) {
    return <AppBootScreen error onRetry={() => { void launchApp(pendingProfileName, realSession?.account.id); }} />;
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
      {screen === 'workspace' ? (
        <WorkspaceScreen
          profileName={workspace.profileName}
          threads={workspace.threads}
          threadLimitReached={threadLimitReached}
          onNewChat={newChat}
          onOpenThread={openThread}
        />
      ) : null}
      {screen === 'chat' ? (
        <ChatScreen
          thread={activeThread}
          threadLimitReached={threadLimitReached}
          messageLimitReached={messageLimitReached}
          onNewChat={newChat}
          onSend={sendMessage}
          onEditMessage={editMessage}
          onRenameThread={renameThread}
          onDeleteThread={deleteThread}
        />
      ) : null}
      {screen === 'history' ? (
        <Suspense fallback={secondaryFallback}>
          <HistoryScreen threads={workspace.threads} onOpen={openThread} onDelete={deleteThread} />
        </Suspense>
      ) : null}
      {screen === 'profile' ? (
        <Suspense fallback={secondaryFallback}>
          <ProfileScreen
            profileName={workspace.profileName}
            persistenceAvailable={persistenceAvailable}
            authMode={REAL_AUTH_ENABLED ? 'server' : 'preview'}
            primaryEmail={realSession?.account.primaryEmail}
            sessions={sessions}
            sessionsStatus={sessionsStatus}
            signOutPending={signOutPending}
            signOutError={signOutError}
            onSaveName={saveProfileName}
            onRefreshSessions={REAL_AUTH_ENABLED ? () => { void refreshRealSessions(); } : undefined}
            onRevokeSession={REAL_AUTH_ENABLED ? (sessionId) => { void revokeRealSession(sessionId); } : undefined}
            onOpenStates={() => setScreen('states')}
            onSignOut={REAL_AUTH_ENABLED ? () => { void signOutReal(); } : signOutPreview}
            onReset={resetLocalData}
          />
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
