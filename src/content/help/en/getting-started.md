---
title: Connect a channel or import your first CSV
slug: getting-started
lang: en
roles: [owner, office]
device: desktop
screens: [Today, Channels]
updated: 2026-09-28
checked_against: invai-web d092a4b on 2026-09-28
---

# Connect a channel or import your first CSV

**What you see:** A new company with no orders yet. On **Today**, the **Import CSV** quick action is
there, and the setup checklist "Get set up" lists **Connect a sales channel or import a CSV** as its
first step.

**Why:** Orders have to come from somewhere. Shopify connects directly and new orders arrive on their
own. Every other marketplace (Etsy, Amazon, TikTok Shop, Walmart) doesn't have a live connection yet,
so you import that marketplace's CSV order export instead — re-importing the same file later updates
orders instead of duplicating them.

## Fix it
1. Go to **Settings → Channels** (left menu), or click **Import CSV** on **Today**.
2. Click **Connect a channel**.
3. **Shopify:** click **Connect**, then **Continue to Shopify**. You'll be sent to Shopify to approve
   access, then back here.
   **Etsy, Amazon, TikTok Shop or Walmart:** pick the marketplace, then **Import orders from CSV**.
   Choose the **File format** that matches your export (Etsy orders export, Amazon order report,
   TikTok Shop export, Walmart export, or Generic InvAI template), then drop the CSV file (up to
   5,000 rows) or click to browse.
4. Click **Import**.

![Connect a channel dialog with Shopify and CSV import options](../img/getting-started/01-connect-channel.png)

## Check it worked
The import report shows **New orders**, **Updated**, **Unchanged** and **Rows failed**. If it shows
"N items need SKU mapping", click **Map them now** — see the SKU mapping article. New orders show up
on **Today** under **Due today** and on the **Orders** list.

## Still stuck?
- Stop and contact support if a real order's ship-by date looks wrong after import, or the import
  shows **Rows failed** for orders you need to ship soon.
- Send: the marketplace name, the file you tried to import, and the errors under **Show row errors**.
  Don't send the buyer's address.

Related: [SKU mapping](sku-mapping.md), [Gang sheets and vendors](gang-sheets-and-vendors.md).
