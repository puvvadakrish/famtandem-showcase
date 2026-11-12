import { describe, expect, it, vi } from "vitest";
import { extractTextForSourceArtifact } from "@/lib/artifact-text/runner";

describe("extractTextForSourceArtifact", () => {
  it("downloads text/plain artifacts and records normalized text", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const download = vi.fn().mockResolvedValue({
      data: { text: async () => "  Pickup at 3pm.\r\nBring cleats.  " },
      error: null
    });
    const supabase = supabaseMock({
      rpc,
      download,
      artifact: {
        id: "artifact-1",
        source_input_id: "source-1",
        household_id: "household-1",
        storage_bucket: "source-artifacts",
        storage_path: "household-1/source-1/file.txt",
        original_file_name: "file.txt",
        mime_type: "text/plain",
        text_extraction_status: "pending"
      }
    });

    await extractTextForSourceArtifact({
      supabase: supabase as never,
      sourceArtifactId: "artifact-1"
    });

    expect(download).toHaveBeenCalledWith("household-1/source-1/file.txt");
    expect(rpc).toHaveBeenCalledWith("record_artifact_text_extraction", {
      p_source_artifact_id: "artifact-1",
      p_status: "succeeded",
      p_normalized_text: "Pickup at 3pm.\nBring cleats.",
      p_error: null
    });
  });

  it("marks unsupported PDF/image artifacts not applicable without OCR provider calls", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const download = vi.fn();
    const supabase = supabaseMock({
      rpc,
      download,
      artifact: {
        id: "artifact-1",
        source_input_id: "source-1",
        household_id: "household-1",
        storage_bucket: "source-artifacts",
        storage_path: "household-1/source-1/file.pdf",
        original_file_name: "file.pdf",
        mime_type: "application/pdf",
        text_extraction_status: "pending"
      }
    });

    await extractTextForSourceArtifact({
      supabase: supabase as never,
      sourceArtifactId: "artifact-1",
      artifactTextExtractor: null
    });

    expect(download).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("record_artifact_text_extraction", {
      p_source_artifact_id: "artifact-1",
      p_status: "not_applicable",
      p_normalized_text: null,
      p_error: "OCR provider is not enabled for this file type."
    });
  });

  it("uses an injected OCR extractor for PDF/image artifacts", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const download = vi.fn().mockResolvedValue({
      data: {
        arrayBuffer: async () => bytes,
        text: async () => "not used"
      },
      error: null
    });
    const artifactTextExtractor = vi.fn().mockResolvedValue("  Pickup moved to 4 PM.  ");
    const supabase = supabaseMock({
      rpc,
      download,
      artifact: {
        id: "artifact-1",
        source_input_id: "source-1",
        household_id: "household-1",
        storage_bucket: "source-artifacts",
        storage_path: "household-1/source-1/file.pdf",
        original_file_name: "file.pdf",
        mime_type: "application/pdf",
        text_extraction_status: "pending"
      }
    });

    await extractTextForSourceArtifact({
      supabase: supabase as never,
      sourceArtifactId: "artifact-1",
      artifactTextExtractor
    });

    expect(download).toHaveBeenCalledWith("household-1/source-1/file.pdf");
    expect(artifactTextExtractor).toHaveBeenCalledWith({
      bytes,
      mimeType: "application/pdf",
      fileName: "file.pdf"
    });
    expect(rpc).toHaveBeenCalledWith("record_artifact_text_extraction", {
      p_source_artifact_id: "artifact-1",
      p_status: "succeeded",
      p_normalized_text: "Pickup moved to 4 PM.",
      p_error: null
    });
  });

  it("records OCR provider failures before rethrowing to the job runner", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const download = vi.fn().mockResolvedValue({
      data: {
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        text: async () => "not used"
      },
      error: null
    });
    const artifactTextExtractor = vi.fn().mockRejectedValue(new Error("Gemini OCR timed out"));
    const supabase = supabaseMock({
      rpc,
      download,
      artifact: {
        id: "artifact-1",
        source_input_id: "source-1",
        household_id: "household-1",
        storage_bucket: "source-artifacts",
        storage_path: "household-1/source-1/file.png",
        original_file_name: "file.png",
        mime_type: "image/png",
        text_extraction_status: "pending"
      }
    });

    await expect(
      extractTextForSourceArtifact({
        supabase: supabase as never,
        sourceArtifactId: "artifact-1",
        artifactTextExtractor
      })
    ).rejects.toThrow("Gemini OCR timed out");

    expect(rpc).toHaveBeenCalledWith("record_artifact_text_extraction", {
      p_source_artifact_id: "artifact-1",
      p_status: "failed",
      p_normalized_text: null,
      p_error: "Gemini OCR timed out"
    });
  });

  it("marks OCR artifacts without readable text not applicable", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const download = vi.fn().mockResolvedValue({
      data: {
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        text: async () => "not used"
      },
      error: null
    });
    const artifactTextExtractor = vi.fn().mockResolvedValue("   \n ");
    const supabase = supabaseMock({
      rpc,
      download,
      artifact: {
        id: "artifact-1",
        source_input_id: "source-1",
        household_id: "household-1",
        storage_bucket: "source-artifacts",
        storage_path: "household-1/source-1/file.webp",
        original_file_name: "file.webp",
        mime_type: "image/webp",
        text_extraction_status: "pending"
      }
    });

    await extractTextForSourceArtifact({
      supabase: supabase as never,
      sourceArtifactId: "artifact-1",
      artifactTextExtractor
    });

    expect(rpc).toHaveBeenCalledWith("record_artifact_text_extraction", {
      p_source_artifact_id: "artifact-1",
      p_status: "not_applicable",
      p_normalized_text: null,
      p_error: "Uploaded artifact did not contain readable text."
    });
  });

  it("does not retry terminal artifact text extraction states", async () => {
    const rpc = vi.fn();
    const download = vi.fn();
    const supabase = supabaseMock({
      rpc,
      download,
      artifact: {
        id: "artifact-1",
        source_input_id: "source-1",
        household_id: "household-1",
        storage_bucket: "source-artifacts",
        storage_path: "household-1/source-1/file.txt",
        original_file_name: "file.txt",
        mime_type: "text/plain",
        text_extraction_status: "succeeded"
      }
    });

    await extractTextForSourceArtifact({
      supabase: supabase as never,
      sourceArtifactId: "artifact-1"
    });

    expect(download).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});

function supabaseMock({
  rpc,
  download,
  artifact
}: {
  rpc: ReturnType<typeof vi.fn>;
  download: ReturnType<typeof vi.fn>;
  artifact: Record<string, unknown>;
}) {
  return {
    rpc,
    from: vi.fn((table: string) => {
      if (table !== "source_artifacts") throw new Error(`Unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({ data: artifact, error: null })
          })
        })
      };
    }),
    storage: {
      from: vi.fn(() => ({ download }))
    }
  };
}
