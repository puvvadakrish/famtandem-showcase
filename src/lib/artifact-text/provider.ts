import "server-only";
import { createGeminiArtifactTextExtractor } from "@/lib/artifact-text/gemini";

export type ArtifactTextExtractorInput = {
  bytes: ArrayBuffer;
  mimeType: string;
  fileName: string;
};

export type ArtifactTextExtractor = (
  input: ArtifactTextExtractorInput
) => Promise<string>;

export type ArtifactTextProviderEnv = {
  ARTIFACT_TEXT_PROVIDER?: string;
  ARTIFACT_TEXT_MODEL?: string;
  GEMINI_API_KEY?: string;
};

export type SelectedArtifactTextProvider = {
  provider: "disabled" | "gemini";
  model: string;
  extractor: ArtifactTextExtractor | null;
};

export function selectArtifactTextProvider(
  env: ArtifactTextProviderEnv
): SelectedArtifactTextProvider {
  const provider = env.ARTIFACT_TEXT_PROVIDER ?? "disabled";
  const apiKey = (env.GEMINI_API_KEY ?? "").trim();
  const model = (env.ARTIFACT_TEXT_MODEL ?? "").trim() || "gemini-3.5-flash";

  if (provider === "gemini" && apiKey.length > 0) {
    return {
      provider: "gemini",
      model,
      extractor: createGeminiArtifactTextExtractor({ apiKey, model })
    };
  }

  return {
    provider: "disabled",
    model: "disabled",
    extractor: null
  };
}
