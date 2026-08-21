import { isDefaultPreviewProfileName, normalizePreviewProfileName } from '../auth/previewProfile';
import { BrandMark } from '../components/Brand';
import { ArrowIcon, ChatIcon } from '../components/Icons';
import { Topbar } from '../components/Topbar';
import {
  conversationMessageCount,
  conversationMessageCountLabel,
  conversationRelativeTime,
} from '../domain/chatPresentation';
import type { DemoThread } from '../types';

const productDirections = [
  {
    index: '01',
    title: 'Работа',
    copy: 'Разбирать задачи, ограничения и варианты решения в понятной профессиональной структуре.',
  },
  {
    index: '02',
    title: 'Учёба',
    copy: 'Помогать выстраивать сложный материал последовательно и сохранять контекст разбора в одном диалоге.',
  },
  {
    index: '03',
    title: 'Сложные задачи',
    copy: 'Превращать неструктурированный запрос в более точный, ясный и практически применимый результат.',
  },
] as const;

function greetingFor(profileName: string): string {
  const hour = new Date().getHours();
  const greeting = hour < 6 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  const normalized = normalizePreviewProfileName(profileName);
  if (!normalized || isDefaultPreviewProfileName(normalized)) return greeting;
  const firstName = normalized.split(/\s+/)[0] ?? normalized;
  return `${greeting}, ${firstName}`;
}

export function WorkspaceScreen({
  profileName,
  threads,
  threadLimitReached,
  onNewChat,
  onOpenThread,
}: {
  profileName: string;
  threads: DemoThread[];
  threadLimitReached: boolean;
  onNewChat: () => void;
  onOpenThread: (threadId: string) => void;
}) {
  const recentThreads = threads.slice(0, 3);

  return (
    <div className="content-page home-v3">
      <Topbar title="Главная" subtitle={`${greetingFor(profileName)}.`} />

      <section className="home-v3__hero" aria-labelledby="home-primary-title">
        <div className="home-v3__hero-copy">
          <p className="section-kicker">ARVELIS AI</p>
          <h2 id="home-primary-title">Профессиональный ассистент вокруг вашей задачи.</h2>
          <p>
            ARVELIS AI создаётся для работы, учёбы и решения сложных повседневных задач — с понятным диалогом, историей и контролем данных.
          </p>
          <div className="home-v3__hero-actions">
            <button
              className="button button--primary home-v3__primary"
              type="button"
              onClick={onNewChat}
              disabled={threadLimitReached}
            >
              <ChatIcon />Новый чат
            </button>
          </div>
          {threadLimitReached ? (
            <p className="home-v3__limit" role="status">
              Достигнут локальный лимит диалогов. Удалите ненужный диалог в Истории, чтобы начать новый.
            </p>
          ) : null}
        </div>

        <aside className="home-v3__preview" aria-label="Статус текущей версии">
          <div className="home-v3__preview-brand" aria-hidden="true">
            <BrandMark size="default" />
          </div>
          <div className="home-v3__preview-copy">
            <div className="home-v3__preview-heading">
              <span className="home-v3__preview-dot" aria-hidden="true" />
              <strong>PRODUCT PREVIEW</strong>
            </div>
            <p>Сейчас работает интерфейс и локальная история. Реальная авторизация, серверное хранение и AI ещё не подключены.</p>
          </div>
          <dl className="home-v3__preview-facts">
            <div><dt>Данные</dt><dd>Локально</dd></div>
            <div><dt>AI</dt><dd>Не подключён</dd></div>
          </dl>
        </aside>
      </section>

      <section className="home-v3__recent" aria-labelledby="home-recent-title">
        <div className="home-v3__section-heading">
          <div>
            <p className="section-kicker">ПРОДОЛЖИТЬ</p>
            <h2 id="home-recent-title">Недавние диалоги</h2>
          </div>
          <span>{threads.length}</span>
        </div>

        {recentThreads.length ? (
          <div className="home-v3__recent-list">
            {recentThreads.map((thread) => {
              const conversationCount = conversationMessageCount(thread);
              return (
                <button className="home-v3__recent-row" type="button" key={thread.id} onClick={() => onOpenThread(thread.id)}>
                  <div>
                    <strong>{thread.title}</strong>
                    <span>{conversationMessageCountLabel(conversationCount)} · {conversationRelativeTime(thread.updatedAt)}</span>
                  </div>
                  <ArrowIcon />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="home-v3__empty">
            <strong>Здесь появятся ваши недавние диалоги</strong>
            <p>Начните новый чат — после этого к разговору можно будет быстро вернуться с Главной.</p>
          </div>
        )}
      </section>

      <section className="home-v3__directions" aria-labelledby="home-directions-title">
        <div className="home-v3__section-heading">
          <div>
            <p className="section-kicker">НАПРАВЛЕНИЯ</p>
            <h2 id="home-directions-title">Для чего создаётся ARVELIS AI</h2>
          </div>
        </div>
        <div className="home-v3__direction-grid">
          {productDirections.map((direction) => (
            <article className="home-v3__direction" key={direction.index}>
              <span>{direction.index}</span>
              <h3>{direction.title}</h3>
              <p>{direction.copy}</p>
            </article>
          ))}
        </div>
        <p className="home-v3__direction-note">
          Это продуктовые направления, а не обещание уже работающих AI-функций в текущем preview.
        </p>
      </section>

      <section className="home-v3__info" aria-labelledby="home-info-title">
        <div className="home-v3__section-heading">
          <div>
            <p className="section-kicker">О ПРОЕКТЕ</p>
            <h2 id="home-info-title">Полезная информация</h2>
          </div>
        </div>
        <div className="home-v3__info-grid">
          <article>
            <span>КАК ПОЛЬЗОВАТЬСЯ</span>
            <h3>Один диалог — один контекст задачи.</h3>
            <p>Начните новый чат, сформулируйте задачу обычными словами и продолжайте уточнять её в том же разговоре. Диалог останется в локальной Истории.</p>
          </article>
          <article>
            <span>КОНФИДЕНЦИАЛЬНОСТЬ</span>
            <h3>Текущие данные остаются на этом устройстве.</h3>
            <p>В preview нет production-базы и реального AI. Не вводите пароли, секреты и чувствительные персональные данные до подключения защищённой серверной инфраструктуры.</p>
          </article>
        </div>
      </section>
    </div>
  );
}
