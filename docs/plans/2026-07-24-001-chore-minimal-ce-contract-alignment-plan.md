---
title: Minimal Compound Engineering Contract Alignment - Plan
type: chore
date: 2026-07-24
topic: minimal-ce-contract-alignment
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
---

# Minimal Compound Engineering Contract Alignment - Plan

## Goal Capsule

- **Objective:** Align FamTandem's repository-level Compound Engineering contract with the locally installed v3.20.0 plugin using the smallest configuration and instruction change set that improves future planning, execution, review, and human control.
- **Product authority:** The user-confirmed repository-system scope in this task, the installed v3.20.0 skill contracts, and `AGENTS.md` as the canonical repository instruction source.
- **Open blockers:** None within the repository-system scope. Landing must use accepted current `main` as its base, preserve the five-path CE-only boundary, and leave reconciliation of the separate `da3c4ac` product work outside this plan.

## Product Contract

### Summary

FamTandem will gain a minimal, conservative Compound Engineering v3.20.0 repository contract: a current configuration example, safe machine-local defaults, canonical workflow guidance in `AGENTS.md`, and a narrow `CLAUDE.md` authority handoff.

### Problem Frame

The installed v3.20.0 plugin expects a unified brainstorm-to-plan artifact, task and Git based execution progress, current skill names, explicit shipping gates, and consent-aware cross-model routing. FamTandem's repository has no Compound Engineering configuration example or local configuration, and its agent guidance still describes separate brainstorm artifacts, mutable plan checklists, `ce-review`, standing Cursor review, and an older linear loop. Future agents can therefore follow instructions that conflict with the installed plugin even though the broader validation-first product direction is sound.

### Key Decisions

- **Adopt a minimal v3.20 contract rather than restructure project authority.** (session-settled: user-approved — chosen over a broader strategy/current-state documentation rewrite: the repository needs operating consistency without delaying product validation.) Governs R1-R10.
- **Keep execution human-gated and native by default.** (session-settled: user-approved — chosen over standing autonomous or cross-model execution: external egress, shipping, and autonomous actions require per-run authorization.) Governs R3, R4, R7, R9.
- **Keep `AGENTS.md` canonical while preserving Claude-specific context.** (session-settled: user-approved — chosen over replacing `CLAUDE.md` wholesale: unique user-authored guidance must not be erased.) Governs R5-R8.

### Requirements

**Configuration contract**

- R1. Add `.compound-engineering/config.local.example.yaml` as a byte-current copy of the installed v3.20.0 configuration template so future maintainers can discover every supported key without guessing.
- R2. Ignore only `.compound-engineering/config.local.yaml`; the example and any future tracked project configuration must remain trackable.
- R3. Establish those active machine-local defaults in `.compound-engineering/config.local.yaml`: Markdown brainstorm, plan, and ideation outputs; enabled scoping confirmation; native `ce-work` routing; disabled PR teaching and archival; and disabled automatic PR babysitting.
- R4. Leave model elevation, cross-model peer review, and implementation-engine recipients unset so no standing model route or content egress is implied.

**Instruction authority and workflow**

- R5. Replace only the stale Compound Engineering workflow guidance in `AGENTS.md` with a proportional v3.20 lifecycle. Skills may be skipped when the scope and artifact are already settled; when brainstorming and planning are used, `ce-brainstorm` creates a requirements-only plan under `docs/plans/`, `ce-plan` enriches that same artifact, and `ce-work` consumes it after human approval.
- R6. State that execution progress belongs in the task tracker and Git history, never in plan status fields or mutable implementation checklists.
- R7. Use the current `ce-code-review` name, size review effort proportionally, require explicit human approval for shipping, deployment, hosted mutation, external contact, `lfg`, or other autonomous action, and require separate per-run disclosure and authorization before repository content reaches an external model, agent harness, or model-review provider. Invocation, configuration, or disclosure alone never authorizes egress. Local staging and commits remain bounded by the current task's authority, and merge remains a separate landing gate.
- R8. Make `CLAUDE.md` defer to `AGENTS.md` for canonical repository and Compound Engineering instructions without deleting its distinct product or Claude-specific guidance.

**Safety and verification**

- R9. Do not change product behavior, cohort-signal semantics, strategy/current-state authority, historical plans, dependencies, provider or hosted state, databases, customer data, or the relationship between `da3c4ac` and `main`.
- R10. Verify the tracked and ignored configuration behavior, instruction consistency, repository lint and typecheck health, whitespace integrity, and a read-only `ce-setup` diagnostic. Keep staging, commit, push, PR update, and merge subject to their separately authorized landing gates.

### Acceptance Examples

- AE1. **Covers R1-R4.** Given a fresh clone, the byte-current example configuration is visible to Git while `.compound-engineering/config.local.yaml` is ignored. In the current checkout, the ignored local file explicitly activates Markdown outputs, scoping confirmation, native implementation, and no standing peer route; those active values are not implied by copying the commented example verbatim.
- AE2. **Covers R5-R7.** Given a future meaningful FamTandem slice, an agent can create one requirements-only unified plan, enrich it in place, track implementation outside the plan, and route review through `ce-code-review` without interpreting approval to plan as approval to ship.
- AE3. **Covers R7.** Given a reviewer proposes an external model, agent harness, or model-review provider, repository content does not leave the current host until the recipient, scope, and privacy boundary are disclosed and the user separately authorizes that run; invocation or disclosure alone is not consent.
- AE4. **Covers R8.** Given a Claude-based session, `CLAUDE.md` imports `AGENTS.md` as canonical while all non-workflow guidance unique to `CLAUDE.md` remains present.
- AE5. **Covers R3 and R7.** Given a fresh clone without machine-local configuration, PR delivery either bootstraps explicit `auto_babysit: false` local state or passes `babysit:off`; the plugin's implicit default cannot start autonomous monitoring.

### Scope Boundaries

- No product feature or cohort-signal-integrity work.
- No `STRATEGY.md`, current-state authority restructure, or historical-plan rewrite.
- No branch switch, merge, rebase, cherry-pick, or reconciliation involving `da3c4ac`.
- No dependency, provider, hosted, database, customer, or external-model action.
- No merge, deployment, autonomous monitoring, `lfg`, or mutating dogfood run. Any commit, push, or draft-PR update is a separately authorized landing action and does not imply merge authority.

### Dependencies / Assumptions

- The locally installed Compound Engineering plugin at version 3.20.0 is authoritative for skill and configuration behavior.
- The isolated CE worktree is based directly on accepted `origin/main`; the separate candidate checkout and its uncommitted source copy remain untouched.
- Application code and runtime behavior are unaffected, so browser, database, live-provider, hosted, and end-to-end validation are not required for this slice.

### Sources / Research

- `AGENTS.md`
- `CLAUDE.md`
- `.gitignore`
- `package.json`
- Installed `compound-engineering:ce-setup`, `compound-engineering:ce-brainstorm`, `compound-engineering:ce-doc-review`, `compound-engineering:ce-plan`, and `compound-engineering:ce-work` v3.20.0 skill contracts and references

## Planning Contract

The Product Contract above is unchanged in scope. The requirements review clarified the separation between the tracked template and active local defaults, kept the lifecycle proportional, and retained separate human gates for shipping, hosted/external actions, external-model egress, and autonomy. A CE-only branch or draft PR is a landing vehicle, not authority to merge.

### Key Technical Decisions

- KTD1. **Separate discoverability from activation.** Add the installed v3.20.0 configuration template byte-for-byte as the trackable example, and keep FamTandem's active conservative values only in the ignored local configuration. Governs R1-R4, R10.
- KTD2. **Keep one canonical instruction authority.** Replace only the live Compound Engineering section in `AGENTS.md`; turn the matching `CLAUDE.md` section into a short pointer and preserve all other Claude-specific content. Governs R5-R8.
- KTD3. **Default to native, human-gated execution.** Keep standing model elevation, cross-model peers, and implementation-engine recipients unset. Planning approval does not authorize shipping, hosted/external mutation, or autonomous execution. Governs R3, R4, R7, R9.
- KTD4. **Verify the contract, not unaffected runtime behavior.** Use exact file comparison, ignore checks, targeted instruction scans, `ce-setup`, lint, typecheck, and diff/status checks; do not run browser, database, provider, hosted, or end-to-end workflows for a documentation/configuration-only change. Governs R9, R10.

### Implementation Units

#### U1. Establish the v3.20 configuration contract

- **Goal:** Make the installed configuration surface discoverable while activating only conservative machine-local values.
- **Files:**
  - Create `.compound-engineering/config.local.example.yaml` from the installed v3.20.0 template without modification.
  - Create ignored `.compound-engineering/config.local.yaml` with only the active values required by R3 and R4.
  - Modify `.gitignore` with the root-scoped local-config rule only.
- **Requirements:** R1-R4, R9, R10; AE1.
- **Approach:** Preserve the example byte-for-byte. Set `plan_output`, `brainstorm_output`, and `ideate_output` to `md`; set `plan_skip_scoping_confirm`, `pr_teaching_section`, `pr_teaching_archive`, and `auto_babysit` to `false`; set `work_engine_mode` to `off`; omit model, peer, and engine-recipient keys.
- **Verification:** Compare the example to the installed template; prove the local file is ignored and the example is not; inspect the active local keys and absence of standing routes.
- **Evidence strategy:** No automated application test is appropriate because this is pure local configuration. Replacement evidence is exact comparison plus the installed health diagnostic.

#### U2. Align the canonical workflow instructions

- **Goal:** Make future agents follow the v3.20 unified artifact lifecycle and the project's explicit authority boundaries without duplicating instructions.
- **Files:**
  - Modify only `AGENTS.md`'s live `## Compound Engineering Workflow` section.
  - Add a canonical-authority notice near the top of `CLAUDE.md` and replace only its duplicated CE section with a pointer to `AGENTS.md`.
- **Requirements:** R5-R9; AE2-AE5.
- **Approach:** Describe the proportional lifecycle, requirements-only-to-implementation-ready handoff in one plan, task/Git progress semantics, current review skill, Markdown default, explicit shipping/autonomy gates, separate per-run cross-model consent, and the safe fresh-clone no-babysit fallback. Preserve historical mentions and every non-CE section.
- **Verification:** Targeted scans for required and retired live-workflow terms; a static Claude/Codex cold-start parity check for the literal `@AGENTS.md` import and canonical rules; and diff inspection proving the edit is confined to the authorized sections and authority handoff.
- **Evidence strategy:** No application test is appropriate because the changed behavior is agent guidance. Replacement evidence is targeted document review and repository sanity checks.

#### U3. Diagnose and verify the repository contract

- **Goal:** Prove the configuration and guidance are internally consistent and do not disturb repository health or user-owned work.
- **Files:** No additional product or runtime files.
- **Requirements:** R9, R10.
- **Approach:** Run the v3.20 `ce-setup` check in diagnostic mode without applying fixes, then run the focused repository and Git checks below. Treat any suggested mutation as a reported finding rather than applying it outside U1-U2.
- **Verification:** Complete every required row in the Verification Contract and inspect the complete CE-only branch/PR diff against its current-main base before any merge decision.
- **Evidence strategy:** The diagnostic and static checks are the behavior-level proof for this repository-system change.

### Verification Contract

| Contract | Command or inspection | Expected result |
|---|---|---|
| Exact example | Byte-compare the tracked example with the installed v3.20.0 template | No difference |
| Ignore boundary | `git check-ignore -v` for the local file and example | Local file ignored by the root-scoped rule; example remains trackable |
| Local defaults | Targeted YAML key scan | Required active values present; model, peer, and engine-recipient keys absent |
| Workflow routing | Targeted scans of the live AGENTS/CLAUDE sections and static cold-start parity inspection | Unified artifact, task/Git progress, `ce-code-review`, human gates, separate per-run cross-model consent, literal Claude import, and fresh-clone `babysit:off` fallback are present; live stale routing is absent |
| Plugin health | Installed v3.20.0 `ce-setup` diagnostic | No actionable setup drift for the authorized contract; no fix applied automatically |
| Repository sanity | `npm run lint` and `npm run typecheck` | Both pass |
| Diff integrity | `git diff --check`; targeted trailing-whitespace and content inspection of the new unified plan, trackable configuration example, and ignored local configuration; then manual review of the complete change set | No whitespace errors or out-of-scope edits in tracked, untracked, or ignored files |
| Authority boundary | Inspect branch status, cached diff before commit, and the complete main-targeted PR diff after push | Exactly the five authorized CE paths are present; unrelated work is untouched; merge remains separately gated |

### Risks and Compatibility

- Any CE-only landing branch must be based directly on accepted current `main`; no candidate commit or product path may enter its history or diff. Reconciliation of `da3c4ac` remains a separate product task.
- The machine-local configuration is intentionally absent from fresh clones. Maintainers discover supported keys through the committed example and choose or create local values explicitly; until then, PR delivery must pass `babysit:off` rather than inherit the plugin's automatic-babysitting default.
- Cross-model and autonomous paths remain available as per-run exceptions, but no standing configuration or implicit consent is introduced.

### Definition of Done

- The repository example is byte-identical to the installed v3.20.0 template and remains trackable.
- The active local configuration is ignored and contains only the approved conservative values.
- `AGENTS.md` is the canonical, current CE workflow authority; `CLAUDE.md` safely defers without losing unique guidance.
- The diagnostic, lint, typecheck, exact-comparison, ignore, targeted-scan, and diff checks pass or any blocker is reported without broadening scope.
- No product, dependency, provider, hosted, database, customer, branch-reconciliation, or external-model action occurs.
- The CE-only change set remains isolated from `da3c4ac` product work, targets accepted current `main`, and receives a fresh base/diff/check review before any separately authorized merge.
