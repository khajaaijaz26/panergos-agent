from pathlib import Path


def test_windows_native_install_path_docs_match_installer() -> None:
    doc = Path("website/docs/user-guide/windows-native.md").read_text()
    install = Path("scripts/install.ps1").read_text()

    # The launchers live in the managed binary dir OUTSIDE the git checkout
    # (PANERGOS_HOME\bin, next to the managed uv) — NOT the whole venv\Scripts
    # (which would shadow the user's python, #83797) and NOT a dir inside
    # the checkout (which `panergos update`'s autostash swept off disk).
    assert "%LOCALAPPDATA%\\panergos\\bin" in doc
    assert (
        "Get-Command panergos        # should print "
        "C:\\Users\\<you>\\AppData\\Local\\panergos\\bin\\panergos.exe"
    ) in doc
    # Installer exposes $PanergosHome\bin, and must copy the launchers into it.
    assert '$panergosBin = "$PanergosHome\\bin"' in install
    assert "panergos.exe" in install and "panergos-acp.exe" in install
    # Guard against regressions to either legacy layout.
    assert '$panergosBin = "$InstallDir\\venv\\Scripts"' not in install
    assert '$panergosBin = "$InstallDir\\bin"' not in install
