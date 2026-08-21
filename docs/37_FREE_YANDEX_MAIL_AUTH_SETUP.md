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

## Rollout order

1. Фактически пройти TypeScript/build + SQLite smoke.
2. Создать отдельный бесплатный test mailbox.
3. Создать Mail app password.
4. Добавить SMTP credentials и два pepper только в protected Replit Secrets.
5. Запустить `npm run dev:auth` в test environment.
6. Проверить `/api/health` и `persistence=sqlite`.
7. Запросить OTP на тестовый email и подтвердить реальную доставку.
8. Проверить отсутствие raw OTP, session secret и SMTP password в логах.
9. Только после этого включить `VITE_REAL_AUTH_ENABLED=true` в test Replit environment.
10. Выполнить iPhone E2E: sign-up → OTP → session → refresh → logout → sign-in.

## Production

Обычная Яндекс Почта и локальный SQLite — только закрытый test stack. Перед публичным запуском отдельно утверждаются production transactional mail, persistent DB, регион хранения, backups, privacy/retention и эксплуатационные лимиты.

## Проверенные официальные источники на 2026-08-21

- Яндекс Почта: бесплатный почтовый ящик — https://360.yandex.ru/mail/
- SMTP/пароль приложения — https://yandex.ru/support/yandex-360/customers/mail/ru/mail-clients/others
- Пароли приложений Яндекс ID — https://yandex.ru/support/id/ru/authorization/app-passwords
