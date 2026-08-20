import { BrandMark } from '../components/Brand';
import { ArrowIcon, ChatIcon } from '../components/Icons';
import { Topbar } from '../components/Topbar';
import {
  conversationMessageCount,
  conversationMessageCountLabel,
  conversationRelativeTime,
} from '../domain/chatPresentation';
import type { DemoThread } from '../types';

function greetingFor(profileName: string): string {
  const hour = new Date().getHours();
  const greeting = hour < 6 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  const normalized = profileName.trim();
  if (!normalized || normalized === 'Пользователь ARVELIS') return greeting;
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
  return (
    <div className="content-page home-v2">
      <Topbar title="Главная" subtitle={`${greetingFor(profileName)}. Здесь собрана основная информация об ARVELIS AI.`} />

      <section className="home-v2__hero">
        <div className="home-v2__hero-mark" aria-hidden="true"><BrandMark size="default" /></div>
        <div className="home-v2__hero-copy">
          <p className="section-kicker">ARVELIS AI</p>
          <h2>Интеллект вокруг вашей задачи.</h2>
          <p>
            ARVELIS AI создаётся как профессиональный универсальный ассистент для работы, учёбы и сложных повседневных задач — с понятным интерфейсом, контролем данных и модульной архитектурой.
          </p>
          <button className="button button--primary home-v2__primary" type="button" onClick={onNewChat} disabled={threadLimitReached}>
            <ChatIcon />Новый чат
          </button>
          {threadLimitReached ? <span className="home-v2__limit">Локальный preview достиг лимита диалогов. Удалите ненужный диалог в истории.</span> : null}
        </div>
      </section>

      <section className="home-v2__grid" aria-label="О проекте ARVELIS AI">
        <article className="home-v2__card home-v2__card--wide">
          <span className="home-v2__card-index">01</span>
          <p className="section-kicker">О ПРОЕКТЕ</p>
          <h3>Профессиональный ассистент, а не очередной безликий чат.</h3>
          <p>Продукт проектируется mobile-first: быстрый запуск, спокойный премиальный интерфейс, история диалогов, профиль и понятные системные состояния.</p>
        </article>
        <article className="home-v2__card">
          <span className="home-v2__card-index">02</span>
          <p className="section-kicker">КАК ПОЛЬЗОВАТЬСЯ</p>
          <h3>Начните с обычной формулировки.</h3>
          <p>Откройте «Чат», опишите цель или вопрос своими словами, затем уточняйте задачу в одном диалоге.</p>
        </article>
        <article className="home-v2__card">
          <span className="home-v2__card-index">03</span>
          <p className="section-kicker">КОНФИДЕНЦИАЛЬНОСТЬ</p>
          <h3>Сейчас данные остаются локально.</h3>
          <p>В этой версии нет серверного аккаунта, AI-провайдера или production-хранилища. Не вводите секреты и чувствительные данные.</p>
        </article>
        <article className="home-v2__card home-v2__card--status">
          <div className="home-v2__status-line"><span className="home-v2__status-dot" /><strong>PRODUCT PREVIEW</strong></div>
          <p className="section-kicker">СТАТУС</p>
          <h3>Интерфейс строится до подключения модели.</h3>
          <p>Авторизация, backend, production database и реальный AI пока не подключены. Это намеренный этап разработки.</p>
        </article>
      </section>

      <section className="home-v2__recent">
        <div className="section-heading section-heading--inline">
          <div><p className="section-kicker">БЫСТРЫЙ ДОСТУП</p><h2>Недавние диалоги</h2></div>
          <span>{threads.length}</span>
        </div>
        {threads.length ? (
          <div className="history-list">
            {threads.slice(0, 3).map((thread) => {
              const conversationCount = conversationMessageCount(thread);
              return (
                <button className="history-row" type="button" key={thread.id} onClick={() => onOpenThread(thread.id)}>
                  <div>
                    <strong>{thread.title}</strong>
                    <span>{conversationMessageCountLabel(conversationCount)} · {conversationRelativeTime(thread.updatedAt)}</span>
                  </div>
                  <ArrowIcon />
                </button>
              );
            })}
          </div>
        ) : <div className="empty-inline">Диалогов пока нет. Новый разговор можно начать во вкладке «Чат».</div>}
      </section>
    </div>
  );
}
