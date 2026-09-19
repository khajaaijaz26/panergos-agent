# Panergos Agent

Panergos is a complete open agent runtime with durable coordination for work that spans agents, sessions, restarts, and human review. The name combines *pan* (“all”) and Greek *ergon* (“work”).

## Development status

The `main` branch ships Panergos Durable Missions and Project Memory in runtime package `0.1.0`.

| Component | Status |
|---|---|
| Panergos runtime | Implemented and covered by release-gate tests |
| Durable Missions | Experimental; implemented with local contract tests |
| Project Memory | Experimental; implemented, focused-tested, and microbenchmarked |
| Model quick start | Implemented for managed/local runtimes, Anthropic, and OpenAI-compatible endpoints |
| Unified connectors | Implemented over the built-in and plugin platform catalog |
| Organization workflows | Implemented as a reviewed, evidence-backed role and department pack |
| Capability Forge | Planned; specification only |
| Policy Ledger | Planned; specification only |
| Evidence Gates and comparative benchmarks | Planned; specification only |

The mission layer deliberately reuses the Kanban engine instead of introducing another scheduler:

- Kanban owns tasks, dependency edges, worker profiles, atomic claims, leases, heartbeats, retries, reviews, workspaces, and artifacts.
- Panergos owns mission metadata, typed compare-and-swap shared state, addressed peer messages, and the unified audit stream.
- Every Kanban event for a mission task is mirrored by a SQLite trigger in the same transaction. A process crash cannot leave the task changed but the mission timeline unaware.

## Connect models and accounts

Use the guided route to detect an already-running Ollama, LM Studio, llama.cpp, or
managed local runtime, or configure Anthropic or another OpenAI-compatible service:

```bash
panergos model --quick
```

The quick start reports local hardware before choosing a route, keeps API-key values
out of configuration files, and rejects authenticated plain-HTTP endpoints outside
the loopback interface. CPU-only inference is supported where the selected local
model fits available memory; speed and context capacity still depend on the model and
machine.

## Connect messaging platforms

The connector command reads the same dynamic catalog used by the gateway, so current
built-ins and installed, enabled platform plugins appear without a second hard-coded
registry:

```bash
panergos connect
panergos connect status --json
panergos connect whatsapp
panergos connect whatsapp-cloud
panergos connect auth anthropic --type oauth
```

The clean-profile v0.1 inventory contains 33 adapters, including WhatsApp QR/local
bridge, Meta WhatsApp Cloud API, Telegram, Discord, Slack, Signal, Matrix, email, SMS,
Microsoft Teams, Google Chat, LINE, IRC, iMessage routes, webhooks, and the
OpenAI-compatible API server. Plugins extend that inventory under the existing trust
and enablement policy. Status output contains connector names, readiness, missing key
*names*, and local gateway state; it never prints credential values or performs
unsolicited vendor requests. Vendor accounts, credentials, permissions, quotas, and
service availability remain external requirements.

Telegram defaults to manual BotFather setup so its credential flow stays local. The
optional QR route is an explicit opt-in to the configured hosted onboarding service,
which processes the requested bot name and returns the bot token and owner ID after
confirmation. `TELEGRAM_ONBOARDING_URL` can select a compatible self-hosted service.

## Coordinate professional organization work

The bundled `organization-workflows` skill turns an objective into accountable
work packages across individual, manager, department, and executive scopes. Its
role pack covers finance, HR, sales, marketing, support, operations, procurement,
legal/compliance, engineering/IT/security, product, analytics, and executive
coordination while routing documents, spreadsheets, email, calendars, connected
systems, missions, and project handoffs through capabilities already available in
the session.

Every package keeps **Draft → Review → Execute → Evidence** separate. Money,
contracts, employment decisions, access changes, and external publishing require
exact approval from an authenticated accountable human. The agent never invents
an account or claims an external action happened when the connector, permission,
qualified reviewer, or provider evidence is missing.

## Start a mission

Enable the toolset for the profile that will orchestrate work:

```bash
panergos plugins enable panergos_missions
panergos gateway start
```

From a chat, ask the planner to create a mission and assign tasks. The model receives one `panergos_mission` tool with these actions:

| Action | Purpose |
|---|---|
| `create`, `list`, `show`, `set_status` | Mission lifecycle and restart recovery |
| `add_task`, `list_tasks` | Durable task graph backed by Kanban workers |
| `put_state`, `get_state` | Typed shared state with optimistic concurrency (`expected_version`) |
| `send`, `inbox`, `ack` | Idempotent addressed peer messages |
| `events` | Keyset-paginated mission and task audit history |

The same interface is available to operators without an LLM:

```bash
panergos missions create --data '{"goal":"Research, build, test, and document a release","idempotency_key":"release-1"}'
panergos missions list
```

## Resume a project without rereading it

The `project_memory` tool has four actions: `sync` incrementally indexes eligible
text, `search` returns bounded BM25-ranked snippets with file and line evidence,
`remember` saves a concise completed/pending/next-step handoff, and `status` reports
index freshness plus the latest handoff. A saved handoff is loaded into the next
coding session as untrusted data and must be checked against current files before use.

Indexes live under the active profile outside the repository. Git-ignored files,
common vendor/cache trees, credential/key/environment files, binary content,
oversized files, and escaping symlinks are excluded. See
[`benchmarks/project-memory`](benchmarks/project-memory/README.md) for the runnable
microbenchmark and dated raw trials.

On PowerShell, quote JSON with single quotes as shown. On shells where that is unavailable, pass an escaped JSON object.

## Reliability contract

- Mission and coordination writes use SQLite `BEGIN IMMEDIATE` transactions.
- Task execution uses the inherited Kanban claim/run fencing, stale-worker recovery, and dependency promotion.
- Mission and message retries accept idempotency keys.
- Shared-state writes can require an exact prior version; stale writers fail without overwriting newer work.
- Only the intended recipient can acknowledge a message.
- JSON is size-bounded and rejects NaN/Infinity; identifiers and page sizes are validated at the tool boundary.
- Mission task workspaces default to scratch isolation. Host permissions, API spend, and external side effects still follow the runtime's configured approval policy.

### Current 0.1 boundaries

- Mission lifecycle policy applies through `panergos_mission`. Callers that invoke raw Kanban APIs can bypass that mission policy.
- Stopping an operating-system process is staged and cannot be part of the same SQLite transaction as the mission state change. Durable stop fences and quarantine preserve retry and recovery behavior.
- Mission budgets are not enforced in 0.1; provider quotas and configured runtime or operating-system limits remain external controls.

## What “no limits” means

Panergos has no fixed task taxonomy and no mandatory model provider. It does **not** bypass operating-system permissions, provider quotas, context windows, budgets, laws, or safety controls. Unlimited authority would make a long-running agent less reliable, not more capable.

## Roadmap and acceptance

The end-to-end roadmap is [.agents-cli-spec.md](.agents-cli-spec.md). It defines four proposed differentiators—Durable Missions, Capability Forge, Policy Ledger, and Evidence Gates—plus release phases and measurable evaluations. Features are marked complete only after their acceptance checks pass; the project does not claim blanket superiority without benchmark evidence. Any comparison must publish its inputs, pinned commits and model configurations, graders, repeated trials, failures, cost, and latency so others can reproduce it.

## License

Panergos installation, updates, issues, and releases come from [khajaaijaz26/panergos-agent](https://github.com/khajaaijaz26/panergos-agent). Required third-party attribution is isolated in [NOTICE](NOTICE) and the bundled third-party license files.
