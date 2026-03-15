# edgetunnel 项目原理深度解读（小白友好版）

## 一、一句话概括

**edgetunnel 是一个部署在 Cloudflare 边缘网络上的代理隧道工具**。它利用 Cloudflare Workers/Pages 平台，把你的网络流量通过 Cloudflare 的全球 CDN 节点进行中转，实现科学上网。

---

## 二、先搞懂几个前置概念

### 2.1 Cloudflare Workers 是什么？

想象一下：Cloudflare 在全球有几百个数据中心（节点），每个节点上都能跑你写的一小段 JavaScript 代码。这就是 **Workers** —— 它是 Cloudflare 提供的"无服务器函数"（Serverless Function）平台。

**关键特性：**
- 免费额度：每天 10 万次请求（免费用户）
- 全球部署：代码自动分发到全球 300+ 节点
- 支持 WebSocket：可以建立长连接
- 支持 TCP 出站连接：可以通过 `cloudflare:sockets` 模块发起 TCP 连接

### 2.2 VLESS / Trojan 协议是什么？

它们是代理协议，和 HTTP、HTTPS 类似，但专门为代理场景设计：

| 协议 | 核心思路 | 认证方式 |
|------|----------|----------|
| **VLESS** | 极简协议，几乎无额外开销 | UUID（一串唯一标识符） |
| **Trojan** | 伪装成正常 HTTPS 流量 | 密码的 SHA-224 哈希 |

### 2.3 WebSocket 是什么？

普通 HTTP 请求是"一问一答"式的（你发请求，服务器回响应）。而 **WebSocket** 是在 HTTP 握手成功后，升级为一条**双向的持久连接通道**，双方可以随时互发数据。

**为什么需要 WebSocket？** 因为 Cloudflare Workers 原生只支持 HTTP 请求处理，但通过 WebSocket 升级，就可以在上面传输任意的二进制数据流，从而实现代理功能。

---

## 三、核心架构（整体数据流）

```
你的设备 (v2rayN/Clash等客户端)
    │
    │ ① 建立 WebSocket 连接（TLS 加密）
    ▼
Cloudflare CDN 边缘节点
    │
    │ ② Workers 代码接收 WebSocket 数据
    │    解析 VLESS/Trojan 协议
    │    提取目标地址和端口
    ▼
    │ ③ 通过 cloudflare:sockets 发起 TCP 连接
    ▼
目标网站 (google.com / youtube.com 等)
```

**核心原理用一句话说就是：** 客户端把要访问的目标地址打包进 VLESS/Trojan 协议数据里，通过 WebSocket 发给 Cloudflare Worker，Worker 解包后代替你去连接目标网站，再把数据原路返回。

---

## 四、代码结构逐层拆解

整个项目就一个核心文件：`_worker.js`（约 2463 行），运行在 Cloudflare Workers 环境中。

### 4.1 入口函数 —— `export default { fetch() }`

```
请求进来
    │
    ├─ 是 WebSocket 升级请求？ ─── 是 ──→ 进入代理隧道（核心功能）
    │
    └─ 普通 HTTP 请求？ ─── 是 ──→ 根据路径分发：
         ├─ /admin        → 管理后台页面
         ├─ /login        → 登录页面
         ├─ /sub          → 生成订阅链接
         ├─ /logout       → 退出登录
         └─ 其他路径       → 显示伪装页面
```

**关键判断逻辑：**

```javascript
const upgradeHeader = request.headers.get('Upgrade');
if (!upgradeHeader || upgradeHeader !== 'websocket') {
    // 普通 HTTP 请求 → 走管理/订阅/伪装逻辑
} else {
    // WebSocket 请求 → 走代理隧道逻辑
}
```

### 4.2 代理隧道核心 —— WebSocket 数据处理

这是整个项目最核心的部分，在 `处理WS请求()` 函数中实现。

#### 第一步：建立 WebSocket 连接

```javascript
const wssPair = new WebSocketPair();
const [clientSock, serverSock] = Object.values(wssPair);
serverSock.accept();
```

Cloudflare Workers 提供了 `WebSocketPair` API，创建一对配对的 WebSocket。`clientSock` 返回给客户端，`serverSock` 在服务端使用。

#### 第二步：读取客户端发来的数据流

```javascript
const readable = makeReadableStr(serverSock, earlyData);
```

`makeReadableStr()` 把 WebSocket 的消息事件转换成一个 `ReadableStream`（可读流），这样就可以用流式 API 来处理数据了。

`earlyData` 是 WebSocket 握手阶段通过 `sec-websocket-protocol` 头携带的预发送数据（Base64 编码），用于减少一次往返延迟。

#### 第三步：自动识别协议（VLESS 还是 Trojan）

```javascript
if (判断是否是木马 === null) {
    const bytes = new Uint8Array(chunk);
    判断是否是木马 = bytes.byteLength >= 58 && bytes[56] === 0x0d && bytes[57] === 0x0a;
}
```

这里"木马"其实是 **Trojan**（特洛伊）协议的中文直译。判断逻辑是：
- Trojan 协议的前 56 字节是密码的 SHA-224 哈希（十六进制字符串），之后跟 `\r\n`（0x0D 0x0A）
- 如果第 56、57 字节是 `\r\n`，就认为是 Trojan 协议；否则是 VLESS 协议

#### 第四步：解析协议数据

**VLESS 协议解析 (`解析魏烈思请求`)：**

```
字节布局：
[0]       版本号
[1-16]    UUID（16字节）  ← 用于身份认证
[17]      附加选项长度
[18+opt]  命令（1=TCP, 2=UDP）
[19+opt]  目标端口（2字节，大端序）
[21+opt]  地址类型 + 地址
          1 = IPv4（4字节）
          2 = 域名（1字节长度 + 域名字符串）
          3 = IPv6（16字节）
```

**Trojan 协议解析 (`解析木马请求`)：**

```
字节布局：
[0-55]    SHA-224(密码) 的十六进制字符串（56字节ASCII）
[56-57]   \r\n
[58]      命令（1=TCP CONNECT）
[59]      地址类型（同SOCKS5: 1=IPv4, 3=域名, 4=IPv6）
[60+]     地址 + 端口 + 载荷数据
```

#### 第五步：连接目标服务器

```javascript
await forwardataTCP(hostname, port, rawData, serverSock, respHeader, remoteConnWrapper, yourUUID);
```

`forwardataTCP()` 是 TCP 转发的核心函数，它的连接策略是：

```
尝试直连目标
    │
    ├─ 成功 → 建立双向数据流
    │
    └─ 失败 → 尝试通过反代IP (ProxyIP) 连接
         │
         ├─ 有 SOCKS5/HTTP 代理配置？→ 通过代理转发
         │
         └─ 有 ProxyIP？→ 通过反代 IP 连接
```

**为什么需要 ProxyIP？**

Cloudflare Workers 直接连接某些 IP 段（特别是 Cloudflare 自己的 IP）会被拦截。ProxyIP 就是一个中间跳板，Worker 先连接 ProxyIP 上的中转服务，再由中转服务连接最终目标。

#### 第六步：双向数据流转发

```javascript
function connectStreams(remoteSocket, webSocket, headerData, retryFunc) {
    // 把远程 TCP 连接的数据 → 发送到 WebSocket → 返回给客户端
    await remoteSocket.readable.pipeTo(
        new WritableStream({
            async write(chunk) {
                webSocket.send(chunk);
            }
        })
    );
}
```

数据流转的完整链路：

```
客户端 ←→ WebSocket ←→ Worker 代码 ←→ TCP Socket ←→ 目标网站
         (加密通道)    (协议解析/封装)    (原始TCP)
```

---

## 五、管理后台系统

### 5.1 认证机制

后台使用 Cookie 认证：

```
1. 用户访问 /login → 输入管理员密码（ADMIN 环境变量）
2. 密码正确 → 服务端计算 MD5(MD5(UA + 密钥 + 密码))
3. 将这个哈希值设置为 HttpOnly Cookie（有效期24小时）
4. 后续请求验证 Cookie 中的哈希值是否匹配
```

这里用了双重 MD5（`MD5MD5()` 函数）来生成认证令牌，而且把 User-Agent 也混入了计算，这样即使 Cookie 被窃取，在不同浏览器上也无法使用。

### 5.2 配置存储

所有配置都存在 Cloudflare KV（Key-Value 数据库）中：

| KV 键名 | 用途 |
|---------|------|
| `config.json` | 主配置（UUID、协议、路径、订阅设置等） |
| `cf.json` | Cloudflare API 凭证（用于查询用量） |
| `tg.json` | Telegram 通知配置 |
| `ADD.txt` | 自定义优选 IP 列表 |
| `log.json` | 访问日志 |

### 5.3 UUID 生成

如果用户没有指定 UUID，系统会自动从管理员密码生成一个：

```javascript
const userIDMD5 = await MD5MD5(管理员密码 + 加密秘钥);
const userID = [
    userIDMD5.slice(0, 8),     // 8位
    userIDMD5.slice(8, 12),    // 4位
    '4' + userIDMD5.slice(13, 16),  // 4xxx（UUID v4 标记）
    '8' + userIDMD5.slice(17, 20),  // 8xxx（变体标记）
    userIDMD5.slice(20)        // 12位
].join('-');
```

这样保证了每个管理员密码都会生成一个稳定且符合 UUID v4 格式的标识符。

---

## 六、订阅系统

### 6.1 什么是"订阅"？

代理客户端（如 Clash、v2rayN）需要知道服务器的地址、端口、UUID 等信息才能连接。手动配置很麻烦，所以有了"订阅链接"——客户端访问一个 URL，自动获取所有节点配置。

### 6.2 订阅生成流程

```
客户端请求 /sub?token=xxx
    │
    ├─ 验证 token（= MD5MD5(host + UUID)）
    │
    ├─ 根据 User-Agent 判断客户端类型：
    │   ├─ Clash/Meta/Mihomo → 生成 YAML 格式
    │   ├─ Sing-box → 生成 JSON 格式
    │   ├─ Surge → 生成 Surge 格式
    │   └─ 其他 → 生成 Base64 编码的 URI 列表
    │
    ├─ 获取优选 IP 列表：
    │   ├─ 随机生成 Cloudflare IP（根据 ISP 优化）
    │   ├─ 从 KV 读取自定义 IP
    │   └─ 从外部优选 API 获取
    │
    └─ 拼接成完整的节点 URI 并返回
```

### 6.3 优选 IP 的含义

Cloudflare 有大量的 IP 段，但不是所有 IP 从你的网络访问都一样快。"优选 IP"就是**经过测速后筛选出来的、延迟低、速度快的 Cloudflare IP**。

代码中的 `生成随机IP()` 函数会根据你的 ISP（运营商）来选择对应的 IP 段：

```javascript
const ISP配置 = {
    '9808':  { file: 'cmcc', name: 'CF移动优选' },   // 中国移动
    '4837':  { file: 'cu',   name: 'CF联通优选' },    // 中国联通
    '4134':  { file: 'ct',   name: 'CF电信优选' },    // 中国电信
};
```

### 6.4 订阅格式适配

edgetunnel 内置了对多种客户端格式的适配：

- **mixed（通用）**：VLESS/Trojan URI 格式，Base64 编码
- **Clash**：YAML 配置文件，包含代理组、规则等
- **Sing-box**：JSON 配置文件
- **Surge**：Surge 专用格式

对于 Clash 和 Sing-box，代码还有"热补丁"（hotpatch）机制，可以在订阅转换后对配置做微调，比如：
- 添加 DNS 配置
- 迁移旧版 geo 规则到 rule_set
- 添加 ECH（Encrypted Client Hello）支持
- 修正 TLS 指纹配置

---

## 七、反代 (ProxyIP) 与 SOCKS5/HTTP 代理链

### 7.1 为什么需要反代？

Cloudflare Workers 发出的 TCP 连接，有些目标是无法直连的（比如被 Cloudflare 自身策略阻止的 IP）。反代就是在中间加一层：

```
Worker → ProxyIP 服务器 → 目标网站
```

代码中反代地址的获取支持多种方式：
1. **环境变量**：`PROXYIP=xxx.xxx.xxx.xxx`
2. **自动分配**：使用 `{机房代码}.proxyip.cmliussss.net` 域名
3. **路径参数**：`/proxyip=xxx` 或 `?proxyip=xxx`
4. **DNS TXT 记录**：从特殊域名的 TXT 记录中解析反代 IP

### 7.2 SOCKS5/HTTP 代理链

除了直接的 ProxyIP，还支持通过 SOCKS5 或 HTTP 代理来转发流量：

```javascript
// SOCKS5 代理连接流程：
1. TCP 连接到 SOCKS5 代理服务器
2. 协商认证方法（无认证 / 用户名密码）
3. 发送 CONNECT 命令（指定目标地址和端口）
4. 代理确认连接成功
5. 开始转发数据
```

配置方式灵活，可以通过路径或查询参数指定：
- `/socks5=user:pass@1.2.3.4:1080`
- `/http=user:pass@1.2.3.4:8080`
- `/?proxyip=socks5://user:pass@1.2.3.4:1080`

### 7.3 SOCKS5 白名单

可以配置哪些域名走 SOCKS5 代理，哪些直连：

```javascript
let SOCKS5白名单 = ['*tapecontent.net', '*cloudatacdn.com', ...];
```

如果设为 `*`，则所有流量都走 SOCKS5。

---

## 八、伪装机制

为了让这个 Worker 看起来像一个正常的网站，edgetunnel 有多层伪装：

### 8.1 首页伪装

```javascript
let 伪装页URL = env.URL || 'nginx';
```

- 默认显示一个假的 nginx 欢迎页
- 可以配置为任意网站的反向代理
- 可以配置为 `1101`，显示一个假的 Cloudflare 错误页面

### 8.2 robots.txt

```javascript
if (访问路径 === 'robots.txt') 
    return new Response('User-agent: *\nDisallow: /');
```

告诉搜索引擎不要爬取这个站点。

### 8.3 路径随机化

```javascript
function 随机路径(完整节点路径) {
    const 常用路径目录 = ["about", "account", "api", "blog", ...];
    // 随机拼接 1-3 个常见路径段
}
```

每次生成订阅时，可以给 WebSocket 路径加上随机的前缀（如 `/blog/article/...`），让流量看起来像正常的网站 API 请求。

---

## 九、其他辅助功能

### 9.1 日志系统

每次订阅请求和管理操作都会记录到 KV 中的 `log.json`：

```javascript
const 日志内容 = {
    TYPE: '请求类型',
    IP: '访问者IP',
    ASN: 'AS号和运营商',
    CC: '国家和城市',
    URL: '请求URL',
    UA: 'User-Agent',
    TIME: '时间戳'
};
```

还支持通过 Telegram Bot 实时推送日志通知。

### 9.2 Cloudflare 用量监控

通过 Cloudflare GraphQL API 查询当天的 Workers 和 Pages 请求量，可以在订阅信息中展示剩余额度。

### 9.3 DNS-over-HTTPS (DoH)

代码中实现了完整的 DoH 查询功能 (`DoH查询()`)，用于：
- 将 ProxyIP 域名解析为 IP 地址
- 查询 ECH (Encrypted Client Hello) 配置
- 解析特殊的 TXT 记录获取反代信息

### 9.4 ECH 支持

ECH (Encrypted Client Hello) 是 TLS 1.3 的扩展，可以加密 SNI（Server Name Indication），防止中间人知道你在访问哪个域名。代码通过 DoH 查询 HTTPS 记录中的 ECH 配置，并注入到订阅配置中。

---

## 十、数据流完整链路（总结）

以你在手机上打开 Google 为例：

```
1. 你的 Clash 客户端将请求封装为 VLESS 协议数据
2. 通过 WebSocket（TLS 加密）发送到 Cloudflare CDN
3. CDN 路由到最近的边缘节点
4. 节点上的 _worker.js 代码开始执行：
   a. 接收 WebSocket 消息
   b. 解析 VLESS 协议头，提取出目标 = google.com:443
   c. 验证 UUID 是否匹配
   d. 尝试直连 google.com:443
   e. 如果直连失败，通过 ProxyIP 或 SOCKS5 中转
   f. TCP 连接建立成功
5. 将 google.com 返回的数据通过同一条 WebSocket 回传
6. Clash 客户端收到数据，解封装后呈现为正常的网页
```

**整个过程中：**
- 你的 ISP 只能看到你在访问 Cloudflare（一个正常的 CDN 服务商）
- Cloudflare 作为中转，替你访问了 Google
- 所有数据都有 TLS 加密保护

---

## 十一、技术亮点总结

| 特性 | 说明 |
|------|------|
| **零服务器成本** | 运行在 Cloudflare 免费套餐上 |
| **全球加速** | 自动使用离你最近的 Cloudflare 节点 |
| **双协议** | 同时支持 VLESS 和 Trojan，自动识别 |
| **多级代理** | 支持 ProxyIP + SOCKS5 + HTTP 代理链 |
| **订阅适配** | 一键生成适配 Clash/Sing-box/Surge 等多客户端的配置 |
| **管理后台** | 可视化配置，不需要改代码 |
| **伪装能力** | 多种首页伪装 + 路径随机化 |
| **ISP 优化** | 根据运营商自动选择最优 IP 段 |
| **ECH 支持** | 加密 SNI，增强隐私 |
| **日志 & 通知** | KV 日志 + Telegram 推送 |
