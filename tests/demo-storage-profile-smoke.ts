import { DEFAULT_PREVIEW_PROFILE_NAME } from '../src/auth/previewProfile';
import {
  loadDemoWorkspace,
  resetDemoWorkspace,
  saveDemoWorkspace,
} from '../src/lib/demoStorage';

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

const base = resetDemoWorkspace();
assert(saveDemoWorkspace({ ...base, profileName: 'Ильсаф' }), 'valid workspace profile was not persisted');

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
  'corrupt profile name discarded otherwise healthy workspace threads',
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
  'internal default preview profile was rejected for reset persistence',
);

console.log('ARVELIS demo storage profile smoke: PASS');
