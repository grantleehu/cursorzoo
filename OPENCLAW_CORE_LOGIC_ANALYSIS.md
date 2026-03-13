# OpenClaw 核心逻辑分析

> 项目地址: https://github.com/openclaw/openclaw
> 语言: TypeScript (Node.js >= 22)
> 许可证: MIT
> 星标: ~183k | Forks: ~30k

---

## 1. 项目概述

**OpenClaw** 是一个**个人 AI 助手平台**,用户可以在自己的设备上运行。它通过用户已使用的通讯频道（WhatsApp、Telegram、Slack、Discord、Google Chat、Signal、iMessage、Microsoft Teams、WebChat 等）进行对话交互,并可扩展到 BlueBubbles、Matrix、Zalo 等。它还支持 macOS/iOS/Android 上的语音对话,以及实时 Canvas 渲染。

核心理念: **Gateway 是控制平面，产品是 AI 助手本身**。

---

## 2. 顶层架构

```
┌─────────────────────────────────────────────────────────────────┐
│                           CLI (入口)                            │
│  openclaw onboard | openclaw gateway | openclaw agent | ...    │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Gateway Server (核心中枢)                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ WebSocket│ │ HTTP API │ │ Control  │ │ OpenAI-compatible│   │
│  │  Server  │ │ Endpoints│ │    UI    │ │   API endpoints  │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┬─────────┘   │
│       └─────────────┼───────────┼─────────────────┘             │
│                     ▼                                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Server Methods (RPC handlers)               │    │
│  │  agent | chat | send | channels | cron | sessions | ... │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                          │                                       │
│  ┌────────────┐  ┌──────┴───────┐  ┌────────────┐              │
│  │  Channels  │  │  Auto-Reply  │  │  Sidecars   │              │
│  │  Manager   │  │   Pipeline   │  │ (Gmail,     │              │
│  │            │  │              │  │  Browser,   │              │
│  └─────┬──────┘  └──────┬───────┘  │  Memory)    │              │
│        │                │          └────────────┘              │
└────────┼────────────────┼──────────────────────────────────────┘
         │                │
         ▼                ▼
┌────────────────┐ ┌──────────────────────────────────────────────┐
│ Channel Plugins│ │           Agent Execution Engine              │
│ ┌────────────┐ │ │  ┌────────────┐  ┌────────────┐             │
│ │  WhatsApp  │ │ │  │ PI Embedded│  │   Skills   │             │
│ │  Telegram  │ │ │  │   Runner   │  │   System   │             │
│ │  Discord   │ │ │  │            │  │            │             │
│ │  Slack     │ │ │  └─────┬──────┘  └─────┬──────┘             │
│ │  Signal    │ │ │        │               │                     │
│ │  iMessage  │ │ │  ┌─────┴──────┐  ┌─────┴──────┐             │
│ │  MS Teams  │ │ │  │  AI Model  │  │   Tools    │             │
│ │  Matrix    │ │ │  │  Providers │  │  Registry  │             │
│ │  WebChat   │ │ │  │(Anthropic, │  │            │             │
│ │  IRC/Nostr │ │ │  │ OpenAI,    │  └────────────┘             │
│ │  Zalo ...  │ │ │  │ Google...) │                              │
│ └────────────┘ │ │  └────────────┘                              │
└────────────────┘ └──────────────────────────────────────────────┘
         │                │
         ▼                ▼
┌────────────────────────────────────────────────────────────────┐
│                    Persistent Layer                             │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ │
│  │  Sessions  │ │   Config   │ │   Memory   │ │  Cron Jobs │ │
│  │  (JSON)    │ │  (JSON5)   │ │  (SQLite + │ │  (SQLite)  │ │
│  │            │ │            │ │  Vectors)  │ │            │ │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

---

## 3. 核心模块详解

### 3.1 CLI 入口 (`src/cli/`)

**入口点**: `src/cli/run-main.ts` -> `runCli()`

CLI 是用户与 OpenClaw 交互的主要入口。流程:

1. **环境初始化**: 加载 `.env`、规范化环境变量、确保 CLI 在 PATH 中
2. **运行时检查**: 验证 Node >= 22
3. **路由分发**: 先尝试 fast-path 路由 (`tryRouteCli`)，再使用 Commander.js 构建完整 program
4. **子命令懒加载**: 根据主命令按需注册子 CLI，避免加载全部依赖

主要子命令:
- `openclaw gateway` — 启动 Gateway 服务器
- `openclaw agent` — 直接向 AI 助手发送消息
- `openclaw onboard` — 引导式安装向导
- `openclaw message send` — 发送消息到指定频道
- `openclaw doctor` — 诊断和修复配置

### 3.2 Gateway Server (`src/gateway/`)

**核心文件**: `server.impl.ts` -> `startGatewayServer()`

Gateway 是整个系统的**控制平面**（Control Plane），默认端口 `18789`。

#### 启动流程:

```
startGatewayServer(port)
  ├── 读取 & 验证配置文件 (JSON5)
  ├── 迁移旧版配置 (migrateLegacyConfig)
  ├── 自动启用插件 (applyPluginAutoEnable)
  ├── 加载插件注册表 (loadGatewayPlugins)
  ├── 解析运行时配置 (bind/TLS/auth/tailscale)
  ├── 构建 Gateway 方法列表 (RPC handlers)
  ├── 注册 WebSocket + HTTP 处理器
  ├── 启动 Sidecar 服务:
  │   ├── Browser Control Server (Playwright/CDP)
  │   ├── Gmail Watcher
  │   ├── Memory Backend (QMD)
  │   ├── Plugin Services
  │   └── Internal Hooks
  ├── 启动 Channel Manager (WhatsApp/Telegram/...)
  ├── 启动 Cron Service
  ├── 启动 Discovery (mDNS/Bonjour)
  ├── Canvas Host (A2UI)
  └── 定时任务: 更新检查, 健康快照, Skills 刷新
```

#### 关键子系统:

| 子系统 | 文件 | 职责 |
|--------|------|------|
| Server Methods | `server-methods/` | 所有 RPC/API 处理器 (agent, chat, send, cron...) |
| WebSocket Runtime | `server-ws-runtime.ts` | 管理 WS 连接、消息路由 |
| Channel Manager | `server-channels.ts` | 管理所有通讯频道的生命周期 |
| Config Reload | `config-reload.ts` | 热重载配置文件 |
| Node Registry | `node-registry.ts` | 管理连接的移动设备/桌面节点 |
| Session Utils | `session-utils.ts` | 会话持久化与查找 |
| Exec Approval | `exec-approval.ts` | 安全执行审批机制 |

### 3.3 Auto-Reply Pipeline（自动回复管线）— 核心消息处理

**目录**: `src/auto-reply/`

这是 OpenClaw 最核心的业务逻辑 — 当用户从任何频道发送消息时，如何处理并生成 AI 回复。

#### 消息处理完整流程:

```
用户消息 (WhatsApp/Telegram/Slack/...)
    │
    ▼
┌───────────────────────────────────────┐
│ Channel Plugin 接收 & 标准化消息        │
│ (normalize/whatsapp.ts, telegram.ts)  │
└──────────────┬────────────────────────┘
               │
               ▼
┌───────────────────────────────────────┐
│ Inbound Processing                     │
│ - 去重 (inbound-dedupe.ts)            │
│ - 分块 (chunk.ts)                     │
│ - 命令检测 (command-detection.ts)      │
│ - 触发判断 (group-activation.ts)       │
│ - 权限校验 (command-auth.ts)           │
└──────────────┬────────────────────────┘
               │
               ▼
┌───────────────────────────────────────┐
│ getReplyFromConfig()                   │ ← get-reply.ts
│ - 解析 Agent ID & Session Key          │
│ - 解析默认模型 & Provider              │
│ - 确保工作区存在                        │
│ - 应用 Media Understanding             │
│ - 应用 Link Understanding              │
│ - 解析内联指令 (Directives)            │
│ - 处理命令 (/status, /model, etc.)     │
└──────────────┬────────────────────────┘
               │
               ▼
┌───────────────────────────────────────┐
│ runPreparedReply()                     │ ← get-reply-run.ts
│ - 解析 Session 状态                    │
│ - 构建群组上下文                        │
│ - 处理 Queue 设置 (follow-up)          │
│ - 应用会话 Skills 快照                  │
│ - 应用思考级别 (thinking level)         │
└──────────────┬────────────────────────┘
               │
               ▼
┌───────────────────────────────────────┐
│ runReplyAgent()                        │ ← agent-runner.ts
│ - 创建 Typing 控制器                   │
│ - 创建 Block Reply Pipeline            │
│ - 调用 runAgentTurnWithFallback()      │
│   (含 failover/retry 逻辑)             │
│ - 处理流式输出 (Block Streaming)        │
│ - 构建最终回复 Payload                  │
│ - 执行 Memory Flush (如需要)           │
│ - 持久化使用统计                        │
└──────────────┬────────────────────────┘
               │
               ▼
┌───────────────────────────────────────┐
│ Channel Plugin 发送回复                 │
│ (outbound/telegram.ts, discord.ts...) │
└───────────────────────────────────────┘
```

#### 关键概念:

- **Directives (指令)**: 用户可以在消息中内联指令, 如 `/model claude-opus-4-20250514`, `/think high`, `/verbose`
- **Queue System**: Follow-up 消息队列, 支持 debounce, cap, drop policy
- **Block Streaming**: 分块流式输出, 按段落/换行/句子分割
- **Typing Controller**: 模拟真人打字效果

### 3.4 Agent 执行引擎 (`src/agents/`)

**核心文件**: `pi-embedded-runner/run.ts` -> `runEmbeddedPiAgent()`

这是 AI 模型调用的实际执行层。使用了 `@mariozechner/pi-agent-core` 和 `@mariozechner/pi-coding-agent` 两个核心库。

#### 执行流程:

```
runEmbeddedPiAgent(params)
  │
  ├── 1. Lane 调度 (Session Lane + Global Lane)
  │   └── 使用 command-queue 进行并发控制
  │
  ├── 2. Model 解析
  │   ├── resolveModel() — 确定 provider + model
  │   ├── resolveAuthProfileOrder() — 确定认证方式
  │   └── getApiKeyForModel() — 获取 API key
  │
  ├── 3. 构建运行载荷
  │   └── buildEmbeddedRunPayloads()
  │       ├── System Prompt 构建
  │       ├── Skills 加载
  │       ├── Tools 注册
  │       └── 上下文窗口管理
  │
  ├── 4. 执行 Attempt (含重试逻辑)
  │   └── runEmbeddedAttempt()
  │       ├── createAgentSession() — 创建代理会话
  │       ├── subscribeEmbeddedPiSession() — 订阅流式事件
  │       ├── 处理 Tool Calls
  │       └── 处理 Failover 错误
  │
  ├── 5. Auth Profile Failover
  │   ├── 标记失败: markAuthProfileFailure()
  │   ├── 检查冷却: isProfileInCooldown()
  │   ├── 分类失败原因: classifyFailoverReason()
  │   └── 切换到下一个 profile
  │
  ├── 6. Context Overflow 处理
  │   ├── evaluateContextWindowGuard()
  │   └── 自动 Compaction (压缩历史)
  │
  └── 7. 返回结果
      └── EmbeddedPiRunResult { reply, usage, model, ... }
```

#### Auth Profile 轮转机制:

OpenClaw 支持多个 AI 提供商的认证 profile 轮转:
- 主要 profile 失败时自动切换到备用
- 支持 OAuth (Anthropic Pro/Max, OpenAI) 和 API Key
- 冷却期机制防止反复切换
- 按失败原因分类 (auth, billing, rate-limit, timeout)

### 3.5 Tools 系统 (`src/agents/tools/`)

OpenClaw 内建了丰富的 Agent 工具集:

| 工具 | 文件 | 功能 |
|------|------|------|
| **message** | `message-tool.ts` | 跨频道消息发送(send/reply/react/pin/delete) |
| **web_search** | `web-search.ts` | 网页搜索 (Brave/Perplexity/Grok) |
| **web_fetch** | `web-fetch.ts` | 网页内容抓取 (含 Firecrawl 集成) |
| **browser** | `browser-tool.ts` | 浏览器控制 (Playwright/CDP) |
| **memory** | `memory-tool.ts` | 语义记忆搜索 |
| **image** | `image-tool.ts` | 图像生成 |
| **cron** | `cron-tool.ts` | 定时任务管理 |
| **canvas** | `canvas-tool.ts` | Canvas UI 渲染 |
| **tts** | `tts-tool.ts` | 文本转语音 |
| **sessions** | `sessions-*.ts` | 子代理 (Sub-Agent) 会话管理 |
| **gateway** | `gateway-tool.ts` | Gateway 配置操作 |
| **discord/slack/telegram** | `*-actions.ts` | 平台特定操作 |

### 3.6 Skills 系统 (`src/agents/skills/` + `skills/`)

Skills 是 OpenClaw 的能力扩展机制。每个 Skill 是一个 Markdown 文件 (SKILL.md)，包含:

- **Frontmatter**: 元数据 (名称, 依赖, 平台限制等)
- **Prompt 内容**: 注入到 System Prompt 中的指令

#### Skills 加载流程:

```
loadWorkspaceSkillEntries()
  ├── 加载 bundled skills (内置)
  ├── 加载 workspace skills (工作区)
  ├── 加载 plugin skills (插件提供)
  ├── 合并 & 去重
  ├── 检查依赖满足条件 (bins, env, config)
  ├── 应用 config 过滤
  └── 格式化为 System Prompt 片段
```

内置 Skills 示例:
- `coding-agent` — 编程辅助
- `github` — GitHub 操作
- `weather` — 天气查询
- `spotify-player` — Spotify 控制
- `apple-reminders` — Apple 提醒事项
- `discord/slack/telegram` — 平台深度集成
- 等 60+ 个 Skills

### 3.7 Channel Plugin 系统 (`src/channels/` + `extensions/`)

通讯频道是 OpenClaw 的核心差异化特性。架构采用统一的插件接口:

#### 频道插件接口 (`types.core.ts`):

```typescript
type ChannelMeta = {
  id: ChannelId;
  label: string;
  // ... UI 相关元数据
  setup: (input: ChannelSetupInput) => Promise<void>;
  start: (config: OpenClawConfig) => Promise<void>;
  stop: () => Promise<void>;
  send: (target, message, options) => Promise<void>;
  // ... 其他能力声明
};
```

#### 支持的频道:

| 频道 | 位置 | 类型 |
|------|------|------|
| WhatsApp | `extensions/whatsapp/` | 插件 (Baileys) |
| Telegram | `extensions/telegram/` | 插件 |
| Discord | `extensions/discord/` | 插件 |
| Slack | `extensions/slack/` | 插件 |
| Signal | `extensions/signal/` | 插件 |
| iMessage | `extensions/imessage/` | 插件 |
| Microsoft Teams | `extensions/msteams/` | 插件 |
| Matrix | `extensions/matrix/` | 插件 |
| Google Chat | `extensions/googlechat/` | 插件 |
| IRC | `extensions/irc/` | 插件 |
| BlueBubbles | `extensions/bluebubbles/` | 插件 |
| Nostr | `extensions/nostr/` | 插件 |
| Line | `extensions/line/` | 插件 |
| Zalo / Zalo Personal | `extensions/zalo/`, `extensions/zalouser/` | 插件 |
| WebChat | `src/web/` | 内置 |

每个频道插件负责:
1. **Normalize**: 将平台消息标准化为内部格式
2. **Outbound**: 将回复从内部格式转换为平台格式
3. **Actions**: 平台特有操作 (反应, 置顶, 转发等)
4. **Onboarding**: 频道配置向导
5. **Status**: 连接状态监控

### 3.8 Memory 系统 (`src/memory/`)

OpenClaw 内建了一个**语义记忆检索系统**，基于向量数据库:

#### 架构:

```
MemoryIndexManager
  ├── 文件监控 (chokidar) — 监控 workspace 文件变化
  ├── Embedding Provider
  │   ├── OpenAI (text-embedding-3-small)
  │   ├── Voyage AI
  │   └── Google Gemini
  ├── SQLite + sqlite-vec — 向量存储
  ├── 混合搜索 (Hybrid Search)
  │   ├── Vector Search (语义)
  │   └── BM25 FTS (关键字)
  └── Session Transcript 索引
      └── 自动索引会话历史
```

#### 核心流程:
1. **索引**: 将 workspace 中的 Markdown 文件分块、生成 embedding、存入 SQLite
2. **搜索**: Agent 调用 memory 工具时，执行混合检索
3. **同步**: 文件变更自动触发重新索引
4. **Session 记忆**: 对话历史也可被索引和检索

### 3.9 Cron 定时任务 (`src/cron/`)

提供定时触发 Agent 执行的能力:

```typescript
class CronService {
  start()                    // 启动调度器
  add(input: CronJobCreate)  // 添加定时任务
  update(id, patch)          // 修改任务
  remove(id)                 // 删除任务
  run(id, mode)              // 手动触发
  wake(opts)                 // 唤醒
}
```

支持:
- Cron 表达式调度
- One-shot 单次任务
- Heartbeat 心跳任务 (定期检查)
- 独立 Agent 会话执行
- 结果投递到指定频道

#### Cron 任务执行的完整函数调用链

Cron 定时任务到期后，根据 `sessionTarget` 的不同，分为 **两条执行路径**:

**路径一: `sessionTarget = "main"` (主会话注入)**

```
CronService.start()
  → ops.start(state)                          // service/ops.ts
    → armTimer(state)                          // service/timer.ts — 设置 setTimeout
      → onTimer(state)                         // 到期时触发
        → findDueJobs(state)                   // 找到到期任务
        → executeJobCore(state, job)           // service/timer.ts:392
          → resolveJobPayloadTextForMain(job)  // 取出 systemEvent 文本
          → state.deps.enqueueSystemEvent(text)
            → enqueueSystemEvent(text, {sessionKey})  // infra/system-events.ts:51
              // 将文本放入内存中的 session 事件队列
          → state.deps.requestHeartbeatNow()
            → requestHeartbeatNow()            // infra/heartbeat-wake.ts
              → schedule(coalesceMs)           // 延迟 250ms 合并
                → handler({reason})
                  → runHeartbeatOnce()         // infra/heartbeat-runner.ts
                    → getReplyFromConfig(ctx, {isHeartbeat: true})
                      // ← 这是 auto-reply/reply/get-reply.ts 的核心入口
                      → runPreparedReply()     // get-reply-run.ts
                        → runReplyAgent()      // agent-runner.ts
                          → runEmbeddedPiAgent()  // agents/pi-embedded-runner/run.ts
                            // AI 模型调用,system events 在 prompt 中注入
```

**路径二: `sessionTarget = "isolated"` (独立会话执行)**

```
CronService.start()
  → ops.start(state)
    → armTimer(state)
      → onTimer(state)
        → findDueJobs(state)
        → executeJobCore(state, job)           // service/timer.ts:392
          → state.deps.runIsolatedAgentJob({job, message})
            // ↓ 在 gateway/server-cron.ts:78 绑定为:
            → runCronIsolatedAgentTurn(params)  // cron/isolated-agent/run.ts:106
              → resolveConfiguredModelRef()     // 解析模型
              → ensureAgentWorkspace()          // 确保工作区
              → resolveCronSession()            // 创建/恢复 cron 专用会话
              → buildWorkspaceSkillSnapshot()   // 加载 Skills
              → runWithModelFallback({          // agents/model-fallback.ts — 含 fallback
                  run: (provider, model) => {
                    // CLI provider 走 runCliAgent:
                    → runCliAgent(...)          // agents/cli-runner.ts
                    // 普通 provider 走 runEmbeddedPiAgent:
                    → runEmbeddedPiAgent({      // agents/pi-embedded-runner/run.ts
                        prompt: commandBody,    // "[cron:id name] message\n当前时间"
                        lane: "cron",           // cron 专用并发 lane
                        ...
                      })
                  }
                })
              → deliverOutboundPayloads()       // 投递结果到频道
              // 或:
              → runSubagentAnnounceFlow()       // 通过子代理通告流程投递
```

**核心执行函数总结:**

| 函数 | 位置 | 职责 |
|------|------|------|
| `executeJobCore()` | `src/cron/service/timer.ts:392` | Cron 任务执行的入口分发 |
| `enqueueSystemEvent()` | `src/infra/system-events.ts:51` | main 模式: 将文本放入事件队列 |
| `requestHeartbeatNow()` | `src/infra/heartbeat-wake.ts` | main 模式: 请求立即执行 heartbeat |
| `runHeartbeatOnce()` | `src/infra/heartbeat-runner.ts` | main 模式: 执行 heartbeat（带 system events） |
| `getReplyFromConfig()` | `src/auto-reply/reply/get-reply.ts:53` | main 模式最终调用: 走完整 auto-reply 管线 |
| `runCronIsolatedAgentTurn()` | `src/cron/isolated-agent/run.ts:106` | isolated 模式: 独立会话运行 |
| `runEmbeddedPiAgent()` | `src/agents/pi-embedded-runner/run.ts:137` | **最终的 AI 模型调用** (两条路径都汇聚于此) |
| `runCliAgent()` | `src/agents/cli-runner.ts` | CLI provider 的替代执行路径 |
| `deliverOutboundPayloads()` | `src/infra/outbound/deliver.ts` | 将结果投递到通讯频道 |

### 3.10 Configuration 系统 (`src/config/`)

使用 **JSON5** 格式的配置文件，位于 `~/.config/openclaw/config.json5`:

```
OpenClawConfig
  ├── agents.defaults        — Agent 默认配置 (模型, 提供商, 超时)
  ├── agents.defaults.models — 模型白名单 & 别名
  ├── channels.*             — 各频道配置
  ├── gateway.*              — Gateway 服务器配置
  ├── hooks.*                — Hooks 配置 (Gmail, 内部钩子)
  ├── memory.*               — 记忆系统配置
  ├── session.*              — 会话配置
  ├── skills.*               — Skills 配置
  ├── sandbox.*              — 沙盒安全配置
  ├── cron.*                 — 定时任务配置
  ├── tts.*                  — TTS 配置
  └── plugins.*              — 插件配置
```

支持:
- Zod Schema 验证
- 热重载 (config-reload.ts)
- 旧版自动迁移
- 运行时覆盖 (环境变量)

### 3.11 Security 安全模块 (`src/security/`)

- **audit.ts**: 文件系统权限审计
- **external-content.ts**: 外部内容安全包装 (防注入)
- **skill-scanner.ts**: Skill 文件安全扫描
- **fix.ts**: 自动修复权限问题
- **Exec Approval**: Agent 执行敏感操作时需要人工审批
- **Sandbox**: 代码执行沙盒隔离

### 3.12 Browser Control (`src/browser/`)

基于 Playwright 和 Chrome DevTools Protocol (CDP) 的浏览器控制:

- 自动化网页操作
- 截图
- DOM 快照
- 元素交互
- 表单填写
- 多标签管理
- AI 驱动的页面理解

### 3.13 Plugin 系统 (`src/plugins/`)

OpenClaw 有一个完善的插件架构:

```
Plugin 发现 & 加载
  ├── discovery.ts     — 从 bundled/workspace/global/config 发现插件
  ├── loader.ts        — 加载 & 初始化插件 (使用 jiti 支持 TS)
  ├── registry.ts      — 全局插件注册表
  ├── manifest.ts      — openclaw.plugin.json 声明文件
  ├── services.ts      — 插件后台服务管理
  ├── hooks.ts         — 插件 Hook 系统
  └── tools.ts         — 插件提供的 Agent 工具
```

每个插件通过 `openclaw.plugin.json` 声明，可以:
- 注册新的 Channel
- 提供 Agent Tools
- 注册 Gateway Methods
- 提供 Hook Handlers
- 提供 Memory Backend

---

## 4. 数据流总结

### 4.1 消息接收到回复的完整路径

```
[频道] 用户发送消息
   ↓
[Channel Plugin] 接收 & Normalize → MsgContext
   ↓
[Auto-Reply] Inbound 处理 (去重/命令检测/权限)
   ↓
[Auto-Reply] getReplyFromConfig()
   ├── 解析 Agent/Session/Model
   ├── Media/Link Understanding
   └── Directive 解析
   ↓
[Auto-Reply] runPreparedReply()
   ├── Session 状态管理
   ├── Skills 快照加载
   └── Queue 设置
   ↓
[Auto-Reply] runReplyAgent()
   ↓
[Agent] runEmbeddedPiAgent()
   ├── Auth Profile 选择
   ├── System Prompt 构建 (含 Skills)
   ├── Tool 注册
   └── AI Model API 调用
   ↓
[PI-Agent-Core] createAgentSession()
   ├── 流式 Token 输出
   ├── Tool Call 处理
   │   ├── message (发消息)
   │   ├── web_search (搜索)
   │   ├── memory (记忆检索)
   │   ├── bash (命令执行)
   │   └── ... 其他工具
   └── 最终回复文本
   ↓
[Auto-Reply] 构建 ReplyPayload
   ├── Block Streaming 分块
   ├── 格式化 (Markdown 适配)
   └── 使用统计
   ↓
[Channel Plugin] Outbound 发送回复
   ↓
[频道] 用户收到回复
```

### 4.2 Gateway WebSocket 通信

```
Client (Mobile App / Desktop)
   ↕ WebSocket (JSON-RPC style)
Gateway Server
   ├── agent.run      — 触发 Agent 运行
   ├── chat.send      — 发送聊天消息
   ├── sessions.list  — 列出会话
   ├── cron.add       — 添加定时任务
   ├── config.get     — 获取配置
   ├── nodes.register — 注册设备节点
   └── ... 50+ methods
```

---

## 5. 关键设计模式

### 5.1 Lane 并发控制
使用 "Lane" 模式进行并发管理。每个 Session 有自己的 Lane (保证会话内顺序)，全局也有 Lane (限制总并发数)。

### 5.2 Failover 与弹性
- Auth Profile 自动轮转
- Context Overflow 自动压缩
- Model Fallback
- Thinking Level 降级

### 5.3 插件化一切
几乎所有外部集成都是插件形式，Channel / Memory Backend / Voice / Auth 都通过 Plugin 系统扩展。

### 5.4 Streaming-First
从 AI 模型到用户界面，全链路支持流式输出，最小化首字延迟。

### 5.5 Security by Default
- 沙盒执行 (Sandbox)
- 外部内容安全包装
- Exec Approval 审批
- 文件权限审计
- Prompt Injection 防护 (Anthropic Magic String 过滤)

---

## 6. 技术栈

| 层面 | 技术 |
|------|------|
| 语言 | TypeScript (ES2023, NodeNext modules) |
| 运行时 | Node.js >= 22 (可选 Bun) |
| 构建 | tsdown (esbuild-based) |
| 测试 | Vitest |
| AI SDK | `@mariozechner/pi-agent-core`, `@mariozechner/pi-ai`, `@mariozechner/pi-coding-agent` |
| 向量数据库 | SQLite + sqlite-vec |
| 浏览器控制 | Playwright + CDP |
| 配置 | JSON5 + Zod Schema |
| CLI | Commander.js |
| 移动端 | Swift (iOS/macOS), Kotlin (Android) |
| UI | TypeScript SPA (Canvas + WebChat) |

---

## 7. 源代码规模统计

| 目录 | 文件数 | 描述 |
|------|--------|------|
| `src/agents/` | ~466 | Agent 执行引擎 (最大模块) |
| `src/auto-reply/` | ~209 | 自动回复管线 |
| `src/gateway/` | ~202 | Gateway 服务器 |
| `src/config/` | ~143 | 配置系统 |
| `src/channels/` | ~102 | 频道抽象层 |
| `src/cli/` | ~173 | CLI 工具 |
| `src/browser/` | ~75 | 浏览器控制 |
| `src/telegram/` | ~89 | Telegram 集成 |
| `src/discord/` | ~69 | Discord 集成 |
| `src/slack/` | ~64 | Slack 集成 |
| `src/memory/` | ~48 | 记忆系统 |
| `src/cron/` | ~44 | 定时任务 |
| `src/plugins/` | ~39 | 插件框架 |
| `extensions/` | ~628 | 频道插件实现 |
| `skills/` | ~74 | 内置 Skills |
| **总计** | **~2660+ (src)** | |

---

## 8. 总结

OpenClaw 的核心逻辑可以概括为:

1. **Gateway 是中枢**: 一个 WebSocket + HTTP 服务器，管理所有频道连接、Agent 调度、设备注册
2. **Auto-Reply 是管线**: 从消息接收到 AI 回复的完整流水线，包含命令解析、指令处理、模型选择、流式输出
3. **Agent Runner 是引擎**: 基于 pi-agent-core 的 AI 模型调用层，支持工具调用、failover、上下文管理
4. **Channel Plugin 是触角**: 统一的插件接口连接 15+ 通讯平台
5. **Skills 是知识**: Markdown 格式的能力扩展，注入 System Prompt
6. **Memory 是记忆**: 基于向量搜索的语义记忆系统

整体架构追求**单用户、本地优先、全平台覆盖**的设计哲学，是一个工程质量极高的开源项目。
