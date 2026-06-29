import {
  protectedResourceHandler,
  metadataCorsOptionsRequestHandler,
} from "mcp-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tells MCP clients (Claude) that this resource server delegates auth to Auth0.
// AUTH0_ISSUER_BASE_URL e.g. https://sbi-pro.us.auth0.com
const authServerUrl = (process.env.AUTH0_ISSUER_BASE_URL || "").trim();

const handler = protectedResourceHandler({
  authServerUrls: [authServerUrl],
});

const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
