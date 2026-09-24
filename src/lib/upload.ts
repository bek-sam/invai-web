import { client } from "./rpc";

type FileKind = "design" | "artwork" | "template_background" | "csv" | "photo" | "mockup" | "other";

function guessContentType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv") return "text/csv";
  if (ext === "png") return "image/png";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "pdf") return "application/pdf";
  return "application/octet-stream";
}

class UploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function put(
  presigned: { method: string; uploadUrl: string; headers: Record<string, string> },
  file: File,
  contentType: string,
  onProgress?: (ratio: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(presigned.method, presigned.uploadUrl);
    for (const [k, v] of Object.entries(presigned.headers)) xhr.setRequestHeader(k, v);
    if (!Object.keys(presigned.headers).some((h) => h.toLowerCase() === "content-type")) {
      xhr.setRequestHeader("Content-Type", contentType);
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new UploadError(`Upload failed (${xhr.status})`, xhr.status));
    xhr.onerror = () => reject(new UploadError("Upload failed: storage unreachable", 0));
    xhr.send(file);
  });
}

/**
 * Presign, PUT straight to S3/MinIO, return the file key to use in other calls.
 * A 403 from storage (seen intermittently from browsers as SignatureDoesNotMatch) gets one retry
 * with a freshly signed URL; the signature keeps binding content type and size.
 */
export async function uploadFile(
  kind: FileKind,
  file: File,
  onProgress?: (ratio: number) => void,
): Promise<string> {
  const contentType = guessContentType(file);
  for (let attempt = 1; ; attempt++) {
    const presigned = await client.files.presignUpload({
      kind,
      filename: file.name,
      contentType,
      sizeBytes: file.size,
    });
    try {
      await put(presigned, file, contentType, onProgress);
      onProgress?.(1);
      return presigned.fileKey;
    } catch (err) {
      if (attempt >= 2 || !(err instanceof UploadError) || err.status !== 403) throw err;
    }
  }
}

/** Opens a signed URL in a new tab (labels PDF, sheet downloads). */
export function openInNewTab(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}
