"""ensure_panergos_home is memoized per home path (perf: it runs on every
load_config), but a deleted home must still be recreated on the next call."""

import shutil

import pytest

from panergos_cli import config as cfg


def test_repeat_calls_are_memoized_but_deleted_home_is_recreated(tmp_path, monkeypatch):
    home = tmp_path / ".panergos"
    monkeypatch.setenv("PANERGOS_HOME", str(home))

    cfg.ensure_panergos_home()
    assert (home / "sessions").is_dir()

    # Memoized: a second call must not recreate a removed SUBDIR (the fast
    # path only re-checks the home root)…
    shutil.rmtree(home / "sessions")
    cfg.ensure_panergos_home()
    assert not (home / "sessions").exists()

    # …but a vanished HOME re-runs the full walk and restores the skeleton.
    shutil.rmtree(home)
    cfg.ensure_panergos_home()
    assert (home / "sessions").is_dir()


def test_distinct_home_paths_each_get_the_skeleton(tmp_path, monkeypatch):
    first = tmp_path / "a" / ".panergos"
    second = tmp_path / "b" / ".panergos"

    monkeypatch.setenv("PANERGOS_HOME", str(first))
    cfg.ensure_panergos_home()

    # Profile switch: PANERGOS_HOME moves → the new path is ensured too.
    monkeypatch.setenv("PANERGOS_HOME", str(second))
    cfg.ensure_panergos_home()

    assert (first / "logs").is_dir()
    assert (second / "logs").is_dir()


@pytest.mark.windows_only
def test_windows_case_alias_is_memoized(tmp_path, monkeypatch):
    home = tmp_path / ".panergos"
    monkeypatch.setenv("PANERGOS_HOME", str(home))
    cfg.ensure_panergos_home()

    monkeypatch.setenv("PANERGOS_HOME", str(home).swapcase())
    monkeypatch.setattr(
        "panergos_cli.config_home.initialize_home",
        lambda *_args: pytest.fail("same Windows path was initialized twice"),
    )

    cfg.ensure_panergos_home()


@pytest.mark.windows_only
def test_windows_private_acl_is_not_rewritten(tmp_path, monkeypatch):
    import win32security

    cfg._secure_windows_path(tmp_path, directory=True)
    descriptor = win32security.GetNamedSecurityInfo(
        str(tmp_path), win32security.SE_FILE_OBJECT,
        win32security.DACL_SECURITY_INFORMATION,
    )
    assert descriptor.GetSecurityDescriptorControl()[0] & win32security.SE_DACL_PROTECTED
    assert descriptor.GetSecurityDescriptorDacl().GetAceCount() == 2
    with monkeypatch.context() as patch:
        patch.setattr(
            win32security,
            "SetNamedSecurityInfo",
            lambda *_args: pytest.fail("matching private ACL was rewritten"),
        )
        cfg._secure_windows_path(tmp_path, directory=True)

    def fail_read(*_args):
        raise RuntimeError("read failed")

    calls = []
    with monkeypatch.context() as patch:
        patch.setattr(win32security, "GetNamedSecurityInfo", fail_read)
        patch.setattr(
            win32security,
            "SetNamedSecurityInfo",
            lambda *args: calls.append(args),
        )
        cfg._secure_windows_path(tmp_path, directory=True)

    assert calls and calls[0][0] == str(tmp_path)
