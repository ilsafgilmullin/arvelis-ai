import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from './components/AppLayout';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { loadDemoWorkspace, resetDemoWorkspace, saveDemoWorkspace } from './lib/demoStorage';
import { AuthScreen } from './screens/AuthScreen';
import { ChatScreen } from './screens/ChatScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { StatesScreen } from './screens/StatesScreen';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { WorkspaceScreen } from './screens/WorkspaceScreen';
import type { AppScreen, DemoMessage, DemoThread, DemoWorkspaceState, EntryScreen } from './types';

const makeId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

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
    content: 'Запрос сохранён локально для тестирования интерфейса. Реальный AI пока не подключён, поэтому ответ модели не генерируется.',
  };
}

export default function App() {
  const [entry, setEntry] = useState<EntryScreen>('welcome');
  const [screen, setScreen] = useState<AppScreen>('workspace');
  const [workspace, setWorkspace] = useState<DemoWorkspaceState>(() => loadDemoWorkspace());
  const online = useOnlineStatus();

  useEffect(() => {
    saveDemoWorkspace(workspace);
  }, [workspace]);

  const activeThread = useMemo(
    () => workspace.threads.find((thread) => thread.id === workspace.activeThreadId) ?? null,
    [workspace.activeThreadId, workspace.threads],
  );

  const openThread = (threadId: string) => {
    setWorkspace((current) => ({ ...current, activeThreadId: threadId }));
    setScreen('chat');
  };

  const newChat = () => {
    setWorkspace((current) => ({ ...current, activeThreadId: null }));
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

    setWorkspace((current) => ({ ...current, activeThreadId: thread.id, threads: [thread, ...current.threads] }));
    setScreen('chat');
  };

  const sendMessage = (content: string) => {
    if (!activeThread) {
      createThreadFromPrompt(content);
      return;
    }

    const userMessage = createUserMessage(content);
    const systemMessage = createSystemMessage();
    const timestamp = Date.now();

    setWorkspace((current) => ({
      ...current,
      threads: current.threads.map((thread) => thread.id === activeThread.id ? {
        ...thread,
        updatedAt: timestamp,
        messages: [...thread.messages, userMessage, systemMessage],
      } : thread).sort((a, b) => b.updatedAt - a.updatedAt),
    }));
  };

  const deleteThread = (threadId: string) => {
    setWorkspace((current) => {
      const threads = current.threads.filter((thread) => thread.id !== threadId);
      return { ...current, threads, activeThreadId: current.activeThreadId === threadId ? threads[0]?.id ?? null : current.activeThreadId };
    });
  };

  const saveProfileName = (profileName: string) => setWorkspace((current) => ({ ...current, profileName }));

  const resetDemo = () => {
    const next = resetDemoWorkspace();
    setWorkspace(next);
    setScreen('workspace');
  };

  if (entry === 'welcome') {
    return <WelcomeScreen onDemo={() => setEntry('app')} onAuth={() => setEntry('auth')} />;
  }

  if (entry === 'auth') {
    return <AuthScreen initialName={workspace.profileName} onBack={() => setEntry('welcome')} onContinue={(name) => { saveProfileName(name); setEntry('app'); }} />;
  }

  return (
    <AppLayout screen={screen} onNavigate={setScreen} onNewChat={newChat} online={online}>
      {screen === 'workspace' ? <WorkspaceScreen profileName={workspace.profileName} threads={workspace.threads} onSubmit={createThreadFromPrompt} onOpenThread={openThread} /> : null}
      {screen === 'chat' ? <ChatScreen thread={activeThread} onNewChat={newChat} onSend={sendMessage} /> : null}
      {screen === 'history' ? <HistoryScreen threads={workspace.threads} onOpen={openThread} onDelete={deleteThread} /> : null}
      {screen === 'profile' ? <ProfileScreen profileName={workspace.profileName} onSaveName={saveProfileName} onOpenStates={() => setScreen('states')} onReset={resetDemo} /> : null}
      {screen === 'states' ? <StatesScreen /> : null}
    </AppLayout>
  );
}
