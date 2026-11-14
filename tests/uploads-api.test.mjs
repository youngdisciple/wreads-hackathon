import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../public/assets/js/uploads-api.js", import.meta.url), "utf8");

test("uploads use multipart files[], session cookies, and the application base path", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  try {
    for (const basePath of ["", "/wreads-hackaton"]) {
      globalThis.window = { WREADS: { basePath } };
      const api = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}#${basePath}`);
      const file = new File(["These notes contain several words."], "notes.txt", { type: "text/plain" });
      const result = { guest: true, files: [{ id: null, name: file.name, size: file.size, pages: ["These notes contain several words."] }], rejected: [] };
      let call;
      globalThis.fetch = async (url, options) => {
        call = { url, ...options };
        return { ok: true, status: 201, json: async () => result };
      };
      assert.deepEqual(await api.uploadFiles([file, file]), result);
      assert.equal(call.url, `${basePath}/api/upload`);
      assert.equal(call.method, "POST");
      assert.equal(call.credentials, "same-origin");
      assert.equal(call.headers["Content-Type"], undefined); // Browser must set the multipart boundary.
      assert.equal(call.body.getAll("files[]").length, 2);
      assert.equal(await call.body.get("files[]").text(), await file.text());

      const rejected = { ...result, files: [], rejected: [{ name: "empty.pdf", reason: "No text found." }] };
      globalThis.fetch = async () => ({ ok: false, status: 422, json: async () => rejected });
      assert.deepEqual(await api.uploadFiles([file]), rejected);
      assert.equal(api.rejectionMessage(rejected.rejected), "empty.pdf: No text found.");
      const partial = { ...result, rejected: rejected.rejected };
      globalThis.fetch = async () => ({ ok: true, status: 201, json: async () => partial });
      assert.deepEqual(await api.uploadFiles([file]), partial);

      globalThis.fetch = async (url, options) => {
        call = { url, ...options };
        return { ok: true, json: async () => ({ uploads: [{ id: "saved-id", original_name: "notes.txt", size_bytes: 32 }], upload: { pages: ["First page", "Second page"] }, ok: true }) };
      };
      assert.deepEqual(await api.listUploads(), [{ id: "saved-id", original_name: "notes.txt", size_bytes: 32, name: "notes.txt", size: 32, server: true }]);
      assert.equal(await api.loadUploadText("saved-id"), "First page\n\nSecond page");
      await api.deleteUpload("saved-id");
      assert.equal(call.method, "DELETE");
      assert.equal(call.url, `${basePath}/api/uploads/saved-id`);

      globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: "Log in first." }) });
      await assert.rejects(api.listUploads(), /Log in first/);
      globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
      await assert.rejects(api.uploadFiles([file]), /Unexpected upload response/);
      globalThis.fetch = async () => { throw new TypeError(); };
      await assert.rejects(api.uploadFiles([file]), /Could not reach the server/);
    }
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});
