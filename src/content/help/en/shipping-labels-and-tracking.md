---
title: Buy a shipping label and get tracking to the buyer
slug: shipping-labels-and-tracking
lang: en
roles: [owner, office]
device: desktop
screens: [Shipping]
updated: 2026-09-28
checked_against: invai-web d092a4b on 2026-09-28
---

# Buy a shipping label and get tracking to the buyer

**What you see:** A packed order sitting under **Ready to ship** on the **Shipping** page, with no
label bought yet.

**Why:** An order can't get a label until every item in it is packed on the floor. Once it's on the
**Shipping** page's **Ready to ship** list, InvAI compares carrier rates, buys the label, and (when
the channel supports it) pushes the tracking number back to the marketplace automatically.

## Fix it
1. Go to **Shipping**. The **Ready to ship** list shows packed orders.
2. Click **Get rates** for one order (or use a **Batch strategy** — **Cheapest**, **Fastest**, or
   **Cheapest on time** — and **Buy & print all** for many at once).
3. Pick a rate, click **Buy & print** (or **Buy & print {{count}}** for a batch). A 4×6 label PDF is
   generated.
4. If tracking needs to reach the marketplace and **Push tracking to channels automatically** is on,
   it's sent right away. Otherwise use the CSV export — see [CSV tracking
   export](csv-tracking-export.md).
5. Made a mistake on a label that hasn't shipped yet? Click **Void**, confirm **Void label**. A label
   the carrier has already scanned, or whose tracking was already pushed to the buyer's channel,
   can't be voided here — cancel or refund the order on the channel instead.

![Ready to ship list with Buy & print button](../img/shipping-labels-and-tracking/01-buy-label.png)

## Check it worked
The order moves from **Ready to ship** to **Shipments**, showing **Labeled** and, once pushed,
**Pushed to channel**. On the marketplace side, the buyer's order should show the tracking number
within a few minutes for channels with a live connection.

## Still stuck?
- Stop and contact support if an order due today won't get a rate, a label was bought twice for the
  same order, or tracking keeps failing to push and the order is close to its ship-by.
- Send: the order number and the error message shown next to **Tracking push**. Don't send the
  buyer's address.

Related: [CSV tracking export](csv-tracking-export.md), [Profit and ad spend](profit-and-ad-spend.md).
