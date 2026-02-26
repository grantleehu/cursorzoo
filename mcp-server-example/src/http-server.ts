#!/usr/bin/env node

/**
 * 远程部署示例：使用 Streamable HTTP 传输
 *
 * 运行方式：
 *   npm run build && node dist/http-server.js
 *
 * 然后在 .cursor/mcp.json 中配置：
 *   { "mcpServers": { "remote": { "url": "http://localhost:3000/mcp" } } }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "mcp-server-example-http",
    version: "1.0.0",
  });

  server.tool(
    "ping",
    "Check if the server is alive",
    {},
    async () => ({
      content: [{ type: "text", text: `pong — server time: ${new Date().toISOString()}` }],
    })
  );

  server.tool(
    "echo",
    "Echo back the provided message",
    { message: z.string() },
    async ({ message }) => ({
      content: [{ type: "text", text: message }],
    })
  );

  return server;
}

async function main() {
  const PORT = parseInt(process.env.PORT ?? "3000", 10);

  const mcpServer = createMcpServer();

  const transports = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === "/mcp") {
      try {
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => crypto.randomUUID() });
        transports.set(transport.sessionId!, transport);

        transport.onclose = () => {
          transports.delete(transport.sessionId!);
        };

        await mcpServer.connect(transport);
        await transport.handleRequest(req, res);
      } catch (err) {
        console.error("Error handling /mcp request:", err);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      }
      return;
    }

    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", sessions: transports.size }));
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  httpServer.listen(PORT, () => {
    console.error(`MCP HTTP server listening on http://localhost:${PORT}/mcp`);
    console.error(`Health check: http://localhost:${PORT}/health`);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
