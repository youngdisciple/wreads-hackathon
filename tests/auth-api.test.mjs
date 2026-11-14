import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../public/assets/js/auth-api.js", import.meta.url), "utf8");

test("authentication sends JSON, keeps session cookies, and supports subfolder installs", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  try {
    for (const basePath of ["", "/wreads-hackaton"]) {
      globalThis.window = { WREADS: { basePath } };
      const api = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}#${basePath}`);
      const user = { id: 1, username: "student", email: "student@example.com" };
      const calls = [];
      globalThis.fetch = async (url, options) => {
        calls.push({ url, ...options });
        return { ok: true, json: async () => url.endsWith("/logout") ? { ok: true } : { user } };
      };
      const registration = { username: user.username, email: user.email, password: "test-password" };
      const login = { email: user.email, password: "test-password" };
      assert.deepEqual(await api.registerUser(registration), user);
      assert.deepEqual(await api.loginUser(login), user);
      assert.deepEqual(await api.getCurrentUser(), user);
      await api.logoutUser();
      assert.deepEqual(calls.map((call) => call.url), ["register", "login", "me", "logout"].map((action) => `${basePath}/api/auth/${action}`));
      assert.deepEqual(calls.map((call) => call.method), ["POST", "POST", "GET", "POST"]);
      for (const call of calls) {
        assert.equal(call.credentials, "same-origin");
        assert.equal(call.headers.Accept, "application/json");
      }
      assert.deepEqual(JSON.parse(calls[0].body), registration);
      assert.deepEqual(JSON.parse(calls[1].body), login);
      assert.equal(calls[0].headers["Content-Type"], "application/json");
      assert.equal(calls[2].body, undefined);

      globalThis.fetch = async () => ({ ok: true, json: async () => ({ user: null }) });
      assert.equal(await api.getCurrentUser(), null);

      for (const [status, message] of [[401, "Wrong email or password."], [409, "That username or email is already taken."], [422, "Please enter a valid email."]]) {
        globalThis.fetch = async () => ({ ok: false, status, json: async () => ({ error: message }) });
        await assert.rejects(api.loginUser(login), { message });
      }
      globalThis.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: "Invalid request" } }) });
      await assert.rejects(api.loginUser(login), /Invalid request/);

      globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({ error: { message: "Database credentials" } }) });
      await assert.rejects(api.loginUser(login), /The server could not complete/);
      globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
      await assert.rejects(api.getCurrentUser(), /Could not reach the server/);
      globalThis.fetch = async () => ({ ok: true, json: async () => { throw new SyntaxError(); } });
      await assert.rejects(api.getCurrentUser(), /Unexpected server response/);
    }
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});
