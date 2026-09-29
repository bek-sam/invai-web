---
title: Upload tracking numbers to a marketplace that isn't connected
slug: csv-tracking-export
lang: en
roles: [owner, office]
device: desktop
screens: [Shipping]
updated: 2026-09-28
checked_against: invai-web d092a4b on 2026-09-28
---

# Upload tracking numbers to a marketplace that isn't connected

**What you see:** Labels bought and shipments moving, but the marketplace still shows the order as
unshipped, because that channel (Etsy, Amazon, TikTok Shop or Walmart CSV import) has no live API
connection to push tracking automatically.

**Why:** Only Shopify pushes tracking on its own right now. For a CSV-imported channel, InvAI instead
builds a file in the format each marketplace's bulk-upload tool expects, so you can hand it back to
them in a couple of clicks.

## Fix it
1. Go to **Shipping**, find **Export tracking for {{channel}}** for the channel you need.
2. Click it. If there's nothing new, you'll see "Nothing new to export for {{channel}}" — everything's
   already been exported.
3. Save the downloaded file, then upload it where that marketplace expects:
   - **Amazon:** Seller Central → Orders → Upload Order Related Files → Shipping Confirmation.
   - **Etsy:** Shop Manager → Orders & Shipping — add tracking to each order, or use a bulk-upload
     app built on Etsy's tracking API with this file.
   - **TikTok Shop:** Seller Center → Orders → Manage orders → Upload → Add Tracking No.
   - **Walmart:** Seller Center → Order Management → Bulk Order Update, then upload this file.

![Export tracking button on the Shipping page](../img/csv-tracking-export/01-export-tracking.png)

## Check it worked
The export shows "N shipments exported for {{channel}}". After you upload the file on the
marketplace's own site, the buyer's order there shows tracking — InvAI can't confirm that last step,
since the channel has no live connection.

## Still stuck?
- Stop and contact support if the same shipment keeps showing up in every export (it should only
  appear once, the first time it's exported), or if orders close to their ship-by aren't in the file
  at all.
- Send: the channel name, the order number, and the exported file's name. Don't send the buyer's
  address.

Related: [Shipping labels and tracking](shipping-labels-and-tracking.md), [Getting started](getting-started.md).
