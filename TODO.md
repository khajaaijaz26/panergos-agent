# Panergos Agent delivery ledger

This is the public, evidence-based build checklist. An item is checked only when the
implementation exists and its focused validation passes. Ambitious ideas stay unchecked
until they are real; this file is not a marketing claims list.

## v0.1.0 — independent source release

- [x] Select the independent name **Panergos Agent** and screen the exact package/repository name.
- [x] Preserve all legally required third-party attribution in `NOTICE` and `LICENSE-MIT-UPSTREAM`.
- [x] Reserve the public repository name `khajaaijaz26/panergos-agent`.
- [ ] Replace the GitHub fork-network repository with a verified standalone repository at the same URL.
- [x] Add the `panergos` CLI and independent distribution/version metadata.
- [x] Add Panergos icon and banner assets.
- [x] Replace the inherited visual identity with the Panergos Knot and a distinct,
  accessible jade/coral/deep-ink theme across public application surfaces.
- [x] Route self-update only through the exact Panergos repository; reject stale or hostile remotes.
- [x] Add a clean-tree, exact-repository, exact-branch SemVer release preflight.
- [x] Add Durable Missions with persistent task graphs, scoped actors, idempotency, messages,
  replayable events, durable stop fences, and focused tests.
- [x] Move model, plugin, skill-index, and MCP client-metadata trust roots to Panergos-owned URLs.
- [x] Add `panergos model --quick` for CPU-aware local-runtime detection plus Anthropic and
  OpenAI-compatible endpoint setup without persisting key values.
- [x] Add `panergos connect` to inventory inherited and plugin connectors, report readiness without
  exposing secret values, and route setup to each connector's existing handler.
- [x] Add a professional organization-workflow pack spanning individual, manager, department,
  and executive scopes with explicit approvals, provider read-back evidence, and resumable handoffs.
- [x] Finish desktop/bootstrap identity migration and run desktop-focused tests.
- [x] Finish installer, website, contribution, security, and translated documentation migration.
- [x] Disable inherited publish/schedule jobs that require unavailable external infrastructure; keep
  runnable checks on GitHub-hosted runners.
- [x] Run the final Python, web, desktop, installer, workflow, lockfile, and stale-brand validation
  after the first-party namespace migration.
- [ ] Commit the release tree, make `main` the canonical branch, and remove the temporary branch.
- [x] Enable GitHub Issues, Discussions, private vulnerability reporting, and repository topics.
- [x] Enable GitHub Pages and set the public documentation homepage.
- [ ] Protect the final `main` branch after its required checks exist.
- [ ] Publish the source-only `v0.1.0` release and verify installation from a clean machine.

## Project memory and fast resume

- [x] Retain bounded personal memory, profile memory, session transcripts, FTS5 session search,
  compaction handoffs, project context files, checkpoints, and resumable sessions from the baseline.
- [x] Add a local per-project incremental source index that reads only new or changed text files.
- [x] Add compact FTS5 retrieval with file/line evidence so agents do not inject whole repositories.
- [x] Add durable per-project handoffs and load the latest handoff in a new coding session.
- [x] Exclude secrets, ignored files, binary files, vendor trees, oversized files, and escaping symlinks.
- [x] Measure cold-index time, warm-index time, retrieval size, and changed-file update cost.

## Speed and quality

- [x] Retain progressive tool disclosure, on-demand skills, prompt caching, context compaction,
  persistent terminal state, code-execution batching, and parallel subagents from the baseline.
- [ ] Add a reproducible Panergos benchmark suite for latency, tokens, task success,
  resume accuracy, memory retrieval, and long-repository navigation.
- [ ] Publish benchmark hardware, prompts, seeds, raw results, and failure cases before claiming a win.
- [ ] Profile startup and first-token latency; optimize only measured bottlenecks.
- [ ] Add regression budgets for prompt size, warm project-memory sync, and tool schema overhead.

## Public-system study (clean-room)

- [x] Review leading public agent implementations and documentation at a pinned baseline.
- [x] Review public Claude Code documentation for project instructions, auto memory, rules, hooks,
  session resume, skills, and isolated subagents.
- [x] Review public OpenAI Codex documentation for `AGENTS.md`, memories, skills, MCP, and subagents.
- [x] Publish a dated feature matrix with primary-source links and map each adopted idea to an
  independently implemented Panergos capability.
- [x] Review public documentation for Gemini CLI, OpenCode, Aider, Cursor, GitHub Copilot,
  Claude Code, Codex, and goose.
- [ ] Review current primary documentation for leading model providers before publishing model
  capability recommendations.
- [ ] Add provider-neutral model capability discovery and eval-based recommendations; never label a
  model “best” from a hard-coded popularity list.

## Post-v0.1 roadmap

- [ ] Capability Forge: safely generate, test, approve, version, and roll back reusable skills/tools.
- [ ] Policy Ledger: explicit, inspectable permission, spend, network, and data-boundary decisions.
- [ ] Evidence Gates: require commands, artifacts, or citations before an agent marks work complete.
- [ ] Mission budgets and per-task resource accounting.
- [ ] First-party signed Windows, macOS, and Linux artifacts with reproducible provenance.
- [ ] Encrypted optional memory sync with user-owned storage and deletion/export controls.
- [ ] Multi-repository semantic navigation after the local FTS5 baseline is benchmarked.
