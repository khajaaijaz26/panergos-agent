# Project-memory microbenchmark

This deterministic benchmark measures the local indexing/retrieval layer; it is
not an end-to-end model-quality comparison. It creates a temporary Git repository,
commits a synthetic corpus, performs a cold sync, a clean warm sync, a one-file
update, and an FTS5 query, then removes the corpus and profile database.

Run it with the release-pinned environment:

```bash
uvx --from uv==0.9.28 uv run --frozen python scripts/benchmark_project_memory.py --files 500
```

The dated JSON files contain raw repeated trials, environment details, and medians.
Results vary with filesystem cache, antivirus, storage, and CPU. Compare commits on
the same machine and retain every trial; do not use this microbenchmark as evidence
that Panergos beats another complete agent.
