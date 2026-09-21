# Project-memory microbenchmark

This deterministic benchmark measures the local indexing/retrieval layer; it is
not an end-to-end model-quality comparison. It creates a temporary Git repository,
commits a synthetic corpus, performs a cold sync, a clean warm sync, a one-file
update, and an FTS5 query. It also imports a synthetic 500-node graph and reports
recall before/after import, import latency, three-query search latency and result
bytes, idempotent re-import latency, and recall after explicit removal. Temporary
project and private profile data are deleted when the run exits.

Run it with the release-pinned environment:

```bash
uvx --from uv==0.9.28 uv run --frozen python scripts/benchmark_project_memory.py --files 500
```

The command emits JSON suitable for retaining as raw trial data. Dated JSON files
may contain results from older script versions, so use their recorded command and
fields when comparing them. Results vary with filesystem cache, antivirus, storage,
and CPU. Compare commits on the same machine and retain every trial; do not use this
microbenchmark as evidence that Panergos beats another complete agent. Recall here
only means whether three known synthetic records were retrieved; it is not a model
quality score or a claim about arbitrary real-world knowledge.
