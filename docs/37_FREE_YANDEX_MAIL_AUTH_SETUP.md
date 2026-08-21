# ARVELIS AI — бесплатная Яндекс Почта для auth test

Дата: 2026-08-22.
Статус: **development / closed-test setup, не production email**.

## Решение

Для закрытого тестирования Email OTP используется обычный бесплатный ящик Яндекс Почты через generic SMTP adapter.

Yandex Cloud Postbox не используется. Отдельный cloud billing account, Postbox resource и собственный домен для текущего test/auth не требуются.

## Closed-test mailbox

Для текущей изолированной test-ветки используется отдельный технический mailbox ARVELIS:

`arvelis.auth@yandex.ru`

Это не секрет. Обычный пароль Yandex ID и пароль приложения по-прежнему не фиксируются в GitHub.

## Пароль приложения

Для SMTP используется отдельный пароль приложения типа «Почта».

Обычный пароль Yandex ID нельзя использовать как ARVELIS SMTP secret.

Пароль приложения нельзя:

- отправлять в чат;
- коммитить в GitHub;
- вставлять в frontend code;
- записывать в документацию;
- показывать на screenshots.

## Zero-manual-config test preset

Чтобы Replit UI/ветки не требовали повторного ручного ввода несекретных Configurations, closed-test runtime содержит безопасные defaults:

```text
AUTH_DB_PROVIDER=sqlite
AUTH_SQLITE_PATH=.data/arvelis-auth.sqlite
AUTH_API_PORT=3001
AUTH_TRUST_PROXY=false
AUTH_COOKIE_SECURE=auto
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USERNAME=arvelis.auth@yandex.ru
SMTP_FROM=arvelis.auth@yandex.ru
VITE_REAL_AUTH_ENABLED=false
```

Эти значения можно переопределить environment-переменными, но для текущего закрытого теста Replit Configurations не обязательны.

В Replit Secrets обязательны только три значения:

```text
SMTP_PASSWORD=<Mail app password>
AUTH_OTP_PEPPER_HEX=<32+ random bytes in hex>
AUTH_SESSION_PEPPER_HEX=<different 32+ random bytes in hex>
```

Оба pepper должны быть разными. Все три значения хранятся только в protected Secrets/environment.

Transport ARVELIS требует TLS `1.2+`.

## Бесплатная test БД

Закрытый auth test использует встроенный `node:sqlite`. Внешний PostgreSQL/cloud DB для этого test flow не требуется.

SQLite используется только в development workspace; published Replit filesystem не является production-persistent storage.

## Безопасные smoke-команды

До включения real-auth используются отдельные проверки:

- `npm run auth:readiness` — проверяет test-конфигурацию без вывода секретов;
- `npm run check:free-auth` — readiness + TypeScript/auth/SQLite/build проверки;
- `npm run auth:smoke-smtp` — проверяет SMTP credentials и отправляет одно техническое письмо на сам test mailbox. Письмо явно помечено как техническое, не содержит OTP и не создаёт Account/Session;
- `npm run auth:verify-setup` — последовательно выполняет полный closed-test gate перед запуском приложения.

`auth:smoke-smtp` не выводит SMTP password и не должен использоваться с личным mailbox.

## Replit test runtime

На feature-ветке `feat/auth-persistence-v1` обычная кнопка Replit `Run` выполняет:

1. install без создания/обновления lock-файла;
2. `auth:verify-setup`;
3. только после успешного gate запускает `dev:auth`.

`dev:auth` одновременно запускает:

- trusted auth API на loopback `127.0.0.1:3001`;
- Vite frontend на `0.0.0.0:3000`;
- browser `/api/*` идёт через same-origin Vite proxy.

`VITE_REAL_AUTH_ENABLED=false` является closed-test default до успешного SMTP + SQLite + iPhone E2E gate. Поэтому наличие запущенного backend само по себе не включает реальную регистрацию в интерфейсе.

## Rollout order

1. Убедиться, что три protected Secrets существуют.
2. Нажать Replit `Run`.
3. Подтвердить успешные readiness + TypeScript/auth/SQLite/build проверки.
4. Подтвердить получение одного технического SMTP smoke-письма.
5. Проверить `/api/health`.
6. Убедиться, что SQLite создаётся только в `.data/` и не отдаётся Vite как статический файл.
7. Проверить отсутствие raw OTP, session secret и SMTP password в логах.
8. Только после этого включить `VITE_REAL_AUTH_ENABLED=true` в test Replit environment.
9. Выполнить iPhone E2E: sign-up → OTP → Account → HttpOnly session → refresh restore → logout → sign-in.
10. Проверить account-local data isolation и session revoke.
11. После успешного E2E отдельно решить вопрос merge PR в `main`.

## Production

Обычная Яндекс Почта и локальный SQLite — только закрытый test stack. Перед публичным запуском отдельно утверждаются production transactional mail, persistent DB, регион хранения, backups, privacy/retention и эксплуатационные лимиты.

## Проверенные официальные источники

- Яндекс Почта: бесплатный почтовый ящик — https://360.yandex.ru/mail/
- SMTP/пароль приложения — https://yandex.ru/support/yandex-360/customers/mail/ru/mail-clients/others
- Пароли приложений Яндекс ID — https://yandex.ru/support/id/ru/authorization/app-passwords
