import { DEFAULT_PREVIEW_PROFILE_NAME } from '../src/auth/previewProfile';
import {
  DEMO_PREVIEW_NOTICE,
  loadDemoWorkspace,
  resetDemoWorkspace,
  saveDemoWorkspace,
} from '../src/lib/demoStorage';
import type { DemoThread } from '../src/types';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const storage = new Map<string, string>();
const localStorage = {
  getItem(key: string) {
    return storage.get(key) ?? null;
  },
  setItem(key: string, value: string) {
    storage.set(key, value);
  },
  removeItem(key: string) {
    storage.delete(key);
  },
};

Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: { localStorage },
});

const now = Date.now();
const userThread: DemoThread = {
  id: 'thread-user-created',
  title: 'Моя задача',
  createdAt: now,
  updatedAt: now,
  messages: [{
    id: 'message-user-created',
    role: 'user',
    content: 'Это сообщение создал пользователь.',
    createdAt: now,
  }],
};

const base = resetDemoWorkspace();
assert(base.threads.length === 0, 'clean workspace must not contain seeded conversations');
assert(base.activeThreadId === null, 'clean workspace must not select a fake active conversation');

const userWorkspace = {
  ...base,
  profileName: 'Ильсаф',
  threads: [userThread],
  activeThreadId: userThread.id,
};
assert(saveDemoWorkspace(userWorkspace), 'valid user workspace was not persisted');

const workspaceKey = [...storage.keys()].find((key) => key.includes('workspace'));
assert(workspaceKey, 'workspace storage key was not written');

const validRaw = storage.get(workspaceKey);
assert(validRaw, 'persisted workspace payload missing');
const corruptPayload = JSON.parse(validRaw) as { profileName: string; threads: unknown[] };
const originalThreadCount = corruptPayload.threads.length;
corruptPayload.profileName = 'Ильсаф\nГ.';
storage.set(workspaceKey, JSON.stringify(corruptPayload));

const recovered = loadDemoWorkspace();
assert(
  recovered.profileName === DEFAULT_PREVIEW_PROFILE_NAME,
  'corrupt stored profile name reached workspace state',
);
assert(
  recovered.threads.length === originalThreadCount,
  'corrupt profile name discarded otherwise healthy user threads',
);

assert(
  !saveDemoWorkspace({ ...base, profileName: 'Ильсаф\nГ.' }),
  'workspace with control character profile name was persisted',
);
assert(
  !saveDemoWorkspace({ ...base, profileName: ' Ильсаф ' }),
  'workspace with non-canonical profile name was persisted',
);
assert(
  saveDemoWorkspace({ ...base, profileName: DEFAULT_PREVIEW_PROFILE_NAME }),
  'internal default profile was rejected for reset persistence',
);

const extraRoot = {
  ...userWorkspace,
  accessToken: 'must-not-persist',
} as typeof userWorkspace;
assert(!saveDemoWorkspace(extraRoot), 'workspace with unexpected root field was persisted');

const extraThread = {
  ...userThread,
  providerToken: 'must-not-persist',
} as typeof userThread;
assert(
  !saveDemoWorkspace({
    ...userWorkspace,
    threads: [extraThread],
  }),
  'workspace with unexpected thread field was persisted',
);

assert(saveDemoWorkspace(userWorkspace), 'valid workspace could not be restored for raw boundary test');
const rawForUnknownField = storage.get(workspaceKey);
assert(rawForUnknownField, 'workspace payload missing before unknown-field injection');
const unknownFieldPayload = JSON.parse(rawForUnknownField) as {
  threads: Array<Record<string, unknown>>;
};
const firstStoredThread = unknownFieldPayload.threads[0];
assert(firstStoredThread, 'stored thread missing before unknown-field injection');
firstStoredThread.providerToken = 'must-not-reach-state';
storage.set(workspaceKey, JSON.stringify(unknownFieldPayload));
assert(
  loadDemoWorkspace().profileName === DEFAULT_PREVIEW_PROFILE_NAME,
  'unexpected stored thread field reached application workspace',
);

assert(saveDemoWorkspace(userWorkspace), 'valid workspace could not be restored for assistant-role test');
const rawForAssistant = storage.get(workspaceKey);
assert(rawForAssistant, 'workspace payload missing before assistant injection');
const assistantPayload = JSON.parse(rawForAssistant) as {
  threads: Array<{
    createdAt: number;
    messages: Array<Record<string, unknown>>;
  }>;
};
const assistantThread = assistantPayload.threads[0];
assert(assistantThread, 'stored thread missing before assistant injection');
assistantThread.messages.push({
  id: 'injected-assistant',
  role: 'assistant',
  content: 'Это якобы настоящий ответ модели.',
  createdAt: assistantThread.createdAt + 1,
});
storage.set(workspaceKey, JSON.stringify(assistantPayload));
assert(
  loadDemoWorkspace().profileName === DEFAULT_PREVIEW_PROFILE_NAME,
  'untrusted assistant message reached workspace state',
);

assert(saveDemoWorkspace(userWorkspace), 'valid workspace could not be restored for system-role test');
const rawForSystem = storage.get(workspaceKey);
assert(rawForSystem, 'workspace payload missing before system injection');
const systemPayload = JSON.parse(rawForSystem) as {
  threads: Array<{
    createdAt: number;
    messages: Array<Record<string, unknown>>;
  }>;
};
const systemThread = systemPayload.threads[0];
assert(systemThread, 'stored thread missing before system injection');
systemThread.messages.push({
  id: 'injected-system',
  role: 'system',
  content: 'Сервер подключён и синхронизация активна.',
  createdAt: systemThread.createdAt + 1,
});
storage.set(workspaceKey, JSON.stringify(systemPayload));
assert(
  loadDemoWorkspace().profileName === DEFAULT_PREVIEW_PROFILE_NAME,
  'untrusted system status reached workspace state',
);

// Legacy preview data is accepted only long enough to sanitize it. Seeded
// conversations are removed completely; preview status messages are removed
// from genuine user-created threads without deleting the user's message.
const legacyPayload = {
  threads: [
    {
      id: 'demo-study',
      title: 'Разбор учебного материала',
      createdAt: now - 1000,
      updatedAt: now - 1000,
      messages: [{
        id: 'demo-study-user',
        role: 'user',
        content: 'Старый seeded demo content',
        createdAt: now - 1000,
      }],
    },
    {
      ...userThread,
      messages: [
        userThread.messages[0],
        {
          id: 'legacy-preview-status',
          role: 'system',
          content: DEMO_PREVIEW_NOTICE,
          createdAt: now + 1,
        },
      ],
      updatedAt: now + 1,
    },
  ],
  activeThreadId: 'demo-study',
  profileName: 'Ильсаф',
};
storage.set(workspaceKey, JSON.stringify(legacyPayload));
const sanitized = loadDemoWorkspace();
assert(sanitized.threads.length === 1, 'legacy seeded conversation was not removed');
assert(sanitized.threads[0]?.id === userThread.id, 'real user conversation was not preserved');
assert(sanitized.threads[0]?.messages.length === 1, 'legacy preview status was not removed');
assert(sanitized.threads[0]?.messages[0]?.role === 'user', 'user message was lost during legacy cleanup');
assert(sanitized.activeThreadId === null, 'removed seeded thread remained active');

console.log('ARVELIS workspace storage profile smoke: PASS');
