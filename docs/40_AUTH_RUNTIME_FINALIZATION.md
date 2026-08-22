# ARVELIS AI — Auth Runtime Finalization

Дата: 2026-08-22.
Ветка: `feat/auth-runtime-finalization`.

## Цель

Закрыть разрыв между уже проверенным Email OTP backend и обычным Replit Run. После этой доработки development/closed-test запуск должен открывать настоящий Email OTP auth, а не локальный preview-auth.

## Утверждённая граница

- Replit Run используется как development/closed-test runtime.
- Production/public registration этим изменением не включается.
- `npm run dev` остаётся frontend preview без Auth API.
- `npm run dev:auth:closed-test` сначала проверяет closed-test auth configuration, затем запускает Auth API и Vite.
- Real-auth rollout включается только в окружении Vite child-process через явный launcher flag.
- `VITE_REAL_AUTH_ENABLED` не должен храниться глобально как `true` в Replit Secrets/Configurations.
- `NODE_ENV=production` запрещает closed-test launcher.

## Защита секретов

Frontend child-process не получает server-only environment variables:

- `AUTH_*`;
- `SMTP_*`;
- `DATABASE_URL`;
- `SESSION_SECRET`.

Vite получает только scoped `VITE_REAL_AUTH_ENABLED=true` для закрытого тестового запуска. Серверные секреты остаются только в Auth API process environment.

## Поведение пользователя

1. При открытии real-auth UI сначала проверяется существующая HttpOnly server session.
2. Пока restore выполняется, форма входа/регистрации не показывается, чтобы исключить визуальный flash ложного signed-out state.
3. Если сессия действительна, приложение продолжает работу без нового OTP.
4. Если сессии нет, показывается настоящий экран `Вход / Регистрация`.
5. При регистрации OTP отправляется на email, введённый пользователем.
6. После подтверждения создаются Account + server Session; closed-test persistence — SQLite.

## Safari / переключение в Почту во время OTP

На iPhone Safari может выгрузить вкладку из памяти, пока пользователь открывает приложение Почты, а при возврате восстановить страницу через reload. До исправления активный Email OTP challenge хранился только в React state, поэтому после такого reload интерфейс забывал уже отправленный код и предлагал запросить новый.

Исправление:

- после успешного `/api/auth/start` сохраняется короткоживущий pending handoff;
- сохраняются только `challengeId`, intent, email, display name для sign-up, masked destination и server expiry;
- сам 6-значный OTP не сохраняется;
- session secret не сохраняется и по-прежнему существует только в HttpOnly cookie;
- после reload сначала проверяется полноценная server Session, а если её ещё нет — восстанавливается действующий pending OTP challenge;
- после успешной авторизации, явной смены email/режима, terminal challenge error или истечения challenge pending handoff удаляется;
- просроченный или повреждённый browser state не используется.

Pending OTP handoff хранится локально только для восстановления незавершённого входа и ограничен серверным `expiresAt`. Это не заменяет server session и не используется как credential после завершения OTP.

## Что не меняется

- AI по-прежнему не подключён.
- Chat/demo state не становится server-backed автоматически.
- SQLite не объявляется production database.
- Яндекс Почта остаётся только closed-test delivery path.
- Production DB, transactional email, trusted proxy/IP abuse protection, monitoring, account deletion/export, legal/privacy requirements остаются отдельными production gates.

## Проверки перед merge

GitHub Actions run #552 на Safari-fix HEAD: PASS.

Фактически прошли:

- `npm ci`;
- `npm audit --audit-level=high`;
- TypeScript typecheck;
- closed-test auth dev environment smoke;
- pending Email OTP handoff regression smoke;
- auth core/server auth smoke;
- SQLite auth persistence + full flow smoke;
- auth server runtime build;
- frontend production build;
- PostgreSQL 18.4 migration + persistence smoke.

Остаётся фактический Replit iPhone E2E: request OTP → открыть Почту → вернуться в Safari → ввести уже полученный код → session restore → refresh.

Merge в `main` выполняется только после отдельного подтверждения пользователя.
