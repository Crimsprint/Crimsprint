# Layered avatars

## Dressing room screenshots

| Viewport | Light | Dark |
| --- | --- | --- |
| Desktop, 1440 px | [Light](desktop-light.png) | [Dark](desktop-dark.png) |
| Phone, 390 px | [Light](phone-light.png) | [Dark](phone-dark.png) |

The screenshots use a local test account. The phone captures show the entire scrollable page with the fixed tab bar placed at the bottom of the image.

## Six sample outfits

| Library Night | Relay Captain | Crimson Graduate |
| --- | --- | --- |
| ![Library Night](01-library-night.png) | ![Relay Captain](02-relay-captain.png) | ![Crimson Graduate](03-crimson-graduate.png) |

| Art Club | Rooftop Radio | Campus Stroll |
| --- | --- | --- |
| ![Art Club](04-art-club.png) | ![Rooftop Radio](05-rooftop-radio.png) | ![Campus Stroll](06-campus-stroll.png) |

## Coin pricing

The game selects three daily quests from its daily pool and pays 5 Coins for each one completed. The three weekly quests each pay 30 Coins. They require 150 points, eight lessons, and three practice sessions respectively. Each unit chest adds 20 Coins once per unit. [Daily quest selection](../../supabase/migrations/0002_gamification_mock_admin.sql) · [Quest rewards and weekly goals](../../supabase/migrations/0007_pages_shop_drills.sql) · [Unit chests](../../supabase/migrations/0006_learning_path.sql)

The active-week estimate assumes studying five days, completing two quests per study day, and meeting all three weekly goals. That gives `5 × 2 × 5 + 3 × 30 = 140 Coins/week`, or 20 Coins per calendar day on average. Actual earnings arrive in chunks as quests complete. One-time chests are excluded from this recurring estimate.

| Rarity | Standard price | Time at 140 Coins per week |
| --- | ---: | ---: |
| Common | 50 | 2.5 calendar days |
| Rare | 120 | 6 calendar days |
| Epic | 300 | 2.14 weeks |
| Legendary | 700 | 5 weeks |

The Graduation Cap (100), Reading Glasses (60), and Bow Tie (40) retain their previous prices. All six skin tones, eight hairstyles, custom hair color, and five expressions are free, as are the starter tee, joggers, and sneakers.

## Database rollout

Apply [0012_layered_avatars.sql](../../supabase/migrations/0012_layered_avatars.sql) before deploying the avatar client. The new client stores equipped item IDs and a hex hair color in `profiles.outfit`. Until the learner saves an outfit, the renderer uses the legacy avatar color as a matching hair tint. An equipped Graduation Cap maps to headwear, while Reading Glasses and Bow Tie map to accessories. The existing inventory IDs also make previously bought, unequipped items available to wear.

The old client can continue using the legacy avatar fields and RPC signatures. The database uses the existing `buy_item` RPC for purchases and checks slot validity and paid-item ownership when equipping.
