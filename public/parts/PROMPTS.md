# Character Parts Sprite Sheet Prompts

Spec: 1696x2520px total, 212x280px per frame, 8 cols x 9 rows, ZERO padding.

NOTE: AI often outputs 1696x2528 instead of 1696x2520. After generation, crop/resize to exactly 1696x2520.
NOTE: Use solid white background (#FFFFFF), then manually remove background. AI fails at true transparency.

---

## Base Body (Skin Tones)

```
A complete sprite sheet of a single 2D game character. Chibi anime style, extremely cute with a very big round head (about 1/2 of total height), very small and slim body — emphasize a tiny narrow waist and slightly wider hips to create a cute pear-shaped chibi silhouette. Thin delicate arms, short stubby legs. NOT chubby, NOT thick — the body should look petite and dainty.

The character is a base body template: completely bald (no hair at all), and the face must be COMPLETELY BLANK — no eyes, no mouth, no eyebrows, no facial features at all. Just a plain smooth skin-colored head with no face. Facial features will be added as a separate overlay layer. Wearing a plain white sports bra and matching white hot pants (modest, wholesome athletic underwear style — this is the base layer for a dress-up system where clothes will be layered on top). Simple small shoes. Skin tone: [LIGHT / FAIR / MEDIUM / TAN / BROWN / DARK].

ABSOLUTE SIZE REQUIREMENT — THIS IS THE MOST IMPORTANT RULE:
- Total image: EXACTLY 1696 pixels wide, EXACTLY 2520 pixels tall. NOT 2528, NOT 2512, EXACTLY 2520.
- Grid: 8 columns, 9 rows.
- Each cell: EXACTLY 212 x 280 pixels.
- 212 x 8 = 1696. 280 x 9 = 2520. No rounding, no extra pixels.
- ZERO padding, ZERO margin, ZERO gap between cells.
- DO NOT draw any grid lines, borders, dividers, or separators between frames. The frames are invisible divisions — no lines should be visible on the image.
- Character centered in each cell, feet at bottom.

ROW LAYOUT (top to bottom):
Row 1 (y: 0-279): front-facing walk cycle, 8 frames
Row 2 (y: 280-559): front-facing sitting and working pose — the character must face DIRECTLY FORWARD (perfectly symmetrical, looking straight at the viewer, NOT turned to any side). NO chair, NO desk, NO furniture — just the character sitting in the air with both hands forward as if typing. 8 frames
Row 3 (y: 560-839): left-facing walk cycle, 8 frames
Row 4 (y: 840-1119): left-facing sitting and working pose (no furniture), 8 frames
Row 5 (y: 1120-1399): right-facing walk cycle, 8 frames
Row 6 (y: 1400-1679): right-facing sitting and working pose (no furniture), 8 frames
Row 7 (y: 1680-1959): back-facing walk cycle, 8 frames
Row 8 (y: 1960-2239): back-facing sitting and working pose (no furniture), 8 frames
Row 9 (y: 2240-2519): front-facing jumping animation, 8 frames

Solid white background (#FFFFFF). Clean lines, flat colors, soft pastel skin. No accessories, no hair, no hat. Consistent character size and position across ALL 72 frames.
```

---

## Hair (Overlay Layer)

```
A sprite sheet containing ONLY an isolated hair piece for a 2D chibi anime game character. [STYLE] hairstyle in [COLOR] color. Draw ONLY the hair — no face, no body, no skin, nothing else. The hair should be positioned where a chibi character's big round head would be in each frame. Solid white background (#FFFFFF).

Chibi proportions: the head is very large (about half the character's total height), so the hair should be large and prominent.

ABSOLUTE SIZE REQUIREMENT:
- Total image: EXACTLY 1696 x 2520 pixels. NOT 2528.
- Grid: 8 columns, 9 rows. Each cell: 212 x 280 pixels. ZERO padding. NO grid lines, NO borders, NO dividers between frames.

ROW LAYOUT:
Row 1 (y: 0-279): front-facing walk cycle hair, 8 frames
Row 2 (y: 280-559): front-facing sitting pose hair, 8 frames
Row 3 (y: 560-839): left-facing walk cycle hair, 8 frames
Row 4 (y: 840-1119): left-facing sitting pose hair, 8 frames
Row 5 (y: 1120-1399): right-facing walk cycle hair, 8 frames
Row 6 (y: 1400-1679): right-facing sitting pose hair, 8 frames
Row 7 (y: 1680-1959): back-facing walk cycle hair, 8 frames
Row 8 (y: 1960-2239): back-facing sitting pose hair, 8 frames
Row 9 (y: 2240-2519): front-facing jump hair, 8 frames

This is an overlay layer for a character customization system. Will be composited on top of a bald base body.
```

**Hair styles:** Short, Medium, Long, Curly, Ponytail, Mohawk, Pigtails
**Hair colors:** Black, Brown, Blonde, Red, Gray, Blue, Pink, Green

---

## Clothes (Overlay Layer)

```
A sprite sheet containing ONLY isolated clothing for a 2D chibi anime game character. [STYLE] in [COLOR] color. Draw ONLY the clothing — no head, no skin, no hair, nothing else. The clothing should be shaped and positioned to fit a very small chibi body (tiny narrow waist, slightly wider hips, thin arms, short legs). Solid white background (#FFFFFF).

ABSOLUTE SIZE REQUIREMENT:
- Total image: EXACTLY 1696 x 2520 pixels. NOT 2528.
- Grid: 8 columns, 9 rows. Each cell: 212 x 280 pixels. ZERO padding. NO grid lines, NO borders, NO dividers between frames.

ROW LAYOUT:
Row 1 (y: 0-279): front-facing walk cycle clothes, 8 frames
Row 2 (y: 280-559): front-facing sitting pose clothes, 8 frames
Row 3 (y: 560-839): left-facing walk cycle clothes, 8 frames
Row 4 (y: 840-1119): left-facing sitting pose clothes, 8 frames
Row 5 (y: 1120-1399): right-facing walk cycle clothes, 8 frames
Row 6 (y: 1400-1679): right-facing sitting pose clothes, 8 frames
Row 7 (y: 1680-1959): back-facing walk cycle clothes, 8 frames
Row 8 (y: 1960-2239): back-facing sitting pose clothes, 8 frames
Row 9 (y: 2240-2519): front-facing jump clothes, 8 frames

This is an overlay layer for a character customization system.
```

**Clothes styles:** T-Shirt, Hoodie, Suit, Tank Top, Sweater, Dress, Crop Top, Off-Shoulder Top
**Clothes colors:** Blue, Red, Green, Purple, Orange, Black, White, Yellow

---

## Face (Overlay Layer)

```
A sprite sheet containing ONLY isolated facial features (eyes and mouth) for a 2D chibi anime game character. [EXPRESSION] expression. Draw ONLY the eyes and mouth — no head outline, no skin color, no hair. Big expressive chibi anime eyes. Position the features where they would appear on a large round chibi head. Solid white background (#FFFFFF).

ABSOLUTE SIZE REQUIREMENT:
- Total image: EXACTLY 1696 x 2520 pixels. NOT 2528.
- Grid: 8 columns, 9 rows. Each cell: 212 x 280 pixels. ZERO padding. NO grid lines, NO borders, NO dividers between frames.

ROW LAYOUT:
Row 1-9: same as base body layout. Back-facing rows (7-8) should have NO facial features (face not visible from behind).

This is an overlay layer for a character customization system.
```

**Face styles:** Normal, Happy, Glasses, Cat-mouth

---

## Hat (Overlay Layer)

```
A sprite sheet containing ONLY an isolated hat/headwear for a 2D chibi anime game character. [HAT TYPE]. Draw ONLY the hat — nothing else. The hat should be sized to sit on top of a very large round chibi head (head is about half the character's height). Solid white background (#FFFFFF).

ABSOLUTE SIZE REQUIREMENT:
- Total image: EXACTLY 1696 x 2520 pixels. NOT 2528.
- Grid: 8 columns, 9 rows. Each cell: 212 x 280 pixels. ZERO padding. NO grid lines, NO borders, NO dividers between frames.

ROW LAYOUT:
Row 1-9: same as base body layout. Hat follows head position in all animations.

This is an overlay layer for a character customization system.
```

**Hat styles:** Cap, Beanie, Crown, Headband, Bow

---

## Accessory (Overlay Layer — Held Item)

```
A sprite sheet containing ONLY an isolated handheld item for a 2D chibi anime game character. [ITEM]. Draw ONLY the item — nothing else. The item should be positioned where a chibi character's small hand would be in each frame. Solid white background (#FFFFFF).

ABSOLUTE SIZE REQUIREMENT:
- Total image: EXACTLY 1696 x 2520 pixels. NOT 2528.
- Grid: 8 columns, 9 rows. Each cell: 212 x 280 pixels. ZERO padding. NO grid lines, NO borders, NO dividers between frames.

ROW LAYOUT:
Row 1-9: same as base body layout. Item follows hand position in all animations.

This is an overlay layer for a character customization system.
```

**Accessory styles:** Coffee Cup, Book, Sword, Flower, Flag

---

## Complete Character (Single Sheet — No Parts)

Use this prompt when generating a fully assembled character in one image (not parts-based customization). Attach a **reference image** and fill in the `[DESCRIPTION]` fields.

```
THIS IS A SPRITE SHEET FOR A 2D GAME ENGINE. It will be sliced into individual frames by code and played back as animation. Every frame MUST be precisely aligned to the grid — this is NOT decorative art, it is a technical game asset. If frames are misaligned, offset, or inconsistently sized, the animation will break in the game.

A complete sprite sheet of a single 2D game character. HIGH QUALITY, DETAILED illustration — clean smooth lines, rich colors, soft shading, NO pixelation, NO low-res artifacts, NO blurriness, NO smudging. Take as much time as needed to render every frame with full detail and clarity. Do NOT rush or compress the quality to fit everything — each of the 72 frames must be drawn with the same level of care as a standalone illustration. The character must look sharp and well-defined in EVERY frame — no mushy faces, no blobby limbs, no melted features. Chibi anime style, extremely cute with a very big round head (about 1/2 of total height), very small and slim body — tiny narrow waist and slightly wider hips creating a cute pear-shaped chibi silhouette. Thin delicate arms, short stubby legs. NOT chubby, NOT thick — petite and dainty.

CHARACTER DESIGN: Match the attached reference image as closely as possible. Reproduce the same hair, eyes, outfit, accessories, and colors exactly. The character's appearance must stay PERFECTLY CONSISTENT across all 72 frames. Every frame must look like the exact same character.

CRITICAL — CHARACTER MUST FIT INSIDE EACH CELL WITH NO CLIPPING:
- The character must be fully contained within each 212x280 cell. NO part of the character (head, hair, arms, feet, accessories) should be cut off or extend beyond the cell boundary.
- The character's feet must touch the BOTTOM EDGE of each cell exactly — align the soles to the very bottom pixel row of the cell.
- Leave a small gap (about 5-10px) above the character's head to the top edge of the cell.
- Keep the character horizontally centered in each cell.
- Maintain the SAME character size and vertical position across ALL 72 frames so the animation does not jitter.

ABSOLUTE SIZE REQUIREMENT — THIS IS THE MOST IMPORTANT RULE:
- Total image: EXACTLY 1696 pixels wide, EXACTLY 2520 pixels tall. NOT 2528, NOT 2512, EXACTLY 2520.
- Grid: 8 columns, 9 rows.
- Each cell: EXACTLY 212 x 280 pixels.
- 212 x 8 = 1696. 280 x 9 = 2520. No rounding, no extra pixels.
- ZERO padding, ZERO margin, ZERO gap between cells.
- DO NOT draw any grid lines, borders, dividers, or separators between frames. The frames are invisible divisions — no lines should be visible on the image.
- Character centered in each cell, feet at bottom.

ANIMATION QUALITY — MAKE IT LIVELY:
- Walk cycles must show clear leg movement, arm swinging, and slight body bounce. Each of the 8 frames should be a distinct pose in the walk cycle — NOT static copies.
- Sitting/typing poses must show active hand movement, slight head bobbing, and body shifting — the character should look alive and busy, not frozen.
- Jump animation must show a full arc: crouch → launch → peak → fall → land with visible squash and stretch.
- Every row must have 8 visually DISTINCT frames that create smooth, fluid animation when played in sequence.

ROW LAYOUT (top to bottom, 8 frames per row):
Row 1 (y: 0-279): front-facing walk cycle, 8 frames — full smooth looping walk with arm swing and body bounce
Row 2 (y: 280-559): front-facing sitting and working pose — character faces DIRECTLY FORWARD (perfectly symmetrical, looking straight at viewer). NO chair, NO desk, NO furniture — just the character sitting in the air with both hands forward as if typing on an invisible keyboard. 12 frames with active typing motion, head bob, and body sway
Row 3 (y: 560-839): left-facing walk cycle, 8 frames
Row 4 (y: 840-1119): left-facing sitting and working pose (no furniture), 8 frames
Row 5 (y: 1120-1399): right-facing walk cycle, 8 frames
Row 6 (y: 1400-1679): right-facing sitting and working pose (no furniture), 8 frames
Row 7 (y: 1680-1959): back-facing walk cycle, 8 frames
Row 8 (y: 1960-2239): back-facing sitting and working pose (no furniture), 8 frames
Row 9 (y: 2240-2519): front-facing celebration dance (first 4 frames) + front-facing alert jump (last 4 frames)

Solid white background (#FFFFFF). Clean lines, flat colors, soft pastel shading. Consistent character size and position across ALL 72 frames. The character should be the same recognizable person in every single frame.
```

---

## Post-Generation Checklist

1. **Size check**: Output must be 1696x2520. AI often generates wrong height — crop/resize if needed.
2. **Background removal**: Generated with white bg → use background remover tool for overlay layers.
3. **Body shape check**: Verify tiny waist, wider hips, petite silhouette. Re-roll if chubby.
4. **Right-facing shortcut**: Left-facing rows can be horizontally flipped to create right-facing rows.
5. **Pixel cleanup**: Run through Unfaker (jenissimo.itch.io/unfaker) if edges are messy.
6. **Alignment test**: Overlay the hair/clothes PNG on the base body to check positioning matches.
