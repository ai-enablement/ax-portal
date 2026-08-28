# Role usability acceptance

## Policy baseline

The implementation follows the portal policy source of truth:

- General User submits and follows requests; they do not approve gates.
- AI activation team members prepare, review, and request corrections; they do not self-approve.
- The AI activation team lead reviews gate evidence and makes approval decisions.
- G1-G4 status remains tied to the required documents and evidence, while AX Projects Hub provides linked execution progress.

## Acceptance matrix

| Role | Landing outcome | Primary action | Restricted action | Evidence |
|---|---|---|---|---|
| General User | Understand current stage, next gate, owner, due date, and own next action | Continue the request or open the relevant lifecycle screen | Admin & Governance and operations navigation are hidden; no approval CTA | Browser role switch and navigation inspection passed |
| AI activation team member | See personal work queue ordered by SLA and risk | Open assigned work or request correction | Admin & Governance is hidden; no approval CTA | Drawer actions verified as `보완 요청`, `담당 업무 열기` |
| AI activation team lead | See approval queue, bottlenecks, risks, and linked delivery status | Open approval review with evidence | None within the requested governance scope | Drawer action verified as `승인 검토 열기`; route opens Admin & Governance |
| Project Owner | See required agreements, pilot decisions, and owned operating Agents | Open G2 agreement or responsibility screen | Admin & Governance is hidden; no gate approval CTA | Owner home, menu, and drawer action verified |
| Operations owner | See freshness, quality, error, and reassessment work | Record an issue or open operations inspection | Intake and Admin & Governance are hidden; no gate approval CTA | Operator drawer verified as `이슈 기록`, `운영 점검 열기`; route opens operations |

## Cross-role safeguards

- A role change resets the portal to that role's home view.
- General User cannot remain on a previously open governance screen after switching roles.
- Team members cannot approve from the shared project drawer.
- The lead's approval CTA opens the evidence-based governance workflow instead of completing approval immediately.
- Project Owners are guided to G2 agreement, pilot evidence, and ongoing responsibility rather than governance approval.
- Operations owners are guided to OPS/CHG work and reassessment, with intake and gate approval removed.

## Verification

- ESLint: 0 errors, 0 warnings.
- Vinext production build: passed.
- Rendered HTML test: 1 passed, 0 failed.
- Desktop interaction routes: passed.
- Mobile 390 × 844: no horizontal overflow.
- Mobile menu state, modal semantics, close-control labels, and form-control naming: passed.

## Deployment status

The verified implementation is local in `portal-app`. It has not been published to the existing Sites project because publishing requires explicit user approval.
