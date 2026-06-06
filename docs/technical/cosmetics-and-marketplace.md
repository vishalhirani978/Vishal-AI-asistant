# Cosmetics & Marketplace System

To transition Vishal into a customizable companion, we implement a gamified Pixel Coin economy and cosmetic layering system.

---

## 1. Data Model (`vishal-settings.json`)

The user's customization state is stored inside the standard settings file:
```json
{
  "coins": 150,
  "unlockedCosmetics": ["santa_hat", "sleek_shades"],
  "equippedHat": "santa_hat",
  "equippedGlasses": "sleek_shades",
  "equippedSkin": "cyberpunk"
}
```

- **Coin Generation**:
  - Main process hooks into IPC channels.
  - Every successful tool invocation grants `+10 coins`.
  - Every chat message parsed grants `+5 coins`.
- Settings are saved atomically, triggering a renderer event to update overlays instantly.

---

## 2. HTML Layering & SVG Overlays

Instead of altering the base sprite files (which would require hundreds of pre-rendered combinations), we stack transparent vector overlays directly on top of the character image:

```html
<div id="vishal-container">
  <!-- Dynamic overlays for hats, glasses, or accessories -->
  <div id="accessory-hat" class="cosmetic-overlay"></div>
  <div id="accessory-glasses" class="cosmetic-overlay"></div>
  <img id="vishal" src="../assets/character-front.png" alt="Vishal">
  <div id="vishal-name-tag">Vishal</div>
</div>
```

- **Visual Assets**: Accessories are rendered using responsive inline SVGs embedded in CSS or generated dynamically via Javascript.
- **Positioning**: They are aligned using percentage-based positioning (`top`, `left`, `width`) relative to the parent container so they scale accurately when the character size changes (e.g. 80% to 150%).
- **Pose Adjustments**: When Vishal's pose changes (e.g. `thinking`, `pointingRight`), we append class names to the overlays (e.g., `#accessory-hat.thinking-pose`) to adjust SVG positions (offsets) dynamically.

---

## 3. Skin Customization (CSS Filters)

We apply outfits and skins by injecting CSS filter configurations onto the `#vishal` image:

- **Cyberpunk Purple**: `filter: hue-rotate(90deg) saturate(1.2)`
- **Emerald Green**: `filter: hue-rotate(180deg) saturate(1.2)`
- **Crimson Red**: `filter: hue-rotate(275deg) saturate(1.3)`
- **Matrix Neon**: Uses a keyframe animation looping the hue rotate from `0deg` to `360deg` for a glowing rainbow effect.

```css
@keyframes matrixPulse {
  0% { filter: hue-rotate(0deg) saturate(1.5); }
  100% { filter: hue-rotate(360deg) saturate(1.5); }
}
```

---

## 4. Marketplace Tab inside Settings Window

The Settings window contains a dedicated **Marketplace & Cosmetics** panel:
1. Queries current settings for `coins` and `unlockedCosmetics`.
2. Displays grid list of available items (Top Hat, 3D Glasses, Emerald Skin).
3. If an item is locked, user can click "Purchase" (if coins are sufficient).
4. If unlocked, clicking "Equip" saves it to the configuration.
5. Emits the changes to trigger instant visual updates on the desktop character overlay.
