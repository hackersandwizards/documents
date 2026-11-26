import { compress } from "woff2-encoder";

export type EncodeResult = Uint8Array | null | { error: unknown };

/** A Worker of subsetFaces and cutFacesToPdf: one TrueType face in, its WOFF2 or error back.
 * The encoder's own refusal sends null so the caller gets that error by encoding in-process. */
async function compressedFace(font: Uint8Array): Promise<EncodeResult> {
  try {
    return await compress(font);
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "Error" &&
      error.message === "Failed to compress the font data."
    )
      return null;
    return { error };
  }
}

self.onmessage = async ({ data }: MessageEvent<Uint8Array>) => {
  postMessage(await compressedFace(data));
};
