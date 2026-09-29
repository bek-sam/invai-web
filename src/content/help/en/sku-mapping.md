---
title: Map a channel SKU to a design and blank
slug: sku-mapping
lang: en
roles: [owner, office]
device: desktop
screens: [SKU mapping]
updated: 2026-09-28
checked_against: invai-web d092a4b on 2026-09-28
---

# Map a channel SKU to a design and blank

**What you see:** An order sits with items that need SKU mapping — either a badge on **Today**
("Needs SKU mapping") or a row under **Catalog → SKU Mapping** with no design or blank chosen yet.

**Why:** InvAI doesn't know which design and blank a marketplace's SKU means until you tell it once.
After that, a saved rule maps every future order with that SKU automatically — mapping is a one-time
cost per SKU, not per order.

## Fix it
1. Go to **Catalog → SKU Mapping** (or click **Map them now** from an import report or Today).
2. To handle many at once: click **Suggest mappings** to have AI propose a design and blank for a
   batch, then **Accept {{count}} at ≥80%** to bulk-accept the confident ones.
3. To map one by hand: pick its row, choose **Maps to** (a design and blank variant/size), then
   click **Map**.
4. Turn on **New rule** if you want this exact SKU (or a pattern like
   `{style}-{color}-{size}-{design}`) to map itself next time. Rules show up under **Rules** and can
   be deleted later — items already mapped keep their mapping.

![SKU mapping page with a suggested match and the Map button](../img/sku-mapping/01-map-sku.png)

## Check it worked
The row moves out of **Unmapped SKUs**, and the page's total ("N SKUs · N items waiting") goes down.
The order's items move from "needs SKU mapping" toward ready to build.

## Still stuck?
- Stop and contact support if a SKU keeps needing mapping even after you saved a rule for it, or an
  order due today still shows unmapped items you can't match to anything in your catalog.
- Send: the channel SKU, the order number, and a screenshot of the suggestion (if any). Don't send
  the buyer's address.

Related: [Getting started](getting-started.md), [Gang sheets and vendors](gang-sheets-and-vendors.md).
