import { compress } from "woff2-encoder";

/** A Worker of subsetFaces and cutFacesToPdf: one TrueType face in, its WOFF2 back, or null for a
 * face that cannot be encoded, which the caller then fails on with the encoder's own error. */
self.onmessage = async ({ data }: MessageEvent<Uint8Array>) => {
  postMessage(await compress(data).catch(() => null));
};
