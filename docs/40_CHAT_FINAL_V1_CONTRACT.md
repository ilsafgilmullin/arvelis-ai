# ARVELIS AI — Chat Final v1 Contract

Status: architecture freeze in progress  
Date: 2026-08-22

## Purpose

Chat is the primary and most frequently used ARVELIS AI workspace. Its v1 contract must be stable before History and Profile are finalized, so those screens consume the same conversation model instead of forcing a later Chat rewrite.

This document supersedes older preview-only Chat decisions where they conflict with later explicit product decisions to support attachments, voice input and a model selector.

## Product truth boundary

Current closed-test capabilities that may be shown as working:

- user-authored text messages;
- photo/video/file/audio attachment selection;
- local attachment binary persistence in IndexedDB;
- pending attachment recovery after reload when the blob is still available;
- browser microphone recording through MediaRecorder;
- local conversation search, rename, edit, copy and delete;
- model-selector shell that lists only models actually exposed by a provider registry.

Current capabilities that MUST NOT be represented as working yet:

- AI generation;
- provider/model availability while the server registry is empty;
- server-backed conversation history;
- server file upload/storage;
- speech transcription;
- citations/web search/tools;
- production billing/limits.

No mock assistant response is allowed in the user-visible Chat.

## Canonical domain

New Chat code uses:

- `ChatMessage`
- `Conversation`
- `ChatWorkspaceState`
- `ChatAttachmentMeta`
- `ChatMessageStatus`
- `ChatMessagePart`

`DemoMessage`, `DemoThread` and `DemoWorkspaceState` are legacy aliases only for migration compatibility and must not be introduced into new Chat UI/domain code.

### Message lifecycle

Supported lifecycle vocabulary:

- `local`
- `pending`
- `sending`
- `streaming`
- `completed`
- `failed`
- `cancelled`

The closed-test browser implementation currently produces `local` user messages. Server/AI implementation will use the remaining states without changing the UI contract.

### Content model

Forward server contract is content-parts based:

- text part;
- attachment part.

Current browser persistence keeps text and attachment metadata as separate fields for backward compatibility. `src/chat/domain.ts` is the normalization boundary between the legacy browser representation and the future parts-based API.

## Persistence boundary

UI must not own persistence details.

`ConversationRepository` is the replaceable boundary for:

- list/get/create conversations;
- append/update messages;
- rename/delete conversations.

`AttachmentRepository` is the replaceable boundary for attachment binaries.

Closed-test implementation remains browser-local. Future server implementation must satisfy the same UI-facing contract.

## Final Chat component boundaries

Target decomposition before Chat v1 is declared complete:

- `ChatScreen` — orchestration only;
- `ChatHeader`;
- `ConversationSearch`;
- `MessageList`;
- `MessageItem` / user + assistant rendering;
- `ChatComposer`;
- `AttachmentTray`;
- `VoiceRecorderControls`;
- `ModelSelector`;
- conversation actions/sheets.

No component should directly know SMTP/auth secrets, AI provider keys or production storage credentials.

## Final data architecture before History freeze

History must not be finalized against browser-local storage and then rewritten later.

Required server entities before History finalization:

- Account
- Conversation
- Message
- Attachment

Required ownership relationship:

`Account -> Conversations -> Messages -> Attachments`

Browser storage after server migration is limited to drafts, temporary upload state and cache.

## AI boundary

Chat UI must depend on an ARVELIS AI gateway, never directly on one model vendor.

Required gateway responsibilities:

- authenticated account check;
- model registry/capability check;
- attachment ownership and capability validation;
- context assembly;
- provider routing;
- server-side secrets;
- streaming;
- cancel;
- timeout;
- normalized errors;
- rate/cost limits;
- audit metadata without logging raw secrets.

Default product concept for later approval: `ARVELIS Auto` routes to a compatible connected model. Concrete providers are not approved by this document.

## Attachment contract

Current closed test:

- binary payload: IndexedDB;
- workspace/localStorage: validated metadata only;
- no persisted data/blob URL;
- per-kind and batch limits;
- delete/reset cleans referenced local blobs.

Final server version additionally requires:

- authenticated upload endpoint;
- server-side MIME/content validation;
- ownership checks;
- private object access;
- upload progress/cancel/retry;
- deletion lifecycle;
- document prompt-injection boundary.

## Voice contract

Current closed test records real audio using browser MediaRecorder.

Final AI flow should remain provider-independent:

`microphone -> audio attachment -> speech adapter -> text/context -> AI gateway`

Speech provider selection is not approved here.

## UI/UX completion gates

Chat v1 cannot be marked final until:

- one stable mobile/desktop Chat CSS layer replaces obsolete historical Chat overrides;
- no horizontal document overflow;
- iPhone visualViewport + keyboard behavior passes;
- Android keyboard/picker/microphone behavior passes;
- desktop keyboard, drag/drop/paste policy and resizing pass;
- composer, pending attachments and bottom navigation never overlap;
- all touch targets are suitable for mobile;
- loading, empty, offline, upload error, generation error, timeout, limit and retry states are explicit;
- assistant output renderer safely supports formatted text required by the chosen AI gateway;
- long conversations remain usable.

## Security completion gates

Before real AI/public Chat:

- auth on every Chat endpoint;
- account ownership on conversation/message/attachment operations;
- origin/CSRF policy;
- server request-size limits;
- upload validation;
- rate limits;
- provider time/cost limits;
- safe output rendering;
- prompt-injection handling for imported documents;
- AI/provider secrets server-side only;
- raw prompts/files are not written to technical logs by default.

## Freeze rule

After these gates pass and the user approves final Chat v1, History and Profile may proceed against this contract. New providers, models and capabilities must be added through repository/gateway adapters and must not require another foundational Chat rewrite.
