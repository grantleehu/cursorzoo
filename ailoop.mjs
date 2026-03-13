#!/usr/bin/env node

//
// ailoop — Minimal AI agent loop extracted from OpenClaw's core logic.
//
// Reads a task from stdin, runs a tool-use loop against an OpenAI-compatible
// API (default: Ollama qwen3:8b), prints the final reply to stdout.
//
// Usage:
//   echo "What time is it in Tokyo?" | node ailoop.mjs
//   echo "Fetch https://httpbin.org/ip" | node ailoop.mjs
//   echo "What is 2+2?" | node ailoop.mjs -m gpt-4o -u https://api.openai.com/v1 -k sk-xxx
//
// Zero dependencies. Works with Node.js >= 18.
//

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";

// ─── Helpers ────────────────────────────────────────────────────────────────

const log = (...a) => {
  if (process.env.AILOOP_VERBOSE === "1") process.stderr.write("[ailoop] " + a.join(" ") + "\n");
};

function die(msg) {
  process.stderr.write("error: " + msg + "\n");
  process.exit(1);
}

function parseArgs(argv) {
  const args = { model: null, baseUrl: null, apiKey: null, maxRounds: null, timeout: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if ((a === "--model" || a === "-m") && argv[i + 1]) args.model = argv[++i];
    else if ((a === "--base-url" || a === "-u") && argv[i + 1]) args.baseUrl = argv[++i];
    else if ((a === "--api-key" || a === "-k") && argv[i + 1]) args.apiKey = argv[++i];
    else if (a === "--max-rounds" && argv[i + 1]) args.maxRounds = parseInt(argv[++i], 10);
    else if (a === "--timeout" && argv[i + 1]) args.timeout = parseInt(argv[++i], 10);
    else if (a === "--verbose" || a === "-v") process.env.AILOOP_VERBOSE = "1";
    else if (a === "--help" || a === "-h") {
      process.stdout.write(
`ailoop — Minimal AI agent tool-use loop (OpenClaw core logic extract)

Usage:
  echo "your task" | node ailoop.mjs [options]

Options:
  -m, --model <name>      Model name        (env: AILOOP_MODEL, default: qwen3:8b)
  -u, --base-url <url>    API base URL      (env: OPENAI_BASE_URL, default: Ollama localhost)
  -k, --api-key <key>     API bearer token  (env: OPENAI_API_KEY, default: none)
      --max-rounds <n>    Max tool rounds   (default: 15)
      --timeout <sec>     Timeout seconds   (default: 300)
  -v, --verbose           Debug to stderr
  -h, --help              Show this help

Built-in tools: shell, fetch, datetime, calculate, read_file, write_file, ls

Examples:
  echo "List files in /tmp" | node ailoop.mjs
  echo "What is the weather in Tokyo?" | node ailoop.mjs
  echo "Calculate 2^10 * 3.14" | node ailoop.mjs
  cat task.txt | node ailoop.mjs -m gpt-4o -u https://api.openai.com/v1 -k sk-xxx > result.txt
`
      );
      process.exit(0);
    }
  }
  return args;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) die('No input on stdin. Usage: echo "your task" | node ailoop.mjs');
    const chunks = [];
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => resolve(chunks.join("")));
    process.stdin.on("error", reject);
  });
}

// ─── HTTP fetch (zero-dependency, built-in Node.js) ─────────────────────────

function httpRequest(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? https : http;
    const reqOpts = {
      method: opts.method || "GET",
      headers: { "User-Agent": "ailoop/1.0", ...(opts.headers || {}) },
      timeout: opts.timeout || 15000,
    };
    const req = mod.request(url, reqOpts, (res) => {
      const chunks = [];
      res.setEncoding("utf8");
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          httpRequest(new URL(res.headers.location, url).href, opts).then(resolve, reject);
          return;
        }
        resolve({ status: res.statusCode, contentType: res.headers["content-type"] || "", body: chunks.join("") });
      });
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.on("error", reject);
    if (opts.body && ["POST", "PUT", "PATCH"].includes((opts.method || "").toUpperCase())) req.write(opts.body);
    req.end();
  });
}

// ─── Tool Registry ──────────────────────────────────────────────────────────
//
// Each tool: { spec: OpenAI function schema, execute(args) → string }
// Mirrors OpenClaw src/agents/tools/*.ts
//

const TOOLS = {
  shell: {
    spec: {
      type: "function",
      function: {
        name: "shell",
        description: "Run a shell command (bash/cmd). Returns stdout+stderr. 30s timeout.",
        parameters: {
          type: "object",
          properties: { command: { type: "string", description: "Shell command to run." } },
          required: ["command"],
        },
      },
    },
    execute(args) {
      if (!args.command) return '{"error":"missing command"}';
      log("tool:shell →", args.command);
      try {
        const out = execSync(args.command, { encoding: "utf8", timeout: 30000, maxBuffer: 2 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
        return out.length > 20000 ? out.slice(0, 20000) + "\n...[truncated]" : out;
      } catch (e) {
        return JSON.stringify({ exitCode: e.status, stdout: (e.stdout || "").toString().slice(0, 5000), stderr: (e.stderr || "").toString().slice(0, 5000) });
      }
    },
  },

  fetch: {
    spec: {
      type: "function",
      function: {
        name: "fetch",
        description: "HTTP request. Returns { status, contentType, body }. Body truncated at 30k chars.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "URL to fetch." },
            method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"] },
            headers: { type: "object", additionalProperties: { type: "string" } },
            body: { type: "string", description: "Request body for POST/PUT/PATCH." },
          },
          required: ["url"],
        },
      },
    },
    async execute(args) {
      if (!args.url) return '{"error":"missing url"}';
      log("tool:fetch →", args.method || "GET", args.url);
      try {
        const r = await httpRequest(args.url, { method: args.method || "GET", headers: args.headers, body: args.body, timeout: 15000 });
        let body = r.body;
        if (body.length > 30000) body = body.slice(0, 30000) + "\n...[truncated]";
        return JSON.stringify({ status: r.status, contentType: r.contentType, body });
      } catch (e) {
        return JSON.stringify({ error: e.message });
      }
    },
  },

  datetime: {
    spec: {
      type: "function",
      function: {
        name: "datetime",
        description: "Get current date/time. Optional timezone (IANA name like Asia/Shanghai).",
        parameters: {
          type: "object",
          properties: { timezone: { type: "string", description: 'IANA timezone. Default: "UTC".' } },
        },
      },
    },
    execute(args) {
      const tz = args.timezone || "UTC";
      try {
        const now = new Date();
        const fmt = new Intl.DateTimeFormat("en-US", {
          timeZone: tz, year: "numeric", month: "long", day: "numeric",
          weekday: "long", hour: "2-digit", minute: "2-digit", second: "2-digit",
          hourCycle: "h23", timeZoneName: "longOffset",
        });
        return JSON.stringify({ iso: now.toISOString(), formatted: fmt.format(now), timezone: tz, unix: Math.floor(now.getTime() / 1000) });
      } catch (e) { return JSON.stringify({ error: e.message }); }
    },
  },

  calculate: {
    spec: {
      type: "function",
      function: {
        name: "calculate",
        description: "Evaluate math expression. Supports +-*/%, sqrt, sin, cos, log, PI, E, pow, etc.",
        parameters: {
          type: "object",
          properties: { expression: { type: "string", description: 'e.g. "sqrt(144) + 3 * 7"' } },
          required: ["expression"],
        },
      },
    },
    execute(args) {
      if (!args.expression) return '{"error":"missing expression"}';
      try {
        const m = { sqrt: Math.sqrt, abs: Math.abs, ceil: Math.ceil, floor: Math.floor, round: Math.round, sin: Math.sin, cos: Math.cos, tan: Math.tan, log: Math.log, log2: Math.log2, log10: Math.log10, exp: Math.exp, pow: Math.pow, min: Math.min, max: Math.max, PI: Math.PI, E: Math.E };
        let e = args.expression;
        for (const k of Object.keys(m)) e = e.replace(new RegExp("\\b" + k + "\\b", "g"), "__m." + k);
        if (/[;{}[\]\\`'"$]/.test(e) || /\b(function|return|var|let|const|import|require|eval)\b/.test(e)) return '{"error":"disallowed"}';
        const r = new Function("__m", '"use strict"; return (' + e + ");").call(null, m);
        return JSON.stringify({ expression: args.expression, result: r });
      } catch (e) { return JSON.stringify({ error: e.message }); }
    },
  },

  read_file: {
    spec: {
      type: "function",
      function: {
        name: "read_file",
        description: "Read a text file. Returns content (truncated at 50k chars).",
        parameters: {
          type: "object",
          properties: { path: { type: "string", description: "File path." } },
          required: ["path"],
        },
      },
    },
    execute(args) {
      try {
        const p = path.resolve(args.path);
        log("tool:read_file →", p);
        const c = fs.readFileSync(p, "utf8");
        return c.length > 50000 ? c.slice(0, 50000) + "\n...[truncated]" : c;
      } catch (e) { return JSON.stringify({ error: e.message }); }
    },
  },

  write_file: {
    spec: {
      type: "function",
      function: {
        name: "write_file",
        description: "Write text content to a file. Creates directories as needed.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path." },
            content: { type: "string", description: "Content to write." },
          },
          required: ["path", "content"],
        },
      },
    },
    execute(args) {
      try {
        const p = path.resolve(args.path);
        log("tool:write_file →", p);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, args.content, "utf8");
        return JSON.stringify({ ok: true, path: p, bytes: Buffer.byteLength(args.content) });
      } catch (e) { return JSON.stringify({ error: e.message }); }
    },
  },

  ls: {
    spec: {
      type: "function",
      function: {
        name: "ls",
        description: "List directory contents. Returns names (/ suffix for directories).",
        parameters: {
          type: "object",
          properties: { path: { type: "string", description: "Directory path. Default: cwd." } },
        },
      },
    },
    execute(args) {
      try {
        const dir = path.resolve(args.path || ".");
        log("tool:ls →", dir);
        return fs.readdirSync(dir, { withFileTypes: true }).map((e) => e.name + (e.isDirectory() ? "/" : "")).join("\n");
      } catch (e) { return JSON.stringify({ error: e.message }); }
    },
  },
};

// ─── OpenAI-compatible API call ─────────────────────────────────────────────

async function chatCompletion(baseUrl, apiKey, model, messages, tools) {
  const url = baseUrl.replace(/\/+$/, "") + "/chat/completions";
  const payload = { model, messages, temperature: 0.7, stream: false };
  if (tools.length > 0) payload.tools = tools;

  log("api →", url, "model=" + model, "msgs=" + messages.length);

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = "Bearer " + apiKey;

  const resp = await httpRequest(url, { method: "POST", headers, body: JSON.stringify(payload), timeout: 120000 });
  if (resp.status !== 200) throw new Error("API " + resp.status + ": " + resp.body.slice(0, 1000));

  let data;
  try { data = JSON.parse(resp.body); } catch { throw new Error("Non-JSON response: " + resp.body.slice(0, 500)); }
  return data;
}

// ─── Core Agent Loop ────────────────────────────────────────────────────────
//
// This IS OpenClaw's core, stripped to the essential cycle:
//
//   OpenClaw path: runEmbeddedPiAgent → runEmbeddedAttempt → subscribeEmbeddedPiSession
//     └─ loop: model response → has tool_calls? → execute each → append results → repeat
//
//   ailoop:
//     └─ loop: chatCompletion() → has tool_calls? → executeTool() → append → repeat
//

async function runAgentLoop(config, taskMessage) {
  const { baseUrl, apiKey, model, maxRounds, timeoutMs } = config;
  const startedAt = Date.now();
  const toolSpecs = Object.values(TOOLS).map((t) => t.spec);

  const messages = [
    { role: "system", content: "You are a capable AI assistant. Use tools when helpful. Be concise.\nCurrent time: " + new Date().toISOString() + " UTC" },
    { role: "user", content: taskMessage },
  ];

  let round = 0;
  let totalToolCalls = 0;

  while (round < maxRounds) {
    round++;

    if (Date.now() - startedAt > timeoutMs) die("Timed out after " + ((Date.now() - startedAt) / 1000).toFixed(1) + "s");

    let response;
    try {
      response = await chatCompletion(baseUrl, apiKey, model, messages, toolSpecs);
    } catch (e) {
      if (e.message.includes("429")) die("Rate limited. Retry later.");
      if (e.message.includes("401") || e.message.includes("403")) die("Auth failed. Check API key.");
      if (e.message.includes("ECONNREFUSED")) die("Cannot connect to " + baseUrl + " — is Ollama running?");
      die("API call failed: " + e.message);
    }

    const choice = response.choices?.[0];
    if (!choice) die("No choices in response");

    const msg = choice.message;
    messages.push(msg);

    const toolCalls = msg.tool_calls;

    // ── No tool calls → final answer
    if (!toolCalls || toolCalls.length === 0) {
      log("round " + round + ": done (" + (msg.content || "").length + " chars)");
      if (response.usage) log("tokens: in=" + (response.usage.prompt_tokens || 0) + " out=" + (response.usage.completion_tokens || 0));
      return { text: msg.content || "", rounds: round, toolCalls: totalToolCalls, usage: response.usage, durationMs: Date.now() - startedAt };
    }

    // ── Execute tools, feed results back
    log("round " + round + ": " + toolCalls.length + " tool call(s)");

    for (const tc of toolCalls) {
      totalToolCalls++;
      const name = tc.function.name;
      let args;
      try { args = typeof tc.function.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function.arguments || {}; } catch { args = {}; }

      const tool = TOOLS[name];
      let result;
      if (!tool) {
        result = '{"error":"unknown tool: ' + name + '"}';
        log("tool:UNKNOWN →", name);
      } else {
        const t0 = Date.now();
        try { result = await tool.execute(args); } catch (e) { result = JSON.stringify({ error: e.message }); }
        log("tool:" + name + " (" + (Date.now() - t0) + "ms)");
      }

      messages.push({ role: "tool", tool_call_id: tc.id, content: typeof result === "string" ? result : JSON.stringify(result) });
    }
  }

  die("Reached max rounds (" + maxRounds + ") without final answer");
}

// ─── Main ───────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv);

const ollamaHost = (process.env.OLLAMA_HOST || "http://localhost:11434").replace(/\/+$/, "");
const baseUrl = args.baseUrl || process.env.OPENAI_BASE_URL || ollamaHost + "/v1";
const apiKey = args.apiKey || process.env.OPENAI_API_KEY || "";
const model = args.model || process.env.AILOOP_MODEL || "qwen3:8b";
const maxRounds = args.maxRounds || parseInt(process.env.AILOOP_MAX_ROUNDS || "15", 10);
const timeoutSec = args.timeout || parseInt(process.env.AILOOP_TIMEOUT || "300", 10);

log("model=" + model, "url=" + baseUrl, "maxRounds=" + maxRounds, "timeout=" + timeoutSec + "s");

const input = await readStdin();
const task = input.trim();
if (!task) die("Empty input");

log("task:", task.slice(0, 200));

const result = await runAgentLoop({ baseUrl, apiKey, model, maxRounds, timeoutMs: timeoutSec * 1000 }, task);

// Output only the AI reply to stdout — clean pipe-friendly output
process.stdout.write(result.text);
if (!result.text.endsWith("\n")) process.stdout.write("\n");

if (process.env.AILOOP_VERBOSE === "1") {
  process.stderr.write("---\nrounds=" + result.rounds + " tools=" + result.toolCalls + " " + (result.durationMs / 1000).toFixed(1) + "s");
  if (result.usage) process.stderr.write(" tokens=" + (result.usage.prompt_tokens || 0) + "+" + (result.usage.completion_tokens || 0));
  process.stderr.write("\n");
}
