"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FileUp, ShieldCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/ui";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const SOURCE_ARTIFACTS_BUCKET = "source-artifacts";
const ALLOWED_UPLOAD_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain"
]);

const uploadAccept = Array.from(ALLOWED_UPLOAD_TYPES).join(",");

type UploadMetadataResult = {
  source_input_id: string;
  source_artifact_id: string;
  storage_path: string;
};

export function UploadSourceForm() {
  const fileInputId = useId();
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceTitle, setSourceTitle] = useState("");
  const [status, setStatus] = useState<"idle" | "uploading" | "success">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const validationError = validateUploadFile(selectedFile);
    if (validationError) {
      setError(validationError);
      return;
    }

    const file = selectedFile;
    if (!file) return;
    setStatus("uploading");
    let sourceInputId: string | null = null;
    let storagePath: string | null = null;
    let isFinalized = false;

    try {
      const checksum = await sha256Hex(file);
      const { data, error: metadataError } = await supabase
        .rpc("create_upload_source_metadata", {
          p_raw_subject: sourceTitle.trim() || file.name,
          p_original_file_name: file.name,
          p_mime_type: file.type,
          p_file_size_bytes: file.size,
          p_checksum_sha256: checksum
        })
        .single<UploadMetadataResult>();

      if (metadataError) throw metadataError;
      if (!data?.source_input_id || !data.storage_path) {
        throw new Error("Upload metadata was not created.");
      }
      if (!data.source_artifact_id) {
        throw new Error("Upload artifact metadata was not created.");
      }

      sourceInputId = data.source_input_id;
      storagePath = data.storage_path;

      const { error: uploadError } = await supabase.storage
        .from(SOURCE_ARTIFACTS_BUCKET)
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { error: finalizeError } = await supabase.rpc("finalize_upload_source_artifact", {
        p_source_input_id: data.source_input_id,
        p_source_artifact_id: data.source_artifact_id
      });

      if (finalizeError) throw finalizeError;
      isFinalized = true;

      setStatus("success");
      try {
        router.push(`/app/sources/${sourceInputId}`);
        router.refresh();
      } catch (navigationError) {
        console.error(
          "Navigation failed after successful upload finalization.",
          navigationError instanceof Error
            ? { name: navigationError.name, message: navigationError.message }
            : { name: "UnknownError" }
        );
      }
    } catch (caught) {
      let cleanupError: unknown = null;
      if (!isFinalized && storagePath) {
        const { error: removeError } = await supabase.storage
          .from(SOURCE_ARTIFACTS_BUCKET)
          .remove([storagePath]);
        cleanupError = removeError;
      }
      if (!cleanupError && !isFinalized && sourceInputId) {
        await supabase.from("source_inputs").delete().eq("id", sourceInputId);
      }
      setStatus("idle");
      setError(errorMessage(cleanupError ?? caught));
    }
  }

  return (
    <form
      aria-label="Upload file or screenshot"
      className="mt-3 space-y-3 rounded-lg border border-line bg-white p-3"
      onSubmit={onSubmit}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber text-white">
          <FileUp className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">Upload file or screenshot</h3>
          <p className="mt-1 text-xs leading-5 text-graphite">
            One PDF, image, screenshot, or text file. 10 MB max.
          </p>
        </div>
      </div>

      <label className="block text-sm font-semibold text-ink">
        Upload title
        <input
          className={controlClassName}
          name="uploadSourceTitle"
          onChange={(event) => setSourceTitle(event.target.value)}
          placeholder={selectedFile?.name ?? "School flyer, team schedule, appointment note"}
          value={sourceTitle}
        />
      </label>

      <label className="block text-sm font-semibold text-ink" htmlFor={fileInputId}>
        File
      </label>
      <input
        accept={uploadAccept}
        className={cn(controlClassName, "file:mr-3 file:rounded-md file:border-0 file:bg-sage file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-moss")}
        id={fileInputId}
        name="uploadFile"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          setSelectedFile(file);
          setError(validateUploadFile(file));
        }}
        required
        type="file"
      />

      {selectedFile ? (
        <p className="rounded-md bg-cream px-3 py-2 text-xs leading-5 text-graphite">
          {selectedFile.name} · {selectedFile.type || "unknown type"} · {formatBytes(selectedFile.size)}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-md border border-coral/25 bg-red-50 px-3 py-2 text-sm font-semibold text-coral" role="alert">
          {error}
        </p>
      ) : null}

      <button
        className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-moss px-3 text-sm font-semibold text-white shadow-inset transition hover:bg-[#244d3c] disabled:bg-sage disabled:text-moss"
        disabled={status === "uploading" || Boolean(validateUploadFile(selectedFile))}
        type="submit"
      >
        <FileUp className="h-4 w-4" aria-hidden="true" />
        {status === "uploading" ? "Uploading source" : "Upload source"}
      </button>

      <p className="flex items-start gap-2 text-xs font-semibold leading-5 text-graphite">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-moss" aria-hidden="true" />
        Uploads stay private and attach to a source review page before cards are created.
      </p>
    </form>
  );
}

function validateUploadFile(file: File | null) {
  if (!file) return "Choose one file to upload.";
  if (file.size <= 0) return "Choose a file with content.";
  if (file.size > MAX_UPLOAD_BYTES) return "Choose a file that is 10 MB or smaller.";
  if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
    return "Upload a PDF, JPEG, PNG, WebP, or plain text file.";
  }
  return null;
}

async function sha256Hex(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "The upload could not finish. Try again with a smaller supported file.";
}

const controlClassName =
  "mt-2 min-h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink outline-none transition placeholder:text-graphite/70 focus:border-moss focus:ring-2 focus:ring-sage disabled:bg-paper";
