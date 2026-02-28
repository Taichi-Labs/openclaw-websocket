import type { WsAuthConfig } from "./types.js";

export interface AuthResult {
  userId: string;
  username: string;
  avatar?: string;
  extra?: Record<string, unknown>;
}

interface AuthVerifyResponse {
  success: boolean;
  data?: AuthResult;
  error?: string;
  message?: string;
}

export async function verifyToken(
  authConfig: WsAuthConfig,
  params: Record<string, string>,
): Promise<AuthResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), authConfig.timeout);

  try {
    const res = await fetch(authConfig.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    const body: AuthVerifyResponse = await res.json();

    if (!body.success || !body.data) {
      throw new AuthError(
        body.error ?? "auth_failed",
        body.message ?? "Authentication failed",
      );
    }

    return body.data;
  } catch (err) {
    if (err instanceof AuthError) throw err;
    if ((err as Error).name === "AbortError") {
      throw new AuthError("timeout", "Auth service request timed out");
    }
    throw new AuthError("service_unavailable", `Auth service error: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

export class AuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "AuthError";
  }
}
