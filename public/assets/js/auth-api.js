// Session cookies stay with requests, including installations under a subfolder.
const BASE = (window.WREADS && window.WREADS.basePath) || "";

async function authRequest(action, body) {
  let response;
  try {
    response = await fetch(`${BASE}/api/auth/${action}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof data?.error === "string" ? data.error : data?.error?.message;
    throw new Error(response.status >= 500
      ? "The server could not complete the request. Please try again later."
      : message || "The request failed. Please try again.");
  }
  if (!data || (action !== "logout" && !("user" in data))) {
    throw new Error("Unexpected server response. Please reload and try again.");
  }
  return data;
}

export async function registerUser(form) {
  return (await authRequest("register", form)).user;
}

export async function loginUser(form) {
  return (await authRequest("login", form)).user;
}

export async function getCurrentUser() {
  return (await authRequest("me")).user;
}

export async function logoutUser() {
  await authRequest("logout", {});
}
