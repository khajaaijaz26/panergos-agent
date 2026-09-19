---
name: digital-marketing
description: Plan, create, publish, and measure digital campaigns.
version: 0.1.0
author: Khaja Aijaz (@khajaaijaz26), Panergos Agent
license: Apache-2.0
platforms: [linux, macos, windows]
metadata:
  panergos:
    tags: [Marketing, Campaigns, Content, Publishing, Analytics]
    category: productivity
    related_skills:
      [
        organization-workflows,
        social-media-content-calendar,
        xurl,
        humanizer,
        ai-presenter-video,
        kanban-video-orchestrator
      ]
---

# Digital Marketing Skill

Run a campaign from brief and channel plan through asset production, approved publication, and measured results. This skill coordinates capabilities and connected accounts; it does not invent access, silently spend money, bypass platform controls, or claim publication without provider evidence.

## When to Use

- "Launch this product across email, social, search, and our website."
- "Create the campaign images and videos, then publish the approved set."
- "Connect our available accounts and run a measurable content campaign."
- "Audit last month's funnel and prepare the next experiment."

Don't use for deceptive engagement, spam, fake reviews, impersonation, evasion of platform rules, or publication without the account owner's authority.

## Prerequisites

- Record the business objective, audience, offer, brand rules, region, budget ceiling, dates, owner, and success metric.
- Confirm rights for source media, testimonials, likenesses, voices, music, customer data, and generated assets.
- Discover accounts with `terminal` by running `panergos connect` or inspect the dashboard's Connected Platforms view. Authenticate only through the provider's setup flow or an approved secret store; never ask for a password, token, or recovery code in chat.
- Verify the active account identity, scopes, write capability, rate limits, and platform terms immediately before use. A connected account is not proof that a campaign is approved.
- Name the accountable human for public publishing, bulk sends, regulated claims, targeting, tracking, and paid spend.

## How to Run

Install with `panergos skills install official/productivity/digital-marketing`, then ask Panergos for the campaign outcome. Keep the work in one campaign package containing the brief, source register, channel plan, drafts, approvals, provider results, metrics, and next handoff.

Use only routes exposed in the current session:

| Need                            | Route                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| Account discovery and setup     | `terminal` with `panergos connect`; dashboard Connected Platforms                       |
| Research and source checks      | `web_search`, `web_extract`, `read_file`                                                |
| Copy and channel adaptation     | `humanizer`, `social-media-content-calendar`                                            |
| Images and transformations      | `image_generate`; capability depends on the selected provider/model                     |
| Video generation and production | `video_generate`, `ai-presenter-video`, `kanban-video-orchestrator`                     |
| X publishing and media upload   | `xurl` after its account is configured                                                  |
| Other destinations              | An enabled connector, plugin, MCP server, or provider API tool with write support       |
| Permitted browser fallback      | `browser_navigate` or installed computer-use tooling with an authenticated user profile |
| Department review and handoff   | `organization-workflows`; `delegate_task` for bounded parallel work                     |

Browser fallback must obey the platform's terms, use a user-authenticated profile, stop for CAPTCHA or security challenges, and never extract or print credentials. If no safe write route exists, produce an upload-ready package and mark it `handed_off`, not `published`.

## Quick Reference

### Campaign states

| State        | Meaning                                                   | Allowed next action                                    |
| ------------ | --------------------------------------------------------- | ------------------------------------------------------ |
| `planned`    | Brief, audience, channels, and metrics are defined        | Produce drafts                                         |
| `draft`      | Copy and assets exist but are unapproved                  | Review only                                            |
| `approved`   | An accountable human approved the exact batch and targets | Publish that scope                                     |
| `publishing` | A provider mutation is in progress or ambiguous           | Read back before retrying                              |
| `published`  | Provider ID, URL or delivery record was read back         | Measure                                                |
| `handed_off` | No configured write route; package was delivered          | Await external confirmation                            |
| `failed`     | Provider returned a terminal failure                      | Diagnose and request a new approval if payload changes |

### Approval gates

Exact human approval is required before public posting, bulk email/message sends, ad creation or spend, audience upload, tracking changes, customer-data use, account changes, and deletion or replacement of live content. Approval records the account, destination, payload/version, schedule, budget where relevant, and any conditions.

## Procedure

### 1. Establish the campaign charter

Record the objective, audience and exclusions, offer, funnel stage, brand voice, channels, geography, dates/timezone, budget ceiling, required claims, prohibited claims, owner, reviewers, and measurable outcome. Separate known facts from assumptions and ideas. Done when the campaign boundary and accountable decision maker are explicit.

### 2. Verify connection inventory

Inspect the live connector, plugin, MCP, and tool registries. For each requested channel record the active identity, authentication status, scopes, read/write/media/scheduling capability, rate limits, and approved fallback. Do not add a credential to a document or campaign package. Done when every channel is `ready`, `read_only`, `missing_permission`, `not_connected`, or `handoff_only`.

### 3. Build the evidence baseline

Use `web_search`, `web_extract`, configured analytics, and authoritative internal files to collect product facts, prior results, audience evidence, competitor positioning, search intent, consent constraints, and current landing-page performance. Preserve source links and query windows. Done when each material claim and baseline metric has a source or is marked unverified.

### 4. Design the funnel and measurement plan

Map awareness, consideration, conversion, retention, and referral actions to selected channels. Define content themes, landing destination, CTA, UTM convention, attribution window, event names, KPI targets, guardrail metrics, and stop conditions. Avoid dark patterns and collect only necessary data. Done when every asset and channel has a purpose and measurable outcome.

### 5. Produce channel-ready assets

Draft channel-specific copy and use `image_generate` and `video_generate` only when their live schemas advertise the required operation. Use production skills for storyboards, presenter work, captions, audio, deterministic edits, QA, and delivery formats. Record prompts, source rights, aspect ratio, duration, alt text, captions, thumbnails, and output hashes. Done when each planned placement has a versioned copy-and-media bundle or a visible blocker.

### 6. Review brand, facts, rights, and risk

Check factual support, offer terms, pricing, dates, brand consistency, accessibility, links, disclosures, privacy, consent, regulated claims, localization, media rights, and platform policy. Scan final files rather than trusting draft previews. Done when every item is `approved`, `change_requested`, or `rejected` by the required reviewer.

### 7. Approve the exact execution batch

Show the accountable human the final payloads, accounts, destinations, schedule, audience, tracking, and maximum spend. Record the exact approved version and conditions; a delegated agent cannot approve its own external action. Done when the immutable publish batch has a valid approval or remains blocked.

### 8. Publish through the connected route

Recheck identity, permission, approval, current destination state, and asset compatibility immediately before writing. Upload media first when the provider requires it, then create or schedule only the approved posts, pages, messages, or ads. Use provider idempotency or a stable request marker when available. On timeout, query before retrying. Done when each attempt has a provider response or an explicit `unknown` state.

### 9. Read back and prove publication

Fetch each resulting object from the destination. Capture the provider ID, stable URL, account, timestamp/schedule, content preview or hash, media status, spend cap, and errors. A local file, successful upload call, browser click, or queued request alone is not proof of publication. Done when every item is `published`, `handed_off`, `failed`, or `unknown` with checkable evidence.

### 10. Measure and improve

At the declared checkpoints, retrieve comparable impressions, reach, view time, clicks, conversion, cost, revenue, retention, deliverability, and unsubscribe/complaint metrics where available. Reconcile attribution limitations, compare with the baseline and guardrails, and propose the smallest next experiment. Any new spend, targeting, payload, or public mutation returns through approval. Done when results, limitations, decision, and next owner are recorded.

## Pitfalls

- Claiming universal account support when no connector exposes the requested platform.
- Treating generated media, an upload, or a clicked Publish button as provider-confirmed publication.
- Reusing one message unchanged across channels, audiences, or funnel stages.
- Placing passwords, OAuth codes, API keys, customer lists, or private analytics in prompts or handoffs.
- Retrying an ambiguous request and creating duplicate posts, sends, ads, or spend.
- Auto-optimizing paid campaigns beyond the approved budget, audience, or claims.
- Using browser automation to bypass security checks, platform rules, or missing API authorization.

## Verification

- [ ] Every destination has a verified connected identity and capability status.
- [ ] Claims, media rights, consent, privacy, accessibility, links, and disclosures were reviewed.
- [ ] Public writes, bulk sends, account changes, tracking, targeting, and spend have exact approval.
- [ ] Only the approved payload versions and destinations were executed.
- [ ] Every publication claim has provider-read-back evidence; unsupported routes say `handed_off`.
- [ ] Metrics include source, query window, attribution limits, and guardrail outcomes.
- [ ] The handoff records completed, pending, blocked, next owner/action, and do-not-replay operations.
