import { readFile } from 'node:fs/promises';

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function reject(source, pattern, label) {
  if (pattern.test(source)) throw new Error(`Chat architecture regression: ${label}`);
}

const [main, chatScreen, chatDomain, repository, contract] = await Promise.all([
  read('src/main.tsx'),
  read('src/screens/ChatScreen.tsx'),
  read('src/chat/domain.ts'),
  read('src/chat/repository.ts'),
  read('docs/40_CHAT_FINAL_V1_CONTRACT.md'),
]);

reject(main, /chat-refactor-v2\.css/, 'legacy chat-refactor-v2.css is imported');
reject(main, /chat-runtime-hardening-v2\.css/, 'legacy chat-runtime-hardening-v2.css is imported');
reject(chatScreen, /\bDemo(?:Message|Thread|WorkspaceState)\b/, 'active ChatScreen uses Demo* domain types');
reject(chatScreen, />\s*(?:MOCK|PREVIEW)\s*</i, 'active ChatScreen renders MOCK/PREVIEW UI');
reject(chatScreen, /QUICK_STARTS/, 'fake seeded quick starts returned');

if (!/interface ConversationRepository/.test(repository)) {
  throw new Error('Chat architecture regression: ConversationRepository boundary is missing');
}
if (!/interface AttachmentRepository/.test(repository)) {
  throw new Error('Chat architecture regression: AttachmentRepository boundary is missing');
}
if (!/export function messageParts/.test(chatDomain)) {
  throw new Error('Chat architecture regression: message-parts normalization boundary is missing');
}
if (!/No mock assistant response is allowed/.test(contract)) {
  throw new Error('Chat architecture regression: final v1 truth boundary is missing');
}

console.log('ARVELIS chat architecture smoke: PASS');
