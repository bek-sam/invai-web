# InvAI Privacy Policy

> **DRAFT for counsel review. Not in force.** Version 1, 2026-09-28, compliance-officer. This is not legal
> advice, has not been reviewed by a lawyer, and has not been published, sent or agreed to by anyone.
>
> **Owner decisions needed:**
> - `[[OWNER: InvAI's exact legal entity name and address]]`
> - `[[OWNER: contact email/address for privacy requests]]`
> - `[COUNSEL: international transfer mechanism (SCCs) if InvAI or a sub-processor is outside the EU/UK
>   and an EU/UK Shop or buyer's data is involved]]`
> - `[COUNSEL: minimum age / children's data — InvAI's users are shop staff, not children, but confirm no
>   statement is needed]]`

## 1. Scope and our two roles

This policy covers InvAI's own website and product (invai-web, invai-floor, the vendor portal) and the
account data of the people who use them: Shop owners, staff and connected vendors.

InvAI plays two different roles with two different kinds of personal data:
- **Controller**, for account data: the name, email, role and login activity of people who sign in to InvAI.
  This policy describes that processing directly.
- **Processor (GDPR) / service provider (CCPA)**, for buyer data that passes through InvAI because a Shop
  connected a marketplace: a buyer's order, name, shipping address, email or phone. InvAI processes that data
  only on the Shop's instructions, under the Data Processing Agreement (`dpa.md`). If you are a marketplace
  buyer with a question about your data, see §8 — we point you to the Shop, because the Shop is the
  controller of your data, not InvAI.

## 2. Data we collect

| Category | Examples | From whom |
|---|---|---|
| Account data | name, email, role (owner/admin/office/designer/presser/packer/receiver), password hash, floor PIN (hashed) | Shop staff who sign up or are invited |
| Usage and device data | pages visited, actions taken, IP address, browser/device info, audit log entries | all InvAI users, automatically |
| Billing contact | Shop's billing name/email, Stripe customer and subscription ids | Shop owner, once billing is live (`[[OWNER: not live today, see Terms §7]]`) |
| Support messages | anything a Shop sends InvAI for help | Shop staff |
| Buyer order data (processor role, not InvAI's own data) | buyer name, shipping/billing address, email, phone, order and item details, personalization text | the Shop's connected marketplace, described in the DPA |

*Evidence:* buyer fields and their encryption (`invai-backend/src/db/schema/orders.ts:249-274` `buyerPii`
table: `name`, `email`, `phone`, `company`, `street1`, `street2`, `city`, `state`, `zip`, `country`, each
identifying field stored with field-level AES-256-GCM encryption,
`invai-backend/src/lib/crypto.ts:12,49`).

## 3. How we use it

To operate the service (order import, gang-sheet build, floor scanning, label purchase, profit calculation,
AI listing drafts, vendor portal), to secure accounts and investigate abuse, to bill Shops once billing is
live, and to improve the product using aggregated, non-identifying usage statistics. We do not use
marketplace or buyer data to train or fine-tune any AI model.

## 4. AI features

When a Shop uses an AI-assisted feature (listing drafts, trademark-risk check, personalization check, the
assistant), InvAI sends the relevant shop-authored text to a third-party AI model (Anthropic). Buyer personal
data (email addresses, phone numbers, street addresses, numbers that look like payment card numbers, ZIP
codes) is stripped from any text before it reaches the model.

*Evidence:* scrubbing patterns for email, phone, street address, ZIP and card-like numbers
(`invai-backend/src/ai/pii.ts:8-24` `stripPii`/`stripPiiDeep`, applied to everything sent through the
gateway per the file's own comment at line 3: "Buyer personal data never reaches the model"). Default model
and policy: `invai-docs/decisions/0007-ai-model-policy.md` ("PII: none goes to the AI provider"). AI drafts
require a human at the Shop to approve before anything is published
(`invai-backend/src/modules/ai/service.ts:58`). `[COUNSEL/owner: confirm Anthropic's data-retention or
zero-retention setting for our account, once one exists — not verified in code]`

## 5. Who we share it with

InvAI shares data only with the sub-processors listed in `subprocessors.md`, each bound by a data processing
agreement, and only for the purpose that page states. InvAI does not sell personal data and does not share it
for cross-context behavioral advertising (CCPA). Marketplace connections (Etsy, Amazon, Shopify, TikTok Shop,
Walmart) are the Shop's own accounts, authorized by the Shop; InvAI does not send buyer data to a marketplace
except tracking numbers and delivery status the Shop has asked InvAI to push back to that order.

## 6. Retention

| Data | Retention | Mechanism |
|---|---|---|
| Buyer PII (identifying fields) | deleted 30 days after delivery (fallback: 30 days after shipping or cancelling if no delivery event arrives) | nightly job, `invai-backend/src/modules/orders/jobs.ts:13` `PII_RETENTION_DAYS = 30`, `:20-71` `purgeBuyerPii` |
| Raw marketplace payloads, order CSVs, label PDFs in object storage | 30 days | `invai-backend/src/modules/orders/jobs.ts:82-100` `purgePiiObjects` |
| Buyer data on any order, regardless of marketplace | redacted after 18 months even without a deletion request | `invai-backend/src/modules/privacy/service.ts:285` `BUYER_PII_RETENTION_MONTHS = 18`, `:767` `redactStaleBuyerPii` (daily sweep, `invai-backend/src/modules/privacy/jobs.ts:63-77`) |
| Shop's account and company data after cancellation | deleted within 30 days of a deletion request (soft-deleted first, cancellable) | `invai-backend/src/modules/privacy/service.ts:283` `HARD_PURGE_DELAY_MS`, `:581` `requestDeletion`, `:615` `cancelDeletion`, `:653` `hardPurgeCompany` |
| Database backups | `[[OWNER/platform-sre: confirm the production RDS snapshot retention window — not found in `invai-infra/sst.config.ts` as of this draft]]` |
| Security and audit logs | `invai-backend`'s `audit_log` table is append-only with no PII in its summary text; a centralized 12-month log retention policy is **not yet built** — see `invai-docs/security/v1-review.md` |

## 7. Security (verified controls only)

- Identifying buyer fields are encrypted at rest with AES-256-GCM, field by field, with a key ring for
  rotation (`invai-backend/src/lib/crypto.ts:12,49,67`).
- Every tenant table enforces row-level security so one Shop's data is never visible to another's database
  session, checked by an automated cross-tenant test suite
  (`invai-backend/src/db/rls-coverage.test.ts`).
- `[[OWNER/security-reviewer: any further security claim (MFA, centralized logging, penetration testing,
  SOC 2) must come from the verified DPP evidence pack, not be added here — none of those are done yet, see
  `invai-docs/security/v1-review.md`]]`

## 8. Your rights

If you are InvAI's own user (a Shop staff member), you can ask to access, correct or delete your account data
by contacting `[[OWNER: privacy contact]]`. If you are a marketplace buyer, InvAI is not the controller of
your data — the Shop is. Contact the Shop you ordered from; InvAI helps the Shop answer your request within
the clock that applies (GDPR: 1 month; CCPA/CPRA: 45 days), and for Shopify Shops, three Shopify-triggered
processes (`customers/data_request`, `customers/redact`, `shop/redact`) already run automatically today
(`invai-backend/src/integrations/channels/shopify/common.ts:265-267`,
`invai-backend/src/modules/privacy/service.ts:57-62`).

## 9. International transfers

`[COUNSEL: SCCs or other transfer mechanism, once sub-processor and hosting regions are confirmed by the
owner — see subprocessors.md region placeholders]]`

## 10. Cookies and analytics

`[[OWNER: list only cookies/analytics tools actually in use — none found in the code as of this draft, see
subprocessors.md]]`

## 11. Children

`[COUNSEL: statement on not directing the service at children]`

## 12. Contact and changes

`[[OWNER: contact email/address, and how we will notify of material changes]]`

---
*Last updated: 2026-09-28 (draft). Effective date: not in force.*
