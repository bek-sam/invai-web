# InvAI Data Processing Agreement

> **DRAFT for counsel review. Not in force.** Version 1, 2026-09-28, compliance-officer. This is not legal
> advice, has not been reviewed by a lawyer, and has not been published, sent or agreed to by anyone.
>
> **Owner decisions needed:**
> - `[[OWNER: InvAI's exact legal entity name and address (the "Processor")]]`
> - `[[OWNER: sub-processor change-notice period, e.g. 30 days before a new sub-processor starts
>   processing — counsel's recommendation needed]]`
> - `[COUNSEL: international transfer mechanism (SCCs) once sub-processor regions are confirmed]]`
> - `[COUNSEL: audit rights mechanism — on-site, documentation only, or via a shared report]]`

This Data Processing Agreement ("DPA") is between the Shop that has agreed to InvAI's Terms of Service
("Controller") and `[[OWNER: InvAI legal entity name]]` ("Processor"), and applies whenever InvAI processes
personal data of the Controller's marketplace buyers on the Controller's behalf. It incorporates the terms
required by GDPR Article 28(3) and the CCPA/CPRA service-provider terms (Cal. Civ. Code §1798.140;
11 CCR §7051).

## 1. Subject matter, duration, nature and purpose

**Subject matter:** InvAI's processing of the Controller's marketplace buyers' personal data as part of the
InvAI service (order import, gang-sheet production, shipping, profit reporting, AI-assisted listing tools).
**Duration:** for as long as the Controller's InvAI account is active, plus the deletion window in §8.
**Nature and purpose:** to receive orders from the Controller's connected marketplaces, store and display
them to the Controller's authorized staff, print production materials, buy and track shipping labels, and
(with buyer personal data stripped first) support the Controller's AI-assisted listing features.

**Categories of data:** buyer name, shipping and billing address, email, phone, order and line-item details,
gift/personalization text.
*Evidence:* the fields InvAI stores, each encrypted at rest: `invai-backend/src/db/schema/orders.ts:249-274`
(`buyerPii` table columns `name`, `email`, `phone`, `company`, `street1`, `street2`, `city`, `state`, `zip`,
`country`).
**Categories of data subjects:** the Controller's marketplace buyers.

## 2. Processing only on documented instructions

The Processor processes personal data only on the Controller's documented instructions — configuring which
marketplace channels are connected, which staff and vendors can see order data, and which shipping and
listing features are enabled — unless required to do otherwise by law, in which case the Processor will tell
the Controller first unless the law prohibits it.

## 3. Confidentiality

Anyone the Processor allows to process this data is bound to confidentiality, by contract or by law.
`[COUNSEL: standard confidentiality clause]`

## 4. Security measures (Art. 32)

The measures actually built and verifiable today:
- Identifying buyer fields are encrypted at rest, field by field, with AES-256-GCM
  (`invai-backend/src/lib/crypto.ts:12,49,67`).
- Every tenant-scoped database table carries row-level security so the Controller's data is isolated from
  every other Shop's, verified by an automated cross-tenant test suite
  (`invai-backend/src/db/rls-coverage.test.ts`).
- Buyer personal data is stripped from any text before it is sent to the AI sub-processor
  (`invai-backend/src/ai/pii.ts:8-24`).
- Marketplace webhook payloads are signature-verified before use, including Shopify's GDPR compliance
  webhooks (`invai-backend/src/integrations/channels/shopify/common.ts:265-267`).

Measures the DPP and Shopify Level 2 programs require that are **not yet built**, tracked with an owner and
date in `invai-docs/security/v1-review.md` and the Amazon DPP evidence pack: multi-factor authentication on
accounts with PII access, centralized 12-month security logging, scheduled vulnerability scanning and
penetration testing, and use of the provisioned AWS KMS key for envelope encryption (today the app manages
its own key ring). This DPA's security annex will be updated as each closes, never before.

## 5. Sub-processors

The Controller gives the Processor a general authorization to use the sub-processors listed in the public
sub-processor list (`subprocessors.md`), which the Processor keeps current. The Processor will give the
Controller notice of a new sub-processor at least `[[OWNER: notice period]]` before it starts processing
Controller data, during which the Controller may object on reasonable data-protection grounds.

## 6. Assistance with data subject rights and DPIAs

The Processor will help the Controller respond to a data subject's request (access, deletion, correction)
within the applicable clock, following the process in `invai-docs/compliance/privacy-requests/` once that
process is in active use, and will provide information reasonably needed for the Controller's own data
protection impact assessments. Three of Shopify's own compliance webhooks already run against Controller
buyer data automatically: `customers/data_request` opens a request the Controller (Shop owner) must answer
within 30 days; `customers/redact` and `shop/redact` remove that data
(`invai-backend/src/modules/privacy/service.ts:57-62`, test coverage at
`invai-backend/src/modules/privacy/service.test.ts:143-268`).

## 7. Breach notification

The Processor will notify the Controller without undue delay, and in any case within **24 hours** of becoming
aware of a personal data breach affecting the Controller's data, with enough information for the Controller
to meet its own 72-hour notice duty to a supervisory authority under GDPR Art. 33. `[[OWNER: this target
matches the incident-response playbook's Amazon and shop notice clocks
(invai-docs/research/12-security-quality-playbook.md §5); confirm it is acceptable as a contractual
commitment]]`

## 8. Deletion or return; backup window

On termination of the Controller's account, the Processor will make the Controller's data available for
export, then delete it within 30 days of a deletion request (no separate export-only window is offered; the
export and the deletion clock run together).
*Evidence:* `invai-backend/src/modules/privacy/service.ts:283` (`HARD_PURGE_DELAY_MS = 30 * 86400_000`),
`:372` (export trigger), `:581` (deletion request), `:653` (hard purge, deletes tenant rows and S3 objects).
Buyer personal data specifically is deleted sooner and automatically: 30 days after delivery regardless of
account status (`invai-backend/src/modules/orders/jobs.ts:13,20-71`), and on any order older than 18 months
even without a request (`invai-backend/src/modules/privacy/service.ts:285,767`).
Backups: `[[OWNER/platform-sre: state the production database backup retention window here once confirmed —
not found in `invai-infra/sst.config.ts` as of this draft]]`.

## 9. Audits and information

The Processor will make available information reasonably necessary to demonstrate compliance with this DPA
and allow for audits. `[COUNSEL: audit mechanism — see banner]`

## 10. International transfers

`[COUNSEL: SCCs or equivalent mechanism, once InvAI's hosting region and every sub-processor's region are
confirmed — see subprocessors.md region placeholders]]`

## Annex A — Data flow summary

Marketplace (buyer places order) → channel adapter/webhook → `orders` table and encrypted `buyer_pii` table
→ raw payload archived in object storage → gang-sheet build and floor scan (no buyer PII on the physical
sheet beyond what the design needs) → EasyPost (ship-to address) for a label → label PDF and packing slip →
tracking pushed back to the marketplace → all buyer-identifying data purged 30 days after delivery.
AI listing/trademark features receive shop-authored text only, with buyer PII patterns stripped first.
See `invai-docs/compliance/vendor-inventory.md` for the full data-flow table by vendor.

## Annex B — Security measures

See §4 above; kept current from `invai-docs/security/v1-review.md` and the Amazon DPP evidence pack.

## Annex C — Sub-processors

See `subprocessors.md`.

## CCPA/CPRA service-provider terms

The Processor will process personal data only for the specific business purpose of providing the InvAI
service described in this DPA; will not sell or share personal data; will not retain, use or disclose
personal data outside the direct business relationship with the Controller; will not combine personal data
received from the Controller with personal data from other sources except as CCPA permits; and will notify
the Controller if it can no longer meet these obligations. The Controller may take reasonable steps to stop
and remediate unauthorized use of personal data by the Processor.

---
*Last updated: 2026-09-28 (draft). Effective date: not in force.*
