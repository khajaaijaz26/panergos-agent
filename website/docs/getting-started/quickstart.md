---
sidebar_position: 1
title: "Panergos Agent Quickstart"
description: "Your first conversation with Panergos Agent, from source install to a verified chat"
---

# Panergos Agent Quickstart

This guide gets you from zero to a working Panergos setup that survives real use. Install, choose a provider, verify a working chat, and know exactly what to do when something breaks.

## Who this is for

- Brand new and want the shortest path to a working setup
- Switching providers and don't want to lose time to config mistakes
- Setting up Panergos for a team, bot, or always-on workflow
- Tired of "it installed, but it still does nothing"

## The fastest path

Pick the row that matches your goal:

| Goal | Do this first | Then do this |
|---|---|---|
| I just want Panergos working on my machine | `panergos setup` | Run a real chat and verify it responds |
| I already know my provider | `panergos model` | Save the config, then start chatting |
| I want a bot or always-on setup | `panergos gateway setup` after CLI works | Connect Telegram, Discord, Slack, or another platform |
| I want a local or self-hosted model | `panergos model` → custom endpoint | Verify the endpoint, model name, and context length |
| I want multi-provider fallback | `panergos model` first | Add routing and fallback only after the base chat works |

**Rule of thumb:** if Panergos cannot complete a normal chat, do not add more features yet. Get one clean conversation working first, then layer on gateway, cron, skills, voice, or routing.

---

## 1. Install Panergos Agent

Panergos 0.1 is source-only and publishes no prebuilt desktop installer. The
repository installers below create a managed source checkout and CLI. After
setup, `panergos desktop` builds and launches the desktop app from that checkout.

#### Linux / macOS / WSL2 / Android (Termux)
```bash
curl -fsSL https://raw.githubusercontent.com/khajaaijaz26/panergos-agent/main/scripts/install.sh | bash
```

#### Windows (native)

Run in powershell:
```powershell
iex (irm https://raw.githubusercontent.com/khajaaijaz26/panergos-agent/main/scripts/install.ps1)
```

:::tip Android / Termux
If you're installing on a phone, see the dedicated [Termux guide](./termux.md) for the tested manual path, supported extras, and current Android-specific limitations.
:::

After it finishes, reload your shell:

```bash
source ~/.bashrc   # or source ~/.zshrc
```

For detailed installation options, prerequisites, and troubleshooting, see the [Installation guide](./installation.md).

## 2. Choose a Provider

The single most important setup step. Use `panergos model` to walk through the choice interactively:

```bash
panergos model
```

:::info Setup modes
On a fresh install, `panergos setup` offers three modes:

- **Quick model setup** — `panergos model --quick` detects ready local runtimes and supports cloud endpoints with minimal configuration.
- **Full Setup** — walk through every provider, tool, and option yourself (bring your own keys).
- **Blank Slate** — everything starts **off** except the bare minimum needed to run an agent: **provider & model, the File Operations toolset, and the Terminal toolset**. No web, browser, code execution, vision, memory, delegation, cron, skills, plugins, or MCP servers — and compression, checkpoints, smart routing, and memory capture are all disabled. After the minimal baseline is applied, you choose one of two paths: **start with everything disabled** (finish now with the minimal agent), or **walk through all configurations** (opt in to tools, skills, plugins, MCP, and messaging). Pick this when you want a minimal, fully-controlled agent and intend to enable only exactly what you need.

Blank Slate writes an explicit `platform_toolsets.cli` list plus `agent.disabled_toolsets`, so nothing you didn't choose ever loads — not even after `panergos update`. Re-enable anything later with `panergos tools`, seed skills with `panergos skills opt-in --sync`, or tune settings with `panergos setup agent`.
:::

Good defaults:

| Provider | What it is | How to set up |
|----------|-----------|---------------|
| **OpenAI Codex** | ChatGPT or Codex subscription, uses Codex models | Device code auth via `panergos model` → **ChatGPT or Codex Subscription** |
| **Anthropic** | Claude models directly — Max plan + extra usage credits (OAuth), or API key for pay-per-token | `panergos model` → OAuth login (requires Max + extra credits), or an Anthropic API key |
| **OpenRouter** | Multi-provider routing across many models | Enter your API key |
| **Fireworks AI** | Direct OpenAI-compatible model API | Set `FIREWORKS_API_KEY` |
| **Z.AI** | GLM / Zhipu-hosted models | Set `GLM_API_KEY` / `ZAI_API_KEY` (also accepts `Z_AI_API_KEY`) |
| **Kimi / Moonshot** | Moonshot-hosted coding and chat models | Set `KIMI_API_KEY` (or the Kimi-Coding-specific `KIMI_CODING_API_KEY`) |
| **Kimi / Moonshot China** | China-region Moonshot endpoint | Set `KIMI_CN_API_KEY` |
| **Arcee AI** | Trinity models | Set `ARCEEAI_API_KEY` |
| **GMI Cloud** | Multi-model direct API | Set `GMI_API_KEY` |
| **Actual Computer** | Your own hardware as a private inference cluster — hosted relay or local daemon | Set `ACTUAL_API_KEY` (relay) or `ACTUAL_BASE_URL=http://127.0.0.1:8080` (local, no key) |
| **MiniMax (OAuth)** | MiniMax frontier model via browser OAuth — no API key needed (model name in `panergos_cli/models.py` may change between releases) | `panergos model` → MiniMax (OAuth) |
| **MiniMax** | International MiniMax endpoint | Set `MINIMAX_API_KEY` |
| **MiniMax China** | China-region MiniMax endpoint | Set `MINIMAX_CN_API_KEY` |
| **Alibaba Cloud** | Qwen models via DashScope | Set `DASHSCOPE_API_KEY` (Qwen Coding Plan also accepts `ALIBABA_CODING_PLAN_API_KEY`) |
| **Hugging Face** | 20+ open models via unified router (Qwen, DeepSeek, Kimi, etc.) | Set `HF_TOKEN` |
| **AWS Bedrock** | Claude, Nova, Llama, DeepSeek via native Converse API | IAM role or `aws configure` ([guide](../guides/aws-bedrock.md)) |
| **Azure Foundry** | Azure AI Foundry-hosted models | Set `AZURE_FOUNDRY_API_KEY` + `AZURE_FOUNDRY_BASE_URL` |
| **Google AI Studio** | Gemini models via direct API | Set `GOOGLE_API_KEY` / `GEMINI_API_KEY` |
| **xAI** | Grok models via direct API | Set `XAI_API_KEY` |
| **xAI Grok OAuth** | SuperGrok / Premium+ subscription, no API key needed | `panergos model` → xAI Grok OAuth |
| **NovitaAI** | Multi-model API gateway | Set `NOVITA_API_KEY` |
| **Ramp Router** | Responses-native LLM gateway routing across OpenAI/Anthropic/xAI/... | Set `RAMP_ROUTER_API_KEY` |
| **Nebius Token Factory** | Open models on Nebius AI cloud | Set `NEBIUS_API_KEY` |
| **StepFun** | Step Plan models | Set `STEPFUN_API_KEY` |
| **Xiaomi MiMo** | Xiaomi-hosted models | Set `XIAOMI_API_KEY` |
| **Tencent TokenHub** | Tencent-hosted models | Set `TOKENHUB_API_KEY` |
| **Tencent TokenPlan** | Tencent Hy models via Anthropic-style endpoint | Set `TOKENPLAN_API_KEY` |
| **Ollama Cloud** | Managed Ollama-hosted models | Set `OLLAMA_API_KEY` |
| **LM Studio** | Local desktop app exposing an OpenAI-compatible API | Set `LM_API_KEY` (and `LM_BASE_URL` if non-default) |
| **Qwen OAuth** | Qwen Portal browser OAuth — no API key needed | `panergos model` → Qwen OAuth |
| **Kilo Code** | KiloCode-hosted models | Set `KILOCODE_API_KEY` |
| **OpenCode Zen** | Pay-as-you-go access to curated models | Set `OPENCODE_ZEN_API_KEY` |
| **OpenCode Go** | $10/month subscription for open models | Set `OPENCODE_GO_API_KEY` |
| **DeepSeek** | Direct DeepSeek API access | Set `DEEPSEEK_API_KEY` |
| **NVIDIA NIM** | Nemotron models via build.nvidia.com or local NIM | Set `NVIDIA_API_KEY` (optional: `NVIDIA_BASE_URL`) |
| **GitHub Copilot** | GitHub Copilot subscription (GPT-5.x, Claude, Gemini, etc.) | OAuth via `panergos model`, or `COPILOT_GITHUB_TOKEN` / `GH_TOKEN` |
| **GitHub Copilot ACP** | Copilot ACP agent backend (spawns local `copilot` CLI) | `panergos model` (requires `copilot` CLI + `copilot login`) |
| **Vercel AI Gateway** | Vercel AI Gateway routing | Set `AI_GATEWAY_API_KEY` |
| **Custom Endpoint** | VLLM, SGLang, Ollama, or any OpenAI-compatible API | Set base URL + API key |

For most first-time users: choose a provider, accept the defaults unless you know why you're changing them. The full provider catalog with env vars and setup steps lives on the [Providers](../integrations/providers.md) page.

:::caution Minimum context: 64K tokens
Panergos Agent requires a model with at least **64,000 tokens** of context. Models with smaller windows cannot maintain enough working memory for multi-step tool-calling workflows and will be rejected at startup. Most hosted models (Claude, GPT, Gemini, Qwen, DeepSeek) meet this easily. If you're running a local model, set its context size to at least 64K (e.g. `--ctx-size 65536` for llama.cpp or `-c 65536` for Ollama).
:::

:::tip
You can switch providers at any time with `panergos model` — no lock-in. For a full list of all supported providers and setup details, see [AI Providers](../integrations/providers.md).
:::

### How settings are stored

Panergos separates secrets from normal config:

- **Secrets and tokens** → `~/.panergos/.env`
- **Non-secret settings** → `~/.panergos/config.yaml`

The easiest way to set values correctly is through the CLI:

```bash
panergos config set model anthropic/claude-opus-4.6
panergos config set terminal.backend docker
panergos config set OPENROUTER_API_KEY sk-or-...
```

The right value goes to the right file automatically.

## 3. Run Your First Chat

```bash
panergos            # classic CLI
panergos --tui      # modern TUI (recommended)
```

You'll see a welcome banner with your model, available tools, and skills. Use a prompt that's specific and easy to verify:

:::tip Pick your interface
Panergos ships with two terminal interfaces: the classic `prompt_toolkit` CLI and a newer [TUI](../user-guide/tui.md) with modal overlays, mouse selection, and non-blocking input. Both share the same sessions, slash commands, and config — try each with `panergos` vs `panergos --tui`.
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

**What success looks like:**

- The banner shows your chosen model/provider
- Panergos replies without error
- It can use a tool if needed (terminal, file read, web search)
- The conversation continues normally for more than one turn

If that works, you're past the hardest part.

## 4. Verify Sessions Work

Before moving on, make sure resume works:

```bash
panergos --continue    # Resume the most recent session
panergos -c            # Short form
```

That should bring you back to the session you just had. If it doesn't, check whether you're in the same profile and whether the session actually saved. This matters later when you're juggling multiple setups or machines.

## 5. Try Key Features

### Use the terminal

```
❯ What's my disk usage? Show the top 5 largest directories.
```

The agent runs terminal commands on your behalf and shows results.

### Slash commands

Type `/` to see an autocomplete dropdown of all commands:

| Command | What it does |
|---------|-------------|
| `/help` | Show all available commands |
| `/tools` | List available tools |
| `/model` | Switch models interactively |
| `/personality pirate` | Try a fun personality |
| `/save` | Save the conversation |

### Multi-line input

Press `Alt+Enter`, `Ctrl+J`, or `Shift+Enter` to add a new line. `Shift+Enter` requires a terminal that sends it as a distinct sequence (Kitty / foot / WezTerm / Ghostty by default; iTerm2 / Alacritty / VS Code terminal once the Kitty keyboard protocol is enabled). `Alt+Enter` and `Ctrl+J` work in every terminal.

### Interrupt the agent

If the agent is taking too long, type a new message and press Enter — it interrupts the current task and switches to your new instructions. `Ctrl+C` also works.

## 6. Add the Next Layer

Only after the base chat works. Pick what you need:

### Bot or shared assistant

```bash
panergos gateway setup    # Interactive platform configuration
```

Connect [Telegram](/user-guide/messaging/telegram), [Discord](/user-guide/messaging/discord), [Slack](/user-guide/messaging/slack), [WhatsApp](/user-guide/messaging/whatsapp), [Signal](/user-guide/messaging/signal), [Email](/user-guide/messaging/email), or [Home Assistant](/user-guide/messaging/homeassistant), or [Microsoft Teams](/user-guide/messaging/teams).

### Automation and tools

- `panergos tools` — tune tool access per platform
- `panergos skills` — browse and install reusable workflows
- Cron — only after your bot or CLI setup is stable

### Sandboxed terminal

For safety, run the agent in a Docker container or on a remote server:

```bash
panergos config set terminal.backend docker    # Docker isolation
panergos config set terminal.backend ssh       # Remote server
```

For Docker sandboxes, you can also enable the **egress credential-injection proxy** so the sandbox never sees your real API keys — only opaque proxy tokens that work exclusively from behind a local TLS-intercepting daemon. See [Egress proxy](../user-guide/egress/iron-proxy.md). Setup is `panergos egress setup && panergos egress start`; `panergos setup terminal` also points Docker users at it. Modal, SSH, Daytona, and Singularity are not wired yet.

### Voice mode

```bash
# From the Panergos install directory (the curl installer placed it at
# ~/.panergos/panergos-agent on Linux/macOS or %LOCALAPPDATA%\panergos\panergos-agent on Windows):
cd ~/.panergos/panergos-agent
uv pip install --python ./venv/bin/python -e ".[voice]"
# Includes faster-whisper for free local speech-to-text
```

Then in the CLI: `/voice on`. Press `Ctrl+B` to record. See [Voice Mode](../user-guide/features/voice-mode.md).

### Skills

Skills are on-demand instruction documents that teach Panergos how to do a specific task — deploy to Kubernetes, open a GitHub PR, fine-tune a model, search for GIFs. Each is a `SKILL.md` file with a name, a description, and a step-by-step procedure. The agent reads the short descriptions for free and only loads a skill's full content when a task actually calls for it, so adding skills doesn't bloat every request.

Panergos ships with a catalog of bundled skills already installed in `~/.panergos/skills/`. You can add more from the Skills Hub, or write your own.

**Browse and install from the hub:**

```bash
panergos skills browse                      # list everything available
panergos skills search kubernetes           # find skills by keyword
panergos skills install openai/skills/k8s   # install one (runs a security scan first)
```

The install argument is a `source/path` slug from the hub — `openai/skills/k8s` means the `k8s` skill from OpenAI's catalog. `panergos skills browse` shows the exact slugs to use.

**Use a skill** — every installed skill becomes a slash command automatically:

```bash
/k8s deploy the staging manifest          # run the skill with a request
/k8s                                       # load it and let Panergos ask what you need
```

This works in the CLI and in any connected messaging platform. You don't have to install everything up front — the agent picks the right bundled skill on its own during normal conversation when a task matches one.

See [Skills System](../user-guide/features/skills.md) for writing your own, external skill directories, and the full hub source list.

### MCP servers

```yaml
# Add to ~/.panergos/config.yaml
mcp_servers:
  github:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-github"]
    env:
      GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_xxx"
```

### Editor integration (ACP)

ACP support ships with the standard `[all]` extras, so the curl installer already includes it. Just run:

```bash
panergos acp
```

(If you installed without `[all]`, run `cd ~/.panergos/panergos-agent && uv pip install -e ".[acp]"` first.)

See [ACP Editor Integration](../user-guide/features/acp.md).

---

## Common Failure Modes

These are the problems that waste the most time:

| Symptom | Likely cause | Fix |
|---|---|---|
| Panergos opens but gives empty or broken replies | Provider auth or model selection is wrong | Run `panergos model` again and confirm provider, model, and auth |
| Custom endpoint "works" but returns garbage | Wrong base URL, model name, or not actually OpenAI-compatible | Verify the endpoint in a separate client first |
| Gateway starts but nobody can message it | Bot token, allowlist, or platform setup is incomplete | Re-run `panergos gateway setup` and check `panergos gateway status` |
| `panergos --continue` can't find old session | Switched profiles or session never saved | Check `panergos sessions list` and confirm you're in the right profile |
| Model unavailable or odd fallback behavior | Provider routing or fallback settings are too aggressive | Keep routing off until the base provider is stable |
| `panergos doctor` flags config problems | Config values are missing or stale | Fix the config, retest a plain chat before adding features |

## Recovery Toolkit

When something feels off, use this order:

1. `panergos doctor`
2. `panergos model`
3. `panergos setup`
4. `panergos sessions list`
5. `panergos --continue`
6. `panergos gateway status`

That sequence gets you from "broken vibes" back to a known state fast.

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `panergos` | Start chatting |
| `panergos model` | Choose your LLM provider and model |
| `panergos tools` | Configure which tools are enabled per platform |
| `panergos setup` | Full setup wizard (configures everything at once) |
| `panergos doctor` | Diagnose issues |
| `panergos update` | Update to latest version |
| `panergos gateway` | Start the messaging gateway |
| `panergos --continue` | Resume last session |

## Next Steps

- **[CLI Guide](../user-guide/cli.md)** — Master the terminal interface
- **[Configuration](../user-guide/configuration.md)** — Customize your setup
- **[Messaging Gateway](../user-guide/messaging/index.md)** — Connect Telegram, Discord, Slack, WhatsApp, Signal, Email, Home Assistant, Teams, and more
- **[Tools & Toolsets](../user-guide/features/tools.md)** — Explore available capabilities
- **[AI Providers](../integrations/providers.md)** — Full provider list and setup details
- **[Skills System](../user-guide/features/skills.md)** — Reusable workflows and knowledge
- **[Tips & Best Practices](../guides/tips.md)** — Power user tips
- **[Moving to another machine](/reference/faq#exporting-panergos-to-another-machine)** — `panergos backup` migrates your whole setup (or [a single profile](/reference/faq#moving-a-single-profile-to-another-machine)); no need to rebuild from scratch
