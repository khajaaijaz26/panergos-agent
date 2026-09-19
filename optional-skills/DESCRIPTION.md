# Optional Skills

Optional skills maintained by Panergos contributors that are **not activated by default**.

These skills ship with the Panergos Agent repository but are not copied to
`~/.panergos/skills/` during setup. They are discoverable via the Skills Hub:

```bash
panergos skills browse               # browse all skills, official shown first
panergos skills browse --source official  # browse only official optional skills
panergos skills search <query>       # finds optional skills labeled "official"
panergos skills install <identifier> # copies to ~/.panergos/skills/ and activates
```

## Why optional?

Some skills are useful but not broadly needed by every user:

- **Niche integrations** — specific paid services, specialized tools
- **Experimental features** — promising but not yet proven
- **Heavyweight dependencies** — require significant setup (API keys, installs)

By keeping them optional, we keep the default skill set lean while still
providing curated, tested, official skills for users who want them.
