export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export async function api(
  path,
  data,
  method = data === undefined ? "GET" : "POST",
) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    signal: AbortSignal.timeout(15000),
    headers: data === undefined ? {} : { "content-type": "application/json" },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const value = await response.json();
  if (!response.ok)
    throw new ApiError(
      value.error?.message ?? value.message ?? "Request failed.",
      response.status,
      value.error?.code,
    );
  return value;
}
export async function ensureSession() {
  try {
    return await api("/api/me");
  } catch (error) {
    if (error.status !== 401) throw error;
    await api("/api/auth/sign-in/anonymous", {});
    return api("/api/me");
  }
}
