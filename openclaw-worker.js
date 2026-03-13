/**
 * OpenClaw-style AI Reply Pipeline — Cloudflare Worker (Single File)
 *
 * 参考 OpenClaw 项目的核心架构，实现一个完整的 AI 回复流程:
 *
 *   1. Gateway 入口 (fetch handler)  — 对应 OpenClaw 的 Gateway Server
 *   2. Task Fetcher                  — 从 https://task.aaa.com 获取用户任务
 *   3. Auto-Reply Pipeline           — 对应 OpenClaw 的 auto-reply 管线
 *      - Inbound Processing (指令解析、上下文构建)
 *      - Session Management (会话状态管理)
 *      - System Prompt + Skills 注入
 *   4. Agent Runner                  — 对应 OpenClaw 的 pi-embedded-runner
 *      - Tool-use Loop (工具调用循环)
 *      - Gemini API 调用
 *   5. Response Builder              — 构建最终回复
 *
 * 环境变量 (Cloudflare Worker Secrets):
 *   - GEMINI_API_KEY: Google Gemini API Key
 *   - TASK_API_URL:   (可选) 覆盖默认的 task 获取地址, 默认 https://task.aaa.com
 *
 * 使用方式:
 *   GET  /         → 健康检查
 *   POST /run      → 执行完整 AI 回复流程 (可选 JSON body: { "task_url": "..." })
 *   POST /run/raw  → 直接传入消息 (JSON body: { "message": "..." })
 */

// ─── 配置 ──────────────────────────────────────────────────────────────────

const DEFAULT_TASK_URL = "https://task.aaa.com";
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MAX_TOOL_ROUNDS = 10;
const AGENT_TIMEOUT_MS = 120_000;

// ─── System Prompt (对应 OpenClaw 的 system-prompt.ts + skills 注入) ────────

const SYSTEM_PROMPT = `You are OpenClaw, a capable personal AI assistant.

## Core Behavior
- You are helpful, direct, and efficient.
- Always respond in the same language the user writes in.
- When given a task, complete it thoroughly. If the task is ambiguous, make a reasonable interpretation and proceed.
- Use tools when they help accomplish the task. Prefer using tools over guessing.

## Available Tools
You have access to the following tools. Use them by responding with function calls when appropriate:

- **web_fetch**: Fetch content from a URL. Use this to retrieve web pages, APIs, or any HTTP resource.
- **datetime**: Get the current date, time, and timezone information.
- **calculate**: Evaluate a mathematical expression.

## Response Format
- Be concise but thorough.
- Use markdown formatting when it improves readability.
- For code, always specify the language in fenced code blocks.
`;

// ─── Tool Definitions (对应 OpenClaw 的 agents/tools/) ─────────────────────

const TOOL_DECLARATIONS = [
  {
    name: "web_fetch",
    description:
      "Fetch the content of a URL. Returns the HTTP status code, headers, and body text. " +
      "Use this to retrieve web pages, REST API responses, or any HTTP resource.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to fetch.",
        },
        method: {
          type: "string",
          description: 'HTTP method (GET, POST, etc.). Default: "GET".',
          enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"],
        },
        headers: {
          type: "object",
          description: "Optional HTTP headers as key-value pairs.",
          additionalProperties: { type: "string" },
        },
        body: {
          type: "string",
          description: "Optional request body (for POST/PUT/PATCH).",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "datetime",
    description:
      "Get the current date, time, and timezone. Returns ISO 8601 timestamp and readable format.",
    parameters: {
      type: "object",
      properties: {
        timezone: {
          type: "string",
          description:
            'IANA timezone name (e.g. "Asia/Shanghai", "America/New_York"). Default: "UTC".',
        },
      },
    },
  },
  {
    name: "calculate",
    description:
      "Evaluate a mathematical expression and return the result. " +
      "Supports basic arithmetic (+, -, *, /, %, **), Math functions (sqrt, sin, cos, log, etc.), and constants (PI, E).",
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: 'The math expression to evaluate, e.g. "sqrt(144) + 3 * 7".',
        },
      },
      required: ["expression"],
    },
  },
];

// ─── Tool Implementations (对应 OpenClaw 各 tool 的 execute 函数) ──────────

async function executeWebFetch(args) {
  const { url, method = "GET", headers = {}, body } = args;
  if (!url) {
    return { error: "Missing required parameter: url" };
  }

  try {
    const fetchOpts = {
      method,
      headers: { "User-Agent": "OpenClaw-Worker/1.0", ...headers },
    };
    if (body && ["POST", "PUT", "PATCH"].includes(method.toUpperCase())) {
      fetchOpts.body = body;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    fetchOpts.signal = controller.signal;

    const response = await fetch(url, fetchOpts);
    clearTimeout(timeoutId);

    const contentType = response.headers.get("content-type") || "";
    let responseBody;
    if (contentType.includes("application/json")) {
      try {
        responseBody = JSON.stringify(await response.json(), null, 2);
      } catch {
        responseBody = await response.text();
      }
    } else {
      responseBody = await response.text();
    }

    // Truncate very large responses (similar to OpenClaw's tool result truncation)
    const MAX_BODY_CHARS = 30_000;
    if (responseBody.length > MAX_BODY_CHARS) {
      responseBody =
        responseBody.slice(0, MAX_BODY_CHARS) +
        `\n\n... [truncated, total ${responseBody.length} chars]`;
    }

    return {
      status: response.status,
      statusText: response.statusText,
      contentType,
      body: responseBody,
    };
  } catch (err) {
    return { error: `Fetch failed: ${err.message}` };
  }
}

function executeDatetime(args) {
  const tz = args?.timezone || "UTC";
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZoneName: "longOffset",
    });
    return {
      iso: now.toISOString(),
      formatted: formatter.format(now),
      timezone: tz,
      unix: Math.floor(now.getTime() / 1000),
    };
  } catch (err) {
    return { error: `Invalid timezone "${tz}": ${err.message}` };
  }
}

function executeCalculate(args) {
  const { expression } = args;
  if (!expression) {
    return { error: "Missing required parameter: expression" };
  }

  try {
    // Safe math evaluation — only allow numbers, operators, and Math functions
    const sanitized = expression.replace(/\s+/g, " ").trim();
    const SAFE_PATTERN =
      /^[0-9+\-*/%.() ,eE]+$|^[\w.() +\-*/%,eE]+$/;

    // Build a safe evaluation context with Math functions
    const mathContext = {
      sqrt: Math.sqrt,
      abs: Math.abs,
      ceil: Math.ceil,
      floor: Math.floor,
      round: Math.round,
      sin: Math.sin,
      cos: Math.cos,
      tan: Math.tan,
      log: Math.log,
      log2: Math.log2,
      log10: Math.log10,
      exp: Math.exp,
      pow: Math.pow,
      min: Math.min,
      max: Math.max,
      random: Math.random,
      PI: Math.PI,
      E: Math.E,
    };

    // Replace known function/constant names, then evaluate
    let evalExpr = sanitized;
    for (const [name] of Object.entries(mathContext)) {
      evalExpr = evalExpr.replace(
        new RegExp(`\\b${name}\\b`, "g"),
        `__math.${name}`
      );
    }

    // Security: reject anything that looks like code injection
    if (/[;{}[\]\\`'"$]/.test(evalExpr) || /\b(function|return|var|let|const|import|require|eval|this|globalThis|self)\b/.test(evalExpr)) {
      return { error: "Expression contains disallowed characters or keywords." };
    }

    const fn = new Function("__math", `"use strict"; return (${evalExpr});`);
    const result = fn(mathContext);

    if (typeof result !== "number" || !Number.isFinite(result)) {
      return { expression: sanitized, result: String(result), note: "Non-finite result" };
    }
    return { expression: sanitized, result };
  } catch (err) {
    return { error: `Calculation failed: ${err.message}` };
  }
}

/** Tool dispatch — 对应 OpenClaw 的 pi-embedded-subscribe.handlers.tools.ts */
async function executeTool(name, args) {
  switch (name) {
    case "web_fetch":
      return await executeWebFetch(args);
    case "datetime":
      return executeDatetime(args);
    case "calculate":
      return executeCalculate(args);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── Session Management (对应 OpenClaw 的 config/sessions + session-utils) ─

class Session {
  constructor() {
    this.id = crypto.randomUUID();
    this.createdAt = Date.now();
    this.messages = [];
    this.toolCallCount = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
  }

  addSystemMessage(text) {
    this.messages.push({ role: "user", parts: [{ text: `[System] ${text}` }] });
  }

  addUserMessage(text) {
    this.messages.push({ role: "user", parts: [{ text }] });
  }

  addModelResponse(parts) {
    this.messages.push({ role: "model", parts });
  }

  addToolResults(toolResults) {
    // Gemini expects tool results as a user-role message with functionResponse parts
    const parts = toolResults.map((r) => ({
      functionResponse: {
        name: r.name,
        response: r.response,
      },
    }));
    this.messages.push({ role: "user", parts });
  }

  trackUsage(usage) {
    if (usage) {
      this.totalInputTokens += usage.promptTokenCount || 0;
      this.totalOutputTokens += usage.candidatesTokenCount || 0;
    }
  }

  getHistory() {
    return this.messages;
  }

  getUsageSummary() {
    return {
      sessionId: this.id,
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      totalTokens: this.totalInputTokens + this.totalOutputTokens,
      toolCallCount: this.toolCallCount,
      durationMs: Date.now() - this.createdAt,
    };
  }
}

// ─── Gemini API Client (对应 OpenClaw 对 AI provider 的调用封装) ────────────

async function callGeminiApi(apiKey, session) {
  const url = `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: session.getHistory(),
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
    tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
      topP: 0.95,
      topK: 40,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
    ],
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new GeminiApiError(
      `Gemini API error ${response.status}: ${errorText}`,
      response.status,
      errorText
    );
  }

  return await response.json();
}

class GeminiApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "GeminiApiError";
    this.status = status;
    this.body = body;
  }
}

// ─── Task Fetcher (从外部 URL 获取用户任务) ─────────────────────────────────

async function fetchTask(taskUrl) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(taskUrl, {
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "OpenClaw-Worker/1.0",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Task API returned ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "";

    // Try JSON first, fall back to plain text
    if (contentType.includes("application/json")) {
      const data = await response.json();
      // Support multiple response shapes:
      //   { "msg": "..." }
      //   { "message": "..." }
      //   { "task": "..." }
      //   { "data": { "msg": "..." } }
      //   plain string
      const msg =
        typeof data === "string"
          ? data
          : data.msg || data.message || data.task || data.data?.msg || data.data?.message;
      if (!msg || typeof msg !== "string") {
        throw new Error(
          `Task API returned JSON but no recognizable message field. Keys: [${Object.keys(data).join(", ")}]`
        );
      }
      return msg.trim();
    }

    const text = await response.text();
    if (!text.trim()) {
      throw new Error("Task API returned empty response");
    }
    return text.trim();
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Task API request timed out (10s): ${taskUrl}`);
    }
    throw err;
  }
}

// ─── Agent Runner — 核心 AI 回复流程 ──────────────────────────────────────
//
// 对应 OpenClaw 的:
//   auto-reply/reply/agent-runner.ts → runReplyAgent()
//   agents/pi-embedded-runner/run.ts → runEmbeddedPiAgent()
//   agents/pi-embedded-runner/run/attempt.ts → runEmbeddedAttempt()
//
// 核心循环:
//   1. 发送消息给 Gemini
//   2. 如果模型返回 function call → 执行工具 → 把结果送回模型
//   3. 重复直到模型返回纯文本回复或达到工具调用上限
//

async function runAgentPipeline(apiKey, userMessage) {
  const startedAt = Date.now();
  const session = new Session();
  const toolLog = [];

  // ── Inbound Processing (对应 OpenClaw 的 inbound-context.ts + get-reply.ts)
  // 注入当前时间上下文 (类似 OpenClaw 的 current-time.ts appendCronStyleCurrentTimeLine)
  const now = new Date();
  const timeContext = `Current time: ${now.toISOString()} (UTC)`;
  session.addSystemMessage(timeContext);

  // 添加用户消息
  session.addUserMessage(userMessage);

  // ── Agent Turn Loop (对应 OpenClaw 的 tool-use 循环)
  let round = 0;
  let finalText = null;
  let finishReason = null;
  let lastError = null;

  while (round < MAX_TOOL_ROUNDS) {
    round++;

    // 超时保护 (对应 OpenClaw 的 resolveAgentTimeoutMs)
    if (Date.now() - startedAt > AGENT_TIMEOUT_MS) {
      lastError = `Agent execution timed out after ${AGENT_TIMEOUT_MS}ms`;
      break;
    }

    let geminiResponse;
    try {
      geminiResponse = await callGeminiApi(apiKey, session);
    } catch (err) {
      // 对应 OpenClaw 的 failover-error.ts 错误分类
      if (err instanceof GeminiApiError) {
        if (err.status === 429) {
          lastError = "Rate limited by Gemini API. Please retry later.";
        } else if (err.status === 401 || err.status === 403) {
          lastError = "Authentication failed. Check your GEMINI_API_KEY.";
        } else {
          lastError = `Gemini API error: ${err.message}`;
        }
      } else {
        lastError = `Unexpected error: ${err.message}`;
      }
      break;
    }

    // Track token usage (对应 OpenClaw 的 usage.ts normalizeUsage)
    session.trackUsage(geminiResponse.usageMetadata);

    const candidate = geminiResponse.candidates?.[0];
    if (!candidate) {
      lastError = "Gemini returned no candidates";
      if (geminiResponse.promptFeedback?.blockReason) {
        lastError += ` (blocked: ${geminiResponse.promptFeedback.blockReason})`;
      }
      break;
    }

    finishReason = candidate.finishReason;
    const parts = candidate.content?.parts || [];

    // 将模型响应添加到会话历史
    session.addModelResponse(parts);

    // 检查是否有 function calls
    const functionCalls = parts.filter((p) => p.functionCall);

    if (functionCalls.length === 0) {
      // 没有工具调用 → 提取最终文本回复
      const textParts = parts.filter((p) => p.text).map((p) => p.text);
      finalText = textParts.join("\n");
      break;
    }

    // ── 执行工具调用 (对应 OpenClaw 的 pi-embedded-subscribe.handlers.tools.ts)
    const toolResults = [];
    for (const part of functionCalls) {
      const { name, args } = part.functionCall;
      session.toolCallCount++;

      const toolStartedAt = Date.now();
      let result;
      try {
        result = await executeTool(name, args || {});
      } catch (err) {
        result = { error: `Tool execution failed: ${err.message}` };
      }
      const toolDurationMs = Date.now() - toolStartedAt;

      toolLog.push({
        round,
        tool: name,
        args: args || {},
        result:
          typeof result === "string"
            ? result.slice(0, 500)
            : JSON.stringify(result).slice(0, 500),
        durationMs: toolDurationMs,
      });

      toolResults.push({
        name,
        response: typeof result === "object" ? result : { output: result },
      });
    }

    // 把工具结果送回模型，继续循环
    session.addToolResults(toolResults);
  }

  // ── 构建最终结果 (对应 OpenClaw 的 agent-runner-payloads.ts buildReplyPayloads)
  const usage = session.getUsageSummary();

  if (lastError) {
    return {
      ok: false,
      error: lastError,
      reply: null,
      usage,
      toolLog,
      rounds: round,
      model: GEMINI_MODEL,
    };
  }

  if (!finalText && round >= MAX_TOOL_ROUNDS) {
    return {
      ok: false,
      error: `Reached maximum tool call rounds (${MAX_TOOL_ROUNDS}) without a final response`,
      reply: null,
      usage,
      toolLog,
      rounds: round,
      model: GEMINI_MODEL,
    };
  }

  return {
    ok: true,
    error: null,
    reply: finalText || "(empty response)",
    finishReason,
    usage,
    toolLog,
    rounds: round,
    model: GEMINI_MODEL,
  };
}

// ─── Gateway (Cloudflare Worker fetch handler) ─────────────────────────────
//
// 对应 OpenClaw 的 gateway/server-http.ts + gateway/server.impl.ts
// 路由分发 → 鉴权 → 调用 agent pipeline → 返回结果
//

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ── Health check (对应 OpenClaw 的 server-methods/health.ts)
    if (path === "/" || path === "/health") {
      return jsonResponse({
        status: "ok",
        service: "openclaw-worker",
        model: GEMINI_MODEL,
        timestamp: new Date().toISOString(),
        endpoints: {
          "POST /run": "Fetch task from task URL, run AI pipeline, return result",
          "POST /run/raw": "Send raw message, run AI pipeline, return result",
          "GET /health": "Health check",
        },
      });
    }

    // ── Main pipeline: fetch task → run agent
    if (path === "/run" && request.method === "POST") {
      const apiKey = env.GEMINI_API_KEY;
      if (!apiKey) {
        return jsonResponse(
          { ok: false, error: "GEMINI_API_KEY not configured" },
          500
        );
      }

      // Resolve task URL from request body or env or default
      let taskUrl = env.TASK_API_URL || DEFAULT_TASK_URL;
      try {
        const body = await request.json().catch(() => null);
        if (body?.task_url) {
          taskUrl = body.task_url;
        }
      } catch {
        // no body is fine, use default
      }

      // Step 1: Fetch task (对应 OpenClaw 的 inbound processing)
      let userMessage;
      try {
        userMessage = await fetchTask(taskUrl);
      } catch (err) {
        return jsonResponse(
          {
            ok: false,
            error: `Failed to fetch task: ${err.message}`,
            taskUrl,
          },
          502
        );
      }

      // Step 2: Run full AI reply pipeline
      const result = await runAgentPipeline(apiKey, userMessage);

      return jsonResponse({
        ...result,
        taskUrl,
        taskMessage: userMessage,
      });
    }

    // ── Raw message pipeline: direct message → run agent
    if (path === "/run/raw" && request.method === "POST") {
      const apiKey = env.GEMINI_API_KEY;
      if (!apiKey) {
        return jsonResponse(
          { ok: false, error: "GEMINI_API_KEY not configured" },
          500
        );
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse(
          { ok: false, error: "Invalid JSON body. Expected: { \"message\": \"...\" }" },
          400
        );
      }

      const userMessage = body?.message;
      if (!userMessage || typeof userMessage !== "string" || !userMessage.trim()) {
        return jsonResponse(
          { ok: false, error: "Missing or empty 'message' field in request body" },
          400
        );
      }

      const result = await runAgentPipeline(apiKey, userMessage.trim());

      return jsonResponse(result);
    }

    // ── 404
    return jsonResponse(
      { error: "Not found", hint: "Try POST /run or POST /run/raw" },
      404
    );
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "X-Powered-By": "openclaw-worker",
    },
  });
}
