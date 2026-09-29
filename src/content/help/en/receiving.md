---
title: Receive blanks, vendor transfers, or do a stock count
slug: receiving
lang: en
roles: [receiver, office]
device: tablet
screens: [Receiving]
updated: 2026-09-28
checked_against: invai-floor 68b9cbb on 2026-09-28
---

# Receive blanks, vendor transfers, or do a stock count

**What you see:** Boxes of blanks or a vendor's sheet just arrived, or you're doing a shelf count, and
the **Receiving** station on the floor tablet has three tabs: **Purchase orders**, **Vendor
transfers** and **Stock count**.

**Why:** Receiving updates your real stock the moment blanks come in, and marks a vendor's printed
sheet arrived so its transfers move to **Press**. Doing it on the tablet, right at the shelf, keeps
the count accurate.

## Receive blanks against a purchase order
1. On **Receiving**, tab **Purchase orders**. Scan the PO number or tap it from the list.
2. Scan each blank as it comes out of the box, or use the **+**/**−** buttons on its line. A blank not
   on this PO shows "This blank isn't on {{poNo}}" — set it aside and tell the office (extra blanks
   can't go on the order).
3. If everything arrived, tap **Receive N: order complete**. If only some arrived, tap
   **Receive N (partial)** — the rest stays "still to come" for later.

## Receive a vendor's printed sheet
1. Tab **Vendor transfers**. Scan any transfer's QR code from the sheet, or tap the sheet from the
   list of sheets on the way.
2. Confirm **Did sheet {{name}} arrive?**, then tap **Mark received**. Its transfers are now ready to
   press.

## Do a stock count
1. Tab **Stock count**. Scan each blank on the shelf.
2. The screen shows **System** (what InvAI has on record) next to **Counted** (what you scanned) and
   any **Difference**. Scanning a blank InvAI doesn't know says "This blank isn't in stock records" —
   give it to the office.
3. Tap **Save count** when done.

![Receiving screen showing the three tabs](../img/receiving/01-receiving-tabs.png)

## Check it worked
The PO's status moves toward **Received** (or **Partly received**), the sheet shows **Received** on
**Production → Gang Sheets**, or the stock count shows "Everything matched" (or lists what changed).

## Still stuck?
- Stop and contact support if the same purchase order keeps showing blanks as "still to come" after
  you've received the whole box, or a vendor sheet won't mark received and its order is due today.
- Send: the PO number or sheet name, and what the screen showed. Don't send a photo of a packing
  slip with a buyer's address on it.

Related: [Floor tablet setup](floor-tablet-setup.md), [Gang sheets and vendors](gang-sheets-and-vendors.md).
