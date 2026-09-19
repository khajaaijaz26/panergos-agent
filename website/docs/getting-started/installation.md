---
sidebar_position: 2
title: "Installation"
description: "Install Panergos Agent on Linux, macOS, WSL2, native Windows, or Android via Termux"
---

# Installation

Get Panergos Agent up and running in under two minutes.

:::tip Platform Support
For the full platform support matrix (which OSes, distribution methods, and
platform-gated features are supported), see **[Platform Support](./platform-support.md)**.
:::

## Quick Install

### Desktop application (source build)

Panergos 0.1 is source-only and does not publish prebuilt desktop installers. Install the CLI below, then run `panergos desktop` to build and launch the desktop application from the managed checkout. Signed release assets, when published, will appear on the repository's [Releases page](https://github.com/khajaaijaz26/panergos-agent/releases).

### Install the CLI

Run:

#### Linux / macOS / WSL2 / Android (Termux)
```bash
curl -fsSL https://raw.githubusercontent.com/khajaaijaz26/panergos-agent/main/scripts/install.sh | bash
```

#### Windows (native)

Run in powershell:
```powershell
iex (irm https://raw.githubusercontent.com/khajaaijaz26/panergos-agent/main/scripts/install.ps1)
```

If you want to install and run Panergos Desktop after a command-line-only install, run:
```bash
panergos desktop
```

### What the Installer Does

The installer handles everything automatically — all dependencies (Python, Node.js, ripgrep, ffmpeg), the Panergos repository clone, virtual environment, global `panergos` command setup, and LLM provider configuration. By the end, you're ready to chat.

#### Install Layout

Where the installer puts things depends on whether you're installing as a normal user or as root:

| Installer                              | Code lives at                  | `panergos` binary                       | Data directory                       |
| -------------------------------------- | ------------------------------ | --------------------------------------- | ------------------------------------ |
| Per-user (git installer)               | `~/.panergos/panergos-agent/`      | `~/.local/bin/panergos`                 | `~/.panergos/`                         |
| Root-mode (`sudo curl … \| sudo bash`) | `/usr/local/lib/panergos-agent/` | `/usr/local/bin/panergos`               | `/root/.panergos/` (or `$PANERGOS_HOME`) |

The root-mode **FHS layout** (`/usr/local/lib/…`, `/usr/local/bin/panergos`) matches where other system-wide developer tools land on Linux. Panergos uses `panergos-agent` for code and `.panergos` for data.

### After Installation

Reload your shell and start chatting:

```bash
source ~/.bashrc   # or: source ~/.zshrc
panergos            # Start chatting!
```

To reconfigure individual settings later, use the dedicated commands:

```bash
panergos model          # Choose your LLM provider and model
panergos tools          # Configure which tools are enabled
panergos gateway setup  # Set up messaging platforms
panergos config set     # Set individual config values
panergos config get     # Inspect individual config values
panergos setup          # Or run the full setup wizard to configure everything at once
```

:::tip Already running Panergos on another machine?
You don't need to rebuild your setup from scratch. Restore a full backup with `panergos import` (see [Exporting Panergos to another machine](/reference/faq#exporting-panergos-to-another-machine)), or bring over a single agent with `panergos profile import` (see [Moving a single profile to another machine](/reference/faq#moving-a-single-profile-to-another-machine)). A profile export excludes credentials by design, so an export alone is not a full backup.
:::

---

## Prerequisites

**Installer:** On non-Windows platforms, the only prerequisite is **Git**. On Linux, also make sure `curl` and `xz-utils` are available (the installer downloads Node.js as a `.tar.xz` archive). The desktop app additionally requires `g++` (or `build-essential` on Debian/Ubuntu) to compile native modules. The installer automatically handles everything else:

- **uv** (fast Python package manager)
- **Python 3.11** (via uv, no sudo needed)
- **Node.js v26** (for browser automation and WhatsApp bridge; existing system Node 22.22+, 24.11+, or 26+ is used as-is)
- **ripgrep** (fast file search)
- **ffmpeg** (audio format conversion for TTS)

:::info
You do **not** need to install Python, Node.js, ripgrep, or ffmpeg manually. The installer detects what's missing and installs it for you. Just make sure `git` is available (`git --version`). On Linux, ensure `curl` and `xz-utils` are installed (`sudo apt install curl xz-utils` on Debian/Ubuntu). For the desktop app, also install `build-essential` (`sudo apt install build-essential`).
:::

:::tip Nix users
Nix is **no longer an explicitly supported install path** (best-effort only). If you already use Nix (on NixOS, macOS, or Linux), there's a dedicated setup path with a Nix flake, declarative NixOS module, and optional container mode. See the **[Nix & NixOS Setup](./nix-setup.md)** guide.
:::

---

## Manual / Developer Installation

If you want to clone the repo and install from source — for contributing, running from a specific branch, or having full control over the virtual environment — see the [Development Setup](../developer-guide/contributing.md#development-setup) section in the Contributing guide.

---

## Non-Sudo / System Service User Installs

Running Panergos as a dedicated unprivileged user (for example, a `panergos` systemd service account) is supported. The only install step that genuinely needs root is Playwright's optional `--with-deps` system-library setup.

**Recommended split (Debian/Ubuntu):**

1. **One time, as an admin user with sudo**, install the system libraries Chromium needs:
   ```bash
   sudo npx playwright install-deps chromium
   ```
   (You can run this from anywhere — `npx` will fetch Playwright on the fly.)

2. **As the unprivileged service user**, run the regular installer. It will detect the missing sudo, skip `--with-deps`, and install Chromium into the user's local Playwright cache:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/khajaaijaz26/panergos-agent/main/scripts/install.sh | bash
   ```

   If you want to skip the Playwright step entirely — for example because you're running headless and don't need browser automation — pass `--skip-browser`:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/khajaaijaz26/panergos-agent/main/scripts/install.sh | bash -s -- --skip-browser
   ```

   The installer also pre-installs [`cua-driver`](../user-guide/features/computer-use.md) so the Computer Use toolset works the moment you enable it; pass `--skip-computer-use` to opt out (it will then install on demand when you enable the tool).

3. **Make `panergos` available to the service user's shells.** The installer writes the launcher to `~/.local/bin/panergos`. System service accounts often have a minimal PATH that doesn't include `~/.local/bin`.
   ```bash
   # Option A — add to the service user's profile
   echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc

   # Option B — symlink system-wide (run as an admin)
   sudo ln -s /home/panergos/.panergos/panergos-agent/venv/bin/panergos /usr/local/bin/panergos
   ```

4. **Verify:** `panergos doctor` should now run cleanly. If you get `ModuleNotFoundError: No module named 'dotenv'`, ensure you are invoking the venv launcher at `~/.panergos/panergos-agent/venv/bin/panergos` rather than a repository source file with system Python.

5. **Running the messaging gateway from this account?** A user-level service stops at logout and does not start at boot until you enable lingering for the service user:

   ```bash
   sudo loginctl enable-linger <service-user>
   ```

   See [Messaging Gateway](/user-guide/messaging/) for the service setup itself.

The same pattern works on Arch (the installer uses pacman with the same sudo-detection logic), Fedora/RHEL, and openSUSE — those distros don't support `--with-deps` at all, so an administrator always installs the system libraries separately. The relevant `dnf`/`zypper` commands are printed by the installer.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `panergos: command not found` | Reload your shell (`source ~/.bashrc`) or check PATH |
| `API key not set` | Run `panergos model` to configure your provider, or `panergos config set OPENROUTER_API_KEY your_key` |
| Missing config after update | Run `panergos config check` then `panergos config migrate` |

For more diagnostics, run `panergos doctor`.

### Symlinked home directories and external storage

Panergos supports a symlinked `PANERGOS_HOME` and symlinked home subdirectories,
including `hooks`, `skills`, `sessions`, and `logs`. During home initialization,
existing directory links are preserved, and permissions on linked directories
(and descendants such as `logs/curator`) are left to their owner.

If a link target is missing, inaccessible, or not a directory, initialization
stops with a storage error naming the path and link target. Panergos does **not**
replace the link or create its missing target: doing so could write data onto
the local disk while an external or NAS volume is unmounted. Check the reported
link, restore the mount or correct its target, and verify access permissions
before retrying. For a deliberately new dotfiles target, create it yourself only
after confirming the intended storage is available.

`panergos doctor` reports these failures as storage problems, not invalid YAML.
Keep your existing `config.yaml`; running `panergos setup` is not the repair for an
unavailable directory. This is a directory-availability check, not a mount monitor:
an existing directory cannot establish that the intended volume is mounted.

## Install method auto-detection

Panergos auto-detects whether it was installed via the git installer, Docker, or NixOS, and `panergos update` prints the matching update command for that path. Detection uses the standard install layout (`~/.panergos/panergos-agent/`, a Docker image stamp, or a Nix store path). `panergos doctor` also surfaces the detected method.
