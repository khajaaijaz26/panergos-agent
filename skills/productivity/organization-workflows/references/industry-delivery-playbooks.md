# Industry delivery playbooks

Use this reference to turn a company or client outcome into a bounded delivery path. It coordinates existing skills, tools, connected accounts, and accountable people; it does not create capabilities or authority that are absent from the current session.

## Operating contract

For every route:

1. Define the outcome, users, acceptance criteria, budget ceiling, deadline, jurisdiction, data classification, owner, and system of record.
2. Inventory the repository, source material, installed skills, available tools, connected accounts, credentials, permissions, and target environments. Mark each required capability `ready`, `read_only`, `not_connected`, `missing_permission`, or `handoff_only`.
3. Create one work package with milestones, department owners, dependencies, risks, approval gates, evidence, and a resumable handoff.
4. Draft or build with the named domain routes below. Test the real artifact or workflow before asking for approval.
5. Execute only the approved external writes. Read the destination back and record provider IDs, URLs, versions, receipts, and observed results.

If a required route is unavailable, produce the best reviewable artifact and a precise handoff. Never report `deployed`, `published`, `paid`, `filed`, or `released` without destination evidence.

## Route matrix

| Industry or delivery | End-to-end work | Existing routes |
|---|---|---|
| Software and product | Discovery, requirements, architecture, implementation, tests, security review, release, observability, support handoff | `read_file`, `search_files`, `patch`, `terminal`, `test-driven-development`, `systematic-debugging`, `sdlc-review`, repository/project tools |
| Websites and web apps | Research, UX, design system, frontend/backend work, accessibility, performance, QA, hosting, domain and analytics handoff | `popular-web-designs`, repository tools, browser tools, `publish-site` when installed |
| Mobile and desktop apps | Product brief, platform design, implementation, device testing, packaging, signing, configured store submission or a submission-ready handoff | Repository tools, `terminal`, accessible platform SDKs, browser tools, and connected store accounts |
| Games and interactive work | Game brief, engine/project setup, vertical slice, assets, gameplay systems, performance, device QA, packaging, and configured distribution or publisher handoff | Repository tools, `terminal`, creative skills, and `unreal-mcp` when installed and configured |
| Education and research | Curriculum, teaching material, assessment drafts, school/university operations, analysis, accreditation and research administration | The education roles in `roles-and-departments.md`, `docx`, `pdf`, `powerpoint`, `xlsx`, and configured LMS/SIS/research tools |
| Film, video and media | Brief, script, storyboard, shot/asset plan, generated or imported media, assembly/editing, audio, captions, QC, and an upload-ready or configured delivery | `kanban-video-orchestrator`, `hyperframes`, `ai-presenter-video`, enabled `video_generate` providers, and other installed creative routes |
| Digital marketing | Research, campaign brief, channel plan, asset production, review, publication, measurement and iteration | `digital-marketing`, `humanizer`, media-generation skills, analytics, and configured publishing accounts |
| Freelance and client services | Discovery, proposal/SOW draft, milestones, delivery, change control, acceptance, invoice handoff and portfolio closeout | Documents, spreadsheets, email/calendar, project tools, and this skill's work package |
| Finance and corporate operations | Budget/forecast drafts, analysis, reconciliation, close, procurement, HR, legal/compliance and executive reporting | Department routes in `roles-and-departments.md`, `xlsx`, documents, and configured finance/ERP/HR/procurement tools |
| Whole-company programs | Portfolio plan, cross-department dependencies, operating cadence, approvals, evidence roll-up and executive decision pack | This skill, `delegate_task`, `panergos_mission` when available, and the domain routes above |

Optional skills must be installed before use. A name in this table is a route, not proof that its runtime, account, or provider is available.

## Delivery playbooks

### Software, websites, apps, and games

1. **Discover:** define users, problem, platforms, non-functional requirements, data and threat boundaries, success metrics, and release targets.
2. **Plan:** inspect the existing project before choosing a stack. Record architecture, interfaces, migrations, test levels, accessibility, performance budgets, release stages, and rollback.
3. **Design:** create reviewable flows and visual direction. For web work, use `popular-web-designs` where appropriate; for games, validate the core loop with a vertical slice before scaling content.
4. **Build:** use `read_file`, `search_files`, `patch`, and `terminal` against the real repository. Keep secrets outside source control and preserve the project's conventions.
5. **Verify:** run the project's real checks plus unit, integration, user-flow, accessibility, security, performance, device/browser, save-data, and upgrade tests that apply. Use `test-driven-development`, `systematic-debugging`, and `sdlc-review` rather than claiming quality from generated code alone.
6. **Release:** follow the release flow below. A successful local build is `built`, not `released`.
7. **Operate:** verify telemetry and customer-visible behavior, record incidents and feedback, and hand off runbooks, rollback, support ownership, and the next milestone.

For Unreal projects, use `unreal-mcp` only when that optional skill and its editor bridge are configured. Other engines, mobile SDKs, desktop packagers, and build systems may be driven through `terminal` only when an accessible official CLI exists; GUI-only steps become an explicit handoff. Do not claim an engine or platform integration that is not present.

### Education and research

Use the education roles and evidence boundaries in `roles-and-departments.md`. Keep learning objectives, curriculum/policy versions, accessibility, privacy, safeguarding, sources, reviewer, and learner-impact decisions explicit. The accountable educator or institution retains grading, admissions, discipline, accommodations, safeguarding, research-ethics, funding, and publication decisions.

### Film, video, and media

1. Record the audience, format, duration, distribution target, creative brief, budget, schedule, and rights owner.
2. Build a source-and-rights register covering footage, music, voice, likeness, locations, fonts, trademarks, releases, and generated assets.
3. Produce script, storyboard, shot/asset list, captions, audio plan, and review cuts from generated or imported media through installed creative routes; generation requires an enabled provider.
4. Check continuity, factual claims, audio levels, captions, accessibility, aspect ratios, codecs, frame rate, loudness, and destination limits on the rendered deliverable.
5. Obtain the rights holder's approval before public release. A rendered file is not proof of distribution; capture the destination URL or asset ID after upload and read-back.

### Digital marketing

Route campaign work through `digital-marketing`. Tie every channel and asset to an approved audience, claim source, destination, tracking plan, budget ceiling, schedule, and success metric. Public posting, bulk sends, audience upload, tracking changes, and paid spend require exact approval and provider evidence.

### Freelance and client services

1. Convert discovery into a proposal or statement-of-work draft with scope, exclusions, milestones, assumptions, dependencies, acceptance criteria, price basis, change control, communication cadence, and ownership/rights terms.
2. Start work only against the approved scope. Give each milestone a versioned deliverable, evidence, review window, and client decision.
3. Record changes before implementing them; show schedule, cost, risk, and acceptance impact for approval.
4. Prepare time, expense, acceptance, and invoice-support evidence, but do not sign terms, issue a binding invoice, charge a client, move money, or make tax/accounting judgments without the authorized human and configured system.
5. Close with accepted artifacts, source/access handoff, operating instructions, unresolved items, retention/deletion obligations, and portfolio permission.

### Finance and corporate operations

Use the department routes in `roles-and-departments.md` and preserve separation of duties. Panergos may prepare calculations, reconciliations, evidence packs, drafts, and approved system entries through a configured route; it must not self-approve or perform live financial transfers, trading, tax filing, binding commitments, employment decisions, or regulated judgments. The named finance, legal, HR, security, or executive authority owns those decisions and their exact external execution.

### Whole-company coordination

Create a portfolio view with one accountable sponsor, measurable outcomes, department work packages, provider/consumer dependencies, critical path, budget and capacity assumptions, decision dates, risks, and evidence roll-up. Delegate bounded deliverables, never authority. Preserve department-level dissent and source gaps in executive summaries, and resume from the latest verified handoff rather than rereading or replaying completed work.

## Release and deployment flow

### 1. Establish the release target

Record the exact product, version, commit/build, environment, regions, distribution channel, rollout audience, owner, approval path, rollback, and success/stop conditions. Identify whether the target supports automation through an authenticated CLI/API or requires an authorized browser/portal handoff.

### 2. Verify prerequisites

Before release, verify the connected developer or publisher account, role permissions, organization identity, project/app registration, package identifiers, domains, certificates, signing keys, profiles, secrets, target SDK/toolchain, privacy and legal metadata, content rights, tax/banking setup where required, and any provider or program fees. Keep credentials and signing material in the platform's approved secret/key store.

Never bypass identity checks, security challenges, platform policy, review, notarization, certification, age rating, export compliance, or account restrictions. Stop for CAPTCHA, multi-factor confirmation, contract acceptance, declarations, payment, or another step that requires the account owner.

### 3. Build and qualify the candidate

Create a versioned release candidate from a clean commit. Run target-specific tests, scans, signing verification, install/upgrade/uninstall checks, accessibility and privacy checks, and a smoke test on the packaged artifact. Record artifact hashes, symbols/source maps, release notes, store assets, test evidence, known limitations, and rollback.

### 4. Approve the immutable release

Show the accountable human the exact artifact/version, destinations, listing copy, screenshots/media, permissions/data declarations, audience/rollout, pricing, availability, legal declarations, and known risks. Record approval before signing, public deployment, store submission, price changes, paid services, or production migration.

### 5. Publish or submit through the available route

| Target | Execution route and required boundary |
|---|---|
| Web or cloud | Use `publish-site` for supported static hosts, or the project's configured deployment pipeline for server runtimes. Requires authenticated infrastructure, approved secrets, domain/DNS authority, environment configuration, and rollback. |
| Desktop direct download | Use the project's installed packager and signing/notarization tooling through `terminal`. Requires platform certificates, update-channel ownership, malware/security checks, hosting, and an approved release page. |
| Apple App Store | Use the installed Apple toolchain and the authorized App Store Connect account. Membership, identifiers, certificates/profiles, signing, privacy/export declarations, listing assets, pricing, territory choices, agreements, possible fees, submission, and Apple review remain provider/account-owner steps. |
| Google Play | Build and sign the approved Android App Bundle with the installed Android toolchain and submit through the authorized Play Console route. Account setup, app signing, testing tracks, content/privacy declarations, listing assets, pricing, regions, possible fees, submission, and Google review remain provider/account-owner steps. |
| Microsoft or other desktop stores | Use the store's official packager/portal or configured API with the authorized publisher account. Identity, signing, product registration, policies, listing, pricing, fees where applicable, certification, and review still apply. |
| PC game stores | Use the configured partner portal/SDK for the chosen store. Partner agreements, build depots, achievements/services, store assets, rights, ratings, pricing, taxes, fees/revenue terms, review, and release controls belong to the publisher account. |
| Console games | Produce the approved build and handoff only through an accepted developer program and its official SDK/hardware. Platform access, certification, ratings, security, contracts, fees, and release approval cannot be bypassed. |

Browser automation may assist an already authenticated, permitted flow, but it must not extract credentials, evade security controls, or turn a missing API/permission into a claimed integration.

### 6. Verify the destination

Read the deployment or submission back from the provider. Record target, account, version/build, provider ID, URL, status (`draft`, `processing`, `in_review`, `rejected`, `ready`, or `released`), timestamp, rollout, and errors. `submitted` and `in_review` are not `released`.

### 7. Operate, roll back, and hand off

When the connected deployment system exposes them, run post-release smoke checks, monitor the declared health and business metrics, and pause or roll back when stop conditions trigger. Otherwise hand those operations to the named owner. Record the observed result and store a resumable handoff with support owner, provider links, rollback version, incidents, reviews still pending, and operations that must not be replayed.

## Verification

- [ ] Every claimed capability maps to an installed skill/tool or configured account; gaps are `handoff_only`.
- [ ] The work package covers discovery, build/draft, review, execution, evidence, and the next owner.
- [ ] Software and media artifacts have real test/QC evidence and version identifiers.
- [ ] Client scope, changes, acceptance, rights, and invoice-support evidence are recorded.
- [ ] No payment, transfer, signing, filing, binding commitment, or regulated decision was self-approved.
- [ ] Every deployment has account/permission, signing/credential, fee/contract, privacy/legal, and review prerequisites checked as applicable.
- [ ] Store submissions distinguish `submitted`, `in_review`, and `released`, with provider read-back evidence.
- [ ] The final handoff identifies blockers, rollback, pending reviews, next action, and operations that must not be replayed.
