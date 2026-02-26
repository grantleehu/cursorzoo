#!/usr/bin/env node

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "mcp-server-example",
  version: "1.0.0",
});

// ============================================================
// Tools — LLM 可以主动调用的函数
// ============================================================

server.tool(
  "calculate",
  "Perform basic arithmetic operations",
  {
    operation: z.enum(["add", "subtract", "multiply", "divide"]),
    a: z.number(),
    b: z.number(),
  },
  async ({ operation, a, b }) => {
    let result: number;
    switch (operation) {
      case "add":
        result = a + b;
        break;
      case "subtract":
        result = a - b;
        break;
      case "multiply":
        result = a * b;
        break;
      case "divide":
        if (b === 0) {
          return {
            content: [{ type: "text", text: "Error: division by zero" }],
            isError: true,
          };
        }
        result = a / b;
        break;
    }
    return {
      content: [{ type: "text", text: `${a} ${operation} ${b} = ${result}` }],
    };
  }
);

server.tool(
  "get_current_time",
  "Get the current date and time in ISO format",
  {},
  async () => {
    return {
      content: [{ type: "text", text: new Date().toISOString() }],
    };
  }
);

server.tool(
  "string_utils",
  "Common string operations: reverse, uppercase, lowercase, word count",
  {
    action: z.enum(["reverse", "uppercase", "lowercase", "word_count"]),
    text: z.string(),
  },
  async ({ action, text }) => {
    let result: string;
    switch (action) {
      case "reverse":
        result = text.split("").reverse().join("");
        break;
      case "uppercase":
        result = text.toUpperCase();
        break;
      case "lowercase":
        result = text.toLowerCase();
        break;
      case "word_count":
        result = `Word count: ${text.split(/\s+/).filter(Boolean).length}`;
        break;
    }
    return {
      content: [{ type: "text", text: result }],
    };
  }
);

// ============================================================
// Resources — 向 LLM 暴露的数据源
// ============================================================

server.resource(
  "server-info",
  "info://server",
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(
          {
            name: "mcp-server-example",
            version: "1.0.0",
            description: "A demo MCP server showcasing tools, resources, and prompts",
            capabilities: ["tools", "resources", "prompts"],
          },
          null,
          2
        ),
      },
    ],
  })
);

server.resource(
  "greeting",
  new ResourceTemplate("greeting://{name}", { list: undefined }),
  async (uri, { name }) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "text/plain",
        text: `Hello, ${name}! Welcome to the MCP server example.`,
      },
    ],
  })
);

// ============================================================
// Prompts — 可复用的提示词模板
// ============================================================

server.prompt(
  "code_review",
  "Generate a code review prompt for a given code snippet",
  { code: z.string(), language: z.string().optional() },
  ({ code, language }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: [
            `Please review the following ${language ?? ""} code:`,
            "",
            "```" + (language ?? ""),
            code,
            "```",
            "",
            "Please analyze:",
            "1. Code quality and readability",
            "2. Potential bugs or edge cases",
            "3. Performance considerations",
            "4. Suggestions for improvement",
          ].join("\n"),
        },
      },
    ],
  })
);

server.prompt(
  "summarize",
  "Generate a summarization prompt for a given text",
  {
    text: z.string(),
    max_sentences: z.string().optional(),
  },
  ({ text, max_sentences }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Please summarize the following text${max_sentences ? ` in at most ${max_sentences} sentences` : ""}:\n\n${text}`,
        },
      },
    ],
  })
);

// ============================================================
// Start the server
// ============================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
