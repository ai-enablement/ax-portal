# G1 leader home design QA

## Reference and capture conditions

- Approval-before reference: `codex-clipboard-82994083-70ec-443b-9f5e-5ce1c44e19db.png` (983 × 313).
- Approval-after reference: `codex-clipboard-ffe38f46-e8b2-4196-a2ec-f06dd5f63ce1.png` (989 × 361).
- Implementation capture: 1920 × 1080 CSS viewport, device scale factor 1. Full-page captures were cropped to the selected-project workspace for comparison.
- Same-input comparisons:
  - `qa/g1-before-comparison.png`
  - `qa/g1-after-comparison.png`
- Responsive evidence:
  - `qa/g1-tablet-1024-fixed.jpg`
  - `qa/g1-narrow-768.jpg`

## Comparison result

- Layout and hierarchy: the project header, lifecycle rail, single schedule strip, G1 action/result surface, and bottom processing route follow the supplied ordering. The existing portal sidebar and project list remain intact around the requested content.
- Approval-before state: the G1 record summary is intentionally absent. The leader receives the three decision choices, development-assignee field, rationale field, and final confirmation action in one surface.
- Approval-after state: the decision form is removed and replaced by the FEA basis, gate result, FEA author, G1 approver, and assigned developer record. The schedule strip reflects the selected G1 result.
- Typography and density: the restrained enterprise type scale, thin borders, white surfaces, and amber/green status colors match the reference intent without introducing decorative imagery or placeholder illustration.
- Copy and content: role language identifies the leader-only decision and assignment responsibility; completion copy distinguishes FEA authorship, G1 approval, and developer assignment.
- Icons: existing Phosphor icons are retained consistently for lifecycle, schedule, completion, and navigation states.

## Interaction verification

- The leader can open G1 from the lifecycle rail after FEA completion.
- Conditional Go was selected, 허정환 was assigned, a rationale was entered, and confirmation was submitted.
- The selected G1 stage remained active after submission.
- The action form disappeared and the approval record appeared with three recorded roles.
- The decision persisted in the top schedule strip as `Conditional Go`.
- Reopening the project no longer resets the selected lifecycle stage during ordinary parent re-renders.

## Responsiveness and accessibility

- At 1024 px the project list stacks above the selected project. The schedule strip wraps instead of clipping its delay and approval notes.
- At 768 px the application sidebar collapses, controls remain reachable, the lifecycle rail stays horizontally usable, and form fields stack without overlap.
- Decision controls use semantic buttons; assignee and rationale inputs retain visible labels; status is conveyed by text in addition to color.
- No application-error, runtime-error, or failed-compilation surface appeared in browser checks. Automated tests and the production build completed successfully.

## Findings resolved

- **P1 · Behavior:** confirming G1 caused the home to return to FEA because a project-array identity change retriggered the selection effect. Fixed by scoping the reset effect to role changes and persisting G1 resolution per project in the home state.
- **P2 · Responsive layout:** the schedule note clipped at the 1024 px viewport. Fixed by wrapping the schedule strip at the same breakpoint used to stack the one-page project layout.

No open P0, P1, or P2 findings remain for the supplied G1 states.
