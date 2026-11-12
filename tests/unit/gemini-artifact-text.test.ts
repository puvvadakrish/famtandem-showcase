import { describe, expect, it, vi } from "vitest";
import {
  buildArtifactTextPrompt,
  createGeminiArtifactTextExtractor
} from "@/lib/artifact-text/gemini";

describe("Gemini artifact text extraction", () => {
  it("sends inline artifact bytes and returns extracted text", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Pickup at 3 PM" }] } }]
      })
    });
    const extractor = createGeminiArtifactTextExtractor({
      apiKey: "test-key",
      model: "gemini-3.5-flash",
      fetchImpl: fetchImpl as never
    });

    const text = await extractor({
      bytes: new Uint8Array([1, 2, 3]).buffer,
      mimeType: "image/png",
      fileName: "screenshot.png"
    });

    expect(text).toBe("Pickup at 3 PM");
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("gemini-3.5-flash:generateContent"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-goog-api-key": "test-key"
        })
      })
    );
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1].body));
    expect(body.contents[0].parts[0]).toEqual({
      inline_data: {
        mime_type: "image/png",
        data: Buffer.from([1, 2, 3]).toString("base64")
      }
    });
    expect(body.contents[0].parts[1].text).toContain("Return plain text only");
  });

  it("reports HTTP status when Gemini returns a non-JSON error response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      }
    });
    const extractor = createGeminiArtifactTextExtractor({
      apiKey: "test-key",
      model: "gemini-3.5-flash",
      fetchImpl: fetchImpl as never
    });

    await expect(
      extractor({
        bytes: new Uint8Array([1, 2, 3]).buffer,
        mimeType: "application/pdf",
        fileName: "notice.pdf"
      })
    ).rejects.toThrow("Gemini OCR request failed with status 502.");
  });

  it("builds a text-only OCR prompt that does not request cards", () => {
    const prompt = buildArtifactTextPrompt("notice.pdf");

    expect(prompt).toContain("Extract the readable source text");
    expect(prompt).toContain("Return plain text only");
    expect(prompt).toContain("Do not summarize, classify, create cards");
  });
});
