# ARVELIS AI — Chat Server Data v1

Status: feature-branch foundation for closed-test development. This document does **not** declare public/production readiness.

## Purpose

Chat Server Data v1 establishes one authenticated, account-scoped source of truth for future Home, Chat and History data without coupling the UI to SQLite, PostgreSQL or a specific AI provider.

The current frontend is intentionally **not switched** from its closed-test browser workspace to server Chat persistence yet. That cutover is deferred until the protected server attachment pipeline exists, so local photo/video/file/audio content is never presented as server-synchronized when its binary payload is still only on the device.

## Canonical ownership model

`Account -> Conversation -> Message -> Attachment metadata`

Every datastore operation that reads or mutates an existing conversation receives `accountId`. Ownership is enforced inside SQLite/PostgreSQL queries, not only in the HTTP router. A foreign or unknown conversation identifier must not grant access.

## Migration chain

PostgreSQL:

1. `001_auth_foundation`
2. `002_chat_foundation`
3. `003_chat_rate_limits`

SQLite applies the equivalent migrations in the same logical order when the local database is opened.

Applied migration content is checksum-protected. `003_chat_rate_limits` is a separate additive migration so the already-defined `002_chat_foundation` checksum is not changed retrospectively.

## Server records

### Conversation

- opaque 32-hex id
- account ownership
- title
- nullable model preference placeholder
- created/updated timestamps as Unix milliseconds
- monotonically increasing version

### Message

- opaque 32-hex id
- conversation id
- role: user / assistant / system
- lifecycle status
- text content
- monotonic position within the conversation
- created/edited timestamps

### Attachment metadata

- opaque 32-hex id
- message id
- image / video / audio / file kind
- normalized metadata
- storage lifecycle state
- internal storage key

The internal storage key is persistence-only and must never be serialized to the browser.

## Public Chat API

Authenticated same-origin routes under `/api/chat` provide:

- list conversations with cursor pagination
- get one conversation with message cursor pagination
- create a text-only conversation
- append a text-only user message
- edit an owned user message
- rename an owned conversation
- delete an owned conversation

At this stage client attachment payloads are explicitly rejected with `attachments_not_ready`. Model-backed execution is also not represented as available.

Public DTOs intentionally omit internal `accountId` and attachment `storageKey` fields.

## Pagination

Conversation listing is ordered by `(updatedAt DESC, id DESC)` and uses an opaque cursor.

Message pages are ordered by message position and load older messages through an opaque cursor. The service queries `limit + 1` internally so a next cursor is returned only when another page actually exists.

This contract is intended to be shared by Home, Chat and History. History must not become a second persistence source and must not require loading every message from every conversation at once.

## Server limits

Current data-integrity limits:

- maximum 100 conversations per account
- maximum 500 messages per conversation
- maximum 6000 characters in a user message
- bounded list/message page sizes

These are technical v1 safeguards, not final commercial tariff limits.

## Anti-abuse layer

Persistent Chat data mutation limits are independent from Email OTP limits:

- `create`: 20 operations / 10 minutes / account
- `mutation`: 120 operations / 10 minutes / account

Read-only GET requests are not counted by this mutation limiter.

A denied request returns HTTP `429`, stable code `rate_limited`, `retryAfterSeconds`, and `Retry-After`.

SQLite uses a transactional persistent counter. PostgreSQL uses an atomic UPSERT with the counter capped at `limit + 1`; concurrent first requests therefore cannot race on row creation and requests over the limit receive a normal denial instead of a database conflict.

AI-generation rate/cost/token limits are a separate future policy and must not be conflated with this data-mutation limiter.

## HTTP/security boundary

Chat routes inherit the existing ARVELIS session and same-origin mutation boundary:

- HttpOnly session authentication
- `X-ARVELIS-Request: 1` for mutations
- Origin / Sec-Fetch-Site checks
- JSON body size limit
- `Cache-Control: no-store`
- structured errors
- account ownership inside persistence queries
- internal persistence fields removed from public responses

The health endpoint may report `chatData: true` only for this data capability. It continues to report AI and server attachments as unavailable until those layers genuinely exist.

## Frontend transport boundary

`ServerConversationRepository` implements the pagination-ready UI repository contract and:

- uses same-origin credentials
- marks mutations with `X-ARVELIS-Request`
- disables response caching
- validates successful JSON responses instead of trusting arbitrary payloads
- maps stable backend error codes
- preserves `rate_limited` retry metadata
- maps 404 conversation reads to `null`
- rejects attachments before network I/O while server file upload is unavailable
- rejects model preference before network I/O while the AI/model registry is unavailable

## Verified CI evidence

Fresh GitHub Actions run #595 on the server-data HEAD passed:

- dependency audit
- TypeScript/typecheck
- existing Auth and Chat regressions
- frontend ServerConversationRepository contract smoke
- SQLite auth persistence/full flow
- SQLite Chat persistence
- SQLite Chat rate limiting
- Chat HTTP route/ownership/public-DTO/rate-limit smoke
- server runtime build
- frontend production build
- PostgreSQL 18.4 migrations 001/002/003
- PostgreSQL auth persistence
- PostgreSQL Chat persistence
- PostgreSQL Chat rate limiting, including concurrent requests

The preceding run #594 exposed a test-double URL matching defect in the frontend transport smoke after pagination query parameters were added. Production runtime code was not accepted as verified until the corrected fresh run #595 passed.

## Explicitly not complete

Chat Server Data v1 does **not** yet provide:

- protected server binary upload/storage
- server attachment download/streaming endpoints
- content/MIME inspection of uploaded files
- browser-to-server migration of existing local attachments
- speech-to-text
- AI provider/model registry
- AI generation or streaming
- AI cancel/retry/cost controls
- production database/storage selection, backup or recovery policy

No UI or documentation should represent those capabilities as working until their corresponding implementation and verification gates pass.

## Next stage

The next stacked Chat stage is the provider-neutral protected file pipeline. It must introduce a storage port, authenticated ownership checks, server-side content/size validation, private retrieval, lifecycle cleanup and closed-test storage implementation before the frontend switches attachment-bearing conversations to server persistence.
