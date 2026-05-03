/**
 * Unit tests for the artifact upload service. We focus on the validation
 * layer here — DB-dependent auth paths and the full happy path are
 * exercised by the e2e test in Step 9.
 */
import { describe, it, expect } from "vitest";
import {
  createArtifactFromUpload,
  UploadValidationError,
  MAX_UPLOAD_BYTES,
} from "../artifact-service.js";

const PDF_MIME = "application/pdf";
const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const baseInput = {
  userId: "00000000-0000-0000-0000-000000000000",
  studentId: "00000000-0000-0000-0000-000000000001",
  courseId: "00000000-0000-0000-0000-000000000002",
  filename: "paper.pdf",
  mimeType: PDF_MIME,
};

describe("createArtifactFromUpload — validation", () => {
  it("rejects an empty buffer", async () => {
    await expect(
      createArtifactFromUpload({ ...baseInput, buffer: Buffer.from("") })
    ).rejects.toBeInstanceOf(UploadValidationError);
  });

  it("rejects a file exceeding the size cap", async () => {
    // Allocate one byte past the cap; Buffer.alloc is zero-filled which
    // is fine because the size check runs before any parsing.
    const oversized = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
    await expect(
      createArtifactFromUpload({ ...baseInput, buffer: oversized })
    ).rejects.toThrow(/20 MB/);
  });

  it("rejects PPTX with a helpful error message", async () => {
    await expect(
      createArtifactFromUpload({
        ...baseInput,
        buffer: Buffer.from("pretend pptx"),
        mimeType: PPTX_MIME,
        filename: "deck.pptx",
      })
    ).rejects.toThrow(/PPTX/);
  });

  it("rejects unknown mime types with a helpful error message", async () => {
    await expect(
      createArtifactFromUpload({
        ...baseInput,
        buffer: Buffer.from("x"),
        mimeType: "application/octet-stream",
        filename: "mystery.bin",
      })
    ).rejects.toThrow(/Unsupported file type/);
  });
});
