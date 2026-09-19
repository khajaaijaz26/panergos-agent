---
title: "Relay Connector Contract"
description: "Version 1 wire, authentication, and session contract for independent Panergos relay connectors"
---

# Relay Connector Contract

This is the experimental version-1 contract between Panergos and an
independently operated messaging connector. The gateway is always the WebSocket
client. The connector owns platform credentials and APIs; the gateway receives
normalized events and sends semantic actions.

Version-1 evolution is additive. A connector may add optional fields and
operations, but must not reinterpret an existing field. A breaking change needs
a new `contract_version`.

## 1. Connection, framing, and authentication

### Endpoint and framing

The gateway normalizes an `http(s)` or `ws(s)` connector base URL to
`ws(s)://<connector>/relay` and dials it. Both peers send UTF-8 JSON objects,
each terminated by `\n`. A WebSocket message may contain several complete
frames or part of one frame, so receivers must buffer through the newline.

Every frame has a string `type`. Unknown connector-to-gateway frame types are
ignored. A malformed JSON line is skipped without terminating the connection.

### WebSocket upgrade bearer

An enrolled gateway authenticates the WebSocket upgrade with:

```http
Authorization: Bearer <token>
```

The token algorithm is byte-for-byte defined as:

```text
exp     = current Unix seconds + 300
signed  = gateway_id + ":" + exp
sig     = lowercase hex HMAC-SHA256(key=UTF8(secret), message=UTF8(signed))
token   = unpadded base64url(UTF8(signed + ":" + sig))
```

An `exp` of `0` means no expiry, although the WebSocket upgrade token uses a
300-second TTL. The connector verifies against its active secret-rotation list.
The bearer, secret, platform credentials, and capability values must never be
placed in relay frames or logs.

The connector closes an unauthorized connection with code `4401`. Reason
`expired` means the bearer expired and is retryable. For an unqualified `4401`
after a successful handshake, the gateway retries once with a newly minted
token; a second `4401` on that fresh-token connection is treated as revocation
and reconnect stops.

### Enrollment

Enrollment is an HTTP control-plane operation, not a WebSocket frame. A gateway
without a pinned relay secret may obtain an OIDC or ambient workload bearer and
send `POST /relay/provision` with:

```json
{
  "gatewayId": "gw-worker-1",
  "platform": "discord",
  "botId": "app-shared",
  "gatewayEndpoint": "",
  "routeKeys": [],
  "instanceId": "optional-instance",
  "wakeUrl": "optional-wake-url",
  "displayName": "optional-name"
}
```

`instanceId`, `wakeUrl`, and `displayName` are omitted when absent. The
connector derives the tenant from the bearer, never from the body. It may return
`gatewayId`, `tenant`, `routeKeys`, `secretIssued`, and, only when the caller is
allowed to receive new credential material, `secret` and `deliveryKey`.

## 2. CapabilityDescriptor

The gateway sends one `hello` for every `(platform, botId)` identity carried by
the connection. The first identity is the default for untagged outbound frames.
The connector answers each hello with a descriptor for that identity.

Gateway to connector:

```json
{"type":"hello","platform":"discord","botId":"app-shared","command_manifest":[]}
```

`command_manifest` is optional and currently appears only on Discord hellos. It
is additive registration data; connectors that do not support it ignore it.

Connector to gateway:

```json
{
  "type": "descriptor",
  "descriptor": {
    "contract_version": 1,
    "platform": "discord",
    "label": "Discord",
    "max_message_length": 2000,
    "supports_draft_streaming": false,
    "supports_edit": true,
    "supports_threads": true,
    "markdown_dialect": "discord",
    "len_unit": "chars"
  }
}
```

The first descriptor completes the connection handshake. Descriptors are fixed
for that connection and keyed by `platform` for per-platform capability checks.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `contract_version` | integer | yes | Contract version; currently `1`. |
| `platform` | string | yes | Platform identifier used for routing. |
| `label` | string | yes | Human-readable platform label. |
| `max_message_length` | integer | yes | Positive outbound message limit. |
| `supports_draft_streaming` | boolean | yes | Draft updates can stream in place. |
| `supports_edit` | boolean | yes | Sent messages can be edited. |
| `supports_threads` | boolean | yes | Thread identifiers are supported. |
| `markdown_dialect` | string | yes | Connector markdown dialect. |
| `len_unit` | string | yes | Length unit: `chars` or `utf16`. |
| `emoji` | string | no | Display emoji; defaults to a plug. |
| `platform_hint` | string | no | Optional platform guidance for the agent. |
| `pii_safe` | boolean | no | Whether platform metadata is safe to surface. |
| `supports_context` | boolean | no | Connector can attach read-only channel context. |
| `supports_inchannel_continuable` | boolean | no | Scheduled work can continue in the channel. |
| `supports_block_formatting` | boolean | no | Native block formatting is available. |
| `supported_ops` | array of strings | no | Semantic outbound operations implemented by this identity. |

Unknown descriptor fields are ignored. Missing optional fields use conservative
defaults. Invalid or non-positive `max_message_length` becomes `4096`. Missing
or malformed `supported_ops` selects the legacy set: `send`, `edit`, `typing`,
and `follow_up`. New operations must be advertised explicitly.

## 3. Sessions and inbound delivery

### 3.1 Inbound frame

The connector sends a normalized event:

```json
{
  "type": "inbound",
  "event": {
    "text": "hello",
    "message_type": "text",
    "message_id": "m-1",
    "source": {
      "platform": "discord",
      "chat_id": "channel-1",
      "chat_type": "channel",
      "user_id": "user-1",
      "scope_id": "guild-1"
    }
  }
}
```

`event.text`, `event.message_type`, and `event.source` are the normal message
surface. Supported message types are `text`, `location`, `photo`, `video`,
`audio`, `voice`, `document`, `sticker`, and `command`; an unknown value falls
back to `text`.

Optional event fields are:

- `message_id` and `reply_to_message_id`;
- `reply_to: {text, author, is_own}`;
- `media_urls`, plus `media` entries containing `url`, `mime`, and optional
  `kind`;
- `context`, an oldest-to-newest list of `{text, source}` reference messages;
- `prompt_response`, a structured prompt answer such as
  `{prompt_id, option_id, label?, prompt_message_id?}`.

### 3.2 Session source

The connector must keep routing discriminators stable. The gateway, not the
connector, derives the session key.

| Source field | Required | Session meaning |
| --- | --- | --- |
| `platform` | yes | Underlying platform, not `relay`. |
| `chat_id` | yes | Stable destination identity. |
| `chat_type` | no | `dm`, `group`, `channel`, or `thread`; defaults to `dm`. |
| `chat_name` | no | Display-only chat name. |
| `user_id` | no | Stable sender identity. |
| `user_name` | no | Sender name; `user_display_name` and `user_handle` are accepted presentation fallbacks. |
| `thread_id` | no | Existing thread/topic identity. |
| `chat_topic` | no | Display/context metadata. |
| `user_id_alt` | no | Stable alternate sender identity. |
| `chat_id_alt` | no | Stable alternate chat identity. |
| `scope_id` | no | Workspace/server discriminator where required. |
| `guild_id` | no | Deprecated serialized alias for `scope_id`; send `scope_id` inbound. |
| `parent_chat_id` | no | Parent channel for a thread. |
| `message_id` | no | Triggering platform message. |
| `profile` | no | Target Panergos profile in multiplex mode. |
| `auto_thread_created` | no | Connector created the destination thread. |
| `auto_thread_initial_name` | no | Original connector-created thread name. |
| `prospective_thread_id` | no | Thread that a channel message will be delivered into. |

The derived key has the shape
`agent:<profile>:<platform>:<chat_type>:...`. Chat, thread, participant, Slack
scope, and profile discriminators are added according to gateway isolation
settings. A named profile therefore cannot collide with the same chat served by
another profile. The connector must preserve these source fields across live
delivery, buffered replay, interactions, and follow-ups.

The connector cannot assert gateway trust. Fields such as
`delivered_via_upstream_relay`, `role_authorized`, and
`profile_route_rejected` are not part of the wire contract. The gateway stamps
relay trust locally only after receiving the event on the authenticated socket.

### 3.3 Buffered replay

A live inbound frame has no `bufferId`. A durable buffered frame carries one:

```json
{"type":"inbound","event":{"text":"queued","source":{"platform":"discord","chat_id":"c1"}},"bufferId":"buf-42"}
```

After its inbound handler accepts the event, the gateway replies:

```json
{"type":"inbound_ack","bufferId":"buf-42"}
```

The connector advances its durable cursor only after that acknowledgement. If
the socket closes before the ack, it may replay the same buffer entry on the
next handshake. Consumers must therefore tolerate at-least-once delivery.

## 4. Outbound actions and results

Every semantic action uses a request/response envelope:

```json
{
  "type": "outbound",
  "requestId": "opaque-correlation-id",
  "platform": "discord",
  "botId": "app-shared",
  "action": {"op":"send","chat_id":"c1","content":"hello","reply_to":null,"metadata":{}}
}
```

`platform` and its matching `botId` are included when a concrete destination
identity is selected; otherwise the connector uses the first hello identity.
The connector returns the same `requestId`:

```json
{"type":"outbound_result","requestId":"opaque-correlation-id","result":{"success":true,"message_id":"m-2"}}
```

Every result contains `success`; it may also contain `message_id`, `error`, or
operation-specific data such as `chat_info`, `thread_id`, and
`auto_thread_name`. A result lost after the action reached the wire is
ambiguous: the gateway must not assume the platform operation did not happen.

The descriptor's `supported_ops` is authoritative for non-legacy operations.
Current semantic operations include `send`, `edit`, `typing`, `follow_up`,
`draft`, `delete`, `send_media`, `prompt`, `react`, `thread_create`,
`thread_rename`, `task_card`, `task_card_stop`, and `get_chat_info`. Metadata is
an extensible object; unknown metadata keys must be ignored.

### 4.1 Token-less follow-up capabilities

Shared-identity capability values remain in the connector vault. The gateway
refers to one by session and kind:

```json
{
  "op": "follow_up",
  "session_key": "agent:main:discord:channel:c1",
  "kind": "discord.interaction_token",
  "content": "done",
  "metadata": {}
}
```

The action must not carry a token, secret, credential, or raw capability value.
The connector resolves the value under the authenticated tenant and returns
`success: false` when it is absent, expired, or tenant-mismatched.

## 5. Control and passthrough frames

### 5.1 Edge-acknowledged passthrough

For platform callbacks that require a latency-critical edge acknowledgement,
the connector validates and acknowledges the provider request, then forwards a
sanitized, byte-preserved request on the existing WebSocket:

```json
{
  "type": "passthrough_forward",
  "forward": {
    "platform": "discord",
    "botId": "app-shared",
    "method": "POST",
    "path": "/interactions/discord/app-shared",
    "headers": [["content-type", "application/json"]],
    "bodyB64": "eyJ0eXBlIjoyfQ==",
    "profile": "reviewer"
  },
  "bufferId": "optional-buffer-id"
}
```

`bodyB64` decodes to the exact request bytes and header pairs preserve arrival
order. `profile` and `bufferId` are optional. The connector remains the
platform-signature boundary; the gateway does not re-verify platform crypto.

### 5.2 Interrupts

Gateway to connector:

```json
{"type":"interrupt","session_key":"agent:main:discord:channel:c1","reason":"optional"}
```

The connector routes the request to the socket that owns that session and sends
the cancellation back to the gateway handling the turn:

```json
{"type":"interrupt_inbound","session_key":"agent:main:discord:channel:c1","chat_id":"c1"}
```

The exact `session_key` is required so one chat or participant cannot interrupt
a sibling session.

### 5.3 Going idle and durable buffering

Before deliberately closing for drain or scale-to-zero, the gateway sends:

```json
{"type":"going_idle"}
```

The connector first atomically switches that gateway instance from live
delivery to durable buffering, then answers:

```json
{"type":"going_idle_ack"}
```

Until the ack arrives, the gateway keeps reading live frames. After the ack it
may close. On reconnect, the normal hello/descriptor exchange occurs and the
connector replays buffered entries using `bufferId`; section 3.3 acknowledgements
advance the buffer cursor.

## 6. Trust and ownership boundaries

- The connector owns tenant platform tokens, signing keys, callback validation,
  decryption, provider acknowledgements, and shared-identity capability values.
- The gateway owns agent execution, authorization policy after normalized
  admission, session-key derivation, and semantic outbound intent.
- Platform secrets and raw capability values never cross into the gateway.
- The gateway authenticates the relay channel with its per-gateway secret but
  does not repeat Discord, Twilio, webhook, or other platform signature checks.
- Tenant selection comes from authenticated connector state, never a tenant
  string supplied in a frame.
- Unknown fields are ignored only for additive compatibility. Missing required
  descriptor, routing, correlation, or authentication data fails closed.

The executable gateway reference is `gateway/relay/ws_transport.py`; auth token
bytes are defined by `gateway/relay/auth.py`, descriptor fields by
`gateway/relay/descriptor.py`, and session routing by `gateway/session.py`.
