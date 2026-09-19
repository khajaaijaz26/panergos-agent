"""Guest ledger connections must inherit the configured database.synchronous.

apply_durability_barriers() is the guest-connection entry point (secondary
state.db users that must NOT touch journal mode). The configured
``database.synchronous`` level normally rides on apply_database_pragmas()
during the owner's journal-mode setup — a path guests deliberately skip — so
the guest entry point applies it directly.
"""

import sqlite3

import pytest

import panergos_state
from panergos_state_repair import apply_durability_barriers


def _config(monkeypatch, database_section):
    import panergos_cli.config as config_mod

    cfg = {"database": database_section}
    monkeypatch.setattr(config_mod, "load_config_readonly", lambda *a, **k: cfg)
    return cfg






def test_guest_barriers_survive_config_failure(monkeypatch, tmp_path):
    import panergos_cli.config as config_mod

    def _boom(*a, **k):
        raise RuntimeError("config unavailable")

    monkeypatch.setattr(config_mod, "load_config_readonly", _boom)
    conn = sqlite3.connect(tmp_path / "state.db")
    try:
        conn.execute("PRAGMA journal_mode=DELETE")
        # Must not raise; best-effort like every other pragma path.
        apply_durability_barriers(conn)
    finally:
        conn.close()
