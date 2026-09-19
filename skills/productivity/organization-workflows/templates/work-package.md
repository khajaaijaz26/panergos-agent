# Organization work package and resumable handoff

Copy this template into the user's approved system of record. Omit unused fields, but keep the four stages separate. Store no secrets and only the minimum necessary personal or confidential data.

## Identity and charter

- `work_id`:
- `version`:
- `status`: active | blocked | accepted | closed
- `scope`: individual | manager | department | executive
- `department`:
- `objective`:
- `acceptance_criteria`:
- `accountable_human`:
- `preparer`:
- `reviewer`:
- `executor`:
- `decision_authority`:
- `deadline_and_timezone`:
- `system_of_record`:
- `connected_account_identity`:
- `permissions_verified_at`:
- `data_classification_and_policy`:

## 1. Draft

- Authoritative sources and versions:
- Facts and citations:
- Calculations and checks:
- Assumptions:
- Conflicts or unknowns:
- Proposed artifacts:
- Proposed external actions:
- Requested reviewer and decision:

## 2. Review

For each review, record:

- Reviewer identity and role:
- Decision: approved | rejected | changes requested | unresolved
- Exact artifact/action/batch covered:
- Target account, audience, recipient, or resource:
- Amount/currency/payload when applicable:
- Conditions, exclusions, expiry, or policy reference:
- Recorded at and source record:

### High-impact approval checklist

- [ ] Money movement or commitment approved, or not applicable
- [ ] Contract/signature/terms approved, or not applicable
- [ ] Employment decision approved with qualified HR/legal review, or not applicable
- [ ] Account/role/credential/permission change approved, or not applicable
- [ ] External send/post/file/publication approved, or not applicable

## 3. Execute

For each approved action, record:

- Stable action or idempotency key:
- Exact approval reference:
- Provider and active account:
- Target and intended effect:
- Preflight state:
- Attempt time and provider result:
- Ambiguous outcome check before retry:
- Rollback or recovery path:

## 4. Evidence

- Provider record/message/event IDs:
- Stable links and timestamps:
- Relevant read-back or before/after values:
- Acceptance checks:
- Failed, partial, or unknown results:
- Evidence reviewer and time:
- Final decision: accepted | continue | blocked

## Resumable handoff

- `work_id` and `version`:
- Last verified at:
- Current stage:
- Completed and evidenced:
- Pending review:
- Approved but not executed:
- Blocked and why:
- Next safe action:
- Next owner:
- Approval scope still valid:
- Operations that must not be replayed:
- Source and evidence links:
- Mission/state version if used:
- Context that must be re-verified on resume:

On resume, verify this handoff against the current system of record before executing anything.
