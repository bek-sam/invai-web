# InvAI Terms of Service

> **DRAFT for counsel review. Not in force.** Version 1, 2026-09-28, compliance-officer. This is not legal
> advice, has not been reviewed by a lawyer, and has not been published, sent or agreed to by anyone.
>
> **Owner decisions needed before this goes to counsel or is published** (placeholders below; nothing is
> invented):
> - `[[OWNER: InvAI's exact legal entity name, type and state/country of formation]]`
> - `[[OWNER: registered business address]]`
> - `[[OWNER: governing law and venue for disputes]]`
> - `[[OWNER: notice email address for legal notices]]`
> - `[[OWNER: plan names, prices, trial length and per-label fee — billing is stubbed today, no real
>   charge exists; see Evidence]]`
> - `[[OWNER: liability cap amount and indemnity terms — counsel's call, see §11]]`

## 1. Parties and acceptance

These Terms are an agreement between `[[OWNER: InvAI legal entity name]]` ("InvAI", "we") and the company
that creates an InvAI account ("Shop", "you"). The person who accepts these Terms on the Shop's behalf must be
authorized to bind the Shop. `[COUNSEL: click-wrap acceptance mechanics, minimum age]`

## 2. The service

InvAI is a platform for direct-to-film (DTF) t-shirt shops that sell on Etsy, Amazon, Shopify, TikTok Shop and
Walmart. It:
- pulls in marketplace orders and turns them into order-labeled production items,
- builds gang sheets for printing and checks production against them with barcode scans,
- buys and tracks shipping labels,
- computes true profit per order and per item,
- drafts AI-assisted marketplace listings with a trademark-risk check, and
- gives outside DTF vendors a portal to receive and fulfill jobs.

Features described as in development, beta or pilot-only in the product or in a Shop's plan are provided
"as-is" and may change or be withdrawn with notice. `[COUNSEL: is a beta disclaimer needed here or in §11?]`

## 3. Accounts and users

The Shop's account owner is responsible for everyone it invites: staff with dashboard logins (roles: owner,
admin, office, designer), production-floor staff who sign in with a 4-digit PIN or scan in at a shared
station, and any outside vendor granted access to the vendor portal for that Shop's jobs. Station access uses
a revocable token issued per physical station; the Shop can revoke a token or deactivate a staff member at any
time, which ends that person's or station's active sessions immediately.

*Evidence:* PIN-only staff and role model (`invai-backend/src/modules/tenancy/service.ts:483` `addPinOnlyStaff`,
`:520` `changeRole`); station tokens issued and revoked (`invai-backend/src/modules/tenancy/service.ts:798`
`issueToken`, `:813` `revokeToken`); staff deactivation ends floor sessions
(`invai-backend/src/modules/tenancy/service.ts:571` `setMemberStatus`).

## 4. Marketplace connections

The Shop connects its own marketplace and channel accounts (Etsy, Amazon, Shopify, TikTok Shop, Walmart) to
InvAI and authorizes InvAI to read its orders and, where the Shop enables it, push tracking and (for Shopify,
opt-in) stock updates back. The Shop remains bound by each marketplace's own seller terms and API terms; InvAI
does not control and cannot guarantee a marketplace's uptime, API availability or approval of InvAI as a
connected app.

As of this draft: the Shopify channel is a live webhook and API integration; Etsy, Amazon, TikTok Shop and
Walmart orders are imported by CSV export/import while InvAI's direct API access to those marketplaces is
pending each marketplace's app review (`invai-docs/decisions/0006-v1-cuts.md`). This section will be updated
as each direct integration goes live.

## 5. AI features

InvAI can draft marketplace listing copy and check a design or listing for trademark risk using a third-party
AI model. A draft is never published to a marketplace without a human at the Shop reviewing and approving it
(`invai-backend/src/modules/ai/service.ts:58` "nothing is published without human approval",
`:633` records the approving user). The trademark check is an automated risk score, not legal advice or a
guarantee of non-infringement; the Shop is responsible for the rights to any design, image or text it
publishes. No buyer personal data is sent to the AI provider (`invai-backend/src/ai/pii.ts`; see the Privacy
Policy).

## 6. Labels and postage

Where the Shop buys shipping labels through InvAI, InvAI purchases them from a third-party carrier API
(EasyPost) at the Shop's direction; postage and any per-label fee are charged to the Shop. Refunds and voided
labels follow the issuing carrier's own rules and timeframes. `[COUNSEL: confirm EasyPost's billing/refund
pass-through model and whether InvAI takes a margin on postage — not decided in code today]`

## 7. Fees and plans

`[[OWNER: plan names, monthly/annual prices, trial terms, per-label or per-order fees, tax handling]]`. As of
this draft, subscription billing is not live: the billing module enforces plan limits but does not charge a
real card (Stripe integration is stubbed, `invai-backend/src/env.ts` `mocks.billing`; see
`invai-docs/decisions/0006-v1-cuts.md` "Stripe checkout: stubbed"). No Shop is charged before this section is
filled in and the payment flow goes live.

## 8. Acceptable use

The Shop will not use InvAI to sell or list counterfeit, infringing or unlawful goods, to scrape or reverse
engineer InvAI, to attempt to access another Shop's data, or to send content to InvAI's AI features that it
does not have the rights to use. `[COUNSEL: standard acceptable-use boilerplate]`

## 9. Data protection

InvAI acts as a processor (GDPR) / service provider (CCPA) for the personal data of the Shop's buyers that
passes through InvAI, under the terms of the Data Processing Agreement (`dpa.md`), which is incorporated into
these Terms by reference. For InvAI's own collection of the Shop's staff account data, see the Privacy Policy
(`privacy.md`).

## 10. Suspension, termination and data return

Either party may terminate as described in `[COUNSEL: termination clause, notice period, cause vs.
convenience]`. On termination or cancellation, the Shop can export its data; InvAI deletes the Shop's company
data within 30 days of a deletion request, unless cancelled first (`invai-backend/src/modules/privacy/service.ts:283`
`HARD_PURGE_DELAY_MS = 30 * 86400_000`, `:372` export, `:581` deletion request, `:653` hard purge). Backups
age out separately; see the Privacy Policy §6 and the DPA §8 for the backup window.

## 11. Warranties, liability, indemnity

`[COUNSEL: disclaimer of warranties, limitation of liability (cap amount and carve-outs), mutual indemnity —
all owner/counsel decisions, nothing drafted here]`

## 12. Changes to these Terms

`[COUNSEL: notice period and mechanism for material changes]`

## 13. Governing law and disputes

`[COUNSEL: governing law, venue, arbitration clause if any]`

## Contact

`[[OWNER: legal notice email/address]]`

---
*Last updated: 2026-09-28 (draft). Effective date: not in force.*
