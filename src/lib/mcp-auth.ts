import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

// --- Auth0 config (the connector's authorization server) ---
// AUTH0_ISSUER_BASE_URL e.g. https://sbi-pro.us.auth0.com  (no trailing slash needed)
// AUTH0_AUDIENCE        the Auth0 API identifier == this MCP server's resource URL
// AUTH0_EMAIL_CLAIM     optional custom claim that carries the email (set if you add
//                       an Auth0 Action; defaults try "email" then a namespaced claim)
function issuerBase(): string {
  const raw = (process.env.AUTH0_ISSUER_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!raw) throw new Error("AUTH0_ISSUER_BASE_URL is not set");
  return raw;
}

// Auth0 issuer claim always carries a trailing slash.
const ISSUER = () => issuerBase() + "/";
const AUDIENCE = () => (process.env.AUTH0_AUDIENCE || "").trim();
const EMAIL_CLAIM = () => (process.env.AUTH0_EMAIL_CLAIM || "").trim();

// Cache the JWKS across warm invocations.
declare global {
  // eslint-disable-next-line no-var
  var __sbiJwks: ReturnType<typeof createRemoteJWKSet> | undefined;
}
function jwks() {
  if (!global.__sbiJwks) {
    global.__sbiJwks = createRemoteJWKSet(
      new URL(issuerBase() + "/.well-known/jwks.json"),
    );
  }
  return global.__sbiJwks;
}

function extractEmail(payload: JWTPayload): string | undefined {
  const tryKeys = [
    EMAIL_CLAIM(),
    "email",
    "https://sbi.com/email",
    `${issuerBase()}/email`,
  ].filter(Boolean);
  for (const k of tryKeys) {
    const v = payload[k as keyof JWTPayload];
    if (typeof v === "string" && v.trim()) return v.trim().toLowerCase();
  }
  return undefined;
}

// Optionally resolve email from Auth0 /userinfo when it's not in the token.
async function fetchUserinfoEmail(token: string): Promise<string | undefined> {
  if ((process.env.AUTH0_FETCH_USERINFO || "").toLowerCase() !== "true") return undefined;
  try {
    const res = await fetch(issuerBase() + "/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return undefined;
    const j = (await res.json()) as { email?: string };
    return j.email?.trim().toLowerCase() || undefined;
  } catch {
    return undefined;
  }
}

// verifyToken for mcp-handler's withMcpAuth. Returns AuthInfo when the token is a
// valid Auth0 access token for this resource, otherwise undefined (-> 401).
export async function verifyToken(
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  try {
    const { payload } = await jwtVerify(bearerToken, jwks(), {
      issuer: ISSUER(),
      audience: AUDIENCE() || undefined,
    });

    const sub = typeof payload.sub === "string" ? payload.sub : undefined;
    if (!sub) return undefined;

    let email = extractEmail(payload);
    if (!email) email = await fetchUserinfoEmail(bearerToken);

    const scopes =
      typeof payload.scope === "string" ? payload.scope.split(" ").filter(Boolean) : [];

    return {
      token: bearerToken,
      clientId: typeof payload.azp === "string" ? payload.azp : (typeof payload.client_id === "string" ? payload.client_id : "unknown"),
      scopes,
      expiresAt: typeof payload.exp === "number" ? payload.exp : undefined,
      extra: { sub, email: email ?? null },
    };
  } catch {
    return undefined;
  }
}
