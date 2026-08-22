export type ChatModelCapability = 'text' | 'image' | 'file' | 'video' | 'audio';

export type ChatModelOption = {
  id: string;
  label: string;
  providerLabel: string;
  capabilities: ChatModelCapability[];
};

/**
 * Deliberately empty until a real AI provider gateway exposes configured models.
 * UI may present the selector shell, but it must never invent or enable models.
 */
export const CONNECTED_CHAT_MODELS: readonly ChatModelOption[] = [];

export const CHAT_MODEL_UNAVAILABLE_LABEL = 'Модель не подключена';
