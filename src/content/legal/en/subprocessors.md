# InvAI Sub-processors

> **DRAFT for counsel review. Not in force.** Version 1, 2026-09-28, compliance-officer. This is not legal
> advice, has not been reviewed by a lawyer, and has not been published, sent or agreed to by anyone. This
> page is meant to become a public page linked from the Privacy Policy and DPA once counsel and the owner
> approve it.
>
> **Owner decisions needed:**
> - `[[OWNER: email provider — code supports any SMTP endpoint; no specific vendor is chosen yet, see the
>   note under "Email"]]`
> - `[[OWNER: production AWS region — code defaults to us-east-1 (`invai-backend/src/env.ts` `S3_REGION`
>   default) but this has not been confirmed as the production region]]`
> - `[[OWNER: whether an error-tracking or product-analytics tool will be added — none exists in the code
>   today, see the note below]]`

Each row below is verified against the code that actually calls that service, not against a plan. "Status"
says whether the integration is live against the real provider or currently running against InvAI's local
mock (mocks are used automatically whenever the provider's API key/secret is not configured;
`invai-backend/src/env.ts` `mocks.*`, lines 249-262).

## Processors of buyer personal data

| Sub-processor | Purpose | Data categories | Region | Status today | Evidence |
|---|---|---|---|---|---|
| Amazon Web Services (AWS) | Hosting: Postgres database, object storage (order payloads, labels, CSVs), a provisioned-but-unused key-management key | All service data, including encrypted buyer PII | `[[OWNER: confirm production region; code default us-east-1]]` | Live locally (Postgres/MinIO stand-ins); production hosting not yet deployed | `invai-infra/sst.config.ts`; `invai-backend/src/env.ts` `S3_BUCKET`/`S3_REGION` |
| Anthropic | AI listing drafts, trademark-risk check, personalization check, in-app assistant | Shop-authored text only; buyer PII (emails, phone numbers, street addresses, card-like numbers, ZIP codes) is stripped before any call | US (Anthropic's processing region) `[COUNSEL: confirm Anthropic's DPA terms and any zero-retention setting]` | Mock unless `ANTHROPIC_API_KEY` is set (`invai-backend/src/env.ts:250`) | `invai-backend/src/ai/pii.ts:8-24`; `invai-docs/decisions/0007-ai-model-policy.md` |
| EasyPost | Shipping rate quotes, label purchase, tracking | Ship-to name/address, parcel weight/dimensions, order reference | US `[[OWNER: confirm]]` | Mock unless `EASYPOST_API_KEY` is set (`invai-backend/src/env.ts:251`) | `invai-backend/src/integrations/carriers/easypost/` |
| S&S Activewear | Blank-garment purchase orders to a Shop's chosen supplier | Ship-to address (the Shop's or its production location), item/quantity — no buyer identity | US `[[OWNER: confirm]]` | Mock unless `SS_ACTIVEWEAR_ACCOUNT`/`SS_ACTIVEWEAR_API_KEY` are set (`invai-backend/src/env.ts:253`) | `invai-backend/src/integrations/suppliers/ssactivewear/` |
| SanMar | Same as S&S, alternate supplier | Same as S&S | US `[[OWNER: confirm]]` | **Deferred, not integrated** — SOAP integration cut from v1 | `invai-docs/decisions/0006-v1-cuts.md` ("SanMar SOAP: deferred. S&S is used for now.") |
| Stripe | Subscription billing | Shop billing contact, subscription/plan ids; no card numbers stored by InvAI (Stripe-hosted checkout planned) | US `[[OWNER: confirm]]` | **Stubbed, no real charge** — plan limits enforced without a live Stripe account (`invai-backend/src/env.ts:254` `mocks.billing`) | `invai-docs/decisions/0006-v1-cuts.md` ("Stripe checkout: stubbed") |
| Email provider `[[OWNER: name]]` | Transactional email (invites, password reset) and opt-in weekly digest email | Recipient name/email, message content | `[[OWNER]]` | Local dev/test uses Mailpit (not a sub-processor, stays on the local machine); no production provider is chosen — Amazon SES is the leading candidate pending an open owner decision | `invai-backend/src/env.ts:112-113` (`SMTP_URL`, `MAIL_FROM`); `invai-docs/owner-inbox.md` OI-13 (email provider, open); digest email is opt-in per person with one-click unsubscribe, `invai-docs/specs/weekly-digest.md` §"Delivery" |

## Marketplace connections (not sub-processors — the Shop's own accounts)

These are not sub-processors in the GDPR/CCPA sense: the Shop authorizes its own marketplace account to send
InvAI its order data, and InvAI is not directing these platforms to process data on InvAI's behalf. Listed
here for completeness because the app calls their APIs.

| Marketplace | What InvAI sends it | What InvAI receives from it | Status today |
|---|---|---|---|
| Shopify | Fulfillment/tracking status updates; opt-in stock-level pushes (`invai-docs/decisions/0003-stock-push-opt-in.md`) | Buyer name, address, email, phone, order and line-item details | Live webhook + API integration, including the three GDPR compliance webhooks (`invai-backend/src/integrations/channels/shopify/common.ts:265-267`) |
| Etsy, Amazon, TikTok Shop, Walmart | Nothing today (no push-back live) | Buyer order data, imported by the Shop's own CSV export today | CSV import only; direct API access pending each marketplace's app review (`invai-docs/decisions/0006-v1-cuts.md`) |

## No sub-processor identified

| Category | Finding |
|---|---|
| Error tracking / application monitoring | No error-tracking or APM tool (e.g. Sentry, Datadog) found anywhere in `invai-backend`'s dependencies or code as of this draft. `[[OWNER: confirm whether one will be added before launch]]` |
| Product analytics | No analytics tool (e.g. PostHog) found in the code as of this draft. `[[OWNER: confirm]]` |
| Market-signal data providers (Census, Google Trends, Pinterest, Jungle Scout) | Present in config (`invai-backend/src/env.ts:100-103`) for AI listing/demand-research features, all mocked unless keys are set; these do not receive buyer or Shop personal data, only aggregate market queries, so they are not treated as personal-data sub-processors, but are listed here for completeness |

## Notice of changes

`[[OWNER/COUNSEL: how customers are notified of a new sub-processor and the notice period before it starts
processing — see dpa.md §5]]`

---
*Last updated: 2026-09-28 (draft). Not published.*
