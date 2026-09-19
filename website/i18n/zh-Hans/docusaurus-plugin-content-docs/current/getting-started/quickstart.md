---
sidebar_position: 1
title: "快速入门"
description: "与 Panergos Agent 的第一次对话——从源码安装到验证聊天"
---

# 快速入门

本指南带你从零开始搭建一个能够应对实际使用的 Panergos 环境，包括安装、选择 provider、验证聊天和排查常见故障。

## 适用人群

- 全新用户，想以最短路径完成可用配置
- 正在切换 provider，不想因配置错误浪费时间
- 为团队、机器人或长期运行的工作流配置 Panergos
- 厌倦了"安装成功但什么都做不了"的情况

## 最快路径

根据你的目标选择对应行：

| 目标 | 先做这步 | 再做这步 |
|---|---|---|
| 只想让 Panergos 在本机跑起来 | `panergos setup` | 运行一次真实对话并验证有响应 |
| 已知道要用哪个 provider | `panergos model` | 保存配置，然后开始聊天 |
| 想搭建机器人或长期运行的服务 | CLI 正常后运行 `panergos gateway setup` | 接入 Telegram、Discord、Slack 或其他平台 |
| 想使用本地或自托管模型 | `panergos model` → 自定义 endpoint | 验证 endpoint、模型名称和上下文长度 |
| 想要多 provider 故障转移 | 先运行 `panergos model` | 基础对话正常后再添加路由和故障转移 |

**经验法则：** 如果 Panergos 无法完成一次正常对话，暂时不要添加更多功能。先让一次完整对话跑通，再逐步叠加 gateway、cron、skills、语音或路由。

---

## 1. 安装 Panergos Agent

Panergos 0.1 仅提供源码发行，不发布预构建桌面安装程序。下方仓库安装脚本会创建受管理的源码检出和 CLI；完成设置后，可用 `panergos desktop` 从该检出构建并启动桌面应用。

```bash
# Linux / macOS / WSL2 / Android (Termux)
curl -fsSL https://raw.githubusercontent.com/khajaaijaz26/panergos-agent/main/scripts/install.sh | bash
```

安装脚本会在 `~/.panergos/panergos-agent` 创建一个受管理的隔离环境（独立的 uv 托管解释器和 venv），这是唯一受支持的安装方式 —— 包括开发用途。请勿使用 `pip install panergos-agent`。

:::tip Android / Termux
如果你在手机上安装，请参阅专门的 [Termux 指南](./termux.md)，其中包含经过测试的手动安装步骤、支持的扩展功能以及当前 Android 特有的限制。
:::

:::tip Windows 用户
请先安装 [WSL2](https://learn.microsoft.com/en-us/windows/wsl/install)，然后在 WSL2 终端中运行上述命令。
:::

安装完成后，重新加载 shell：

```bash
source ~/.bashrc   # 或 source ~/.zshrc
```

详细的安装选项、前置条件和故障排查，请参阅 [安装指南](./installation.md)。

## 2. 选择 Provider

这是最重要的配置步骤。使用 `panergos model` 以交互方式完成选择：

```bash
panergos model
```

推荐默认选项：

| Provider | 说明 | 配置方式 |
|----------|-----------|---------------|
| **OpenAI Codex** | ChatGPT 或 Codex 订阅，使用 Codex 模型 | 通过 `panergos model` → **ChatGPT or Codex Subscription** 进行设备码认证 |
| **Anthropic** | 直接使用 Claude 模型——Max 计划 + 额外用量积分（OAuth），或按 token 付费的 API key | `panergos model` → OAuth 登录（需要 Max + 额外积分），或 Anthropic API key |
| **OpenRouter** | 跨多个 provider 的多模型路由 | 输入 API key |
| **Z.AI** | GLM / Zhipu 托管模型 | 设置 `GLM_API_KEY` / `ZAI_API_KEY` |
| **Kimi / Moonshot** | Moonshot 托管的编程和对话模型 | 设置 `KIMI_API_KEY`（或 Kimi-Coding 专用的 `KIMI_CODING_API_KEY`） |
| **Kimi / Moonshot China** | 中国区 Moonshot endpoint | 设置 `KIMI_CN_API_KEY` |
| **Arcee AI** | Trinity 模型 | 设置 `ARCEEAI_API_KEY` |
| **GMI Cloud** | 多模型直连 API | 设置 `GMI_API_KEY` |
| **MiniMax (OAuth)** | 通过浏览器 OAuth 使用 MiniMax-M2.7，无需 API key | `panergos model` → MiniMax (OAuth) |
| **MiniMax** | 国际版 MiniMax endpoint | 设置 `MINIMAX_API_KEY` |
| **MiniMax China** | 中国区 MiniMax endpoint | 设置 `MINIMAX_CN_API_KEY` |
| **Alibaba Cloud** | 通过 DashScope 使用 Qwen 模型 | 设置 `DASHSCOPE_API_KEY` |
| **Hugging Face** | 通过统一路由器使用 20+ 开源模型（Qwen、DeepSeek、Kimi 等） | 设置 `HF_TOKEN` |
| **AWS Bedrock** | 通过原生 Converse API 使用 Claude、Nova、Llama、DeepSeek | IAM 角色或 `aws configure`（[指南](../guides/aws-bedrock.md)） |
| **Kilo Code** | KiloCode 托管模型 | 设置 `KILOCODE_API_KEY` |
| **OpenCode Zen** | 按需付费访问精选模型 | 设置 `OPENCODE_ZEN_API_KEY` |
| **OpenCode Go** | $10/月订阅，访问开源模型 | 设置 `OPENCODE_GO_API_KEY` |
| **DeepSeek** | 直接访问 DeepSeek API | 设置 `DEEPSEEK_API_KEY` |
| **NVIDIA NIM** | 通过 build.nvidia.com 或本地 NIM 使用 Nemotron 模型 | 设置 `NVIDIA_API_KEY`（可选：`NVIDIA_BASE_URL`） |
| **GitHub Copilot** | GitHub Copilot 订阅（GPT-5.x、Claude、Gemini 等） | 通过 `panergos model` 进行 OAuth，或设置 `COPILOT_GITHUB_TOKEN` / `GH_TOKEN` |
| **GitHub Copilot ACP** | Copilot ACP agent 后端（在本地启动 `copilot` CLI） | `panergos model`（需要 `copilot` CLI + `copilot login`） |
| **Vercel AI Gateway** | Vercel AI Gateway 路由 | 设置 `AI_GATEWAY_API_KEY` |
| **Custom Endpoint** | VLLM、SGLang、Ollama 或任何兼容 OpenAI 的 API | 设置 base URL + API key |

对于大多数初次使用的用户：选择一个 provider，接受默认值（除非你明确知道为何要修改）。完整的 provider 目录及环境变量和配置步骤请参阅 [Providers](../integrations/providers.md) 页面。

:::caution 最低上下文要求：64K token
Panergos Agent 要求模型至少具备 **64,000 个 token** 的上下文窗口。上下文窗口较小的模型无法为多步骤工具调用工作流维持足够的工作内存，启动时将被拒绝。大多数托管模型（Claude、GPT、Gemini、Qwen、DeepSeek）均轻松满足此要求。如果你运行本地模型，请将其上下文大小设置为至少 64K（例如 llama.cpp 使用 `--ctx-size 65536`，Ollama 使用 `-c 65536`）。
:::

:::tip
你可以随时通过 `panergos model` 切换 provider——没有锁定。所有支持的 provider 完整列表及配置详情，请参阅 [AI Providers](../integrations/providers.md)。
:::

### 配置的存储方式

Panergos 将密钥与普通配置分开存储：

- **密钥和 token** → `~/.panergos/.env`
- **非密钥配置** → `~/.panergos/config.yaml`

通过 CLI 设置值是最简便的方式，系统会自动将值写入正确的文件：

```bash
panergos config set model anthropic/claude-opus-4.6
panergos config set terminal.backend docker
panergos config set OPENROUTER_API_KEY sk-or-...
```

## 3. 运行第一次对话

```bash
panergos            # 经典 CLI
panergos --tui      # 现代 TUI（推荐）
```

你会看到一个欢迎横幅，显示你的模型、可用工具和 skills。使用一个具体且易于验证的 prompt（提示词）：

:::tip 选择你的界面
Panergos 提供两种终端界面：经典的 `prompt_toolkit` CLI，以及更新的 [TUI](../user-guide/tui.md)（支持模态覆盖层、鼠标选择和非阻塞输入）。两者共享相同的会话、斜杠命令和配置——分别用 `panergos` 和 `panergos --tui` 试试看。
:::

```
Summarize this repo in 5 bullets and tell me what the main entrypoint is.
```

```
Check my current directory and tell me what looks like the main project file.
```

```
Help me set up a clean GitHub PR workflow for this codebase.
```

**成功的标志：**

- 横幅显示你选择的模型/provider
- Panergos 无错误地回复
- 需要时能够使用工具（终端、文件读取、网页搜索）
- 对话可以正常进行超过一轮

如果以上都正常，你已经过了最难的部分。

## 4. 验证会话功能

继续之前，确认恢复功能正常：

```bash
panergos --continue    # 恢复最近的会话
panergos -c            # 简写形式
```

这应该会带你回到刚才的会话。如果不行，检查你是否在同一个 profile 下，以及会话是否实际已保存。当你同时管理多个配置或多台机器时，这一点很重要。

## 5. 尝试核心功能

### 使用终端

```
❯ What's my disk usage? Show the top 5 largest directories.
```

Agent 会代你执行终端命令并显示结果。

### 斜杠命令

输入 `/` 查看所有命令的自动补全下拉列表：

| 命令 | 功能 |
|---------|-------------|
| `/help` | 显示所有可用命令 |
| `/tools` | 列出可用工具 |
| `/model` | 交互式切换模型 |
| `/personality pirate` | 尝试一个有趣的人格 |
| `/save` | 保存对话 |

### 多行输入

按 `Alt+Enter`、`Ctrl+J` 或 `Shift+Enter` 换行。`Shift+Enter` 需要终端能将其作为独立序列发送（Kitty / foot / WezTerm / Ghostty 默认支持；iTerm2 / Alacritty / VS Code 终端需启用 Kitty 键盘协议）。`Alt+Enter` 和 `Ctrl+J` 在所有终端中均可使用。

### 中断 Agent

如果 agent 响应时间过长，输入新消息并按 Enter——这会中断当前任务并切换到你的新指令。`Ctrl+C` 同样有效。

## 6. 添加下一层功能

仅在基础对话正常后进行。按需选择：

### 机器人或共享助手

```bash
panergos gateway setup    # 交互式平台配置
```

接入 [Telegram](/user-guide/messaging/telegram)、[Discord](/user-guide/messaging/discord)、[Slack](/user-guide/messaging/slack)、[WhatsApp](/user-guide/messaging/whatsapp)、[Signal](/user-guide/messaging/signal)、[Email](/user-guide/messaging/email)、[Home Assistant](/user-guide/messaging/homeassistant) 或 [Microsoft Teams](/user-guide/messaging/teams)。

### 自动化与工具

- `panergos tools` — 按平台调整工具访问权限
- `panergos skills` — 浏览并安装可复用的工作流
- Cron — 仅在机器人或 CLI 配置稳定后使用

### 沙箱终端

为了安全起见，在 Docker 容器或远程服务器中运行 agent：

```bash
panergos config set terminal.backend docker    # Docker 隔离
panergos config set terminal.backend ssh       # 远程服务器
```

### 语音模式

```bash
# 在 Panergos 安装目录下运行（curl 安装器在 Linux/macOS 上将其放置于
# ~/.panergos/panergos-agent，在 Windows 上为 %LOCALAPPDATA%\panergos\panergos-agent）：
cd ~/.panergos/panergos-agent
uv pip install --python ./venv/bin/python -e ".[voice]"
# 包含 faster-whisper，用于免费的本地语音转文字
```

然后在 CLI 中输入：`/voice on`。按 `Ctrl+B` 开始录音。参阅 [语音模式](../user-guide/features/voice-mode.md)。

### Skills

```bash
panergos skills search kubernetes
panergos skills install openai/skills/k8s
```

或在聊天会话中使用 `/skills`。

### MCP 服务器

```yaml
# 添加到 ~/.panergos/config.yaml
mcp_servers:
  github:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-github"]
    env:
      GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_xxx"
```

### 编辑器集成（ACP）

ACP 支持已包含在标准 `[all]` 扩展中，因此 curl 安装器已默认包含。直接运行：

```bash
panergos acp
```

（如果安装时未包含 `[all]`，请先运行 `cd ~/.panergos/panergos-agent && uv pip install -e ".[acp]"`。）

参阅 [ACP 编辑器集成](../user-guide/features/acp.md)。

---

## 常见故障模式

以下是最容易浪费时间的问题：

| 现象 | 可能原因 | 解决方法 |
|---|---|---|
| Panergos 启动但回复为空或异常 | Provider 认证或模型选择有误 | 重新运行 `panergos model`，确认 provider、模型和认证信息 |
| 自定义 endpoint "可用"但返回乱码 | base URL、模型名称有误，或实际上不兼容 OpenAI | 先用独立客户端验证该 endpoint |
| Gateway 启动但无法收到消息 | Bot token、白名单或平台配置不完整 | 重新运行 `panergos gateway setup` 并检查 `panergos gateway status` |
| `panergos --continue` 找不到旧会话 | 切换了 profile 或会话从未保存 | 检查 `panergos sessions list`，确认你在正确的 profile 下 |
| 模型不可用或出现异常的故障转移行为 | Provider 路由或故障转移设置过于激进 | 在基础 provider 稳定之前关闭路由 |
| `panergos doctor` 标记配置问题 | 配置值缺失或已过期 | 修复配置，在添加功能前重新测试普通对话 |

## 恢复工具包

当感觉有问题时，按以下顺序操作：

1. `panergos doctor`
2. `panergos model`
3. `panergos setup`
4. `panergos sessions list`
5. `panergos --continue`
6. `panergos gateway status`

这个顺序能让你快速从"感觉哪里不对"回到已知的正常状态。

---

## 快速参考

| 命令 | 说明 |
|---------|-------------|
| `panergos` | 开始聊天 |
| `panergos model` | 选择 LLM provider 和模型 |
| `panergos tools` | 配置每个平台启用的工具 |
| `panergos setup` | 完整配置向导（一次性配置所有内容） |
| `panergos doctor` | 诊断问题 |
| `panergos update` | 更新到最新版本 |
| `panergos gateway` | 启动消息 gateway |
| `panergos --continue` | 恢复上次会话 |

## 下一步

- **[CLI 指南](../user-guide/cli.md)** — 掌握终端界面
- **[配置](../user-guide/configuration.md)** — 自定义你的配置
- **[消息 Gateway](../user-guide/messaging/index.md)** — 接入 Telegram、Discord、Slack、WhatsApp、Signal、Email、Home Assistant、Teams 等
- **[工具与工具集](../user-guide/features/tools.md)** — 探索可用功能
- **[AI Providers](../integrations/providers.md)** — 完整 provider 列表及配置详情
- **[Skills 系统](../user-guide/features/skills.md)** — 可复用的工作流与知识
- **[技巧与最佳实践](../guides/tips.md)** — 高级用户技巧
