import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { BrandLockup } from './Brand';
import { ChatIcon, HistoryIcon, HomeIcon, PlusIcon, ProfileIcon } from './Icons';
import type { AppScreen } from '../types';

const navigation = [
  { id: 'workspace' as const, label: 'Главная', desktopLabel: 'ARVELIS AI', icon: <HomeIcon /> },
  { id: 'chat' as const, label: 'Чат', desktopLabel: 'Чат', icon: <ChatIcon /> },
  { id: 'history' as const, label: 'История', desktopLabel: 'История', icon: <HistoryIcon /> },
  { id: 'profile' as const, label: 'Профиль', desktopLabel: 'Профиль', icon: <ProfileIcon /> },
];

function isNavigationItemActive(screen: AppScreen, itemId: (typeof navigation)[number]['id']): boolean {
  return screen === itemId || (screen === 'states' && itemId === 'profile');
}

export function AppLayout({
  screen,
  onNavigate,
  onNewChat,
  online,
  persistenceAvailable,
  children,
}: {
  screen: AppScreen;
  onNavigate: (screen: AppScreen) => void;
  onNewChat: () => void;
  online: boolean;
  persistenceAvailable: boolean;
  children: ReactNode;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const statusBannersRef = useRef<HTMLDivElement>(null);
  const shellClassName = screen === 'chat' ? 'app-shell app-shell--chat' : 'app-shell';

  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const syncStatusBannerHeight = () => {
      const height = statusBannersRef.current?.getBoundingClientRect().height ?? 0;
      shell.style.setProperty('--status-banners-height', `${Math.ceil(height)}px`);
    };

    syncStatusBannerHeight();

    const banners = statusBannersRef.current;
    const observer = banners && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(syncStatusBannerHeight)
      : null;
    observer?.observe(banners as Element);
    window.addEventListener('resize', syncStatusBannerHeight);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', syncStatusBannerHeight);
      shell.style.removeProperty('--status-banners-height');
    };
  }, [online, persistenceAvailable]);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const visualViewport = window.visualViewport;
    let frame: number | null = null;
    let orientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
    let layoutViewportHeight = Math.max(
      window.innerHeight,
      document.documentElement.clientHeight,
      visualViewport ? visualViewport.offsetTop + visualViewport.height : 0,
    );

    const syncVisualViewport = () => {
      frame = null;
      const viewport = window.visualViewport;
      const nextOrientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
      const currentLayoutHeight = Math.max(
        window.innerHeight,
        document.documentElement.clientHeight,
        viewport ? viewport.offsetTop + viewport.height : 0,
      );

      if (nextOrientation !== orientation) {
        orientation = nextOrientation;
        layoutViewportHeight = currentLayoutHeight;
      } else {
        layoutViewportHeight = Math.max(layoutViewportHeight, currentLayoutHeight);
      }

      const bottomInset = viewport
        ? Math.max(0, layoutViewportHeight - (viewport.offsetTop + viewport.height))
        : 0;

      shell.style.setProperty('--visual-viewport-bottom-inset', `${Math.ceil(bottomInset)}px`);
      shell.style.setProperty('--visual-viewport-height', `${Math.ceil(viewport?.height ?? currentLayoutHeight)}px`);
    };

    const scheduleVisualViewportSync = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(syncVisualViewport);
    };

    syncVisualViewport();
    visualViewport?.addEventListener('resize', scheduleVisualViewportSync);
    visualViewport?.addEventListener('scroll', scheduleVisualViewportSync);
    window.addEventListener('resize', scheduleVisualViewportSync);
    window.addEventListener('orientationchange', scheduleVisualViewportSync);

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      visualViewport?.removeEventListener('resize', scheduleVisualViewportSync);
      visualViewport?.removeEventListener('scroll', scheduleVisualViewportSync);
      window.removeEventListener('resize', scheduleVisualViewportSync);
      window.removeEventListener('orientationchange', scheduleVisualViewportSync);
      shell.style.removeProperty('--visual-viewport-bottom-inset');
      shell.style.removeProperty('--visual-viewport-height');
    };
  }, []);

  useLayoutEffect(() => {
    if (screen !== 'chat') return;

    let firstFrame = 0;
    let secondFrame = 0;

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        const maxScroll = Math.max(0, document.documentElement.scrollHeight - viewportHeight);

        // SPA navigation keeps the previous document scroll position. For a short
        // chat this can leave the first message underneath the sticky header after
        // History -> Chat. Long threads retain ChatScreen's own latest-message scroll.
        if (maxScroll <= 280) {
          window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        }
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [screen]);

  return (
    <div ref={shellRef} className={shellClassName}>
      <aside className="sidebar">
        <div className="sidebar__top">
          <BrandLockup compact />
          <button className="new-chat" type="button" onClick={onNewChat}><PlusIcon />Новый диалог</button>
          <nav className="sidebar__nav" aria-label="Основная навигация">
            {navigation.map((item) => {
              const active = isNavigationItemActive(screen, item.id);
              return (
                <button
                  type="button"
                  key={item.id}
                  className={active ? 'nav-item nav-item--active' : 'nav-item'}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onNavigate(item.id)}
                >
                  {item.icon}<span>{item.desktopLabel}</span>
                </button>
              );
            })}
          </nav>
        </div>
        <div className="sidebar__status">
          <span className={online ? 'status-dot status-dot--online' : 'status-dot status-dot--offline'} />
          <div><strong>{online ? 'Сеть доступна' : 'Нет соединения'}</strong><span>Тестовая версия · локальный режим</span></div>
        </div>
      </aside>

      <div className="app-main">
        {(!online || !persistenceAvailable) ? (
          <div ref={statusBannersRef} className="status-banners" aria-live="polite">
            {!online ? <div className="offline-banner" role="status">Соединение отсутствует. Локальный интерфейс продолжает работать.</div> : null}
            {!persistenceAvailable ? <div className="storage-banner" role="status">Локальное сохранение недоступно. Текущие изменения могут исчезнуть после перезагрузки.</div> : null}
          </div>
        ) : null}
        {children}
      </div>

      <nav className="mobile-nav" aria-label="Мобильная навигация">
        {navigation.map((item) => {
          const active = isNavigationItemActive(screen, item.id);
          return (
            <button
              type="button"
              key={item.id}
              className={active ? 'mobile-nav__item mobile-nav__item--active' : 'mobile-nav__item'}
              aria-current={active ? 'page' : undefined}
              onClick={() => onNavigate(item.id)}
            >
              {item.icon}<span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
