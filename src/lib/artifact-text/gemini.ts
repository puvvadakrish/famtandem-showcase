import "server-only";
import type { ArtifactTextExtractorInput } from "@/lib/artifact-text/provider";

export type GeminiArtifactTextOptions = {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
};

const DEFAULT_TIMEOUT_MS = 60_000;

export function createGeminiArtifactTextExtractor(options: GeminiArtifactTextOptions) {
  return async function extractArtifactTextWithGemini(input: ArtifactTextExtractorInput) {
    return callGeminiForArtifactText(input, options);
  };
}

async function callGeminiForArtifactText(
  input: ArtifactTextExtractorInput,
  options: GeminiArtifactTextOptions
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": options.apiKey
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  inline_data: {
                    mime_type: input.mimeType,
                    data: Buffer.from(input.bytes).toString("base64")
                  }
                },
                { text: buildArtifactTextPrompt(input.fileName) }
              ]
            }
          ],
          generationConfig: {
            temperature: 0
          }
        })
      }
    );
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw new Error(`Gemini OCR request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(await buildGeminiErrorMessage(response));
  }

  const payload = (await response.json()) as GeminiGenerateContentResponse;
  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini OCR response did not include extracted text.");
  }

  return text;
}

async function buildGeminiErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as GeminiGenerateContentResponse;
    return payload.error?.message ?? `Gemini OCR request failed with status ${response.status}.`;
  } catch {
    return `Gemini OCR request failed with status ${response.status}.`;
  }
}

export function buildArtifactTextPrompt(fileName: string) {
  return [
    "Extract the readable source text from this uploaded family logistics document or screenshot.",
    "Return plain text only. Do not summarize, classify, create cards, or add commentary.",
    "Preserve dates, times, locations, names, lists, form/payment/readiness details, and change notices when visible.",
    "If text is arranged in columns or tables, transcribe it in a readable order.",
    "If no readable logistics text is visible, return an empty response.",
    "",
    `File name: ${fileName}`
  ].join("\n");
}
