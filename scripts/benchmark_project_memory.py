#!/usr/bin/env python3
"""Reproducible synthetic latency benchmark for the project-memory tool."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from tools.project_memory_tool import project_memory  # noqa: E402

_GRAPH_QUERIES = (
    "graph_recall_node_beacon",
    "graph_recall_link_beacon",
    "graph_recall_hyperedge_beacon",
)


def _timed(**kwargs) -> tuple[dict, float, int]:
    started = time.perf_counter()
    raw = project_memory(**kwargs)
    elapsed_ms = (time.perf_counter() - started) * 1_000
    result = json.loads(raw)
    if not result.get("success"):
        raise RuntimeError(result.get("error", "project_memory failed"))
    return result, elapsed_ms, len(raw.encode("utf-8"))


def _recall(root: Path) -> tuple[float, float, int]:
    matches = 0
    elapsed_ms = 0.0
    result_bytes = 0
    for query in _GRAPH_QUERIES:
        result, query_ms, query_bytes = _timed(
            action="search", root=str(root), query=query, limit=1,
        )
        matches += bool(result["count"])
        elapsed_ms += query_ms
        result_bytes += query_bytes
    return matches / len(_GRAPH_QUERIES), elapsed_ms, result_bytes


def _write_graph(path: Path, files: int, nodes: int = 500) -> None:
    path.parent.mkdir()
    document = {
        "directed": True,
        "nodes": [
            {
                "id": f"node-{index}",
                "label": f"synthetic_graph_node_{index}",
                "description": "graph_recall_node_beacon" if index == 0 else "benchmark noise",
                "source_file": f"module_{index % files:05d}.py",
            }
            for index in range(nodes)
        ],
        "links": [
            {
                "source": f"node-{index}",
                "target": f"node-{index + 1}",
                "relation": "depends_on",
                "context": "graph_recall_link_beacon" if index == 0 else "benchmark edge",
            }
            for index in range(nodes - 1)
        ],
        "hyperedges": [{
            "id": "release-set",
            "members": ["node-0", "node-1", "node-2"],
            "context": "graph_recall_hyperedge_beacon",
        }],
    }
    path.write_text(
        json.dumps(document, sort_keys=True, separators=(",", ":")), encoding="utf-8",
    )


def run(files: int) -> dict:
    if not 1 <= files <= 5_000:
        raise ValueError("--files must be between 1 and 5000")
    with tempfile.TemporaryDirectory(prefix="panergos-project-memory-") as temp:
        base = Path(temp)
        project = base / "project"
        project.mkdir()
        os.environ["PANERGOS_HOME"] = str(base / "profile")
        for index in range(files):
            (project / f"module_{index:05d}.py").write_text(
                f"def task_{index}():\n    return 'panergos_beacon_{index}'\n" * 10,
                encoding="utf-8",
            )
        git = shutil.which("git")
        if git:
            subprocess.run([git, "init", "-q"], cwd=project, check=True)
            subprocess.run([git, "add", "."], cwd=project, check=True)
            subprocess.run(
                [git, "-c", "user.name=Panergos Benchmark", "-c", "user.email=benchmark@invalid",
                 "commit", "-qm", "benchmark corpus"],
                cwd=project, check=True,
            )

        cold, cold_ms, _ = _timed(action="sync", root=str(project))
        warm, warm_ms, _ = _timed(action="sync", root=str(project))
        changed_file = project / f"module_{files // 2:05d}.py"
        changed_file.write_text(
            changed_file.read_text(encoding="utf-8") + "\nincremental_target = True\n",
            encoding="utf-8",
        )
        incremental, incremental_ms, _ = _timed(action="sync", root=str(project))
        query, query_ms, query_bytes = _timed(
            action="search", root=str(project), query="incremental_target", limit=5,
        )
        baseline_recall, _, _ = _recall(project)
        graph_path = project / "synthetic-memory" / "graph.json"
        _write_graph(graph_path, files)
        imported, import_ms, _ = _timed(
            action="import_graph", root=str(project), path=str(graph_path),
        )
        after_recall, search_ms, search_bytes = _recall(project)
        duplicate, reimport_ms, _ = _timed(
            action="import_graph", root=str(project), path=str(graph_path),
        )
        removed, remove_ms, _ = _timed(
            action="remove_graph", root=str(project), digest=imported["digest"],
        )
        after_remove_recall, _, _ = _recall(project)
        if (baseline_recall, after_recall, after_remove_recall) != (0.0, 1.0, 0.0):
            raise RuntimeError("graph import recall invariant failed")
        if not duplicate["deduplicated"] or not removed["removed"]:
            raise RuntimeError("graph import lifecycle invariant failed")
        return {
            "files": files,
            "source": cold["source"],
            "cold_sync_ms": round(cold_ms, 3),
            "warm_sync_ms": round(warm_ms, 3),
            "warm_unchanged_files": warm["unchanged_files"],
            "warm_fast_path": warm["fast_path"],
            "incremental_sync_ms": round(incremental_ms, 3),
            "incremental_changed_files": incremental["changed_files"],
            "query_ms": round(query_ms, 3),
            "query_results": query["count"],
            "query_result_bytes": query_bytes,
            "graph_import": {
                "source_bytes": imported["source_size"],
                "nodes": imported["nodes"],
                "links": imported["links"],
                "hyperedges": imported["hyperedges"],
                "probe_queries": len(_GRAPH_QUERIES),
                "baseline_recall": baseline_recall,
                "import_ms": round(import_ms, 3),
                "after_import_recall": after_recall,
                "search_ms": round(search_ms, 3),
                "search_result_bytes": search_bytes,
                "idempotent_reimport_ms": round(reimport_ms, 3),
                "idempotent_reimport": duplicate["deduplicated"],
                "remove_ms": round(remove_ms, 3),
                "removed": removed["removed"],
                "after_remove_recall": after_remove_recall,
            },
        }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--files", type=int, default=500)
    args = parser.parse_args()
    print(json.dumps(run(args.files), indent=2))


if __name__ == "__main__":
    main()
