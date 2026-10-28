# Gotchas from Mealwright

Each one cost real time once. Apply the fix up front instead of rediscovering it.

## Expo Go and SDK versions

- The App Store Expo Go runs one SDK. The phone shows a version-mismatch error on launch when
  the project is on any other SDK, newer or older. Newer Expo Go clients exist only as simulator
  builds, which need a Mac.
- To move SDKs: `npx expo install expo@^<N>` then `npx expo install --fix`, then run the
  codemods `expo install --fix` prints. Known one for 54 -> 57: the navigation theme import
  moves from `@react-navigation/native` to `expo-router/react-navigation`.
- `babel-preset-expo` and `@expo/ngrok` must be explicit devDependencies. npm stopped hoisting
  them, and without them `expo start --tunnel` fails after a fresh install.
- Pin the whole set, not just `expo`: react, react-native, reanimated, worklets, and
  `@types/react` all have one exact version per SDK. `expo install --fix` sets them.

## Layout on iOS

- NativeWind's `text-base` and `text-sm` set a line height taller than the font (24px on 16px).
  In single-line `TextInput`s that clips descenders like g and y. Use `text-[16px]` /
  `text-[14px]` on every single-line input; multiline fields keep the line height.
- The keyboard covers inputs at the bottom of a scrolling screen. Set
  `automaticallyAdjustKeyboardInsets` on the `ScrollView` and
  `keyboardShouldPersistTaps="handled"` so an Add button works in one tap while the keyboard
  is up.
- Icon-only buttons need `accessibilityLabel`. Also makes them findable in Playwright.

## Web and native differences

- `Alert.alert` shows no buttons on web. Wrap it: `Platform.OS === 'web'` ->
  `window.confirm`, else `Alert.alert` with Cancel and a destructive action. Mealwright's is
  `src/lib/confirm.ts`.
- `expo-keep-awake` throws when the browser denies the wake lock. Catch and ignore.
- Browsers block cross-site fetches, so anything that reads a third-party page needs a Supabase
  edge function to fetch it server-side. Native can often fetch directly, but some sites
  reject non-browser user agents, so route both through the function.

## Supabase

- Turn row-level security on for every table from the start, with a policy that lets the anon
  key do everything. Behaviour is identical to RLS off, but the dashboard stops flagging every
  table as publicly accessible:
  ```sql
  alter table <t> enable row level security;
  create policy anon_full_access on <t> for all to anon using (true) with check (true);
  ```
- Edge functions must deploy with `--no-verify-jwt`. New projects hand out an
  `sb_publishable_...` anon key, which is not a JWT, so the default JWT check rejects every
  call from the app.
- Arrays (`uuid[]`) cannot have foreign keys. When a parent row is deleted, strip its id from
  the arrays app-side in the same repository method.

## Nightly backup workflow

All of these are already in the shipped `db-backup.yml`; listed so nobody removes them.

- Use the Session pooler connection string, not the direct one. GitHub runners have no IPv6
  and Supabase's direct address is IPv6-only.
- `pg_dump` major version must match the server. The runner preinstalls client 16; install
  `postgresql-client-17` (or whatever the server is) and call it by full path,
  `/usr/lib/postgresql/17/bin/pg_dump`, because bare `pg_dump` still resolves to 16.
- `set -euo pipefail`, or a failing `pg_dump | gzip` exits 0 and commits an empty dump.
- Count `CREATE TABLE` lines in the dump with `grep -c ... || true` and fail when zero.
  `grep -q` exits early and the broken pipe trips pipefail.
- Dumps live on an orphan `db-backups` branch so `main` history stays clean. Keep the newest 60.

## Testing the web build with Playwright

expo-router keeps previous stack screens mounted and hidden in the DOM. After pushing a detail
screen, `getByText(x).count()` also matches text on the list screen underneath. Assert on text
unique to the new screen, scope the locator, or `page.goto` fresh to reset the stack.

## EAS Update

- `runtimeVersion.policy` must be `sdkVersion`. Expo Go identifies itself as runtime
  `exposdk:<N>.0.0`; any other policy produces updates the client refuses.
- Updates are per branch; the phone opens the `main` channel from the project page on expo.dev.
  Publish after each phase or the phone keeps running the old build.
