---
sidebar_position: 2.5
title: "Platform Support"
description: "Which operating systems and source distribution methods Panergos Agent supports."
---

# Platform Support

Panergos Agent 0.1 is distributed from source. Prebuilt desktop installers and container images are not published yet.

---

## Tier 1

We strive to never break installations and updates for these. Issues & regressions in Tier 1 are our first priority and take precedence over other platforms.

| OS / Architecture                                                             | Installation methods                                                                                                           | Notes                                                                                                                                                     |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **macOS** (Apple Silicon)                                                     | [`install.sh`](./installation.md#linux--macos--wsl2--android-termux)                                                          | Run `panergos desktop` to build the desktop app from the managed checkout.                                                                                |
| [**Windows 10 / 11**](../user-guide/windows-native.md) (x86_64, aarch64)      | [`install.ps1`](./installation.md#windows-native)                                                                              | A few features are [not available](../user-guide/windows-native.md#feature-matrix).                                                                       |
| **Linux / [WSL2](../user-guide/windows-wsl-quickstart.md)** (x86_64, aarch64) | [`install.sh`](./installation.md#linux--macos--wsl2--android-termux)                                                           | We test on the latest Ubuntu and WSL2. If your distro has glibc, systemd, and follows the Filesystem Hierarchy Standard, it's likely to work pretty well. |

---

## Tier 2

These platforms are maintained in-tree only as a best effort.
Releases may break them, and we can't promise we'll fix them promptly when they break.

PRs will be accepted to fix issues with them, but they will take precedence below fixing issues with Tier 1 platforms.

| OS / Architecture              | Installation methods                                                 | Notes                                                                        |
| ------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Android (Termux)** (aarch64) | [`install.sh`](./installation.md#linux--macos--wsl2--android-termux) | A few features are [not available](./termux.md#known-limitations-on-phones). |
| **Nix** (MacOS, Linux, NixOS)  | [`install.sh`](./nix-setup.md)                                       | Breaks often due to node.js packaging woes. Best of luck~! &lt;3             |
| **Local Docker build** (x86_64, aarch64) | [Build from source](../user-guide/docker.md#quick-start) | No published Panergos image exists in 0.1. |

## Unsupported

These platforms and distribution methods are **not** supported.
We suggest that you migrate to a supported distribution method or platform.
They may be broken right now, they may break more in the future.
PRs to fix them will _not_ be accepted, and any code that keeps compatibility with them may be removed at any point.

- installs via the AUR (we might upstream patches if it helps out &lt;3)
- macOS on x86 (Intel) processors
- installs via `pypi` (e.g. `uv tool install panergos-agent`, `pip install panergos-agent`, etc.)
- installs via `brew` (`brew install panergos-agent`)

If you are using an unsupported distribution method, please read the [the installation guide](./installation.md) to learn how to switch to a supported one.
