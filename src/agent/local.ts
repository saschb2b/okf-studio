export type LocalModelProvider =
  | "ollama"
  | "lm-studio"
  | "llama-cpp"
  | "open-ai-compatible";

export interface LocalModelProfileInput {
  name: string;
  provider: LocalModelProvider;
  baseUrl: string;
}

export interface LocalModelProfile extends LocalModelProfileInput {
  id: string;
}

export interface LocalModelProbe {
  provider: LocalModelProvider;
  baseUrl: string;
  models: readonly string[];
}

export const LOCAL_MODEL_PRESETS = {
  ollama: { label: "Ollama", baseUrl: "http://127.0.0.1:11434" },
  "lm-studio": { label: "LM Studio", baseUrl: "http://127.0.0.1:1234" },
  "llama-cpp": { label: "llama.cpp", baseUrl: "http://127.0.0.1:8080" },
  "open-ai-compatible": { label: "OpenAI-compatible", baseUrl: "" },
} satisfies Record<LocalModelProvider, { label: string; baseUrl: string }>;

export function localModelProviderLabel(provider: LocalModelProvider): string {
  return LOCAL_MODEL_PRESETS[provider].label;
}
