---
sidebar_position: 3
title: Model quick-start
description: Auto-detect a local model or connect Claude and OpenAI-compatible endpoints with one command.
---

# Model quick-start

Panergos can reuse a model server that is already running, without asking you to
manually copy ports or model IDs:

```bash
panergos model --quick
```

The command reports the detected memory/backend, then checks the existing
Panergos-managed llama.cpp runtime, Ollama, LM Studio, and llama.cpp. One ready
model is selected immediately; multiple models get one picker. For an unattended
choice, use `--yes`, or make the choice explicit:

```bash
panergos model --quick --provider local --model qwen3:8b
```

To have Panergos install a verified llama.cpp runtime and choose a model that
fits the machine, open the one-click Local Models screen:

```bash
panergos desktop --local
```

## Claude / Anthropic

Reuse an existing Anthropic API key or run the authorized sign-in flow:

```bash
panergos model --quick --provider anthropic
panergos model --quick --provider anthropic --model YOUR_CLAUDE_MODEL
```

Account access and provider charges still apply. Anthropic's current Claude Code
documentation says Claude Code requires an eligible paid or Console account; the
free Claude plan does not include it. See [Anthropic's setup and authentication
requirements](https://code.claude.com/docs/en/getting-started).

## Any OpenAI-compatible server or cloud endpoint

Point Panergos at a server that exposes the OpenAI-compatible model and Chat
Completions endpoints:

```bash
# Keyless local/LAN server
panergos model --quick \
  --provider openai-compatible \
  --base-url http://127.0.0.1:8000/v1 \
  --model my-tool-model

# Hosted or private endpoint: pass the environment-variable NAME, not its secret
export MY_MODEL_API_KEY='...'
panergos model --quick \
  --provider openai-compatible \
  --base-url https://models.example.com/v1 \
  --key-env MY_MODEL_API_KEY \
  --model owner/model
```

Panergos stores only the environment-variable name in `config.yaml`; it does not
copy the secret into the file or a command argument. If `/models` is available,
the model can be selected automatically.

For a hosted, GPU-free trial route, OpenRouter currently exposes the
`openrouter/free` router. Create an OpenRouter key, keep it in your environment,
and connect it through the same standard endpoint:

```bash
export OPENROUTER_API_KEY='...'
panergos model --quick \
  --provider openai-compatible \
  --base-url https://openrouter.ai/api/v1 \
  --key-env OPENROUTER_API_KEY \
  --model openrouter/free
```

Free hosted capacity is not unlimited: model availability, rate limits, and
provider data policies can change. Review the current [free-model
collection](https://openrouter.ai/collections/free-models) and [privacy/provider
controls](https://openrouter.ai/docs/features/provider-routing) before sending
sensitive work.

This route works with local servers, a server on another machine, or a hosted
gateway. Ollama documents its local OpenAI-compatible URL as
`http://localhost:11434/v1`; LM Studio exposes OpenAI- and Anthropic-compatible
APIs from its local server; and llama.cpp ships an OpenAI-compatible HTTP server.
See the current primary documentation for [Ollama](https://docs.ollama.com/api/openai-compatibility),
[LM Studio](https://lmstudio.ai/docs/developer/core/server), and
[llama.cpp](https://github.com/ggml-org/llama.cpp). Official OpenAI tooling also
documents selecting a [custom API base URL](https://developers.openai.com/api/reference/cli).

## What "free and local" actually means

Local inference has no per-token API bill after model weights are downloaded,
but it still consumes CPU/GPU time, RAM, storage, electricity, and download
bandwidth. A GPU is optional for small quantized models; CPU-only inference is
supported and is usually slower. llama.cpp explicitly supports CPU builds and
CPU+GPU hybrid inference.

The agent also needs a model/runtime combination with reliable tool calling.
An arbitrary chat-only model may answer text but cannot reliably edit files or
run tools. "OpenAI-compatible" describes an API protocol, not a guarantee that
every model has enough context, tool-use quality, or hardware capacity.
