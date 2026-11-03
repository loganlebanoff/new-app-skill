# Gotchas

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

- `Alert.alert` shows no buttons on web. Wrap it and call the wrapper everywhere:
  ```ts
  // src/lib/confirm.ts
  import { Alert, Platform } from 'react-native';

  /** Confirm dialog that works on web too, where Alert shows no buttons. */
  export function confirmAction(title: string, message: string, actionLabel: string): Promise<boolean> {
    if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
    return new Promise((resolve) => {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: actionLabel, style: 'destructive', onPress: () => resolve(true) },
      ]);
    });
  }
  ```
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

## NativeWind dark mode on SDK 58 web

With Tailwind's default `darkMode: 'media'`, the SDK 58 web build throws "Cannot manually set
color scheme, as dark mode is type 'media'" on load, and the dev error overlay then swallows
every click. The runtime installs a MutationObserver that calls `colorScheme.set('system')`
when the stylesheet arrives after it, and `set` refuses under `media`. Fix: `darkMode: 'class'`
in `tailwind.config.js` plus a web-only hook in the root layout that calls `colorScheme.set`
from `window.matchMedia('(prefers-color-scheme: dark)')` and listens for changes. Both are in
`stack.md`: the Tailwind config under "NativeWind setup", `useWebDarkMode` under "Root layout".
Native is unaffected either way.

## SDK 58 upgrade

`npx expo install expo@^58` then `--fix` fails on npm peer resolution: expo-router 58 lists
`@expo/ui` and `expo-symbols` as optional peers, and npm still refuses the 57 copies in
`node_modules`. Add both with `npx expo install @expo/ui expo-symbols`, pin the rest from a
fresh `create-expo-app` template's `package.json`, delete `node_modules` and the lockfile, and
install clean. The tab icon `color` prop is now `ColorValue`, which may be `null` or a number;
narrow to `string` before passing it to a vector icon.

## Edge function CPU budget

A Supabase edge function gets about 2s of CPU per request; past that the call fails with
HTTP 546 `WORKER_RESOURCE_LIMIT` after a few seconds of wall time. Parsing an 89-page PDF with
pdf.js blew it. Fix: do the work in batches across requests. The function takes a `fromPage`
argument, extracts 20 pages, saves the text, and returns `{ nextPage, done }`. The app calls it
again with `nextPage` until `done` is true. Each request gets a fresh budget.

## Web search output from OpenAI

With the `web_search` tool, the model pastes citations like `([site](url))` into prose fields
of a structured JSON answer and appends `?utm_source=openai` to URLs. Strip both server-side
before showing them.

## EAS Update and the phone: two things that must exist

- A channel. `eas update --branch main` publishes to the branch, but the link Expo Go opens from
  the project page asks for a channel (`?channel-name=main`), and the manifest server answers
  "There is no channel named main" until one exists. Run `npx eas-cli channel:create main` once;
  it maps to the branch of the same name.
- The Supabase keys. `eas update --environment production` loads env vars from EAS, not from
  the local `.env`, so the published bundle had no `EXPO_PUBLIC_SUPABASE_*` and the phone ran in
  demo mode while the browser was on Supabase. Store them once with
  `npx eas-cli env:push production --path .env`. Verify with
  `strings dist/_expo/static/js/ios/*.hbc | grep -c <project ref>` after the update.

## Streaming a reply into the app

React Native's own `fetch` cannot read a response body as a stream; `expo/fetch` can on iOS and
Android. On web, though, `expo/fetch` buffered the whole server-sent-events reply and handed
it over at the end, while the browser's `globalThis.fetch` streamed it chunk by chunk. Pick
by platform: `Platform.OS === 'web' ? globalThis.fetch : expoFetch`. Verify with a
MutationObserver on the bubble, not by sampling with waitForTimeout: a fast model finishes a
short answer in under half a second, so samples miss it and look like "not streaming".

## Supabase will not serve HTML

A public Storage object uploaded as text/html comes back as text/plain, and so does an edge
function response with `Content-Type: text/html` (HEAD shows text/html, GET shows text/plain).
Neither can host a page for a WebView. Embed the page in the app as a string and load it with
`<WebView source={{ html, baseUrl }}>` on the phone and `<iframe srcDoc>` on web; Storage sends
`Access-Control-Allow-Origin: *`, so the page can still fetch files from Storage. Pass
parameters by injecting a script ahead of the page's own, and escape `<` so a value cannot close
the tag:

```ts
export function viewerHtml(file: string, page: number): string {
  const config = JSON.stringify({ file, page }).replace(/</g, '\\u003c');
  return VIEWER_HTML.replace('<script type="module">', `<script>window.__VIEWER__ = ${config};</script>\n<script type="module">`);
}
```

The page then reads `window.__VIEWER__`. External libraries such as pdf.js load from a CDN with a
pinned version.
