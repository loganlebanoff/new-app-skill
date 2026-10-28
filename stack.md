# The stack and why

Everything below was chosen so the app costs nothing and runs on a real iPhone from an Ubuntu
machine with no Mac. Change a row only when the new spec forces it.

| Area | Choice | Why |
|---|---|---|
| Framework | Expo managed workflow + TypeScript | Expo Go is the only free path to an iPhone without a Mac or the $99 developer fee |
| SDK version | Whatever the App Store Expo Go runs today | Expo Go supports one SDK at a time; ahead or behind both fail on launch |
| Routing | expo-router (file-based, `src/app/`) | Deep links work on web for free, typed routes with `experiments.typedRoutes` |
| Styling | NativeWind 4 + Tailwind 3 | Same classes on web and native, `dark:` variants for free |
| State | zustand, one store | One `load()` from the root layout, screens select slices |
| Data | Supabase free tier, Postgres + edge functions | Two phones see the same data; free tier is enough for personal use |
| Auth | None | Anon key in `.env` is the only gate; auth would slow a private app down for nothing |
| Backups | GitHub Actions nightly `pg_dump` to a `db-backups` branch | Free tier keeps no backups |
| Dev loop | `npm run web` in a browser, `tsc --noEmit` | Faster than the phone; phone check once per phase |
| Phone during dev | `npx expo start --tunnel`, scan with Camera | Tunnel works across networks and firewalls |
| Phone after dev | EAS Update, branch `main`, runtime policy `sdkVersion` | App opens from expo.dev with no dev server running |
| Fonts | `@expo-google-fonts/<face>` via `useFonts` | Works in Expo Go, no asset pipeline |
| Images | `expo-image` | Caching and placeholders built in |

Expo Go limits that shape every spec: no custom native modules, no share extensions, no widgets,
no Live Activities or lock-screen timers, no background tasks beyond what Expo ships. Anything in
those categories goes in the spec as excluded or as a Scriptable workaround.

## Data layer

Two implementations behind one interface, chosen at import time:

```ts
// src/lib/supabase.ts
import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** Null until the keys are set in .env; the app then runs on demo data. */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey, { auth: { persistSession: false } }) : null;
```

```ts
// src/data/index.ts
export type BackendMode = 'demo' | 'supabase';
export const backendMode: BackendMode = supabase ? 'supabase' : 'demo';
export const repo: Repository = supabase ? new SupabaseRepository(supabase) : new MockRepository();
```

The `Repository` interface is the only thing screens and the store import. Each method is a
single storage operation (`listRecipes`, `setMealPlan`, `markCooked`). Mealwright's version is at
`~/mealwright/src/data/repository.ts`.

Schema conventions that held up: `uuid primary key default gen_random_uuid()`, `jsonb` for
nested lists the app owns (ingredients, steps), `text[]` or `uuid[]` for tags and many-to-many
links (arrays cannot carry foreign keys, so the app cleans them up on delete), an `updated_at`
trigger, and starter rows inserted at the bottom of `schema.sql`.

## Root layout

Load fonts and data in `src/app/_layout.tsx`, not per screen, so a deep link straight to a modal
on web still has data. Return `null` until fonts are loaded. Wrap the `Stack` in `ThemeProvider`
from `expo-router/react-navigation` (not `@react-navigation/native`, which expo-router no longer
re-exports) with `DarkTheme`/`DefaultTheme` picked from `useColorScheme()`.

## AGENTS.md template

```markdown
# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v<N>.0.0/ before writing any code.

This project tracks whatever SDK the App Store build of Expo Go supports (the only way to run
the app on a real iPhone without a Mac or a paid Apple account). Expo Go supports exactly one
SDK version at a time, so when the App Store client moves, the project must move with it,
and never past it. As of <month year> that is SDK <N>. If the phone shows a version-mismatch
error on launch, the client has moved again: upgrade the project to match.
```

Also add `.claude/settings.json` with `{"enabledPlugins": {"expo@claude-plugins-official": true}}`
and a `CLAUDE.md` containing only `@AGENTS.md`.
