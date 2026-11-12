import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import {
  selectArtifactTextProvider,
  type ArtifactTextExtractor
} from "@/lib/artifact-text/provider";

const SOURCE_ARTIFACTS_BUCKET = "source-artifacts";
const MAX_EXTRACTED_TEXT_CHARS = 50_000;
const OCR_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

type SourceArtifactRow = {
  id: string;
  source_input_id: string;
  household_id: string;
  storage_bucket: string;
  storage_path: string;
  original_file_name: string;
  mime_type: string;
  text_extraction_status: string;
};

export async function extractTextForSourceArtifact({
  supabase,
  sourceArtifactId,
  artifactTextExtractor
}: {
  supabase: SupabaseClient;
  sourceArtifactId: string;
  artifactTextExtractor?: ArtifactTextExtractor | null;
}) {
  const artifact = await loadArtifact(supabase, sourceArtifactId);

  if (["succeeded", "needs_review", "not_applicable"].includes(artifact.text_extraction_status)) {
    return;
  }

  if (artifact.storage_bucket !== SOURCE_ARTIFACTS_BUCKET) {
    await recordArtifactTextExtraction(supabase, artifact.id, {
      status: "failed",
      error: "Artifact storage bucket is not supported."
    });
    throw new Error("Artifact storage bucket is not supported.");
  }

  if (artifact.mime_type !== "text/plain" && !OCR_MIME_TYPES.has(artifact.mime_type)) {
    await recordArtifactTextExtraction(supabase, artifact.id, {
      status: "not_applicable",
      error: "Artifact file type is not supported for text extraction."
    });
    return;
  }

  const selectedExtractor = artifact.mime_type === "text/plain"
    ? null
    : artifactTextExtractor === undefined
      ? selectArtifactTextProvider(getServerEnv()).extractor
      : artifactTextExtractor;

  if (artifact.mime_type !== "text/plain" && !selectedExtractor) {
    await recordArtifactTextExtraction(supabase, artifact.id, {
      status: "not_applicable",
      error: "OCR provider is not enabled for this file type."
    });
    return;
  }

  const { data, error } = await supabase.storage
    .from(artifact.storage_bucket)
    .download(artifact.storage_path);

  if (error || !data) {
    await recordArtifactTextExtraction(supabase, artifact.id, {
      status: "failed",
      error: "Uploaded artifact object could not be read."
    });
    throw new Error(`Uploaded artifact object could not be read: ${error?.message ?? "not found"}`);
  }

  let extractedText: string;
  try {
    extractedText = artifact.mime_type === "text/plain"
      ? await data.text()
      : await selectedExtractor!({
          bytes: await data.arrayBuffer(),
          mimeType: artifact.mime_type,
          fileName: artifact.original_file_name
        });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Artifact text extraction failed.";
    await recordArtifactTextExtraction(supabase, artifact.id, {
      status: "failed",
      error: message
    });
    throw error;
  }

  const text = normalizeText(extractedText);

  if (!text) {
    await recordArtifactTextExtraction(supabase, artifact.id, {
      status: "not_applicable",
      error: "Uploaded artifact did not contain readable text."
    });
    return;
  }

  await recordArtifactTextExtraction(supabase, artifact.id, {
    status: "succeeded",
    normalizedText: text
  });
}

async function loadArtifact(supabase: SupabaseClient, sourceArtifactId: string) {
  const { data, error } = await supabase
    .from("source_artifacts")
    .select("id, source_input_id, household_id, storage_bucket, storage_path, original_file_name, mime_type, text_extraction_status")
    .eq("id", sourceArtifactId)
    .single<SourceArtifactRow>();

  if (error || !data) {
    throw new Error(`Unable to load source artifact ${sourceArtifactId}: ${error?.message ?? "not found"}`);
  }

  return data;
}

async function recordArtifactTextExtraction(
  supabase: SupabaseClient,
  sourceArtifactId: string,
  input: {
    status: "succeeded" | "failed" | "needs_review" | "not_applicable";
    normalizedText?: string;
    error?: string;
  }
) {
  const { error } = await supabase.rpc("record_artifact_text_extraction", {
    p_source_artifact_id: sourceArtifactId,
    p_status: input.status,
    p_normalized_text: input.normalizedText ?? null,
    p_error: input.error ?? null
  });

  if (error) {
    throw new Error(`Unable to record artifact text extraction: ${error.message}`);
  }
}

function normalizeText(value: string) {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (normalized.length <= MAX_EXTRACTED_TEXT_CHARS) return normalized;
  return normalized.slice(0, MAX_EXTRACTED_TEXT_CHARS);
}
