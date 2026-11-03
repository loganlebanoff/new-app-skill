# The stack and why

Everything below was chosen so the app costs nothing and runs on a real iPhone from a Linux
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

## NativeWind setup

Five files, all at the repo root except `global.css`.

```js
// babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
```

```js
// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

module.exports = withNativeWind(getDefaultConfig(__dirname), { input: './src/global.css' });
```

```js
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  // 'media' breaks on SDK 58 web (see gotchas.md); useWebDarkMode sets the class instead.
  darkMode: 'class',
  theme: {
    extend: {
      // Filled in by the design pass: brand and accent scales, paper, ink, fontFamily.display.
    },
  },
  plugins: [],
};
```

```css
/* src/global.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

```ts
// nativewind-env.d.ts
/// <reference types="nativewind/types" />

declare module '*.css';
```

`tsconfig.json`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": { "@/*": ["./src/*"], "@/assets/*": ["./assets/*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts", "nativewind-env.d.ts"],
  "exclude": ["node_modules", "supabase/functions"]
}
```

`supabase/functions` is excluded because edge functions are Deno code with URL imports that
`tsc` cannot resolve.

## Data layer

Two implementations behind one interface, chosen at import time. The examples use an `Item`
type; rename it to the app's own nouns.

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

The `Repository` interface is the only storage API that screens and the store import. Each
method is one storage operation, named for what the screen does (`markDone`, not `updateRow`).

```ts
// src/data/repository.ts
import type { Item, ItemInput } from './types';

/** Everything the screens need from storage. Implemented in memory and on Supabase. */
export interface Repository {
  listItems(): Promise<Item[]>;
  createItem(input: ItemInput): Promise<Item>;
  updateItem(id: string, patch: Partial<ItemInput>): Promise<Item>;
  deleteItem(id: string): Promise<void>;
}
```

The mock keeps arrays in memory, starting from `seed.ts`. Seed enough realistic rows that every
screen has something to show; Playwright checks assert on them.

```ts
// src/data/mockRepository.ts
let counter = 0;
const newId = (prefix: string) => `${prefix}-${Date.now()}-${counter++}`;

/** In-memory store on seeded demo data, used when the Supabase env vars are unset. Resets on reload. */
export class MockRepository implements Repository {
  private items: Item[] = [...seedItems];

  async listItems(): Promise<Item[]> {
    return [...this.items];
  }

  async createItem(input: ItemInput): Promise<Item> {
    const now = new Date().toISOString();
    const created: Item = { ...input, id: newId('item'), createdAt: now, updatedAt: now };
    this.items.push(created);
    return created;
  }
  // ...the rest of the interface the same way
}
```

The Supabase version declares a row type per table in snake_case and maps it to the camelCase
domain type in one `toItem` function. Every call checks `error` and throws it.

```ts
// src/data/supabaseRepository.ts
interface ItemRow {
  id: string;
  title: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

const toItem = (r: ItemRow): Item => ({
  id: r.id,
  title: r.title,
  tags: r.tags,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export class SupabaseRepository implements Repository {
  constructor(private client: SupabaseClient) {}

  async listItems(): Promise<Item[]> {
    const { data, error } = await this.client.from('items').select('*').order('title');
    if (error) throw error;
    return (data as ItemRow[]).map(toItem);
  }
  // ...
}
```

```ts
// src/data/index.ts
export type BackendMode = 'demo' | 'supabase';
export const backendMode: BackendMode = supabase ? 'supabase' : 'demo';
export const repo: Repository = supabase ? new SupabaseRepository(supabase) : new MockRepository();
export * from './types';
```

The store holds everything the screens show. `load()` fetches it once; each action calls the
repository and then patches the store with what came back.

```ts
// src/store/useAppStore.ts
import { create } from 'zustand';

import { repo, type Item, type ItemInput } from '@/data';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface AppState {
  status: LoadStatus;
  error: string | null;
  items: Item[];
  load(): Promise<void>;
  saveItem(input: ItemInput, id?: string): Promise<Item>;
}

export const useAppStore = create<AppState>((set) => ({
  status: 'idle',
  error: null,
  items: [],

  async load() {
    set({ status: 'loading', error: null });
    try {
      const items = await repo.listItems();
      set({ items, status: 'ready' });
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },

  async saveItem(input, id) {
    const saved = id ? await repo.updateItem(id, input) : await repo.createItem(input);
    set((s) => ({ items: id ? s.items.map((i) => (i.id === id ? saved : i)) : [...s.items, saved] }));
    return saved;
  },
}));
```

Schema conventions that held up: `uuid primary key default gen_random_uuid()`, `jsonb` for
nested lists the app owns (ingredients, steps), `text[]` or `uuid[]` for tags and many-to-many
links (arrays cannot carry foreign keys, so the app cleans them up on delete), and starter rows
inserted at the bottom of `schema.sql`. Tables with `updated_at` share one trigger:

```sql
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger items_updated_at before update on items
  for each row execute function set_updated_at();
```

## Root layout

Load fonts and data in `src/app/_layout.tsx`, not per screen, so a deep link straight to a modal
on web still has data. Return `null` until fonts are loaded. Wrap the `Stack` in `ThemeProvider`
from `expo-router/react-navigation` (not `@react-navigation/native`, which expo-router no longer
re-exports).

```tsx
// src/app/_layout.tsx
import '../global.css';

import { Outfit_600SemiBold, Outfit_700Bold, useFonts } from '@expo-google-fonts/outfit';
import { Stack } from 'expo-router';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { useWebDarkMode } from '@/lib/webDarkMode';
import { useAppStore } from '@/store/useAppStore';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const status = useAppStore((s) => s.status);
  const load = useAppStore((s) => s.load);
  const [fontsLoaded] = useFonts({ Outfit_600SemiBold, Outfit_700Bold });
  useWebDarkMode();

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  if (!fontsLoaded) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          headerTitleStyle: { fontFamily: 'Outfit_600SemiBold' },
          // iOS 26 defaults to a see-through header that fades out the top of each screen.
          headerTransparent: false,
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
```

```ts
// src/lib/webDarkMode.ts
import { colorScheme } from 'nativewind';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/** On web, keep NativeWind's dark class in step with the browser's prefers-color-scheme. No-op on native. */
export function useWebDarkMode() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => colorScheme.set(query.matches ? 'dark' : 'light');
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);
}
```

## AGENTS.md template

```markdown
# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v<N>.0.0/ before writing any code.

This project tracks whatever SDK the App Store build of Expo Go supports (the only way to run
the app on a real iPhone without a Mac or a paid Apple account). Expo Go supports exactly one
SDK version at a time, so when the App Store client moves, the project must move with it,
and never past it. As of <month year> that is SDK <N>. If the phone shows a version-mismatch
error on launch, the client has moved again: upgrade the project to match.

# Ship every change to the phone

The phone runs the last published EAS Update, not the code on disk. After each change is
committed, publish it:

    npx eas-cli update --branch main --environment production --message "<what changed>" --non-interactive

`--environment` is required with `--non-interactive`. The Supabase `EXPO_PUBLIC_*` values live
in the EAS `production` environment, so the published bundle gets them from there.
```

Also add `.claude/settings.json` with `{"enabledPlugins": {"expo@claude-plugins-official": true}}`
and a `CLAUDE.md` containing only `@AGENTS.md`.
