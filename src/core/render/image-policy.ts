/**
 * Image source policy (docs/SECURITY.md, DECISIONS D-013).
 *
 * Default: only base64 `data:` URIs of PNG, JPEG, GIF or WebP whose leading
 * bytes match the declared type, up to `maxBytes` decoded. SVG images are
 * never accepted (they can carry script). Remote URLs are rejected unless the
 * host supplies `allowUrl`, and even then only `https:` is permitted.
 */
export interface ImagePolicy {
  /** Return true to permit an https URL. Called only for syntactically valid https URLs. */
  readonly allowUrl?: (url: URL) => boolean;
  /** Maximum decoded data-URI size in bytes. Defaults to the template limit (512 KiB). */
  readonly maxBytes?: number;
}

export type ImageCheck = { readonly ok: true; readonly kind: "data" | "url" } | { readonly ok: false; readonly code: string; readonly message: string };

const DATA_URI = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_URL_LENGTH = 2048;

const MAGIC: Record<string, (b: Uint8Array) => boolean> = {
  png: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  gif: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  webp: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
};

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Decode the first `count` base64 chars (multiple of 4) without relying on atob. */
function decodeBase64Prefix(b64: string, count: number): Uint8Array {
  const chunk = b64.slice(0, count);
  const out: number[] = [];
  for (let i = 0; i + 3 < chunk.length; i += 4) {
    const n = (B64.indexOf(chunk[i]!) << 18) | (B64.indexOf(chunk[i + 1]!) << 12) | (Math.max(0, B64.indexOf(chunk[i + 2]!)) << 6) | Math.max(0, B64.indexOf(chunk[i + 3]!));
    out.push((n >> 16) & 255, (n >> 8) & 255, n & 255);
  }
  return Uint8Array.from(out);
}

export function checkImageSource(src: string, policy: ImagePolicy | undefined, defaultMaxBytes: number): ImageCheck {
  if (src.startsWith("data:")) {
    const m = DATA_URI.exec(src);
    if (!m) {
      return { ok: false, code: "IMAGE_SOURCE_INVALID", message: "Only base64 data URIs of PNG, JPEG, GIF or WebP images are allowed." };
    }
    const payload = m[2]!;
    if (payload.length % 4 !== 0) return { ok: false, code: "IMAGE_SOURCE_INVALID", message: "Image data is not valid base64." };
    const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
    const bytes = (payload.length / 4) * 3 - padding;
    const max = policy?.maxBytes ?? defaultMaxBytes;
    if (bytes > max) return { ok: false, code: "IMAGE_TOO_LARGE", message: `Image is ${bytes} bytes; the limit is ${max} bytes.` };
    if (payload.length < 16 || !MAGIC[m[1]!]!(decodeBase64Prefix(payload, 16))) {
      return { ok: false, code: "IMAGE_CONTENT_MISMATCH", message: `Image data does not match its declared type image/${m[1]}.` };
    }
    return { ok: true, kind: "data" };
  }
  if (src.length > MAX_URL_LENGTH) return { ok: false, code: "IMAGE_SOURCE_INVALID", message: "Image URL is too long." };
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return { ok: false, code: "IMAGE_SOURCE_INVALID", message: "Image source must be a data URI or an absolute https URL." };
  }
  if (url.protocol !== "https:") return { ok: false, code: "IMAGE_URL_NOT_ALLOWED", message: "Only https image URLs can be allowed." };
  if (url.username || url.password) return { ok: false, code: "IMAGE_URL_NOT_ALLOWED", message: "Image URLs must not contain credentials." };
  if (!policy?.allowUrl || !policy.allowUrl(url)) {
    return { ok: false, code: "IMAGE_URL_NOT_ALLOWED", message: "Remote image URLs are not allowed by the image policy." };
  }
  return { ok: true, kind: "url" };
}
