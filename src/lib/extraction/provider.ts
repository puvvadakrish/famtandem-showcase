import "server-only";
import { runLocalExtractor, localExtractorModel, localExtractorProvider } from "@/lib/extraction/local-extractor";
import { createGeminiRuntimeExtractor } from "@/lib/extraction/gemini-runtime";
import type { ExtractorFn } from "@/lib/extraction/runner";

export type SelectedExtractor = {
  provider: string;
  model: string;
  extractor: ExtractorFn;
};

export type ExtractorEnv = {
  EXTRACTION_PROVIDER?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
};

export function selectExtractor(env: ExtractorEnv): SelectedExtractor {
  const provider = env.EXTRACTION_PROVIDER ?? "local-stub";
  const apiKey = (env.GEMINI_API_KEY ?? "").trim();
  const model = (env.GEMINI_MODEL ?? "").trim() || "gemini-3.5-flash";

  if (provider === "gemini" && apiKey.length > 0) {
    return {
      provider: "gemini",
      model,
      extractor: createGeminiRuntimeExtractor({ apiKey, model })
    };
  }

  return {
    provider: localExtractorProvider,
    model: localExtractorModel,
    extractor: runLocalExtractor
  };
}
