---
title: Pair a floor tablet, sign in with a PIN, and scan
slug: floor-tablet-setup
lang: en
roles: [owner, admin, presser, packer, receiver]
device: tablet
screens: [Stations, Floor login, Press]
updated: 2026-09-28
checked_against: invai-web d092a4b, invai-floor 68b9cbb on 2026-09-28
---

# Pair a floor tablet, sign in with a PIN, and scan

**What you see:** A tablet showing **Set up this tablet**, or the floor app asking for a PIN it
doesn't recognize.

**Why:** Every floor tablet is paired to one station (pick, press, quality check, pack or receiving)
with a one-time token. Staff then sign in on that tablet with their own personal PIN — the tablet
stays paired; only the signed-in person changes.

## Pair the tablet
1. As the owner or admin, go to **Settings → Stations**, click **Add station** if the station
   (for example "Press 1") doesn't exist yet.
2. Click **Pair tablet**. A QR code and a one-time station token appear — it's shown only once.
3. On the tablet, at **Set up this tablet**, scan the QR code, or type the **Station token** by hand
   and click **Connect station**.

## Sign in and scan
1. At **Enter your PIN**, type your 4–6 digit floor PIN. A wrong PIN shows "PIN not recognized" — try
   again or ask an admin to check your PIN under **Settings → Team**.
2. On **Press**: scan the transfer's QR code first ("Scan the transfer QR"), then scan the blank or
   tote label. A full green **PRESS** screen means go ahead; a full red **BLOCKED** screen means stop
   — it shows what was expected vs. what you scanned.
3. To switch who's signed in without unpairing the tablet, tap **Switch** in the header.

## Working offline
If the tablet loses the network, a banner reads "Offline: scans are saved on this tablet and will
sync." Keep scanning — everything is saved on the tablet and sends itself once the connection comes back. The header
shows "N scans waiting to sync" until then. Don't force-close the app while scans are waiting.

![Floor tablet PIN login screen](../img/floor-tablet-setup/01-pin-login.png)

## Check it worked
The header shows **Live** (not "Reconnecting") and, after scans send, **All synced**. On the web,
**Production → Stations board** shows the station's recent scans arriving in real time.

## Still stuck?
- Stop and contact support if the press screen shows green for a shirt you can see is wrong, or a
  tablet has been "Offline" or shows scans waiting to sync for longer than a shift.
- Send: the station name, the staff member's name (not their PIN), and what the screen showed. Don't
  send a photo that includes a buyer's address.

Related: [Gang sheets and vendors](gang-sheets-and-vendors.md), [Receiving](receiving.md).
