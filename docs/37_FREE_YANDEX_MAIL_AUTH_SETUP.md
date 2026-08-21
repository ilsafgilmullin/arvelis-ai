# ARVELIS AI — бесплатная Яндекс Почта для auth test

Дата: 2026-08-21.
Статус: **development / closed-test setup, не production email**.

## Решение

Для закрытого тестирования Email OTP используется обычный бесплатный ящик Яндекс Почты через generic SMTP adapter.

Yandex Cloud Postbox не используется. Отдельный cloud billing account, Postbox resource и собственный домен для текущего test/auth не требуются.

## Что нужно создать

Отдельный тестовый mailbox для ARVELIS, не личный основной ящик пользователя.

Фактический адрес не фиксируется в GitHub и задаётся только в protected environment.

## Пароль приложения

Для SMTP используется отдельный пароль приложения типа «Почта».

Обычный пароль Yandex ID нельзя использовать как ARVELIS SMTP secret.

Пароль приложения нельзя:

- отправлять в чат;
- коммитить в GitHub;
- вставлять в frontend code;
- записывать в документацию;
- показывать на screenshots.

## SMTP configuration

Test preset:

```text
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USERNAME=<test mailbox>
SMTP_PASSWORD=<Mail app password>
SMTP_FROM=<same test mailbox>
```

Transport ARVELIS требует TLS `1.2+`.

## Бесплатная test БД

Закрытый auth test использует встроенный SQLite path:

```text
AUTH_DB_PROVIDER=sqlite
AUTH_SQLITE_PATH=.data/arvelis-auth.sqlite
```

Внешний PostgreSQL/cloud DB для этого test flow не требуется.

SQLite используется только в development workspace; published Replit filesystem не является production-persistent storage.

## Остальные protected secrets

Также нужны два независимых high-entropy server secrets:

```text
AUTH_OTP_PEPPER_HEX=<32+ random bytes in hex>
AUTH_SESSION_PEPPER_HEX=<different 32+ random bytes in hex>
```

Они должны быть разными и храниться только в Replit Secrets/environment.

## Безопасные smoke-команды

До включения real-auth используются отдельные проверки:

- `npm run auth:readiness` — проверяет наличие/формат test-конфигурации без вывода секретов;
- `npm run check:free-auth` — readiness + TypeScript/auth/SQLite/build проверки;
- `npm run auth:smoke-smtp` — проверяет SMTP credentials и отправляет одно техническое письмо на сам test mailbox. Письмо явно помечено как техническое, не содержит OTP и не создаёт Account/Session.

`auth:smoke-smtp` не выводит SMTP password и не должен использоваться с личным mailbox.

## Replit test runtime

На feature-ветке `feat/auth-persistence-v1` `.replit` запускает `npm run dev:auth`, то есть одновременно:

- trusted auth API на loopback `127.0.0.1:3001`;
- Vite frontend на `0.0.0.0:3000`;
- browser `/api/*` идёт через same-origin Vite proxy.

`VITE_REAL_AUTH_ENABLED=false` остаётся обязательным до успешного SMTP + SQLite + iPhone E2E gate. Поэтому наличие запущенного backend само по себе не включает реальную регистрацию в интерфейсе.

## Rollout order

1. Запустить `npm run auth:readiness`.
2. Фактически пройти `npm run check:free-auth`.
3. Запустить `npm run auth:smoke-smtp` и подтвердить получение технического письма.
4. Запустить feature branch через `npm run dev:auth` / Replit Run.
5. Проверить `/api/health`.
6. Убедиться, что SQLite создаётся только в `.data/` и не отдаётся Vite как статический файл.
7. Проверить отсутствие raw OTP, session secret и SMTP password в логах.
8. Только после этого включить `VITE_REAL_AUTH_ENABLED=true` в test Replit environment.
9. Выполнить iPhone E2E: sign-up → OTP → Account → HttpOnly session → refresh restore → logout → sign-in.
10. Проверить account-local data isolation и session revoke.
11. После успешного E2E отдельно решить вопрос merge PR в `main`.

## Production

Обычная Яндекс Почта и локальный SQLite — только закрытый test stack. Перед публичным запуском отдельно утверждаются production transactional mail, persistent DB, регион хранения, backups, privacy/retention и эксплуатационные лимиты.

## Проверенные официальные источники на 2026-08-21

- Яндекс Почта: бесплатный почтовый ящик — https://360.yandex.ru/mail/
- SMTP/пароль приложения — https://yandex.ru/support/yandex-360/customers/mail/ru/mail-clients/others
- Пароли приложений Яндекс ID — https://yandex.ru/support/id/ru/authorization/app-passwords
