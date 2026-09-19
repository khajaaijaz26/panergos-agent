# Panergos CLI Reference

Live sources when anything looks stale: `panergos --help`, `panergos <command> --help`,
https://khajaaijaz26.github.io/panergos-agent/docs/reference/cli-commands

### Global Flags

```
panergos [flags] [command]      (no subcommand = interactive chat)

  --version, -V             Show version
  -z, --oneshot PROMPT      One-shot: print ONLY the final response (for scripts/pipes)
  -m MODEL  --provider P    Model/provider override for this invocation
  -t, --toolsets LIST       Comma-separated toolsets for this invocation
  --resume, -r SESSION      Resume session by ID or title
  --continue, -c [NAME]     Resume by name, or most recent session
  --worktree, -w            Isolated git worktree mode (parallel agents)
  --skills, -s SKILL        Preload skills (comma-separate or repeat)
  --profile, -p NAME        Use a named profile
  --yolo                    Skip dangerous command approval
  --tui / --cli             Force the Ink TUI / classic REPL
  --ignore-rules            Skip AGENTS.md/SOUL.md/memory/skill injection
  --safe-mode               Disable ALL customizations (troubleshooting)
  --pass-session-id         Include session ID in system prompt
```

### Chat

```
panergos chat [flags]
  -q, --query TEXT          Single query, non-interactive
  --image PATH              Attach a local image to a single query
  -Q, --quiet               Suppress banner, spinner, tool previews
  --checkpoints             Enable filesystem checkpoints (/rollback)
  --max-turns N             Cap tool-calling iterations
  --source TAG              Session source tag (default: cli)
```
(plus the global flags above)

### Configuration

```
panergos setup [section]     Wizard (model|tts|terminal|gateway|tools|agent)
panergos model               Interactive model/provider picker
panergos fallback [add|remove|list]  Fallback provider chain
panergos config [show|edit|get|set|unset|path|env-path|check|migrate]
panergos login / logout      OAuth sign-in / clear stored auth
panergos doctor [--fix]      Check dependencies and config
panergos status [--all]      Component status
```

### Tools & Skills

```
panergos tools [list|enable NAME|disable NAME]   Per-platform toolsets (curses UI with no args)

panergos skills list|browse|search QUERY|inspect ID
panergos skills install ID  Hub identifier OR a direct https://…/SKILL.md URL
panergos skills config      Enable/disable skills per platform
panergos skills check|update|uninstall|publish PATH
panergos skills tap add REPO  Add a GitHub repo as a skill source
panergos bundles            Skill bundles (one /<name> alias loads several skills)
```

### MCP Servers

```
panergos mcp add NAME (--url or --command) | remove | list | test NAME
panergos mcp catalog | install NAME   Curated catalog install
panergos mcp configure NAME           Toggle tool selection
panergos mcp serve                    Run Panergos as an MCP server
```
Details (transport, tool discovery, catalog): `references/native-mcp.md`.

### Gateway (Messaging Platforms)

```
panergos gateway run|install|start|stop|restart|status|setup
```

20+ platforms: Telegram, Discord, Slack, WhatsApp (Baileys + Business Cloud API), iMessage (Photon — `panergos photon setup`), Signal, Email, SMS, Matrix, Mattermost, Teams, LINE, SimpleX, ntfy, Google Chat, Home Assistant, DingTalk, Feishu, WeCom, Weixin, API Server, Webhooks. Open WebUI connects via the API Server adapter. Most adapters ship under `plugins/platforms/`.
Docs: https://khajaaijaz26.github.io/panergos-agent/docs/user-guide/messaging/

### Sessions

```
panergos sessions list|browse|rename ID TITLE|delete ID|export OUT|prune|stats
```

### Cron / Webhooks

```
panergos cron list|create SCHED|edit ID|pause|resume|run ID|remove|status
    Schedules: '30m', 'every 2h', '0 9 * * *', ISO timestamp
panergos webhook subscribe NAME|list|remove NAME|test NAME
```
Webhook payloads/routes: `references/webhooks.md`.

### Profiles

```
panergos profile list|create NAME (--clone|--clone-all|--clone-from)|use|show|delete
panergos profile rename A B | alias NAME | export NAME | import FILE
```

### Credentials & Pools

```
panergos auth                 Interactive credential manager
panergos auth add [PROVIDER]  Add OAuth or API-key credential (openai-codex, qwen-oauth, …)
panergos auth list|remove P IDX|reset PROVIDER|status
```
Multiple credentials per provider form a pool that rotates automatically and skips exhausted keys.

### Other

```
panergos desktop / gui      Native desktop app
panergos dashboard          Web admin panel + embedded chat (--stop / --status)
panergos proxy              OpenAI-compatible local proxy backed by an OAuth provider
panergos kanban <verb>      Multi-agent work-queue board
panergos project            Named multi-folder workspaces
panergos skin list|use|set  Switch/tweak skins (see references/themes.md)
panergos pets <verb>        Pet mascots (see references/petdex.md)
panergos memory setup|status|off|reset   Memory provider
panergos secrets bitwarden|onepassword   External secret stores
panergos moa                Mixture-of-Agents slots
panergos hooks / security / backup / import / checkpoints / console
panergos logs [-f] [errors] View agent/error logs
panergos send               One-off message through a gateway platform
panergos pairing / plugins / insights / journey / computer-use
panergos acp                ACP server (IDE integration)
panergos completion bash|zsh|fish
panergos update / uninstall / claw migrate
```

Plugin- and provider-supplied subcommands (e.g. `panergos photon setup`) only appear once their plugin is installed/active.

### Where to Find Things

| Looking for... | Location |
|---|---|
| Config options | `panergos config edit` · [Configuration docs](https://khajaaijaz26.github.io/panergos-agent/docs/user-guide/configuration) |
| Tools / toolsets | `panergos tools list` · [Tools reference](https://khajaaijaz26.github.io/panergos-agent/docs/reference/tools-reference) |
| Skills catalog | `panergos skills browse` · [Skills catalog](https://khajaaijaz26.github.io/panergos-agent/docs/reference/skills-catalog) |
| Provider setup | `panergos model` · [Providers guide](https://khajaaijaz26.github.io/panergos-agent/docs/integrations/providers) |
| Env variables | `panergos config env-path` · [Env vars reference](https://khajaaijaz26.github.io/panergos-agent/docs/reference/environment-variables) |
| Gateway logs | `~/.panergos/logs/gateway.log` (or `panergos logs`) |
| Sessions | `panergos sessions browse` (reads state.db) |
