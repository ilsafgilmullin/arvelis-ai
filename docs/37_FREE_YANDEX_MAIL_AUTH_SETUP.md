# ARVELIS AI — бесплатная Яндекс Почта для auth test

Дата: 2026-08-22.
Статус: **development / closed-test setup, не production email**.

## Решение

Для закрытого тестирования Email OTP используется обычный бесплатный ящик Яндекс Почты через generic SMTP adapter.

Yandex Cloud Postbox не используется. Отдельный cloud billing account, Postbox resource и собственный домен для текущего test/auth не требуются.

## Closed-test mailbox

Для текущего изолированного теста используется отдельный технический mailbox ARVELIS:

`arvelis.auth@yandex.ru`

Это не секрет. Обычный пароль Yandex ID и пароль приложения не фиксируются в GitHub.

Для SMTP-аутентификации текущего личного `@yandex.ru` mailbox используется login:

`arvelis.auth`

Адрес отправителя остаётся:

`arvelis.auth@yandex.ru`

## Пароль приложения

Для SMTP используется отдельный пароль приложения типа «Почта».

Обычный пароль Yandex ID нельзя использовать как ARVELIS SMTP secret.

Пароль приложения нельзя:

- отправлять в чат;
- коммитить в GitHub;
- вставлять во frontend code;
- записывать в документацию;
- показывать на screenshots.

## Closed-test defaults

Чтобы Replit UI не требовал повторного ручного ввода несекретных Configurations, test runtime содержит безопасные defaults:

```text
AUTH_DB_PROVIDER=sqlite
AUTH_SQLITE_PATH=.data/arvelis-auth.sqlite
AUTH_API_PORT=3001
AUTH_TRUST_PROXY=false
AUTH_COOKIE_SECURE=auto
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USERNAME=arvelis.auth
SMTP_FROM=arvelis.auth@yandex.ru
VITE_REAL_AUTH_ENABLED=false
```

В Replit Secrets для closed-test обязательны только три значения:

```text
SMTP_PASSWORD=<Mail app password>
AUTH_OTP_PEPPER_HEX=<32+ random bytes in hex>
AUTH_SESSION_PEPPER_HEX=<different 32+ random bytes in hex>
```

Оба pepper должны быть разными. Все три значения хранятся только в protected Secrets/environment.

Transport ARVELIS требует TLS `1.2+`.

## Бесплатная test БД

Закрытый auth test использует встроенный `node:sqlite`. Внешний PostgreSQL/cloud DB для этого test flow не требуется.

SQLite используется только в development workspace; published Replit filesystem не считается production-persistent storage.

## Проверки

- `npm run auth:readiness` — проверяет test-конфигурацию без вывода секретов;
- `npm run check:free-auth` — readiness + TypeScript/auth/SQLite/build проверки;
- `npm run auth:smoke-smtp` — проверяет SMTP credentials и отправляет одно явно техническое письмо на test mailbox; не создаёт OTP, Account или Session;
- `npm run auth:verify-setup` — полный closed-test gate.

`auth:smoke-smtp` не выводит SMTP password.

## Replit runtime и fail-closed rollout

Перед merge default `.replit` возвращён к обычному frontend preview и **не включает real-auth автоматически**. Это сделано намеренно: стабильный `main` не должен требовать SMTP/auth Secrets и не должен отправлять техническое письмо при каждом `Run`.

Auth runtime остаётся отдельной командой `npm run dev:auth`. Real-auth UI включается только явным `VITE_REAL_AUTH_ENABLED=true` в изолированном test-контуре после прохождения gate.

Auth API слушает только loopback `127.0.0.1:3001`, а browser `/api/*` в development идёт через same-origin Vite proxy.

## Фактически выполненный closed-test E2E 2026-08-22

На iPhone/Safari фактически подтверждены:

1. readiness, TypeScript/auth/SQLite/build gate;
2. SMTP verify + техническая доставка;
3. sign-up на email;
4. получение реального 6-значного OTP;
5. создание Account в SQLite;
6. HttpOnly server session;
7. refresh/session restore без повторного OTP;
8. отображение текущей `iPhone · Safari` session;
9. logout/server revoke;
10. повторный sign-in через новый OTP.

Это подтверждает closed-test stack, но не делает его production-ready.

## Production

Обычная Яндекс Почта и локальный SQLite — только закрытый test stack. Перед публичным запуском отдельно утверждаются production transactional mail, persistent DB, регион хранения, backups/recovery, retention/privacy, эксплуатационные лимиты и production cookie/proxy policy.

## Официальные источники

- Яндекс Почта: https://360.yandex.ru/mail/
- SMTP/почтовые клиенты: https://yandex.ru/support/yandex-360/customers/mail/ru/mail-clients/others
- Пароли приложений Яндекс ID: https://yandex.ru/support/id/ru/authorization/app-passwords
