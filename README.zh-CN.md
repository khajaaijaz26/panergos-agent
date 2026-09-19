# Panergos Agent

**Panergos**（读作 `pan-ER-gos`，由 *pan* 与希腊语 *ergon*“工作”组合而来）是一个开放、模型无关的通用智能体发行版，面向可跨会话持续执行的工作。

本仓库包含完整的 Panergos 发行版，并加入 Durable Missions：持久化任务、基于 Kanban 的任务图、带版本控制的共享状态、定向消息以及可重放的事件流。

[English](README.md) · [Español](README.es.md) · [اردو](README.ur-pk.md)

## 当前状态

| 功能范围 | 状态 |
|---|---|
| Panergos CLI/TUI/桌面运行时、API、消息网关、模型提供商、工具、记忆、技能、插件、MCP、定时任务与子智能体 | 可用 |
| Panergos Durable Missions | 实验性；已实现并通过本地测试 |
| Capability Forge、Policy Ledger 与 Evidence Gates | 规划中 |

Panergos 只发布有可重现结果支持的性能声明。

## 安装

以下安装脚本均来自本仓库，并跟踪 `main` 分支。

### Linux、macOS、WSL2 或 Termux

```bash
curl -fsSL https://raw.githubusercontent.com/khajaaijaz26/panergos-agent/main/scripts/install.sh | bash
panergos setup
```

### Windows PowerShell

```powershell
iex (irm https://raw.githubusercontent.com/khajaaijaz26/panergos-agent/main/scripts/install.ps1)
panergos setup
```

### 从源码运行

```bash
git clone --branch main --single-branch https://github.com/khajaaijaz26/panergos-agent.git
cd panergos-agent
uvx --from uv==0.9.28 uv sync --locked --python 3.11
uv run --frozen panergos setup
uv run --frozen panergos plugins enable panergos_missions
uv run --frozen panergos
```

公开且标准的命令为 `panergos`。

## “无限制”的实际含义

Panergos 不限定任务类型，也不强制使用某个模型提供商。它不会绕过操作系统权限、提供商配额、上下文窗口、预算、法律、安全控制或明确的审批门槛。

## 文档与支持

- [项目指南](PANERGOS.md)
- [安装指南](website/docs/getting-started/installation.md)
- [问题反馈](https://github.com/khajaaijaz26/panergos-agent/issues)
- [安全问题报告](SECURITY.md)

## 许可证

Apache-2.0。请参阅 [LICENSE](LICENSE)、[NOTICE](NOTICE) 以及随附的第三方声明。
