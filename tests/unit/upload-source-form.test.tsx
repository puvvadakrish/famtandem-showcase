import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UploadSourceForm } from "@/components/upload-source-form";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  rpc: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  deleteSource: vi.fn(),
  deleteEq: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh
  })
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    rpc: mocks.rpc,
    storage: {
      from: () => ({
        upload: mocks.upload,
        remove: mocks.remove
      })
    },
    from: () => ({
      delete: mocks.deleteSource
    })
  })
}));

beforeEach(() => {
  mocks.push.mockReset();
  mocks.refresh.mockReset();
  mocks.rpc.mockReset();
  mocks.upload.mockReset();
  mocks.remove.mockReset();
  mocks.deleteSource.mockReset();
  mocks.deleteEq.mockReset();

  mocks.deleteSource.mockReturnValue({ eq: mocks.deleteEq });
  mocks.deleteEq.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.upload.mockResolvedValue({ error: null });
});

describe("UploadSourceForm", () => {
  it("cleans up storage before source metadata when finalization fails", async () => {
    mockMetadataRpc();
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "create_upload_source_metadata") return metadataSingle();
      if (name === "finalize_upload_source_artifact") {
        return Promise.resolve({ error: new Error("finalize failed") });
      }
      throw new Error(`Unexpected RPC ${name}`);
    });

    render(<UploadSourceForm />);
    selectTextFile();
    fireEvent.submit(screen.getByRole("form", { name: "Upload file or screenshot" }));

    await waitFor(() => {
      expect(mocks.remove).toHaveBeenCalledWith(["household-1/source-1/notice.txt"]);
    });
    expect(mocks.deleteSource).toHaveBeenCalled();
    expect(mocks.deleteEq).toHaveBeenCalledWith("id", "source-1");
    expect(mocks.remove.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteSource.mock.invocationCallOrder[0]
    );
  });

  it("does not clean up finalized uploads if navigation fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockMetadataRpc();
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "create_upload_source_metadata") return metadataSingle();
      if (name === "finalize_upload_source_artifact") {
        return Promise.resolve({ error: null });
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
    mocks.push.mockImplementation(() => {
      throw new Error("navigation failed");
    });

    render(<UploadSourceForm />);
    selectTextFile();
    fireEvent.submit(screen.getByRole("form", { name: "Upload file or screenshot" }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/app/sources/source-1");
    });
    expect(errorSpy).toHaveBeenCalledWith(
      "Navigation failed after successful upload finalization.",
      { name: "Error", message: "navigation failed" }
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.deleteSource).not.toHaveBeenCalled();
  });

  it("keeps source metadata when storage cleanup fails", async () => {
    mockMetadataRpc();
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "create_upload_source_metadata") return metadataSingle();
      if (name === "finalize_upload_source_artifact") {
        return Promise.resolve({ error: new Error("finalize failed") });
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
    mocks.remove.mockResolvedValue({ error: new Error("storage remove denied") });

    render(<UploadSourceForm />);
    selectTextFile();
    fireEvent.submit(screen.getByRole("form", { name: "Upload file or screenshot" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("storage remove denied");
    });
    expect(mocks.remove).toHaveBeenCalledWith(["household-1/source-1/notice.txt"]);
    expect(mocks.deleteSource).not.toHaveBeenCalled();
  });
});

function selectTextFile() {
  const input = screen.getByLabelText("File") as HTMLInputElement;
  const file = new File(["Pickup at 3 PM."], "notice.txt", { type: "text/plain" });
  Object.defineProperty(file, "arrayBuffer", {
    value: vi.fn(async () => new TextEncoder().encode("Pickup at 3 PM.").buffer)
  });
  fireEvent.change(input, { target: { files: [file] } });
}

function mockMetadataRpc() {
  mocks.rpc.mockReturnValue(metadataSingle());
}

function metadataSingle() {
  return {
    single: vi.fn().mockResolvedValue({
      data: {
        source_input_id: "source-1",
        source_artifact_id: "artifact-1",
        storage_path: "household-1/source-1/notice.txt"
      },
      error: null
    })
  };
}
