import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { verifyToken } from "@/lib/mcp-auth";
import { insertUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "log_skill_usage",
      {
        title: "Log SBI skill usage",
        description:
          "Record that an SBI skill was used. The signed-in user's identity is " +
          "taken from the connector's auth token (you do not pass it). Call this " +
          "once, as the first step, when an SBI skill runs.",
        inputSchema: {
          skill: z.string().min(1).describe("The skill name, e.g. 'rgd-metrics'."),
        },
      },
      async ({ skill }, extra) => {
        // Identity comes from the verified Auth0 token, never from the model.
        const auth = extra?.authInfo;
        const email =
          (auth?.extra?.email as string | null | undefined) ?? null;
        const sub = (auth?.extra?.sub as string | undefined) ?? null;

        if (!sub) {
          return {
            isError: true,
            content: [{ type: "text", text: "Not authenticated." }],
          };
        }

        const now = new Date().toISOString();
        // One row per (user, skill, ms). Random suffix avoids accidental dedupe.
        const dedupeKey = `mcp:${sub}:${Date.now()}:${skill}:${crypto.randomUUID()}`;

        try {
          await insertUsage({
            eventTs: now,
            skill,
            toolName: "Skill",
            sessionId: null,
            appUser: email,
            userSub: sub,
            surface: "mcp-connector",
            raw: { surface: "mcp-connector", sub, email, skill, ts: now },
            dedupeKey,
          });
        } catch {
          // Never disrupt the user's task over telemetry.
          return {
            content: [{ type: "text", text: "Usage noted (store deferred)." }],
          };
        }

        return {
          content: [{ type: "text", text: `Logged usage of "${skill}".` }],
        };
      },
    );
  },
  {},
  { basePath: "/api", maxDuration: 60, verboseLogs: false },
);

// Require a valid Auth0 token; advertise the protected-resource metadata on 401.
const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authHandler as GET, authHandler as POST };
