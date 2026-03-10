# Wyle Brand Corrections — from Brand Guidelines PDF

## What Changed (v1 → v2)

### 1. Colors — CORRECTED

| Token | v1 (wrong) | v2 (correct) | Source |
|---|---|---|---|
| Background (Jet Black) | `#000000` | `#002F3A` | PDF page 27 |
| Verdigris | `#40B0A6` | `#1B998B` | PDF page 27 |
| CTA color (Chartreuse) | `#E8FF00` | `#D5FF3F` | PDF page 28 |
| Sweet Salmon | `#FF9E8A` | `#FF9F8A` | PDF page 28 |
| Crimson | `#DC143C` | `#D7263D` | PDF page 28 |
| White | `#FFFFFF` | `#FEFFFE` | PDF page 26 |

### 2. Typography — CORRECTED (entirely new)

Brand doc specifies (PDF page 11):
| Usage | Font | Weight |
|---|---|---|
| **Headlines** | Poppins | Bold |
| **Subtitles** | Montserrat | SemiBold |
| **Body** | Inter | Regular |
| **UI / CTA** | Inter | SemiBold |

**Install command:**
```bash
npx expo install @expo-google-fonts/poppins @expo-google-fonts/montserrat @expo-google-fonts/inter expo-font expo-splash-screen
```

### 3. Color Semantics — from brand doc

| Color | Meaning | Use in app |
|---|---|---|
| Jet Black `#002F3A` | Depth, intelligence, background | App background |
| Verdigris `#1B998B` | Balance, trust | Buddy, positive states, primary actions |
| Chartreuse `#D5FF3F` | Innovation spark, action | **All CTAs, FAB, primary buttons** |
| Sweet Salmon `#FF9F8A` | Warmth, approachability | Buddy talking, quick questions |
| Crimson `#D7263D` | Urgency, momentum | High risk, errors, warnings |
| White `#FEFFFE` | Clarity, breathing space | All body text |

### 4. Brand Shapes — to implement

From PDF section 07 (Brand Shapes):
- **Thunder Bolt** → energy, action → use for loading, transitions
- **Semi Circle** → openness, support → use as decorative bg element (WelcomeScreen ✅)
- **S Curve** → stability, flow → use as decorative bg element (WelcomeScreen ✅)

Usage: Crop into shapes for dynamic visual language (see PDF pages 37–39).

### 5. Tone of Voice — apply to all copy in app

From PDF section 03:
1. **Simple and clear** — short sentences, one message at a time
2. **Calm and confident** — no panic, focus on solution
3. **Human and respectful** — speak to people, not users
4. **Time-first** — every message saves time or removes doubt

### 6. Promise / Slogan — use in UI

- **Promise**: "We're Your Local Everything"
- **Slogan**: "From 'I need to' to 'done.'"
- **Positioning**: "Tell Wyle. It's handled."

Use these in: Welcome screen, Home empty states, loading screens, morning brief.

---

## Files Updated This Session

- `src/theme/index.ts` — corrected all color values + font map
- `src/theme/fonts.ts` — NEW: Expo Google Fonts setup guide
- `src/screens/WelcomeScreen.tsx` — NEW: brand-accurate onboarding screen 1
- `src/screens/HomeScreen.tsx` — REBUILT: correct colors, LOS ring, alerts, quick actions
- `src/screens/ObligationsScreen.tsx` — NEW: full obligation stack with risk system + modal

---

## Next Screens to Build

1. **PreferencesScreen** — 5 lifestyle questions (dietary, cuisines, work schedule, household)
2. **BuddyScreen** — Claude chat UI with Salmon color for "Buddy talking" state
3. **FoodScreen** — 3-tap ordering (intent → 3 options with certainty score → confirm)
4. **InsightsScreen** — LOS breakdown, time saved, decisions panel
5. **ObligationScanScreen** — document scan to seed obligations
