# Character Parts Sprite Sheet Prompts

Spec: 848x1260px total, 106x140px per frame, 8 cols x 9 rows, ZERO padding.

NOTE: AI often outputs 848x1264 instead of 848x1260. After generation, crop/resize to exactly 848x1260.
NOTE: Use solid white background (#FFFFFF), then manually remove background. AI fails at true transparency.

---

## Base Body (Skin Tones)

```
A complete sprite sheet of a single 2D game character. Chibi anime style, extremely cute with a very big round head (about 1/2 of total height), very small and slim body — emphasize a tiny narrow waist and slightly wider hips to create a cute pear-shaped chibi silhouette. Thin delicate arms, short stubby legs. NOT chubby, NOT thick — the body should look petite and dainty.

The character is a base body template: completely bald (no hair at all), and the face must be COMPLETELY BLANK — no eyes, no mouth, no eyebrows, no facial features at all. Just a plain smooth skin-colored head with no face. Facial features will be added as a separate overlay layer. Wearing a plain white sports bra and matching white hot pants (modest, wholesome athletic underwear style — this is the base layer for a dress-up system where clothes will be layered on top). Simple small shoes. Skin tone: [LIGHT / FAIR / MEDIUM / TAN / BROWN / DARK].

ABSOLUTE SIZE REQUIREMENT — THIS IS THE MOST IMPORTANT RULE:
- Total image: EXACTLY 848 pixels wide, EXACTLY 1260 pixels tall. NOT 1264, NOT 1256, EXACTLY 1260.
- Grid: 8 columns, 9 rows.
- Each cell: EXACTLY 106 x 140 pixels.
- 106 x 8 = 848. 140 x 9 = 1260. No rounding, no extra pixels.
- ZERO padding, ZERO margin, ZERO gap between cells.
- DO NOT draw any grid lines, borders, dividers, or separators between frames. The frames are invisible divisions — no lines should be visible on the image.
- Character centered in each cell, feet at bottom.

ROW LAYOUT (top to bottom):
Row 1 (y: 0-139): front-facing walk cycle, 8 frames
Row 2 (y: 140-279): front-facing sitting and working pose — the character must face DIRECTLY FORWARD (perfectly symmetrical, looking straight at the viewer, NOT turned to any side). NO chair, NO desk, NO furniture — just the character sitting in the air with both hands forward as if typing. 8 frames
Row 3 (y: 280-419): left-facing walk cycle, 8 frames
Row 4 (y: 420-559): left-facing sitting and working pose (no furniture), 8 frames
Row 5 (y: 560-699): right-facing walk cycle, 8 frames
Row 6 (y: 700-839): right-facing sitting and working pose (no furniture), 8 frames
Row 7 (y: 840-979): back-facing walk cycle, 8 frames
Row 8 (y: 980-1119): back-facing sitting and working pose (no furniture), 8 frames
Row 9 (y: 1120-1259): front-facing jumping animation, 8 frames

Solid white background (#FFFFFF). Clean lines, flat colors, soft pastel skin. No accessories, no hair, no hat. Consistent character size and position across ALL 72 frames.
```

---

## Hair (Overlay Layer)

```
A sprite sheet containing ONLY an isolated hair piece for a 2D chibi anime game character. [STYLE] hairstyle in [COLOR] color. Draw ONLY the hair — no face, no body, no skin, nothing else. The hair should be positioned where a chibi character's big round head would be in each frame. Solid white background (#FFFFFF).

Chibi proportions: the head is very large (about half the character's total height), so the hair should be large and prominent.

ABSOLUTE SIZE REQUIREMENT:
- Total image: EXACTLY 848 x 1260 pixels. NOT 1264.
- Grid: 8 columns, 9 rows. Each cell: 106 x 140 pixels. ZERO padding. NO grid lines, NO borders, NO dividers between frames.

ROW LAYOUT:
Row 1 (y: 0-139): front-facing walk cycle hair, 8 frames
Row 2 (y: 140-279): front-facing sitting pose hair, 8 frames
Row 3 (y: 280-419): left-facing walk cycle hair, 8 frames
Row 4 (y: 420-559): left-facing sitting pose hair, 8 frames
Row 5 (y: 560-699): right-facing walk cycle hair, 8 frames
Row 6 (y: 700-839): right-facing sitting pose hair, 8 frames
Row 7 (y: 840-979): back-facing walk cycle hair, 8 frames
Row 8 (y: 980-1119): back-facing sitting pose hair, 8 frames
Row 9 (y: 1120-1259): front-facing jump hair, 8 frames

This is an overlay layer for a character customization system. Will be composited on top of a bald base body.
```

**Hair styles:** Short, Medium, Long, Curly, Ponytail, Mohawk, Pigtails
**Hair colors:** Black, Brown, Blonde, Red, Gray, Blue, Pink, Green

---

## Clothes (Overlay Layer)

```
A sprite sheet containing ONLY isolated clothing for a 2D chibi anime game character. [STYLE] in [COLOR] color. Draw ONLY the clothing — no head, no skin, no hair, nothing else. The clothing should be shaped and positioned to fit a very small chibi body (tiny narrow waist, slightly wider hips, thin arms, short legs). Solid white background (#FFFFFF).

ABSOLUTE SIZE REQUIREMENT:
- Total image: EXACTLY 848 x 1260 pixels. NOT 1264.
- Grid: 8 columns, 9 rows. Each cell: 106 x 140 pixels. ZERO padding. NO grid lines, NO borders, NO dividers between frames.

ROW LAYOUT:
Row 1 (y: 0-139): front-facing walk cycle clothes, 8 frames
Row 2 (y: 140-279): front-facing sitting pose clothes, 8 frames
Row 3 (y: 280-419): left-facing walk cycle clothes, 8 frames
Row 4 (y: 420-559): left-facing sitting pose clothes, 8 frames
Row 5 (y: 560-699): right-facing walk cycle clothes, 8 frames
Row 6 (y: 700-839): right-facing sitting pose clothes, 8 frames
Row 7 (y: 840-979): back-facing walk cycle clothes, 8 frames
Row 8 (y: 980-1119): back-facing sitting pose clothes, 8 frames
Row 9 (y: 1120-1259): front-facing jump clothes, 8 frames

This is an overlay layer for a character customization system.
```

**Clothes styles:** T-Shirt, Hoodie, Suit, Tank Top, Sweater, Dress, Crop Top, Off-Shoulder Top
**Clothes colors:** Blue, Red, Green, Purple, Orange, Black, White, Yellow

---

## Face (Overlay Layer)

```
A sprite sheet containing ONLY isolated facial features (eyes and mouth) for a 2D chibi anime game character. [EXPRESSION] expression. Draw ONLY the eyes and mouth — no head outline, no skin color, no hair. Big expressive chibi anime eyes. Position the features where they would appear on a large round chibi head. Solid white background (#FFFFFF).

ABSOLUTE SIZE REQUIREMENT:
- Total image: EXACTLY 848 x 1260 pixels. NOT 1264.
- Grid: 8 columns, 9 rows. Each cell: 106 x 140 pixels. ZERO padding. NO grid lines, NO borders, NO dividers between frames.

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
- Total image: EXACTLY 848 x 1260 pixels. NOT 1264.
- Grid: 8 columns, 9 rows. Each cell: 106 x 140 pixels. ZERO padding. NO grid lines, NO borders, NO dividers between frames.

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
- Total image: EXACTLY 848 x 1260 pixels. NOT 1264.
- Grid: 8 columns, 9 rows. Each cell: 106 x 140 pixels. ZERO padding. NO grid lines, NO borders, NO dividers between frames.

ROW LAYOUT:
Row 1-9: same as base body layout. Item follows hand position in all animations.

This is an overlay layer for a character customization system.
```

**Accessory styles:** Coffee Cup, Book, Sword, Flower, Flag

---

## Post-Generation Checklist

1. **Size check**: Output must be 848x1260. AI often makes 848x1264 — crop bottom 4px if needed.
2. **Background removal**: Generated with white bg → use background remover tool for overlay layers.
3. **Body shape check**: Verify tiny waist, wider hips, petite silhouette. Re-roll if chubby.
4. **Right-facing shortcut**: Left-facing rows can be horizontally flipped to create right-facing rows.
5. **Pixel cleanup**: Run through Unfaker (jenissimo.itch.io/unfaker) if edges are messy.
6. **Alignment test**: Overlay the hair/clothes PNG on the base body to check positioning matches.
