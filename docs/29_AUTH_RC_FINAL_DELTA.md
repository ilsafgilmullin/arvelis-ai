# ARVELIS AI — Auth RC Final Delta

Дата: 2026-08-21.
Ветка: `feat/auth-foundation-v1`.
PR: Draft #11.
Статус: `FINAL SOURCE/SECURITY DELTA`, без production auth/backend/AI.

Этот документ дополняет `docs/27_AUTH_NEGATIVE_QA.md` и `docs/28_AUTH_RC_AUDIT.md` последними изменениями RC-прохода.

## Source of truth перед этим delta

- repository: `ilsafgilmullin/arvelis-ai`;
- base: `main`;
- candidate: `feat/auth-foundation-v1`;
- последний проверенный compare перед финальными commit: branch ahead, `behind_by=0`;
- PR #11: open, Draft, mergeable;
- review threads/reviews/comments: отсутствуют;
- `package-lock.json`: отсутствует;
- Replit: Node 22, `npm install --include=dev --no-package-lock ... && npm run dev`;
- project dependencies: React 19.2.8, TypeScript 6.0.3, Vite 8.2.1.

## 1. Local profile / storage boundary

Закрыт разрыв между registration/Profile validation и legacy browser storage.

Единый source of truth:

- `DEFAULT_PREVIEW_PROFILE_NAME`;
- `normalizePreviewProfileName()`;
- `validatePreviewProfileName()`;
- `resolveStoredPreviewProfileName()`;
- `isPersistablePreviewProfileName()`.

Инварианты:

- control/format characters reject выполняется до whitespace normalization;
- corrupt legacy `profileName` не попадает в UI;
- повреждённое имя не уничтожает healthy threads;
- persistence принимает только canonical user name или internal reset default;
- App/Auth/Profile/Home используют одну policy.

## 2. Unicode protocol-text boundary

Добавлен `src/auth/protocolText.ts`.

Auth transport boundary блокирует Unicode category `C*`, включая:

- C0/DEL controls;
- zero-width format controls;
- bidi overrides;
- surrogate/private-use/unassigned code points.

Обычный Unicode пользовательский текст не запрещается автоматически.

Incoming и outgoing auth boundary используют один helper.

## 3. Raw-before-normalization invariant

Security-sensitive outgoing payload сначала проверяется в сыром виде, и только затем допускается разрешённая нормализация.

До transport блокируются raw `\n`, `\t`, bidi/zero-width controls в:

- method id;
- identifier;
- challenge id;
- code response;
- session id.

Это закрывает обход, при котором `.trim()` мог удалить управляющий символ до validation.

## 4. Canonical opaque protocol IDs

Opaque IDs не нормализуются frontend-кодом.

Следующие server/client protocol IDs обязаны быть canonical и не иметь leading/trailing whitespace:

- method id;
- account id;
- session id;
- challenge id;
- challenge method id.

Например, `" email "` не превращается клиентом в `"email"`; такой payload считается protocol violation.

User identifier (email/phone candidate) остаётся отдельным полем и может иметь утверждённую normalization policy после raw unsafe-character reject.

## 5. Timestamp defensive boundary

Timestamp строки также проходят unsafe Unicode/control validation до `Date.parse()`.

Raw newline/tab/format-control в:

- session `createdAt`;
- session `expiresAt`;
- session-summary `lastSeenAt`;
- challenge `expiresAt`

не принимаются как валидные timestamps.

Exact RFC3339/ISO wire format пока не утверждён server API contract, поэтому frontend не вводит более узкий формат без отдельного решения.

## 6. Exact-shape protocol objects

TypeScript excess-property invisibility не считается security boundary.

Runtime guards теперь fail closed при неизвестных полях в:

- auth method descriptor;
- account;
- session;
- session summary;
- code challenge;
- external redirect challenge;
- failure;
- start success/error envelope;
- complete success/error envelope.

Примеры payload, которые должны быть отклонены:

- `accessToken`;
- `sessionToken`;
- `providerToken`;
- `internalRole`;
- `providerDebug`;
- raw fingerprint field, не входящий в approved contract.

Новый backend field требует явного обновления contract/runtime guards, а не молчаливого попадания в application object.

## 7. Preview reset lifecycle — P1

Найден и исправлен lifecycle defect:

до исправления destructive `Сбросить локальные данные` удалял preview profile до system default, но оставлял `entry='app'` и переводил пользователя на Главную.

Теперь reset:

1. инвалидирует pending launch sequence;
2. удаляет chat drafts;
3. сбрасывает workspace/storage;
4. очищает pending profile;
5. возвращает screen в безопасный Chat default;
6. переводит entry на `auth`;
7. следующий доступ к приложению снова требует создать preview profile.

Таким образом удалённый локальный профиль больше не сохраняет app access внутри текущего lifecycle.

## 8. Account Security QA coverage

`AccountSecurityPanel` production-connected branch пока не подключён к реальному Profile runtime — это намеренно.

В internal `StatesScreen` добавлен отдельный `ACCOUNT SECURITY · PREVIEW` QA-блок со состояниями:

- disconnected;
- idle/not loaded;
- loading;
- error;
- ready + empty;
- ready + sessions.

Fixture sessions явно содержат `PREVIEW` в labels.

Server actions/revoke в QA намеренно не подключены, поэтому demo UI не выдаёт no-op за реальную административную/security операцию.

## 9. Account Security source audit

Подтверждено:

- API error не отображается как «сессий нет»;
- loading/idle/error/ready различаются;
- current session не получает revoke button в UI;
- connected=false честно показывает, что real account/session backend отсутствует;
- device/browser labels рендерятся как React text;
- session payload до UI проходит bounded exact-shape/runtime guard.

Current-session revoke policy остаётся backend OPEN decision; frontend UI не симулирует её.

## 10. Safe auth presentation

`AuthStatusPanel` не выводит raw transport/provider `error.message`.

Пользовательский текст строится через `presentAuthFailure()` и фиксированные безопасные presentation states.

Recoverable code error, logout failure, rate limit, offline и session-expired имеют отдельную UX-семантику.

## Automated regression suite

`npm run test:auth` включает:

- `tests/auth-core-smoke.ts`;
- `tests/preview-profile-smoke.ts`;
- `tests/demo-storage-profile-smoke.ts`;
- `tests/protocol-text-smoke.ts`;
- `tests/protocol-shape-smoke.ts`.

Изолированно фактически проверялись и проходили:

- profile normalization/reject/fallback;
- corrupt localStorage profile recovery с сохранением threads;
- Unicode bidi/zero-width/C0 reject;
- raw-before-trim control reject;
- timestamp control reject;
- canonical protocol ID reject;
- exact-shape unknown-field reject;
- extra success/error envelope reject;
- transport call counters остаются 0 для invalid outgoing payload.

Изолированная среда предыдущих smoke: Node 22.16.0 / TypeScript 5.8.3, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.

Это не заменяет repository TypeScript 6.0.3/Vite build.

## GitHub Actions gate

Последний проверенный run после reset/profile изменений: ARVELIS CI run #423.

Фактически:

- workflow run создаётся;
- job `validate` создаётся;
- job завершает `failure` через несколько секунд;
- `steps=null`;
- `logs_url=null`;
- combined commit statuses empty.

Следовательно Checkout/Setup Node/Install/Typecheck/Auth smoke/Build не исполнялись.

Workflow YAML не изменяется вслепую без evidence, что отказ вызван его шагами.

## Remaining RC gates

До merge PR #11 остаются внешние/фактические gates:

1. настоящий repository `npm run typecheck` на TypeScript 6.0.3;
2. настоящий `npm run test:auth` в project dependency environment;
3. настоящий Vite `npm run build`;
4. dependency lockfile;
5. короткий runtime smoke последнего app-entry/auth/reset flow либо отдельное осознанное принятие runtime риска.

## Merge policy

Этот документ не является разрешением на merge.

PR #11 остаётся Draft. `main` не изменять без отдельного подтверждения пользователя.
