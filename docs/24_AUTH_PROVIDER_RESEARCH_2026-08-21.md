# ARVELIS AI — Auth Provider / Identity Research

Дата исследования: 2026-08-21.
Статус: `RESEARCH / CANDIDATE`, **ничего из перечисленного не подключено и не утверждено как production provider**.

## Цель

Подобрать production-направление авторизации, которое:

- не привязывает ARVELIS AI к одному внешнему поставщику;
- позволяет работать в России без VPN там, где это технически и юридически возможно;
- сохраняет собственную ARVELIS account/session модель;
- поддерживает web сейчас и native iOS/Android позже;
- допускает Яндекс/VK/Apple/Google и другие identity providers как заменяемые адаптеры;
- не хранит provider/client secrets во frontend;
- учитывает требования к локализации персональных данных граждан РФ.

## 1. Self-hosted identity core — сильный кандидат для отдельной оценки

### Keycloak

Актуальная документация Keycloak подтверждает:

- self-hosted запуск на собственном сервере/container/Kubernetes;
- OpenID Connect, OAuth 2.0 и SAML;
- identity brokering внешних providers;
- возможность подключать protocol-based OIDC/OAuth providers;
- passkeys/WebAuthn;
- step-up authentication;
- persistent user sessions;
- admin APIs и account management;
- production deployment требует отдельной DB/TLS/HA/backup/upgrade работы.

Плюсы для ARVELIS:

- identity core можно разместить в выбранной российской инфраструктуре;
- внешний Google/Apple/Yandex/VK не становится ARVELIS account database;
- можно добавлять/убирать провайдеров через broker layer;
- зрелая модель session/authentication flows;
- подходит будущему раздельному user realm и усиленному CONTROL realm/policy.

Минусы:

- отдельный Java/OpenJDK service;
- больше DevOps/observability/backup/upgrade работы;
- branded app-like auth UX потребует собственной theme/login integration;
- нельзя считать безопасным «из коробки» без production configuration review.

**Вывод:** `SHORTLIST`, не финальное решение.

## 2. Яндекс ID — сильный внешний provider-кандидат для РФ

Актуальная документация Яндекс ID:

- OAuth 2.0 для сайтов и мобильных приложений;
- web authorization и mobile LoginSDK;
- приложение регистрируется с redirect URI;
- доступ к данным задаётся scopes;
- может вернуть уникальный ID и разрешённые данные пользователя;
- Яндекс отдельно рекомендует не сохранять OAuth token в браузере или открытой конфигурации.

Для ARVELIS это хорошо ложится в уже созданный `external` auth method и server/broker adapter.

**Рекомендация:** рассматривать Яндекс ID как один из основных external providers для аудитории РФ, но не как единственный источник ARVELIS account/session.

Статус: `SHORTLIST`.

## 3. VK ID — сильный внешний provider-кандидат для РФ

Публичная документация/SDK VK ID подтверждает:

- web SDK для авторизации;
- OAuth 2.1;
- PKCE (`codeVerifier`) в SDK flow;
- возможность запрашивать email/phone scopes;
- поддерживаются также варианты входа через Mail и Одноклассники в OAuth list;
- есть отдельные mobile SDK/интеграции.

Для ARVELIS это второй сильный российский external provider-кандидат.

**Рекомендация:** поддерживать через отдельный adapter/broker; не превращать VK access/refresh token в собственную ARVELIS web-session.

Статус: `SHORTLIST`.

## 4. Sign in with Apple — полезный дополнительный provider

Актуальная Apple Developer documentation подтверждает web-flow, authorization code и server-side token validation.

Особенности:

- для web требуется Services ID;
- web service связывается с primary App ID, где включён Sign in with Apple;
- используются зарегистрированные domains/return URLs;
- требуется private key/server-side configuration;
- authorization code короткоживущий и проверяется server-side;
- пользователь может скрыть настоящий email через Apple relay.

Для будущего iOS-клиента ARVELIS это важный provider, но **не стоит делать его единственным базовым способом входа**.

Статус: `OPTIONAL SHORTLIST`.

## 5. Google Identity — дополнительный provider, но не российская точка отказа

Актуальная Google Identity Services documentation рекомендует authorization code model, при котором backend принимает/обменивает authorization code и хранит server-side tokens.

ARVELIS architecture это поддерживает через внешний adapter.

Однако доступность/стабильность Google как единственного способа входа для пользователей в России нельзя предполагать без отдельного runtime/market verification. Поэтому Google не должен быть единственным mandatory auth method.

Статус: `OPTIONAL`, не база.

## 6. Россия — локализация персональных данных

Для production требуется отдельный юридический review.

При этом действующая редакция ч. 5 ст. 18 Федерального закона №152-ФЗ после изменений 2025 года устанавливает, что при сборе персональных данных граждан РФ запись, систематизация, накопление, хранение, уточнение и извлечение с использованием баз данных за пределами РФ не допускаются, кроме предусмотренных законом исключений.

Разъяснение Минцифры по изменениям, вступившим в силу 1 июля 2025 года, отдельно указывает на эти требования и на то, что последующая трансграничная передача регулируется отдельно.

### Архитектурное следствие для ARVELIS

До production нельзя выбирать account/auth database только по удобству SDK.

Рабочий infrastructure candidate для пользователей РФ:

- первичная ARVELIS account/identity/session database — в инфраструктуре, соответствующей требованиям локализации в РФ;
- внешний IdP используется как **источник подтверждения identity**, а не как единственное место хранения ARVELIS account state;
- трансграничные потоки external IdP и другие data transfers оцениваются отдельно до запуска;
- минимизируются запрашиваемые scopes/данные.

Это техническое следствие для проектирования, не замена юридическому заключению.

## 7. Рекомендуемый shortlist архитектуры

### Candidate A — ARVELIS Auth Core + broker

`ARVELIS App → ARVELIS Backend/BFF → Auth Core → Identity Providers`

Auth Core candidate: self-hosted Keycloak или другой зрелый self-hosted OIDC identity server после отдельного сравнения.

External adapters:

- Yandex ID;
- VK ID;
- Apple;
- Google;
- будущие providers без изменения Account id/domain model.

ARVELIS web получает собственную защищённую server session; provider tokens не являются frontend session.

### Candidate B — app-native auth service на собственном backend

Собственный server auth-module + production database + адаптеры external providers.

Плюс: максимальный контроль над branded UX и Node/TypeScript stack.

Минус: существенно больше security responsibility — challenge lifecycle, account linking, recovery, session rotation, anti-abuse, MFA/passkeys и security event model нужно проектировать/поддерживать самим или через зрелую библиотеку.

Требует отдельного library/security review до выбора.

### Не рекомендуется как базовый вариант

Привязать ARVELIS account model напрямую к одному Google/Apple/Yandex/VK/Firebase/Auth0-подобному provider и затем хранить provider token как основную frontend session.

Причины:

- vendor lock-in;
- внешняя точка отказа;
- сложнее соблюдать provider independence;
- риск несовместимости с требованиями инфраструктуры/локализации;
- сложнее изолировать будущий ARVELIS CONTROL.

## 8. Предварительная продуктовая рекомендация

Без подключения сервисов сейчас наиболее устойчивое направление:

1. сохранить уже созданный `AuthGateway` contract;
2. ARVELIS Account ID остаётся внутренним immutable ID;
3. external provider identities связываются через отдельную Identity entity;
4. web-session принадлежит ARVELIS backend, а не внешнему provider;
5. базовый способ входа не должен зависеть от одного иностранного IdP;
6. Yandex ID + VK ID держать в российском external-provider shortlist;
7. Apple — важный дополнительный вариант для iOS;
8. Google — дополнительный, но не обязательный для работы продукта в РФ;
9. self-hosted identity core в российской инфраструктуре провести через отдельный technical spike до production решения.

## 9. Что остаётся OPEN

- Keycloak vs другое identity core vs app-native auth library;
- основной идентификатор: email / phone / комбинация;
- passwordless OTP/magic-link/password/passkey;
- какие external providers войдут в первый релиз;
- конкретный российский hosting/DB provider;
- SMS/email provider;
- exact retention/data-flow map;
- юридическое заключение по персональным данным и трансграничной передаче;
- CONTROL owner/admin auth method.

## Источники исследования

Проверены актуальные на дату исследования официальные/primary documentation:

- Yandex ID OAuth documentation;
- VK ID web SDK / VKCOM SDK documentation;
- Apple Developer — Sign in with Apple;
- Google Identity Services — OAuth code model;
- Keycloak current guides / server administration / current feature set;
- действующая редакция 152-ФЗ, ст. 18 ч. 5, и разъяснение Минцифры по изменениям 2025 года.
