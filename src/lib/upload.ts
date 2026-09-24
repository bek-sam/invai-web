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

/** Presign, PUT straight to S3/MinIO, return the file key to use in other calls. */
export async function uploadFile(
  kind: FileKind,
  file: File,
  onProgress?: (ratio: number) => void,
): Promise<string> {
  const contentType = guessContentType(file);
  const presigned = await client.files.presignUpload({
    kind,
    filename: file.name,
    contentType,
    sizeBytes: file.size,
  });
  await new Promise<void>((resolve, reject) => {
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
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Upload failed: storage unreachable"));
    xhr.send(file);
  });
  onProgress?.(1);
  return presigned.fileKey;
}

/** Opens a signed URL in a new tab (labels PDF, sheet downloads). */
export function openInNewTab(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}
