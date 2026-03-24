# wyle-cos-mobile

React Native (Expo) app for **Wyle** — Personal Chief of Staff.

---

## Stack
| Layer | Technology |
|---|---|
| Framework | React Native + Expo ~51 |
| Navigation | React Navigation (Stack + Bottom Tabs) |
| State | Zustand |
| API Client | Axios |
| Language | TypeScript (strict) |
| Styling | StyleSheet (custom Wyle theme) |

---

## Brand Colors
| Name | Hex | Usage |
|---|---|---|
| Jet Black | `#000000` | App background |
| Sweet Salmon | `#FF9E8A` | Quick questions / prompts |
| Crimson | `#DC143C` | Warnings / errors |
| Yellow | `#E8FF00` | CTA / Add to cart / Payments |
| Verdigris | `#40B0A6` | Buddy / positive states |
| Salmon | `#FA8072` | Buddy talking |
| White | `#FFFFFF` | All text |

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env and fill in API URL
cp .env.example .env

# 3. Start Expo
npm start

# Run on device/simulator
npm run ios
npm run android
```

---

## Folder Structure

```
wyle-cos-mobile/
├── App.tsx                        # Entry point
├── app.json                       # Expo config
├── tsconfig.json                  # TypeScript config (path aliases)
├── babel.config.js                # Babel + module resolver
├── .env.example                   # Environment template
│
└── src/
    ├── screens/
    │   ├── Onboarding/
    │   │   ├── WelcomeScreen.tsx      # App intro + value prop
    │   │   ├── PreferencesScreen.tsx  # 5 lifestyle questions
    │   │   ├── ObligationScanScreen.tsx # Scan/add obligations
    │   │   └── ReadyScreen.tsx        # Onboarding complete
    │   │
    │   ├── Home/
    │   │   └── HomeScreen.tsx         # LOS score, brief, alerts, quick actions
    │   │
    │   ├── Obligations/
    │   │   └── ObligationsScreen.tsx  # Full obligation stack
    │   │
    │   ├── Food/
    │   │   └── FoodScreen.tsx         # 3-tap food ordering
    │   │
    │   ├── Buddy/
    │   │   └── BuddyScreen.tsx        # AI chat (Claude-powered)
    │   │
    │   ├── Insights/
    │   │   └── InsightsScreen.tsx     # Time saved, LOS, decisions
    │   │
    │   └── Settings/
    │       └── SettingsScreen.tsx     # Preferences, trust tier, logout
    │
    ├── components/
    │   ├── common/
    │   │   ├── Button.tsx             # Primary / CTA / ghost variants
    │   │   └── index.tsx              # Card, Badge, CertaintyScore, ScreenHeader
    │   ├── buddy/                     # BuddyMessage, BuddyAvatar
    │   ├── obligations/               # ObligationCard, RiskBadge
    │   ├── food/                      # FoodCard, CertaintyScore
    │   ├── home/                      # LOSRing, ValueStrip, AlertCard
    │   └── insights/                  # ScoreRing, MetricCard
    │
    ├── navigation/
    │   └── index.tsx                  # Root stack + Tab navigator
    │
    ├── services/
    │   └── api.ts                     # All backend API calls (Axios)
    │
    ├── store/
    │   └── index.ts                   # Zustand global state
    │
    ├── theme/
    │   └── index.ts                   # Colors, Typography, Spacing, Radius
    │
    ├── hooks/
    │   └── index.ts                   # useAuth, useObligations, useBrief, useInsights
    │
    ├── constants/
    │   └── index.ts                   # Obligation labels/icons, dietary options, prompts
    │
    ├── types/
    │   └── index.ts                   # All TypeScript interfaces
    │
    ├── utils/
    │   └── index.ts                   # Date, risk, certainty, currency helpers
    │
    └── assets/
        ├── images/                    # App icon, splash screen
        ├── icons/                     # Custom icons
        └── fonts/                     # Custom fonts
```

---

## Screens (V1 — Saturday demo)

| Screen | Status | Notes |
|---|---|---|
| Welcome | 🚧 Scaffold | Build: value prop, "Start" CTA |
| Preferences | 🚧 Scaffold | 5 lifestyle questions |
| ObligationScan | 🚧 Scaffold | Seed demo obligations |
| Ready | 🚧 Scaffold | Onboarding complete |
| Home | ✅ Built | LOS, brief, alerts, quick actions |
| Obligations | 🚧 Scaffold | Build: list + resolve |
| Food | 🚧 Scaffold | Build: 3-tap flow |
| Buddy | ✅ Built | Claude chat |
| Insights | 🚧 Scaffold | Build: metrics panel |

---

## V1 Rules (enforced throughout)
- ≤ 3 taps from food intent → confirmed order
- Certainty score shown before every action
- No silent executions — always confirm first
- Autonomy Tier 0–1 only (Observer + Suggester)
- Every recommendation explainable on demand

---

## Path Aliases (tsconfig)
```ts
import { Colors } from '@theme';
import { useAuth } from '@hooks';
import { obligationsAPI } from '@services/api';
import Button from '@components/common/Button';
```
