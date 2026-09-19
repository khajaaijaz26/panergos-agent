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


def _timed(**kwargs) -> tuple[dict, float, int]:
    started = time.perf_counter()
    raw = project_memory(**kwargs)
    elapsed_ms = (time.perf_counter() - started) * 1_000
    result = json.loads(raw)
    if not result.get("success"):
        raise RuntimeError(result.get("error", "project_memory failed"))
    return result, elapsed_ms, len(raw.encode("utf-8"))


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
        }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--files", type=int, default=500)
    args = parser.parse_args()
    print(json.dumps(run(args.files), indent=2))


if __name__ == "__main__":
    main()
