---
name: new-app
description: Start a new personal mobile app on a free stack. Expo Go on iPhone, Expo web build for development on Linux, Supabase free tier for shared data, no login, no Apple fee. Use when the user wants to make, start, scaffold or bootstrap a new app.
---

# New app

This recipe builds a small personal app that runs for free on real iPhones through Expo Go, is
developed in a browser on Linux, and shares data between phones through Supabase. Follow the
steps in order. [`stack.md`](stack.md) holds the locked choices, why each one won, and the code
to copy. [`gotchas.md`](gotchas.md) holds the bugs a new app on this stack will hit. Read both
before step 3. [`testing.md`](testing.md) is how each change gets checked in a browser.

## 1. Spec

Write `SPEC.md` before any code. Ask the user only what the spec needs and cannot guess: the app's
one-sentence purpose, who uses it (one phone or several), and the feature list. Then write:

- a "Locked decisions" table (copy the one in `stack.md`, change only what this app differs on),
- the feature list, each row marked core, later, or excluded, with the reason,
- a phase plan: 4 to 6 phases, each one shippable on its own, phase 1 being a usable library or
  list with seeded demo data.

Done when the user has read the spec and agreed to phase 1.

## 2. Find the SDK Expo Go supports today

The App Store build of Expo Go runs exactly one SDK version, and `create-expo-app` may default to
a newer one. A project on any other SDK, newer or older, fails on the phone with a
version-mismatch error. Check the current Expo Go version on the App Store listing (its major
version is the SDK) and read https://docs.expo.dev/versions/v<N>.0.0/ for that SDK before
writing code. Write `AGENTS.md` from the template at the bottom of `stack.md` with that number.

Done when `AGENTS.md` names the SDK and the versioned docs URL.

## 3. Scaffold

```bash
npx create-expo-app@latest <name> --template default
cd <name>
npx expo install expo@^<N>   # only if the template is on a different SDK
npx expo install --fix
```

Then reshape it:

- Move `app/` to `src/app/` and add `src/{components,data,lib,store}`. Set `tsconfig.json` as in
  "NativeWind setup" in `stack.md`.
- Remove template packages the spec does not need. Add `babel-preset-expo` and `@expo/ngrok` as
  explicit devDependencies (npm no longer hoists them).
- Install `nativewind tailwindcss@3 zustand @supabase/supabase-js react-native-url-polyfill`.
  Create the five NativeWind files listed in "NativeWind setup" in `stack.md`.
- `.env.example` with `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` and a
  comment saying the app runs on demo data when they are unset. Add `.env`,
  `.claude/settings.local.json`, `supabase/.temp/` to `.gitignore`.
- `package.json` scripts: `web` (`expo start --web`), `typecheck` (`tsc --noEmit`), `lint`
  (`expo lint`).
- `git init`, first commit, create a private GitHub repo with `gh repo create --private`.

Done when `npm run web` shows the template screen and `npm run typecheck` is clean.

## 4. Data layer

Build the storage layer before the first screen. "Data layer" in `stack.md` has the code for
each file.

- `src/data/types.ts`: the domain types.
- `src/data/repository.ts`: one `Repository` interface, everything the screens need from storage.
- `src/data/mockRepository.ts` + `seed.ts`: in-memory implementation on seeded demo data.
- `src/data/supabaseRepository.ts`: the real one.
- `src/lib/supabase.ts`: the client, `null` when the env is unset.
- `src/data/index.ts`: picks the implementation from whether the client is null and exports
  `backendMode: 'demo' | 'supabase'` for the settings screen to show.
- `src/store/useAppStore.ts`: one zustand store with a `load()` that the root layout calls once.
- `src/app/_layout.tsx`: the root layout from "Root layout" in `stack.md`.

`supabase/schema.sql` goes in the repo from day one, written to the conventions in `stack.md`.
Every table gets row-level security on with an `anon_full_access` policy (see `gotchas.md`); no
auth, no login. Say the tradeoff once in the schema header and the README, then stop mentioning
it.

Done when phase 1 screens work against the mock repository with no `.env`.

## 5. Design pass

Before phase 1 is called done, give the app its own look. Run the `frontend-design` skill once if
it is installed. Either way the result should be:

- a named palette in `tailwind.config.js`: a brand colour scale (50 to 950), one accent scale
  for a concept the app repeats everywhere (time, money, status), a warm off-white page
  background, and near-black darks tinted toward the brand colour for dark mode,
- a display face from `@expo-google-fonts/<face>` loaded in the root layout and registered under
  `fontFamily` in the Tailwind config, used for headings and the stack header,
- one signature element that makes the app recognisable at a glance,
- dark mode through `dark:` classes and `"userInterfaceStyle": "automatic"` in `app.json`.

## 6. Build phase by phase

For each phase: implement, check it in the browser with a Playwright script against `npm run
web` (how in [`testing.md`](testing.md)), run `npm run typecheck`, commit to `main`, push.
Commit and push as work finishes, no approval needed. Update the README status list with one
line per shipped phase.

Check on the phone at least once per phase: `npx expo start --tunnel`, scan with the Camera app.
Keyboard handling, line heights and `Alert` behave differently from the web build; the gotchas
file lists the ones already known.

## 7. Connect Supabase

When the user is ready for shared data (this can wait until phase 1 is in hand):

1. Create a free project at supabase.com. Paste `supabase/schema.sql` into SQL Editor and run.
2. Project Settings -> API: copy the URL and the anon key into `.env`. Restart Expo.
3. Copy [`db-backup.yml`](db-backup.yml) into `.github/workflows/` and set `APP` at the top of
   the job to the app name. Ask the user for the Session pooler connection string (Supabase
   dashboard -> Connect), then store it with `gh secret set SUPABASE_DB_URL` and run the
   workflow with `gh workflow run db-backup.yml`. Confirm the `db-backups` branch got a file
   with tables in it.
4. If the app needs an edge function, deploy with `--no-verify-jwt` (reason in `gotchas.md`).

Nothing here carries over between apps. Each app gets its own Supabase project, so the URL, anon
key and connection string are new every time. The CLI logins are per machine, not per app: run
`gh auth login`, `npx supabase login` and `npx eas-cli login` once if they are missing.

Done when the Settings screen shows "Supabase connected" and the backup run is green.

## 8. Publish so the phone works without the dev server

```bash
npx eas-cli init                 # links the repo to a project on expo.dev
npx eas-cli update:configure     # adds expo-updates and the update URL to app.json
npx eas-cli channel:create main  # the link Expo Go opens asks for a channel, not a branch
npx eas-cli env:push production --path .env   # the published bundle reads EXPO_PUBLIC_* from here
npx eas-cli update --branch main --environment production --message "<what shipped>" --non-interactive
```

`app.json` needs `"runtimeVersion": { "policy": "sdkVersion" }` so Expo Go (runtime
`exposdk:<N>.0.0`) can load the update. The phone then opens the app from the project's page on
expo.dev, no laptop running. Re-run the `update` command after every change; the AGENTS.md
template in `stack.md` tells future sessions to do this.

## Optional: home-screen widget

Expo Go cannot ship widget extensions. The workaround is a script for the free Scriptable app
that reads Supabase directly over its REST API. Start from
[`scriptable-widget.js`](scriptable-widget.js): it asks for the two keys on first run and keeps
them in the iOS keychain, so the script itself is safe to commit. Change the query and the row
layout to fit the app.
