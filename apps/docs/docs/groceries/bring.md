---
sidebar_position: 2
title: Shop with Bring!
description: Send recipe ingredients to Bring! instead of the built-in grocery list.
---

# Shop with Bring!

If your household already shops with [Bring!](https://www.getbring.com), an administrator can make it
the instance's shopping list. Adding a recipe's ingredients then sends them to
Bring! instead of the Norish grocery list.

## Turn it on

Open **Settings**, then **Admin**, then **General**, and under **Shopping list**
choose **Bring!**. The change applies to everyone on the instance at once,
without a reload. Choose **Norish grocery list** to switch back.

<!-- Screenshot owed: /img/screenshots/groceries-bring-setting.png (The Shopping list setting in admin settings). Add it as ![The Shopping list setting in admin settings](/img/screenshots/groceries-bring-setting.png) -->

Norish must be reachable from the internet over HTTPS. Bring! cannot take
items directly, so Norish puts them on a temporary web page and Bring!'s
servers fetch it. Set `AUTH_URL` to your public `https://` address. If Bring!
cannot reach Norish, adding ingredients shows an error and nothing is sent. If
Bring! says it could not read the list, check that the address in `AUTH_URL`
opens from outside your network.
See [Server & runtime](/configuration/server-runtime#networking--origins).

## Add ingredients to Bring!

Every place that adds ingredients to the groceries now says **Add to Bring!**:
the planning panel, the recipe's actions menu and a recipe card's menu. Tick
the ingredients, edit a name or amount if you like, and press **Add to
Bring!**.

<!-- Screenshot owed: /img/screenshots/groceries-bring-panel.png (The Add to Bring! panel with ingredients ticked). Add it as ![The Add to Bring! panel with ingredients ticked](/img/screenshots/groceries-bring-panel.png) -->

Amounts match the servings you chose, and foods **In your pantry** stay apart
and unticked, as they do for the Norish grocery list. Bring! shows the items
as a recipe named after yours. Units are written short, in your language, as
the groceries show them: "250 g flour".

On the web this takes two steps. When the items are ready, press **Open
Bring!** on the message that appears. It stays until you close it, because a
browser only opens a new tab when you press a button.

<!-- Screenshot owed: /img/screenshots/groceries-bring-open.png (The Open Bring! message after sending). Add it as ![The Open Bring! message after sending](/img/screenshots/groceries-bring-open.png) -->

## What Bring! receives

Bring! receives the recipe's name, the servings and one line per ingredient,
such as "200 g flour". Norish keeps these lines for one hour on a page whose
address nobody can guess, then the page expires. It shows nothing else: no
person, no household, no link to your recipe and none of its photos.

Bring! thereby also sees your instance's public address, and anyone who holds
the temporary link can read that list until it expires after an hour.

You can send up to 30 lists in 10 minutes.

## What happens to the Norish grocery list

Choosing Bring! hides the **Groceries** tab, and addresses under `/groceries`
take you home. Nothing is deleted. Your groceries, Stores, aisles, pantry and
recurring groceries stay where they were, the API at `/api/v1/groceries` works
as before, and recurring groceries keep adding to the hidden list. Edit your
pantry from an ingredient's panel while the tab is hidden.

Switch back under **Shopping list** and the list returns exactly as you left it.

## The mobile app

The mobile app ignores the setting in this release. It keeps showing the Norish
grocery list and its own wording, because its Groceries tab and add screens
have not been adapted yet, and a half-adapted app would show the wrong list.
Use the web app to send ingredients to Bring!. The mobile app will follow in a
later release.
