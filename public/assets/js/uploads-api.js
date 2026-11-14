const BASE = (window.WREADS && window.WREADS.basePath) || "";

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${BASE}/api${path}`, {
      ...options,
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }
  const data = await response.json().catch(() => null);
  // Upload validation returns rejected files with status 422.
  if (path === "/upload" && response.status === 422 && Array.isArray(data?.rejected)) return data;
  if (!response.ok) {
    throw new Error(response.status >= 500
      ? "The server could not complete the upload request. Please try again later."
      : (typeof data?.error === "string" ? data.error : data?.error?.message) || "The upload request failed.");
  }
  if (!data) throw new Error("Unexpected server response. Please reload and try again.");
  return data;
}

export async function uploadFiles(files) {
  const body = new FormData();
  for (const file of files) body.append("files[]", file);
  const data = await request("/upload", { method: "POST", body });
  if (!Array.isArray(data.files) || !Array.isArray(data.rejected)) {
    throw new Error("Unexpected upload response. Please reload and try again.");
  }
  return data;
}

export function savedUpload(file) {
  return { ...file, name: file.original_name ?? file.name, size: file.size_bytes ?? file.size, server: true };
}

export async function listUploads() {
  const data = await request("/uploads");
  return data.uploads.map(savedUpload);
}

export async function loadUploadText(id) {
  const data = await request(`/uploads/${encodeURIComponent(id)}`);
  return data.upload.pages.join("\n\n");
}

export async function deleteUpload(id) {
  await request(`/uploads/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function rejectionMessage(rejected) {
  return rejected.map((file) => `${file.name}: ${file.reason}`).join(" ");
}
