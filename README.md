# Panergos Agent

<img src="assets/panergos-banner.png" alt="Panergos Agent" width="960">

**Panergos** (`pan-ER-gos`, from *pan* + Greek *ergon*, “all work”) is an open, model-agnostic agent distribution for durable, multi-session work.

It combines a full autonomous-agent runtime with Durable Missions for restart-safe multi-agent coordination and Project Memory for compact, incremental repository recall and cross-session handoffs.

[Español](README.es.md) · [简体中文](README.zh-CN.md) · [اردو](README.ur-pk.md)

## Capability matrix

| Capability | Provenance | Current evidence |
|---|---|---|
| CLI, TUI, desktop, web dashboard, and IDE/ACP surfaces | Panergos runtime | Panergos CI |
| Model/provider routing, tools, memory, skills, plugins, MCP, cron, gateways, and delegation | Panergos runtime | Compatibility and integration tests |
| One-command local/cloud model setup with CPU-aware detection | Panergos runtime | Focused CLI tests and current provider documentation |
| Unified connector inventory, guided setup, provider-account auth, and secret-free health status | Panergos runtime | Dynamic built-in/plugin catalog and focused CLI tests |
| Professional organization workflows across roles and departments | Panergos workflow pack | Bundled role pack, approval/evidence contract, and focused tests |
| Durable mission metadata, task graphs, shared state, peer messages, and audit events | Panergos Missions | Experimental; local contract and distribution tests |
| Incremental project index, compact file/line retrieval, and resumable project handoffs | Panergos Project Memory | Focused tests plus a published synthetic benchmark |
| Capability Forge | Roadmap | Planned; specification only |
| Policy Ledger | Roadmap | Planned; specification only |
| Evidence Gates and comparative benchmarks | Roadmap | Planned; specification only |

Panergos publishes capability claims only when they have reproducible evidence. Comparative results will include benchmark inputs, pinned builds and model configurations, graders, repeated trials, failures, cost, and latency.

## What works now

- Restart-safe mission records over the SQLite Kanban engine.
- Durable task assignment to named agent profiles with dependencies, retries, leases, reviews, workspaces, and artifacts.
- Typed shared state with optimistic concurrency.
- Idempotent addressed messages with recipient-only acknowledgement.
- One paginated audit stream; task events are mirrored atomically by a SQLite trigger.
- A profile-scoped SQLite FTS5 project index that reads changed text files, skips ignored/vendor/secret/binary/oversized content, and returns bounded file/line evidence.
- Durable project handoffs loaded into new coding sessions as untrusted context that must be verified against current files.
- `panergos model --quick` reuses a ready Ollama, LM Studio, llama.cpp, or managed local model, and can connect Anthropic or any OpenAI-compatible cloud endpoint without storing key values in config.
- `panergos connect` discovers built-in and enabled plugin connectors, reports missing requirement names without printing secret values, and delegates setup/authentication to each platform and account handler.
- The bundled `organization-workflows` skill coordinates professional work from individual and manager scopes through finance, HR, sales, marketing, support, operations, procurement, legal/compliance, engineering/IT/security, product, analytics, and executive review, with explicit Draft → Review → Execute → Evidence stages.
- The canonical `panergos` CLI across setup, chat, models, connectors, memory, missions, and administration.

See [PANERGOS.md](PANERGOS.md) for commands, reliability boundaries, and the current architecture.
Project-memory methodology and dated raw trials are in [benchmarks/project-memory](benchmarks/project-memory/README.md).

## Install

Every installer below is fetched from this repository and tracks its `main` branch.

### Linux, macOS, WSL2, or Termux

```bash
curl -fsSL https://raw.githubusercontent.com/khajaaijaz26/panergos-agent/main/scripts/install.sh | bash
panergos setup
```

### Windows PowerShell

```powershell
iex (irm https://raw.githubusercontent.com/khajaaijaz26/panergos-agent/main/scripts/install.ps1)
panergos setup
```

### Source checkout

```bash
git clone --branch main --single-branch https://github.com/khajaaijaz26/panergos-agent.git
cd panergos-agent
uvx --from uv==0.9.28 uv sync --locked --python 3.11
uv run --frozen panergos setup
uv run --frozen panergos plugins enable panergos_missions
uv run --frozen panergos
```

For development, add the test dependencies:

```bash
uvx --from uv==0.9.28 uv sync --locked --python 3.11 --extra dev
```

## Scope of “no limits”

Panergos has no fixed task taxonomy and no mandatory model provider. It does **not** bypass operating-system permissions, provider quotas, context windows, budgets, laws, safety controls, or explicit approval gates.

Durable Missions 0.1 has deliberate boundaries: mission lifecycle policy applies through the `panergos_mission` interface, while callers that use raw Kanban APIs can bypass it. Stopping a terminal task is a staged operating-system action rather than part of one SQLite transaction; durable stop fences and quarantine make retries recoverable. Mission budgets are not enforced in 0.1.

## Documentation and support

- [Project guide](PANERGOS.md)
- [Visual identity](BRAND.md)
- [Installation guide](website/docs/getting-started/installation.md)
- [Issues](https://github.com/khajaaijaz26/panergos-agent/issues)
- [Security reporting](SECURITY.md)

## License

Apache-2.0. See [LICENSE](LICENSE), [NOTICE](NOTICE), and the bundled third-party notices.
