"""Panergos installer entry points must remain project-owned."""

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent


def _read(relative: str) -> str:
    return (REPO_ROOT / relative).read_text(encoding="utf-8")


def test_shell_installer_targets_panergos_default_branch() -> None:
    text = _read("scripts/install.sh")
    assert 'REPO_URL_SSH="git@github.com:khajaaijaz26/panergos-agent.git"' in text
    assert 'REPO_URL_HTTPS="https://github.com/khajaaijaz26/panergos-agent.git"' in text
    assert 'BRANCH="main"' in text
    assert "panergos-agent.exampleorg.com/install.ps1" not in text
    assert "panergos-agent.exampleorg.com/install.sh" not in text
    assert 'cat > "$command_link_dir/panergos"' in text
    assert 'cat > "$command_link_dir/panergos-acp"' in text
    assert ".pre-panergos-" in text
    assert "remote get-url origin" in text


def test_powershell_installer_clone_and_zip_target_panergos() -> None:
    text = _read("scripts/install.ps1")
    assert '[string]$Branch = "main"' in text
    assert 'git@github.com:khajaaijaz26/panergos-agent.git' in text
    assert 'https://github.com/khajaaijaz26/panergos-agent.git' in text
    assert 'https://github.com/khajaaijaz26/panergos-agent/archive/' in text
    assert "panergos-agent.exampleorg.com/install.ps1" not in text
    assert 'foreach ($launcher in @("panergos", "panergos-acp"))' in text
    assert 'Join-Path $scriptsDir "panergos.exe"' in text
    assert '"pre-panergos"' in text
    assert "remote get-url origin" in text


def test_cmd_installer_downloads_panergos_powershell_entrypoint() -> None:
    text = _read("scripts/install.cmd")
    expected_installer = (
        "https://raw.githubusercontent.com/khajaaijaz26/panergos-agent/"
        "main/scripts/install.ps1"
    )
    expected_wrapper = (
        "https://raw.githubusercontent.com/khajaaijaz26/panergos-agent/"
        "main/scripts/install.cmd"
    )
    assert expected_installer in text
    assert expected_wrapper in text
    assert "panergos-agent.exampleorg.com/install.ps1" not in text


def test_user_facing_repair_paths_never_cross_install_upstream() -> None:
    paths = (
        "apps/desktop/src/app/settings/about-settings.tsx",
        "apps/desktop/electron/remote-lifecycle.ts",
        "panergos_cli/uninstall.py",
    )
    combined = "\n".join(_read(path) for path in paths)
    assert "khajaaijaz26/panergos-agent" in combined
    assert "https://github.com/khajaaijaz26/panergos-agent/releases" in combined
    assert "panergos-agent.exampleorg.com/install" not in combined


def test_browser_docker_repair_never_pulls_the_upstream_image() -> None:
    paths = (
        "panergos_cli/tools_config_post_setup.py",
        "tools/browser_tool_session.py",
        "tools/browser_tool_lightpanda_fallback.py",
    )
    combined = "\n".join(_read(path) for path in paths)
    assert "recommended_update_command_for_method" in combined
    assert "docker pull ghcr.io/khajaaijaz26/panergos-agent" not in combined


def test_public_install_guides_never_route_to_upstream_artifacts() -> None:
    paths = (
        "README.md",
        "README.es.md",
        "README.zh-CN.md",
        "README.ur-pk.md",
        "website/docs/index.mdx",
        "website/docs/getting-started/installation.md",
        "website/docs/getting-started/quickstart.md",
        "website/docs/getting-started/platform-support.md",
        "website/docs/getting-started/updating.md",
        "website/docs/user-guide/desktop.md",
        "website/docs/user-guide/docker.md",
        "website/docs/user-guide/windows-native.md",
        "website/docs/user-guide/windows-wsl-quickstart.md",
    )
    combined = "\n".join(_read(path) for path in paths)

    assert "raw.githubusercontent.com/khajaaijaz26/panergos-agent/main" in combined
    assert "panergos-agent.exampleorg.com/install" not in combined
    assert "panergos-agent.exampleorg.com/desktop" not in combined
    assert "docker pull khajaaijaz26/panergos-agent" not in combined
