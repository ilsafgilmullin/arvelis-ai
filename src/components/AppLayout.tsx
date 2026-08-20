import type { ReactNode } from 'react';
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
  return (
    <div className="app-shell">
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
          <div className="status-banners" aria-live="polite">
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
