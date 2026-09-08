import { lazy, Suspense, useEffect, useState } from 'react';
import type { AuthResourceStatus, AuthSession, AuthSessionSummary } from './auth/contracts';
import { realAuthGateway } from './auth/httpTransport';
import {
  DEFAULT_PREVIEW_PROFILE_NAME,
  isDefaultPreviewProfileName,
  normalizePreviewProfileName,
  validatePreviewProfileName,
} from './auth/previewProfile';
import { AppBootScreen } from './components/AppBootScreen';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { loadProfileModule, loadStatesModule } from './lib/appModules';
import { canUseDemoStorage, loadDemoWorkspace, resetDemoWorkspace, saveDemoWorkspace } from './lib/demoStorage';
import { AuthScreen } from './screens/AuthScreen';
import { RealAuthScreen } from './screens/RealAuthScreen';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { TravelApp } from './travel/TravelApp';
import { clearBrowserTrips } from './travel/storage';
import type { EntryScreen } from './types';

const ProfileScreen = lazy(() => loadProfileModule().then((module) => ({ default: module.ProfileScreen })));
const StatesScreen = lazy(() => loadStatesModule().then((module) => ({ default: module.StatesScreen })));
const REAL_AUTH_ENABLED = import.meta.env.VITE_REAL_AUTH_ENABLED === 'true';

const waitForBootPaint = (): Promise<void> => new Promise((resolve) => {
  if (typeof window === 'undefined' || document.visibilityState !== 'visible') {
    resolve();
    return;
  }
  window.requestAnimationFrame(() => resolve());
});

export default function App() {
  const [entry, setEntry] = useState<EntryScreen>('splash');
  const [activeProfileName, setActiveProfileName] = useState(DEFAULT_PREVIEW_PROFILE_NAME);
  const [pendingProfileName, setPendingProfileName] = useState<string | undefined>();
  const [loadError, setLoadError] = useState(false);
  const [persistenceAvailable, setPersistenceAvailable] = useState(true);
  const [realSession, setRealSession] = useState<AuthSession | null>(null);
  const [sessions, setSessions] = useState<AuthSessionSummary[]>([]);
  const [sessionsStatus, setSessionsStatus] = useState<AuthResourceStatus>('idle');
  const [signOutPending, setSignOutPending] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const [dataRevision, setDataRevision] = useState(0);
  const online = useOnlineStatus();

  const ownerScopeId = realSession?.account.id ?? `preview:${activeProfileName.toLocaleLowerCase('ru-RU')}`;

  useEffect(() => {
    if (!REAL_AUTH_ENABLED || entry !== 'app' || !realSession) return;
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
    return () => { active = false; };
  }, [entry, realSession]);

  const launchApp = async (profileName?: string) => {
    if (profileName !== undefined && validatePreviewProfileName(profileName) !== null) {
      setPendingProfileName(undefined);
      setLoadError(false);
      setEntry('auth');
      return;
    }

    const normalizedName = profileName === undefined ? DEFAULT_PREVIEW_PROFILE_NAME : normalizePreviewProfileName(profileName);
    setPendingProfileName(normalizedName);
    setLoadError(false);
    setEntry('boot');

    try {
      await waitForBootPaint();
      setActiveProfileName(normalizedName);
      setPersistenceAvailable(canUseDemoStorage());
      setEntry('app');
      setPendingProfileName(undefined);
    } catch {
      setLoadError(true);
    }
  };

  const openAuth = () => {
    if (REAL_AUTH_ENABLED) {
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
    void launchApp(session.account.displayName);
  };

  const saveProfileName = (profileName: string) => {
    if (REAL_AUTH_ENABLED || validatePreviewProfileName(profileName) !== null) return;
    const normalizedName = normalizePreviewProfileName(profileName);
    const current = loadDemoWorkspace();
    const next = { ...current, profileName: normalizedName };
    setPersistenceAvailable(saveDemoWorkspace(next));
    setActiveProfileName(normalizedName);
  };

  const signOutPreview = () => {
    setPendingProfileName(activeProfileName && !isDefaultPreviewProfileName(activeProfileName) ? activeProfileName : undefined);
    setLoadError(false);
    setEntry('auth');
  };

  const signOutReal = async () => {
    if (!realSession || signOutPending) return;
    setSignOutPending(true);
    setSignOutError(false);
    try {
      await realAuthGateway.signOut();
      setRealSession(null);
      setSessions([]);
      setSessionsStatus('idle');
      setPendingProfileName(undefined);
      setLoadError(false);
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
      setSessions(await realAuthGateway.listSessions());
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
    clearBrowserTrips(ownerScopeId);
    if (REAL_AUTH_ENABLED && realSession) {
      const next = resetDemoWorkspace(realSession.account.id, realSession.account.displayName);
      setPersistenceAvailable(saveDemoWorkspace(next, realSession.account.id));
      setDataRevision((value) => value + 1);
      return;
    }
    const next = resetDemoWorkspace();
    setPersistenceAvailable(saveDemoWorkspace(next));
    setActiveProfileName(DEFAULT_PREVIEW_PROFILE_NAME);
    setPendingProfileName(undefined);
    setDataRevision((value) => value + 1);
    setEntry('auth');
  };

  if (entry === 'splash') return <WelcomeScreen onComplete={openAuth} />;

  if (entry === 'auth') {
    if (REAL_AUTH_ENABLED) return <RealAuthScreen onAuthenticated={handleRealAuthenticated} />;
    return <AuthScreen initialName={pendingProfileName ?? activeProfileName} onContinue={(name) => { void launchApp(name); }} />;
  }

  if (entry === 'boot') {
    return <AppBootScreen progress={{ completed: loadError ? 0 : 1, total: 1, label: loadError ? 'Не удалось подготовить Travel workspace' : 'Подготавливаем Travel workspace', completedTasks: [] }} profileName={pendingProfileName} error={loadError} onRetry={() => { void launchApp(pendingProfileName); }} />;
  }

  const fallback = <section className="module-loading" role="status" aria-live="polite"><span className="module-loading__pulse" aria-hidden="true" /><div><strong>Открываем раздел</strong><p>Подгружаем интерфейс в фоне.</p></div></section>;

  return (
    <TravelApp
      ownerScopeId={ownerScopeId}
      profileName={activeProfileName}
      online={online}
      dataRevision={dataRevision}
      renderProfile={(openStates) => (
        <Suspense fallback={fallback}>
          <ProfileScreen
            profileName={activeProfileName}
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
            onOpenStates={openStates}
            onSignOut={REAL_AUTH_ENABLED ? () => { void signOutReal(); } : signOutPreview}
            onReset={resetLocalData}
          />
        </Suspense>
      )}
      renderStates={() => <Suspense fallback={fallback}><StatesScreen /></Suspense>}
    />
  );
}
