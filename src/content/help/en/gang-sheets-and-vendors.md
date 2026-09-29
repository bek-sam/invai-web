---
title: Build a gang sheet and send it to your vendor
slug: gang-sheets-and-vendors
lang: en
roles: [owner, office]
device: desktop
screens: [Gang sheets, Vendors]
updated: 2026-09-28
checked_against: invai-web d092a4b on 2026-09-28
---

# Build a gang sheet and send it to your vendor

**What you see:** Items sitting as "ready" with nowhere to print from, or a vendor who needs today's
sheet and doesn't have it yet.

**Why:** InvAI nests ready items onto a 22-inch DTF sheet automatically (rush orders first), and
prints a QR code plus the order/item/size/color/design text under every placement — that's what gets
scanned at the press. Once a sheet is built, you send it to the DTF vendor that prints it.

## Fix it
1. Go to **Production → Gang Sheets**, click **Build gang sheets**.
2. Pick a **Ship-by cutoff** (includes items due by the end of that day); turn on **Rush orders
   first** or **Include reprints** if you want them. Click **Build**.
3. Open the built sheet and click **Preview** to see how many items fit and what the film will cost,
   or **Regenerate** if you changed something.
4. Click **Send to vendor**. The vendor gets the print file in their portal (if they're on InvAI) or
   by email — set your default vendor first under **Settings → Vendors → Use as the default vendor**.
5. If you print in-house instead, click **Print in-house**, then **Mark printed** once it's out of
   the printer.
6. When the vendor ships the sheet back, click **Mark received** — the sheet's transfers become
   ready to press.

![Gang sheet preview with Send to vendor button](../img/gang-sheets-and-vendors/01-build-sheet.png)

## Check it worked
The sheet's status moves from **Printed** to **Received**, and its transfers show up at the **Press**
station on the floor tablet, ready to scan.

## Still stuck?
- Stop and contact support if a sheet shows **Received** but the floor still can't find its transfers
  to press, or the film cost or sheet size looks physically wrong.
- Send: the sheet name, the order numbers on it, and a screenshot of the preview. Don't send the
  buyer's address.

Related: [SKU mapping](sku-mapping.md), [Floor tablet setup](floor-tablet-setup.md).
