# Roles and departments

Read the scope row and only the department rows needed for the current work package. These are operating boundaries, not permission grants; the connected actor and organization policy remain authoritative.

## Scope roles

| Scope | Primary role | Owns | Escalates when |
|---|---|---|---|
| Individual | Contributor or analyst | One bounded deliverable, sources, assumptions, and completion check | Authority, data, or acceptance criteria are missing |
| Manager | Team manager | Priorities, capacity, assignments, review, blockers, and team evidence | Cross-team tradeoffs or a gated decision exceeds the role |
| Department | Functional owner | Shared queue, standards, specialist review, dependencies, and consolidated status | Policy conflict, material risk, or another department owns a dependency |
| Executive | Sponsor or decision authority | Outcomes, portfolio tradeoffs, risk acceptance, and decision record | Board, regulator, owner, or another named authority must decide |

The preparer drafts, the reviewer checks, the executor performs the approved action, and the decision authority accepts the material consequence. Do not infer authority from job title alone.

## Department role pack

### Finance

- **Work:** budget and forecast drafts, variance analysis, reconciliations, close checklists, cash and management reporting.
- **Route:** `xlsx`, configured Google Sheets, documents, and available finance MCP/plugin tools.
- **Evidence:** source period, currency, ledger/report version, formulas, reconciled totals, exceptions, reviewer.
- **Gate:** a finance owner reviews accounting/tax judgments; any payment, refund, purchase, budget allocation, or financial commitment needs explicit approval.

### Human resources (HR)

- **Work:** recruiting coordination, onboarding/offboarding checklists, policy drafts, training records, and employee-case summaries.
- **Route:** documents, email/calendar, approved shared files, and a configured HR system MCP/plugin if available.
- **Evidence:** policy version, authorized source records, consent/access boundary, reviewer, effective date.
- **Gate:** hiring, termination, compensation, promotion, discipline, formal evaluation, and access changes require exact approval and qualified HR/legal review. Minimize employee data.

### Sales

- **Work:** account research, pipeline hygiene, call preparation, proposal drafts, follow-ups, and forecast rollups.
- **Route:** documents, spreadsheets, email/calendar, and a configured CRM MCP/plugin if available.
- **Evidence:** account/source links, stage definition, owner, next step, amount/currency, confidence, last verified time.
- **Gate:** sending externally, price/discount commitments, binding offers, and contract terms require approval from the appropriate owner.

### Marketing

- **Work:** campaign briefs, content drafts, editorial calendars, audience research, launch coordination, and performance summaries.
- **Route:** documents, presentations, spreadsheets, calendars, and configured publishing/analytics tools.
- **Evidence:** approved brief, audience, claim sources, asset version, channel, schedule, spend, measured window.
- **Gate:** public or customer-facing publishing, regulated claims, paid spend, and use of protected customer data require exact approval.

### Customer support

- **Work:** case triage, response drafts, escalation packages, incident updates, knowledge drafts, and trend summaries.
- **Route:** email, configured ticketing MCP/plugin tools, documents, and incident/project records.
- **Evidence:** case/thread ID, customer request, severity, policy/SLA, actions taken, read-back status, unresolved risk.
- **Gate:** customer sends, refunds/credits, account/access changes, disclosures, and destructive account actions require approval under policy.

### Operations

- **Work:** standard operating procedures, capacity and schedule plans, service reviews, incident coordination, and control checklists.
- **Route:** documents, spreadsheets, calendars, shared files, and configured tracker/MCP/plugin tools.
- **Evidence:** process/version, owner, volume and time window, dependencies, exceptions, control results, service outcome.
- **Gate:** irreversible operational changes, production-impacting actions, spend, and external commitments follow their corresponding approval gate.

### Procurement

- **Work:** requirements, vendor comparisons, request-for-information/proposal drafts, due-diligence packs, purchase requests, and renewal calendars.
- **Route:** documents/PDFs, spreadsheets, email/calendar, shared files, and configured procurement/vendor tools.
- **Evidence:** requirements, comparable quote terms, currency/tax basis, evaluation criteria, conflicts, security/legal reviews, recommendation.
- **Gate:** vendor contact, purchase orders, spend, contract acceptance, and vendor access require explicit approval by the named authority.

### Legal and compliance

- **Work:** intake, document/obligation extraction, clause and policy comparisons, evidence registers, review queues, and filing drafts.
- **Route:** `document-to-action-items`, `pdf`, `docx`, spreadsheets, controlled files, and configured matter/compliance tools.
- **Evidence:** authoritative document version, page/section citations, jurisdiction, obligation owner/date, ambiguity, qualified reviewer.
- **Gate:** this workflow is not legal advice. A qualified human reviews interpretations; signatures, accepted terms, representations, waivers, and external/regulatory filings require exact approval.

### Engineering, IT, and security

- **Work:** requirements and implementation plans, change requests, incident coordination, access reviews, asset records, runbooks, and postmortems.
- **Route:** repository/file tools, issue/project systems, documents, and configured infrastructure/security MCP/plugin tools.
- **Evidence:** environment, version/commit, ticket or incident ID, test/scan result, change window, rollback, approver, observed outcome.
- **Gate:** production changes, credential/permission changes, destructive actions, disclosure, and incident containment with user impact require the appropriate approval. Preserve evidence and least privilege.

### Product

- **Work:** discovery synthesis, problem statements, requirements, prioritization, experiments, roadmaps, release coordination, and release-note drafts.
- **Route:** documents, notes, project trackers, spreadsheets, research, and configured product/analytics tools.
- **Evidence:** source interviews/data, decision criteria, owner, dependency, success metric, experiment window, result, decision record.
- **Gate:** customer commitments, roadmap publication, experiment exposure, pricing, and external release communication require approval.

### Analytics

- **Work:** metric definitions, data-quality checks, analysis plans, recurring reports, dashboards, forecasts, and decision support.
- **Route:** `xlsx`, configured Sheets, documents/presentations, and available database/BI MCP or plugin tools.
- **Evidence:** source and query/report version, metric definition, population, time window, filters, freshness, checks, uncertainty.
- **Gate:** do not expose restricted or identifying data. Human reviewers approve material financial, employment, legal, security, or public claims derived from the analysis.

### Executive

- **Work:** decision memos, portfolio and operating reviews, board/leadership briefs, scenario comparisons, risk registers, and follow-through tracking.
- **Route:** documents, presentations, spreadsheets, calendars, and evidenced department work packages.
- **Evidence:** decision requested, options, assumptions, material risks, dissent/unknowns, functional owners, decision and follow-up record.
- **Gate:** an agent may prepare and coordinate but is not the accountable executive. Capital allocation, contracts, employment outcomes, access/risk acceptance, board material, and external publishing require the named human authority.

## Cross-functional routing

1. Assign one accountable owner; contributors do not create shared ownership by implication.
2. Give each dependency a provider, consumer, due condition, and evidence link.
3. Preserve each department's source and reviewer instead of flattening everything into an unsupported executive summary.
4. When departments disagree, record both positions and route the decision to the named authority.
5. Share the minimum data required for the receiving role; a handoff is not permission to broaden access.
