# ARVELIS AI — бесплатная отправка auth email через Яндекс Почту

Дата: 2026-08-21.
Статус: **test/auth provider candidate, без платного cloud billing**.

Этот setup предназначен для закрытого тестирования регистрации ARVELIS AI. Он не утверждает production email provider и не является production deploy approval.

## Цель

Получить реальную доставку OTP без отдельного платного email-сервиса, billing account и собственного домена.

Для тестовой auth-среды используется обычный бесплатный ящик Яндекс Почты через стандартный SMTP. ARVELIS по-прежнему работает через generic `EmailOtpDeliveryPort` / SMTP adapter, поэтому provider можно заменить без изменения Account/Session/frontend.

## Что требуется

Нужен отдельный Яндекс ID/почтовый ящик для тестовой отправки, например технический ящик ARVELIS. Не используйте личный основной аккаунт владельца проекта.

В Яндекс ID создаётся отдельный пароль приложения типа «Почта». Обычный пароль аккаунта в ARVELIS не используется.

## SMTP параметры

Официальные параметры Яндекс Почты для отправки:

- SMTP server: `smtp.yandex.ru`;
- port: `465`;
- SSL: enabled;
- username: полный адрес/логин почтового ящика;
- password: отдельный пароль приложения для Почты.

ARVELIS transport дополнительно требует TLS `1.2+`.

## Protected environment

Тестовая среда должна хранить значения только в защищённых secrets/environment:

```text
DATABASE_URL=<protected PostgreSQL connection string>
AUTH_OTP_PEPPER_HEX=<independent 32+ random bytes as hex>
AUTH_SESSION_PEPPER_HEX=<different independent 32+ random bytes as hex>

SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USERNAME=<test Yandex Mail address/login>
SMTP_PASSWORD=<mail app password>
SMTP_FROM=<same test Yandex Mail address>

AUTH_TRUST_PROXY=<environment-specific>
AUTH_COOKIE_SECURE=auto
VITE_REAL_AUTH_ENABLED=false
```

Ни `SMTP_PASSWORD`, ни peppers, ни `DATABASE_URL` нельзя помещать в GitHub, screenshots, frontend env или документацию.

## Rollout gate

До включения frontend real-auth:

1. подготовить тестовую PostgreSQL instance;
2. сохранить `DATABASE_URL` только в protected environment;
3. выполнить `npm run db:migrate`;
4. выполнить `npm run check:with-db`;
5. запустить auth runtime;
6. запросить OTP на тестовый email;
7. подтвердить фактическую доставку письма;
8. проверить, что raw OTP/secrets/session secret не попадают в логи;
9. только после этого включать `VITE_REAL_AUTH_ENABLED=true` в тестовой среде;
10. выполнить iPhone E2E: регистрация → OTP → Account → HttpOnly Session → refresh restore → logout → login.

## Ограничение

Обычная Яндекс Почта подходит для разработки и закрытого тестирования, но не фиксируется как production transactional-email provider. У неё могут действовать антиспам/суточные ограничения, и production sender/domain/reputation должны быть выбраны отдельно перед публичным запуском.

## Что было безопасно отменено

Ранее выбранный Yandex Cloud Postbox отменён до активации инфраструктуры. Postbox resource, billing, domain sender и API credentials не создавались, поэтому rollback не требует удаления данных или cloud-ресурсов.

## Проверенные официальные источники на 2026-08-21

- Яндекс Почта: бесплатный почтовый ящик — https://360.yandex.ru/mail/
- SMTP/пароль приложения — https://yandex.ru/support/yandex-360/customers/mail/ru/mail-clients/others
- Пароли приложений Яндекс ID — https://yandex.ru/support/id/ru/authorization/app-passwords
