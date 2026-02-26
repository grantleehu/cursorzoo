# MCP Server 完全指南

## 目录

- [什么是 MCP Server](#什么是-mcp-server)
- [MCP 的核心架构](#mcp-的核心架构)
- [MCP Server 运行在哪里](#mcp-server-运行在哪里)
- [MCP Server 能做什么](#mcp-server-能做什么)
- [三大核心能力详解](#三大核心能力详解)
- [本项目示例说明](#本项目示例说明)
- [快速开始](#快速开始)
- [在 Cursor 中使用](#在-cursor-中使用)
- [如何发布自己的 MCP Server](#如何发布自己的-mcp-server)
- [实战：高德地图 MCP 在各平台的配置](#实战高德地图-mcp-在各平台的配置)
- [常见问题](#常见问题)

---

## 什么是 MCP Server

**MCP（Model Context Protocol，模型上下文协议）** 是由 Anthropic 提出的一个开放标准协议。
它的核心目标是：**让 AI 模型（如 Claude、GPT 等）能够安全、标准化地与外部工具和数据源交互。**

你可以把 MCP 理解为 **"AI 的 USB 接口"**：

- 就像 USB 让各种外设（键盘、鼠标、打印机）通过统一接口连接电脑一样
- MCP 让各种工具和数据源通过统一协议连接到 AI 模型

**MCP Server** 就是一个遵循 MCP 协议的服务端程序，它向 AI 暴露工具（Tools）、数据（Resources）和提示词模板（Prompts）。

### 为什么需要 MCP？

在 MCP 出现之前，每个 AI 应用要对接外部工具，都需要自己写一套集成代码。这导致：
- 每个工具都需要针对不同 AI 平台做适配
- 开发者重复造轮子
- 没有统一的安全和权限标准

MCP 解决了这些问题，让一个 MCP Server 可以被任何支持 MCP 的 AI 客户端（如 Cursor、Claude Desktop）直接使用。

---

## MCP 的核心架构

MCP 采用 **客户端-服务端（Client-Server）** 架构：

```
┌──────────────────────────────────────────────────┐
│              Host（宿主应用）                       │
│         例如：Cursor、Claude Desktop               │
│                                                    │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  │
│  │  MCP Client │  │  MCP Client │  │  MCP Client │  │
│  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘  │
└─────────┼───────────────┼───────────────┼────────┘
          │               │               │
          ▼               ▼               ▼
   ┌────────────┐  ┌────────────┐  ┌────────────┐
   │ MCP Server │  │ MCP Server │  │ MCP Server │
   │  (本地工具)  │  │ (数据库)    │  │ (API 服务)  │
   └────────────┘  └────────────┘  └────────────┘
```

- **Host（宿主）**：运行 AI 的应用程序（如 Cursor）
- **MCP Client（客户端）**：Host 内部的连接器，每个 Client 对应一个 Server
- **MCP Server（服务端）**：提供工具、资源、提示词的程序

通信方式：
- **stdio（标准输入输出）**：最常见，Server 作为子进程运行
- **Streamable HTTP**：适合远程部署的 Server

---

## MCP Server 运行在哪里

MCP Server 的运行位置取决于你选择的 **传输方式（Transport）**。目前主要有两种模式：

### 模式一：本地运行（stdio 传输）— 最常见

```
┌─────────────────────────────────────────────┐
│            你的电脑（本地）                     │
│                                               │
│  ┌───────────────┐     stdio      ┌────────┐ │
│  │  Cursor /      │ ◄──────────► │  MCP    │ │
│  │  Claude Desktop │  stdin/stdout │  Server │ │
│  └───────────────┘               └────────┘ │
│                                  (子进程)     │
└─────────────────────────────────────────────┘
```

**工作方式**：Host（如 Cursor）直接在本地把 MCP Server 作为 **子进程** 启动，通过标准输入输出（stdin/stdout）通信。

**特点**：
- 配置最简单，不需要网络
- Server 随 Cursor 启动/关闭，生命周期由 Host 管理
- 只能被本机上的一个 Client 使用
- 绝大多数 MCP Server 都是这种模式

**适用场景**：个人开发工具、本地文件操作、本地数据库访问

**配置示例**（`.cursor/mcp.json`）：

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/path/to/dist/index.js"]
    }
  }
}
```

### 模式二：远程部署（Streamable HTTP 传输）

```
┌──────────────┐          HTTPS           ┌──────────────────┐
│  你的电脑      │                          │  云服务器 / 容器    │
│              │        /mcp 端点          │                    │
│  Cursor ─────┼── POST/GET+SSE ────────►│  MCP Server       │
│              │                          │  (HTTP 服务)       │
│  其他 AI 客户 ─┼── POST/GET+SSE ────────►│                    │
│  端也能连接    │                          │                    │
└──────────────┘                          └──────────────────┘
```

**工作方式**：MCP Server 作为 HTTP 服务部署在远程服务器上，暴露 `/mcp` 端点，Client 通过网络连接。

**特点**：
- 多个客户端可以同时连接同一个 Server
- 支持按需伸缩、弹性扩容
- 需要处理认证、TLS、CORS 等安全问题
- 适合团队共享或公开服务

**适用场景**：团队共享工具、SaaS 服务、需要访问云端资源的场景

**可以部署到的平台**：
| 平台 | 说明 |
|------|------|
| **Google Cloud Run** | 支持 Streamable HTTP，可 scale-to-zero |
| **AWS Lambda / ECS** | 容器化部署 |
| **Cloudflare Workers** | 边缘计算，延迟低 |
| **Koyeb** | 支持 scale-to-zero |
| **自己的服务器 + Docker** | 完全掌控 |
| **任何支持 Node.js/Python 的 VPS** | 最灵活 |

**配置示例**（`.cursor/mcp.json`）：

```json
{
  "mcpServers": {
    "remote-server": {
      "url": "https://your-server.example.com/mcp"
    }
  }
}
```

### 模式三：Docker 容器（本地或远程均可）

```bash
# stdio 模式（本地容器）
docker run -i my-mcp-server

# HTTP 模式（远程容器）
docker run -p 3000:3000 my-mcp-server --http
```

Docker 容器化后，本地和远程部署都很方便，还能保证环境一致性。

### 总结对比

| 维度 | 本地 stdio | 远程 HTTP |
|------|-----------|-----------|
| **运行位置** | 你的电脑上，作为子进程 | 云服务器 / 容器平台 |
| **启动方式** | Host 自动启动 | 需要手动部署运行 |
| **通信方式** | stdin / stdout | HTTP POST + SSE |
| **并发客户端** | 仅 1 个 | 多个 |
| **配置复杂度** | 低（只需 command + args） | 中高（需处理网络、安全） |
| **适用场景** | 个人开发工具 | 团队共享、公开服务 |
| **目前使用率** | 绝大多数 | 逐渐增多 |

> **建议**：如果你刚开始开发 MCP Server，从 stdio 模式起步就好。等需要团队共享或公开发布时，再改为 HTTP 模式。两种模式的 Server 逻辑代码完全一样，只是 Transport 层不同。

---

## MCP Server 能做什么

MCP Server 提供三大核心能力：

| 能力 | 说明 | 控制方 | 类比 |
|------|------|--------|------|
| **Tools（工具）** | LLM 可以调用的函数 | 模型控制 | 相当于给 AI 一把"瑞士军刀" |
| **Resources（资源）** | LLM 可以读取的数据 | 应用控制 | 相当于给 AI 一个"图书馆" |
| **Prompts（提示词模板）** | 可复用的提示词 | 用户控制 | 相当于给 AI 一套"操作手册" |

### 真实场景举例

- **数据库 MCP Server**：暴露 `query_sql` 工具，AI 就能直接查询数据库
- **GitHub MCP Server**：暴露 `create_issue`、`list_prs` 等工具，AI 就能管理项目
- **文件系统 MCP Server**：暴露 `read_file`、`write_file` 工具，AI 就能操作文件
- **天气 MCP Server**：暴露 `get_weather` 工具，AI 就能查询天气
- **Slack MCP Server**：暴露 `send_message` 工具，AI 就能发送消息

---

## 三大核心能力详解

### 1. Tools（工具）

Tools 是 MCP 最核心的能力。每个 Tool 包含：
- **名称**：唯一标识符（如 `calculate`）
- **描述**：告诉 AI 这个工具做什么
- **输入参数 Schema**：定义参数的类型和约束（使用 JSON Schema / Zod）
- **处理函数**：实际执行逻辑

```typescript
server.tool(
  "calculate",              // 工具名称
  "Perform arithmetic",     // 描述
  {                          // 参数 Schema（Zod）
    operation: z.enum(["add", "subtract", "multiply", "divide"]),
    a: z.number(),
    b: z.number(),
  },
  async ({ operation, a, b }) => {   // 处理函数
    const result = /* ... 计算逻辑 ... */;
    return {
      content: [{ type: "text", text: String(result) }],
    };
  }
);
```

### 2. Resources（资源）

Resources 让 AI 能够读取结构化数据。它们通过 URI 访问：

```typescript
// 静态资源
server.resource(
  "config",
  "config://app",
  async (uri) => ({
    contents: [{
      uri: uri.href,
      mimeType: "application/json",
      text: JSON.stringify({ theme: "dark", lang: "zh-CN" }),
    }],
  })
);

// 动态资源模板
server.resource(
  "user-profile",
  new ResourceTemplate("user://{userId}", { list: undefined }),
  async (uri, { userId }) => ({
    contents: [{
      uri: uri.href,
      mimeType: "application/json",
      text: JSON.stringify({ id: userId, name: "..." }),
    }],
  })
);
```

### 3. Prompts（提示词模板）

Prompts 是可参数化的提示词模板，方便复用：

```typescript
server.prompt(
  "code_review",
  "Generate a code review prompt",
  { code: z.string(), language: z.string().optional() },
  ({ code, language }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Please review this ${language ?? ""} code:\n\`\`\`\n${code}\n\`\`\``,
      },
    }],
  })
);
```

---

## 本项目示例说明

本项目（`mcp-server-example`）包含了完整的 MCP Server 示例，展示了全部三种能力：

### Tools
| 工具名 | 功能 |
|--------|------|
| `calculate` | 四则运算（加减乘除） |
| `get_current_time` | 获取当前时间 |
| `string_utils` | 字符串操作（反转、大小写、字数统计） |

### Resources
| 资源名 | URI | 功能 |
|--------|-----|------|
| `server-info` | `info://server` | 返回 Server 元信息 |
| `greeting` | `greeting://{name}` | 动态生成问候语 |

### Prompts
| 模板名 | 功能 |
|--------|------|
| `code_review` | 生成代码审查提示词 |
| `summarize` | 生成文本摘要提示词 |

---

## 快速开始

### 1. 安装依赖

```bash
cd mcp-server-example
npm install
```

### 2. 编译

```bash
npm run build
```

### 3. 运行

```bash
npm start
```

Server 会通过 stdio 方式启动，等待 MCP Client 连接。

---

## 在 Cursor 中使用

在你的项目根目录创建 `.cursor/mcp.json` 文件：

```json
{
  "mcpServers": {
    "example-server": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server-example/dist/index.js"]
    }
  }
}
```

也可以在 Cursor 设置 > MCP 中手动添加。

如果你已将 Server 发布到 npm：

```json
{
  "mcpServers": {
    "example-server": {
      "command": "npx",
      "args": ["-y", "mcp-server-example"]
    }
  }
}
```

---

## 如何发布自己的 MCP Server

### 第一步：开发你的 Server

1. **初始化项目**（或使用官方脚手架）：

```bash
# 方法一：手动创建（参考本项目）
mkdir my-mcp-server && cd my-mcp-server
npm init -y
npm install @modelcontextprotocol/sdk zod
npm install -D typescript @types/node

# 方法二：使用官方脚手架
npx @modelcontextprotocol/create-server my-mcp-server
```

2. **编写 Server 代码**（参考 `src/index.ts`）

3. **编译测试**：

```bash
npm run build
npm start
```

### 第二步：发布到 npm

1. **注册 npm 账号**（如果还没有）：

去 [npmjs.com](https://www.npmjs.com/) 注册

2. **登录 npm**：

```bash
npm login
```

3. **确保 `package.json` 配置正确**：

```json
{
  "name": "your-mcp-server-name",
  "version": "1.0.0",
  "description": "A brief description of your MCP server",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "your-mcp-server-name": "dist/index.js"
  },
  "files": ["dist"],
  "keywords": ["mcp", "model-context-protocol"],
  "repository": {
    "type": "git",
    "url": "https://github.com/your-username/your-repo"
  }
}
```

4. **编译并发布**：

```bash
npm run build
npm publish --access public
```

发布后，任何人都可以通过 `npx your-mcp-server-name` 运行你的 Server。

### 第三步（可选）：发布到 MCP Registry

MCP Registry 是官方的 MCP Server 注册表，发布后可以被更多人发现。

1. **安装 `mcp-publisher` CLI**：

```bash
# macOS / Linux
brew install mcp-publisher

# 或下载预构建二进制
# 见 https://github.com/modelcontextprotocol/registry/releases
```

2. **初始化 `server.json`**：

```bash
mcp-publisher init
```

3. **按提示填写信息并提交**。

> 注意：MCP Registry 目前处于预览阶段，API 可能变化。

### 第四步：让别人使用你的 Server

告诉用户在他们的 MCP 配置中添加：

```json
{
  "mcpServers": {
    "your-server": {
      "command": "npx",
      "args": ["-y", "your-mcp-server-name"]
    }
  }
}
```

---

## 实战：高德地图 MCP 在各平台的配置

高德地图 MCP Server 是一个非常好的真实案例——它同时支持 stdio、SSE、Streamable HTTP 三种传输方式，可以在各种 AI 客户端中使用。

### 前置准备：获取高德 API Key

1. 登录 [高德开放平台控制台](https://console.amap.com/)
2. 进入「应用管理」→ 创建新应用
3. 点击「添加 Key」，服务平台选择 **「Web服务」**
4. 复制生成的 Key，下面配置要用

> 高德 MCP 提供的能力：地理编码、逆地理编码、关键词/周边搜索、驾车/步行/骑行/公交路径规划、天气查询、IP 定位、距离测量、生成专属地图等。

---

### 一、在 Cursor 中配置

Cursor 支持所有三种方式，推荐使用 **Streamable HTTP**（最简单，无需 Node.js）。

**方式 A：Streamable HTTP（推荐）**

在项目根目录创建 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "amap-maps": {
      "url": "https://mcp.amap.com/mcp?key=你的API_Key"
    }
  }
}
```

一行 `url` 搞定，不需要安装任何东西。

**方式 B：SSE 传输**

```json
{
  "mcpServers": {
    "amap-maps": {
      "url": "https://mcp.amap.com/sse?key=你的API_Key"
    }
  }
}
```

**方式 C：本地 stdio（npx）**

需要 Node.js >= 20：

```json
{
  "mcpServers": {
    "amap-maps": {
      "command": "npx",
      "args": ["-y", "@amap/amap-maps-mcp-server"],
      "env": {
        "AMAP_MAPS_API_KEY": "你的API_Key"
      }
    }
  }
}
```

配置完成后，重启 Cursor 或在 Settings → MCP 中点击刷新，看到 `amap-maps` 状态变绿即可。

---

### 二、在 Gemini CLI 中配置

Gemini CLI 是 Google 的命令行 AI 工具，配置文件是 `settings.json`。

**方式 A：命令行快速添加（推荐）**

```bash
# Streamable HTTP 方式
gemini mcp add --transport http amap-maps "https://mcp.amap.com/mcp?key=你的API_Key"

# SSE 方式
gemini mcp add --transport sse amap-maps "https://mcp.amap.com/sse?key=你的API_Key"

# stdio 方式（本地 npx）
gemini mcp add -e AMAP_MAPS_API_KEY=你的API_Key amap-maps npx -y @amap/amap-maps-mcp-server
```

默认添加到项目级配置（`.gemini/settings.json`），加 `-s user` 可改为全局配置（`~/.gemini/settings.json`）。

**方式 B：手动编辑 settings.json**

项目级：`.gemini/settings.json`；全局级：`~/.gemini/settings.json`

Streamable HTTP 方式：

```json
{
  "mcpServers": {
    "amap-maps": {
      "httpUrl": "https://mcp.amap.com/mcp?key=你的API_Key"
    }
  }
}
```

stdio 方式：

```json
{
  "mcpServers": {
    "amap-maps": {
      "command": "npx",
      "args": ["-y", "@amap/amap-maps-mcp-server"],
      "env": {
        "AMAP_MAPS_API_KEY": "你的API_Key"
      }
    }
  }
}
```

配置完成后运行 `gemini`，输入 `/mcp list` 验证连接状态。

---

### 三、在 Antigravity 中配置

Antigravity 是 Google 的 AI IDE。它的 MCP 配置文件是 `mcp_config.json`，通过 IDE 界面访问。

**打开配置文件**：

1. 点击 Agent 面板右上角的 `...` 菜单
2. 选择 **「MCP Servers」**
3. 点击 **「Manage MCP Servers」**
4. 点击 **「View raw config」** 打开 `mcp_config.json`

**方式 A：stdio 方式（推荐，兼容性最好）**

```json
{
  "mcpServers": {
    "amap-maps": {
      "command": "npx",
      "args": ["-y", "@amap/amap-maps-mcp-server"],
      "env": {
        "AMAP_MAPS_API_KEY": "你的API_Key"
      }
    }
  }
}
```

**方式 B：通过 HTTP 适配器连接远程 Server**

如果 Antigravity 版本不直接支持 HTTP URL，可以用适配器桥接：

```json
{
  "mcpServers": {
    "amap-maps": {
      "command": "npx",
      "args": ["-y", "@pyroprompts/mcp-stdio-to-streamable-http-adapter"],
      "env": {
        "URI": "https://mcp.amap.com/mcp?key=你的API_Key"
      }
    }
  }
}
```

保存后重启 Agent 面板生效。

---

### 三个平台对比速查

| 平台 | 配置文件位置 | 推荐方式 | 是否支持直接 HTTP URL |
|------|------------|---------|---------------------|
| **Cursor** | `.cursor/mcp.json` | Streamable HTTP | 支持（`"url": "..."`） |
| **Gemini CLI** | `.gemini/settings.json` 或 `~/.gemini/settings.json` | HTTP 或 stdio | 支持（`"httpUrl": "..."` 或 CLI 命令） |
| **Antigravity** | IDE 内 `mcp_config.json` | stdio (npx) | 需适配器或新版本支持 |

> **提示**：不管哪个平台，stdio 方式的配置格式几乎完全一致（`command` + `args` + `env`），这正是 MCP 标准化的好处。

---

## 高德 MCP 免费配额与收费说明

高德 MCP Server 本质上是调用高德开放平台的 Web 服务 API。**MCP 协议层本身不收费**，费用来自底层的高德 API 调用。每调一次 MCP Tool = 消耗一次对应的 API 配额。

### 调用怎么计数？

AI 通过 MCP 调用高德工具时，**每个 Tool 调用 = 1 次 API 请求**。AI 完成一个复杂任务可能会连续调用多个 Tool，每次都独立计数。

例如：让 AI "帮我规划从北京到上海的自驾路线"，AI 可能会：
1. 调用地理编码（北京 → 坐标）→ 消耗 1 次
2. 调用地理编码（上海 → 坐标）→ 消耗 1 次
3. 调用驾车路径规划 → 消耗 1 次
4. 调用天气查询 → 消耗 1 次

**合计 4 次 API 调用**。实际消耗取决于 AI 决定调几个工具，你无法精确预判。

### 免费月配额

2025 年 5 月 20 日起，高德取消了旧的日配额制度，改为 **月配额**：

| 服务类别 | 个人认证开发者 | 企业认证开发者 |
|---------|-------------|-------------|
| **基础 LBS 服务**（地理编码、路径规划、IP定位、距离测量等） | 15 万次/月 | 300 万次/月 |
| **基础搜索服务**（关键词搜索、周边搜索等） | 150 万次/月 | 3,000 万次/月 |
| **天气预报服务** | 无免费额度 | 5,000 次/月 |

> 个人开发者注册即可拿到免费额度，日常开发和个人使用完全够用。

### 超额收费标准

月配额用完后，按量付费：

| 月累计调用量 | 基础 LBS / 搜索 / 天气 |
|------------|---------------------|
| 0 ~ 30 万次 | **30 元/万次** |
| 30 ~ 100 万次 | 24 元/万次（八折） |
| 100 ~ 300 万次 | 18 元/万次（六折） |
| 300 万次以上 | 联系商务谈折扣 |

### QPS 限制（每秒请求数）

除了总量配额，每个 API 还有 QPS 上限（如地理编码 50 QPS）。超限会返回 429 错误，不额外计费但调用会失败。

### 省钱建议

1. **先做个人认证**：实名认证后每月 15 万次 LBS + 150 万次搜索，个人用绰绰有余
2. **关注 AI 的调用行为**：AI 有时会"过度调用"（比如本来一次能搞定的事调了三次），可以通过 Prompt 引导减少不必要的调用
3. **用 Streamable HTTP 方式**：比 stdio 方式少一层 Node.js 中间层，响应更快，不会因为超时重试浪费配额
4. **企业项目做企业认证**：月配额直接翻 20 倍

### 如何查看用量？

登录 [高德开放平台控制台](https://console.amap.com/) → 流量分析 → 配额管理，可以实时看到各 API 的调用量和剩余配额。

---

## 常见问题

### Q: MCP Server 和 API 有什么区别？

MCP Server 是一个标准化协议，而普通 API（REST/GraphQL）需要每个 AI 客户端自己写集成代码。MCP 提供了统一的发现、调用、错误处理机制，让 AI 客户端可以自动理解和使用你的工具。

### Q: MCP Server 安全吗？

MCP 内置了安全机制：
- Server 以最小权限运行
- 每个 Server 相互隔离
- 工具调用需要用户确认（取决于 Host 实现）
- 通信基于 JSON-RPC，支持认证

### Q: 可以用 Python 写 MCP Server 吗？

可以！MCP 有官方的 Python SDK：

```bash
pip install mcp
```

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("my-server")

@mcp.tool()
def add(a: int, b: int) -> int:
    """Add two numbers"""
    return a + b

mcp.run()
```

### Q: stdio 和 HTTP 传输方式怎么选？

- **stdio**：最简单，适合本地运行，Server 作为子进程启动
- **Streamable HTTP**：适合远程部署，多客户端共享同一个 Server 实例

大多数场景用 stdio 就够了。

### Q: 如何调试 MCP Server？

1. 使用 `console.error()` 打印日志（不要用 `console.log`，因为 stdout 被 MCP 协议占用）
2. 使用 MCP Inspector：`npx @modelcontextprotocol/inspector node dist/index.js`
3. 在 Cursor 中查看 MCP 面板的连接状态

---

## 参考资料

- [MCP 官方文档](https://modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk)
- [MCP Registry](https://modelcontextprotocol.io/registry)
- [MCP Servers 合集](https://github.com/modelcontextprotocol/servers)
