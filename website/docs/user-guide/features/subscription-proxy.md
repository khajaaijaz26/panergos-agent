---
sidebar_position: 15
title: "OAuth Proxy"
description: "Expose an authenticated OpenAI-compatible OAuth provider to local applications"
---

# OAuth Proxy

The proxy is a small local HTTP server for applications that speak the
OpenAI-compatible API. It attaches a configured OAuth credential to each
upstream request, refreshes that credential when supported, and passes response
streams through unchanged. It does not run the agent loop, tools, memory, or
skills.

Use the [API server](./api-server.md) when an application should talk to the
full Panergos agent. Use the proxy only when it needs raw model inference from
a supported OAuth provider.

## Quick start

1. Sign in to a supported OAuth provider. For example:

   ```bash
   panergos auth add xai-oauth
   ```

2. Review the adapters available in your installation, then start the proxy:

   ```bash
   panergos proxy providers
   panergos proxy start
   ```

3. Point the local application at the proxy:

   ```text
   Base URL: http://127.0.0.1:8645/v1
   API key:  any non-empty placeholder
   Model:    provider/model-id
   ```

The client-supplied bearer is ignored; the proxy attaches the selected
provider credential. Choose a model ID currently advertised by that provider.

Check credential and adapter readiness with:

```bash
panergos proxy status
```

## Supported surface

The exact paths depend on the selected adapter. OpenAI-compatible adapters may
expose chat completions, text completions, embeddings, and model listing. Other
paths return a clear `404` rather than being forwarded speculatively.

For an application such as OpenViking, Karakeep, Open WebUI, or LobeChat, use
the same local base URL and a non-empty placeholder API key. Example:

```json
{
  "provider": "openai",
  "model": "provider/model-id",
  "api_base": "http://127.0.0.1:8645/v1",
  "api_key": "unused-local-placeholder"
}
```

## Network safety

The proxy binds to `127.0.0.1` by default. Binding it to `0.0.0.0` lets other
machines consume the selected provider credential and quota. If remote access
is required, put the proxy behind a firewall, VPN, or authenticated reverse
proxy. The proxy does not log request bodies, but the upstream provider's own
retention and rate-limit policies still apply.

## Adapter development

Adapters live under `panergos_cli/proxy/adapters/` and implement the
`UpstreamAdapter` interface. A provider whose protocol is not OpenAI-compatible
needs an explicit translation layer; the proxy does not guess or silently
transform incompatible payloads.
