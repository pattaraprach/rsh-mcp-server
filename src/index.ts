import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

import { HostConnectClient } from "./services/hostconnect-client.js";
import { registerInfoTools } from "./tools/info-tools.js";
import { registerBookingTools, registerReadOnlyBookingTools, registerWriteBookingTools } from "./tools/booking-tools.js";
import { registerServiceLineTools, registerReadOnlyServiceLineTools, registerWriteServiceLineTools } from "./tools/service-line-tools.js";

// ── Configuration from environment variables ──────────────────────────────────
const HOSTCONNECT_URL = process.env.HOSTCONNECT_URL;
const AGENT_ID = process.env.HOSTCONNECT_AGENT_ID;
const PASSWORD = process.env.HOSTCONNECT_PASSWORD;
const TRANSPORT = process.env.TRANSPORT || "stdio";
const PORT = parseInt(process.env.PORT || "3000");
const READ_ONLY_MODE = process.env.READ_ONLY_MODE === "true";

if (!HOSTCONNECT_URL || !AGENT_ID || !PASSWORD) {
  console.error(
    "Error: Required environment variables missing.\n" +
    "Please set:\n" +
    "  HOSTCONNECT_URL  - HostConnect endpoint URL (e.g. http://your-server/hostConnect)\n" +
    "  HOSTCONNECT_AGENT_ID - Agent login ID\n" +
    "  HOSTCONNECT_PASSWORD - Agent password"
  );
  process.exit(1);
}

// ── Create HostConnect client ─────────────────────────────────────────────────
const hostConnectClient = new HostConnectClient({
  baseUrl: HOSTCONNECT_URL,
  agentId: AGENT_ID,
  password: PASSWORD,
  timeoutMs: parseInt(process.env.HOSTCONNECT_TIMEOUT_MS || "30000"),
});

// ── Create MCP server ─────────────────────────────────────────────────────────
function createServer(): McpServer {
  const server = new McpServer({
    name: "hostconnect-mcp-server",
    version: "1.0.0",
  });

  // Register tools based on READ_ONLY_MODE
  registerInfoTools(server, hostConnectClient); // All info tools are read-only

  if (READ_ONLY_MODE) {
    // Only register read-only tools
    registerReadOnlyBookingTools(server, hostConnectClient);
    registerReadOnlyServiceLineTools(server, hostConnectClient);
  } else {
    // Register all tools (current behavior)
    registerBookingTools(server, hostConnectClient);
    registerServiceLineTools(server, hostConnectClient);
  }

  return server;
}

// ── Transports ────────────────────────────────────────────────────────────────
async function runStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("HostConnect MCP server running on stdio");
  if (READ_ONLY_MODE) {
    console.error("Running in READ-ONLY mode - write operations are disabled");
  }
}

async function runHTTP(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.post("/mcp", async (req, res) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get("/health", (_req, res) => {
    res.json({ 
      status: "ok", 
      server: "hostconnect-mcp-server", 
      version: "1.0.0",
      readOnlyMode: READ_ONLY_MODE 
    });
  });

  app.listen(PORT, () => {
    console.error(`HostConnect MCP server running on http://localhost:${PORT}/mcp`);
    if (READ_ONLY_MODE) {
      console.error("Running in READ-ONLY mode - write operations are disabled");
    }
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────
if (TRANSPORT === "http") {
  runHTTP().catch((err: unknown) => {
    console.error("Server error:", err);
    process.exit(1);
  });
} else {
  runStdio().catch((err: unknown) => {
    console.error("Server error:", err);
    process.exit(1);
  });
}
