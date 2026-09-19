# Contributor email → GitHub login mappings

Panergos keeps only mappings needed by commits in this independent repository.
Each mapping is its own file, so additions do not conflict and unrelated
historical address lists are not republished.

## Adding a mapping

One file per commit-author email, under `emails/`:

```bash
python3 scripts/add_contributor.py <email> <github-login>
# or by hand:
echo "<github-login>" > contributors/emails/<email>
```

- File **name** = the exact commit-author email (as shown by `git log --format='%ae'`).
- File **content** = the GitHub login on the first non-comment line.
  Lines starting with `#` are comments (use them for the PR reference).

Example — `contributors/emails/jane.doe@example.com`:

```
janedoe
# PR #12345 salvage (gateway: fix session key routing)
```

## Rules

- Add a mapping only for a commit that exists in this repository; do not import
  bulk address lists from another project.
- Prefer a GitHub noreply commit address when possible.
- GitHub noreply emails (`<id>+<login>@users.noreply.github.com` and
  `<login>@users.noreply.github.com`) auto-resolve — no file needed.
- The `Contributor Attribution Check` CI job fails a PR whose commits carry
  an unmapped email; the failure message prints the exact command to run.
