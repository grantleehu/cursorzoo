# 在 Windows Git Bash 中安装 Claude Code 和 Ollama

本指南介绍如何在 Windows 系统上通过 Git Bash 使用 Claude Code 和 Ollama，包括独立使用和搭配使用两种场景。

---

## 目录

- [前置条件](#前置条件)
- [第一步：安装 Git for Windows（含 Git Bash）](#第一步安装-git-for-windows含-git-bash)
- [第二步：安装 Ollama](#第二步安装-ollama)
- [第三步：安装 Claude Code](#第三步安装-claude-code)
- [第四步：在 Git Bash 中验证安装](#第四步在-git-bash-中验证安装)
- [第五步：让 Claude Code 使用 Ollama 本地模型](#第五步让-claude-code-使用-ollama-本地模型)
- [常见问题](#常见问题)

---

## 前置条件

| 项目 | 最低要求 |
|------|---------|
| 操作系统 | Windows 10 (22H2+) 或 Windows 11 |
| 内存 | 8 GB（仅 Claude Code）/ 16 GB+（运行 Ollama 本地模型） |
| 磁盘空间 | 4 GB（Ollama 本体）+ 模型大小（2–100 GB 不等） |
| GPU（可选） | NVIDIA 驱动 452.39+ 或 AMD Radeon（加速推理） |
| Claude 订阅 | Pro / Max / Teams / Enterprise（使用官方 Claude Code 时需要） |

---

## 第一步：安装 Git for Windows（含 Git Bash）

如果你已经有 Git Bash，可以跳过此步。

1. 前往 [https://git-scm.com/downloads/win](https://git-scm.com/downloads/win) 下载安装包
2. 运行安装程序，一路默认即可（建议勾选 **"Add Git Bash to Windows Terminal"**）
3. 安装完成后，右键桌面或文件夹空白处，选择 **"Open Git Bash Here"** 即可打开

验证安装：

```bash
git --version
# 输出示例: git version 2.47.1.windows.1
```

---

## 第二步：安装 Ollama

### 2.1 下载并安装

1. 前往 [https://ollama.com/download/windows](https://ollama.com/download/windows) 下载 `OllamaSetup.exe`
2. 双击运行安装程序（不需要管理员权限，约 90 秒完成）
3. 安装完成后 Ollama 会在后台自动运行，API 默认监听 `http://localhost:11434`

> **自定义安装路径：** `OllamaSetup.exe /DIR="D:\Ollama"`
>
> **自定义模型存储位置：** 设置环境变量 `OLLAMA_MODELS=D:\OllamaModels`

### 2.2 在 Git Bash 中验证

打开 Git Bash，执行：

```bash
ollama --version
# 输出示例: ollama version 0.6.x
```

### 2.3 拉取模型

```bash
# 拉取一个轻量模型测试
ollama pull phi3:mini

# 拉取推荐的编程模型（需要较大显存/内存）
ollama pull qwen3-coder
ollama pull qwen3.5
```

### 2.4 测试运行

```bash
ollama run phi3:mini
# 进入交互对话，输入问题即可，Ctrl+D 退出
```

---

## 第三步：安装 Claude Code

Claude Code 提供三种安装方式，任选其一。

### 方式一：PowerShell 安装（推荐）

打开 **PowerShell**（非 Git Bash），执行：

```powershell
irm https://claude.ai/install.ps1 | iex
```

### 方式二：CMD 安装

打开 **命令提示符**，执行：

```cmd
curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd
```

### 方式三：WinGet 安装

```powershell
winget install Anthropic.ClaudeCode
```

> **注意：** 通过 PowerShell / CMD 原生安装器安装的版本会自动更新；WinGet 安装的版本需要手动更新。
>
> **三种方式安装的二进制文件位置相同：** `%USERPROFILE%\.local\bin\claude.exe`，Git Bash 会继承 Windows 的 PATH，因此**无论用哪种方式安装，都可以在 Git Bash 中调用 `claude` 命令**。

### 3.1 在 Git Bash 中找不到 `claude` 命令？

安装完成后必须**关掉并重新打开** Git Bash，PATH 才会刷新。如果重启后仍然提示 `command not found`，手动将安装目录加入 PATH：

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

验证：

```bash
which claude
# 应输出: /c/Users/你的用户名/.local/bin/claude
```

### 3.2 配置 Git Bash 路径（推荐）

Claude Code 内部执行 shell 命令（如 Git hooks）时默认使用 `cmd.exe`。为了让它改用 Git Bash 执行，避免 Unix shell 语法报错，在 `~/.claude/settings.json` 中添加：

```json
{
  "env": {
    "CLAUDE_CODE_GIT_BASH_PATH": "C:\\Program Files\\Git\\bin\\bash.exe"
  }
}
```

> 如果 `~/.claude/settings.json` 不存在，手动创建即可。

---

## 第四步：在 Git Bash 中验证安装

打开 Git Bash，依次执行：

```bash
# 验证 Claude Code
claude --version

# 运行诊断
claude doctor

# 验证 Ollama
ollama --version

# 检查 Ollama 服务是否在运行
curl -s http://localhost:11434/api/version
```

首次运行 `claude` 会引导你完成 OAuth 登录认证。

---

## 第五步：让 Claude Code 使用 Ollama 本地模型

这是最关键的部分——将 Claude Code 的强大 Agent 框架与 Ollama 的本地模型结合使用。

### 方式一：快捷命令（推荐）

```bash
ollama launch claude
```

或者指定模型：

```bash
ollama launch claude --model qwen3.5
```

### 方式二：手动设置环境变量

在 Git Bash 中设置环境变量，然后启动 Claude Code：

```bash
export ANTHROPIC_AUTH_TOKEN=ollama
export ANTHROPIC_BASE_URL=http://localhost:11434
export ANTHROPIC_API_KEY=""

claude --model qwen3.5
```

如果希望每次打开 Git Bash 都自动生效，将上述 `export` 行添加到 `~/.bashrc`：

```bash
cat >> ~/.bashrc << 'EOF'

# Claude Code + Ollama 配置
export ANTHROPIC_AUTH_TOKEN=ollama
export ANTHROPIC_BASE_URL=http://localhost:11434
export ANTHROPIC_API_KEY=""
EOF

source ~/.bashrc
```

### 方式三：使用云端模型（通过 Ollama）

Ollama 也支持云端模型，无需本地显卡：

```bash
ollama launch claude --model kimi-k2.5:cloud
```

更多云端模型可在 [ollama.com/search?c=cloud](https://ollama.com/search?c=cloud) 查找。

### 推荐模型

| 类型 | 模型名称 | 说明 |
|------|---------|------|
| 本地 | `qwen3.5` | 综合能力强 |
| 本地 | `qwen3-coder` | 编程专用 |
| 本地 | `glm-4.7-flash` | 轻量快速 |
| 云端 | `kimi-k2.5:cloud` | 高质量云端模型 |
| 云端 | `glm-5:cloud` | 云端综合模型 |
| 云端 | `minimax-m2.5:cloud` | 云端备选 |

> **硬件建议：** 本地运行编程模型建议 32 GB 内存 + 24 GB 显存，Apple M 系列芯片因统一内存架构表现优秀。Claude Code 要求模型支持至少 **64K token 上下文窗口**。

---

## 常见问题

### Q: Git Bash 中输入 `claude` 提示找不到命令？

Claude Code 安装后需要重启 Git Bash 让 PATH 生效。如果重启后仍然不行，手动将安装目录加入 PATH：

```bash
# 在 ~/.bashrc 中添加
export PATH="$PATH:/c/Users/你的用户名/AppData/Local/Programs/claude-code"
```

### Q: Git Bash 中输入 `ollama` 提示找不到命令？

同样需要确保 Ollama 在 PATH 中：

```bash
export PATH="$PATH:/c/Users/你的用户名/AppData/Local/Programs/Ollama"
```

### Q: Ollama 模型下载很慢？

可以设置代理：

```bash
export HTTPS_PROXY=http://你的代理地址:端口
ollama pull qwen3.5
```

### Q: Claude Code 连接 Ollama 时报错？

1. 确认 Ollama 服务正在运行：`curl http://localhost:11434/api/version`
2. 确认环境变量设置正确：`echo $ANTHROPIC_BASE_URL`
3. 确认已拉取模型：`ollama list`

### Q: 可以同时使用官方 Claude API 和 Ollama 本地模型吗？

可以。不设置环境变量时 Claude Code 使用官方 API；设置了 `ANTHROPIC_BASE_URL` 后使用 Ollama。你可以通过 alias 快速切换：

```bash
# 在 ~/.bashrc 中添加
alias claude-official='ANTHROPIC_BASE_URL="" ANTHROPIC_AUTH_TOKEN="" claude'
alias claude-local='ANTHROPIC_AUTH_TOKEN=ollama ANTHROPIC_BASE_URL=http://localhost:11434 ANTHROPIC_API_KEY="" claude'
```

### Q: Windows Fast Startup 导致 GPU 问题？

在 **控制面板 → 电源选项 → 选择电源按钮的功能** 中关闭 **"启用快速启动"**，然后重启电脑。

---

## 快速参考

```bash
# === 一键设置脚本（在 Git Bash 中运行）===

# 1. 检查 Ollama 是否运行
curl -s http://localhost:11434/api/version && echo " ✓ Ollama is running" || echo " ✗ Ollama is not running"

# 2. 拉取推荐模型
ollama pull qwen3-coder

# 3. 配置并启动 Claude Code + Ollama
export ANTHROPIC_AUTH_TOKEN=ollama
export ANTHROPIC_BASE_URL=http://localhost:11434
export ANTHROPIC_API_KEY=""
claude --model qwen3-coder

# 或者使用快捷方式
ollama launch claude --model qwen3-coder
```
