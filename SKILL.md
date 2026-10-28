---
name: new-app
description: Start a new personal mobile app the way Mealwright was built. Expo Go on iPhone, Expo web build for development on Linux, Supabase free tier for shared data, no login, no Apple fee. Use when Logan wants to make, start, scaffold or bootstrap a new app.
---

# New app

The recipe that produced Mealwright (`~/mealwright`): a two-person app that runs for free on real
iPhones through Expo Go, is developed in a browser on Ubuntu, and shares data through Supabase.
Follow the steps in order. [`stack.md`](stack.md) holds the locked choices and why each one won.
[`gotchas.md`](gotchas.md) holds every bug Mealwright hit that a new app will hit again. Read
both before step 3.

## 1. Spec

Write `SPEC.md` before any code. Ask Logan only what the spec needs and cannot guess: the app's
one-sentence purpose, who uses it (one phone or several), and the feature list. Then write:

- a "Locked decisions" table (copy the one in `stack.md`, change only what this app differs on),
- the feature list, each row marked core, later, or excluded, with the reason,
- a phase plan: 4 to 6 phases, each one shippable on its own, phase 1 being a usable library or
  list with seeded demo data.

Done when Logan has read the spec and agreed to phase 1.

## 2. Find the SDK Expo Go supports today

The App Store build of Expo Go runs exactly one SDK version, and `create-expo-app` may default to
a newer one. Mealwright shipped on 57, had to downgrade to 54, then upgrade back to 57 when the
client moved. Check the current Expo Go version on the App Store listing (its major version is
the SDK) and read https://docs.expo.dev/versions/v<N>.0.0/ for that SDK before writing code. Write
`AGENTS.md` from the template at the bottom of `stack.md` with that number.

Done when `AGENTS.md` names the SDK and the versioned docs URL.

## 3. Scaffold

```bash
npx create-expo-app@latest <name> --template default
cd <name>
npx expo install expo@^<N>   # only if the template is on a different SDK
npx expo install --fix
```

Then shape it like Mealwright:

- Move `app/` to `src/app/`, add `src/{components,data,lib,store}`, set `"@/*": ["./src/*"]` in
  `tsconfig.json` with `strict: true`.
- Remove template packages the spec does not need. Add `babel-preset-expo` and `@expo/ngrok` as
  explicit devDependencies (npm no longer hoists them).
- Install `nativewind tailwindcss@3 zustand @supabase/supabase-js react-native-url-polyfill`.
  Wire NativeWind through `babel.config.js`, `metro.config.js`, `tailwind.config.js`, and
  `src/global.css` exactly as in `~/mealwright`.
- `.env.example` with `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` and a
  comment saying the app runs on demo data when they are unset. Add `.env`,
  `.claude/settings.local.json`, `supabase/.temp/` to `.gitignore`.
- `package.json` scripts: `web`, `typecheck` (`tsc --noEmit`), `lint`.
- `git init`, first commit, create a private GitHub repo with `gh repo create --private`.

Done when `npm run web` shows the template screen and `npm run typecheck` is clean.

## 4. Data layer

Build the storage seam before the first screen. See "Data layer" in `stack.md` for the shape.

- `src/data/types.ts`: the domain types.
- `src/data/repository.ts`: one `Repository` interface, everything the screens need from storage.
- `src/data/mockRepository.ts` + `seed.ts`: in-memory implementation on seeded demo data.
- `src/data/supabaseRepository.ts`: the real one.
- `src/lib/supabase.ts`: the client, `null` when the env is unset.
- `src/data/index.ts`: picks the implementation from whether the client is null and exports
  `backendMode: 'demo' | 'supabase'` for the settings screen to show.
- `src/store/useAppStore.ts`: one zustand store with a `load()` that the root layout calls once.

`supabase/schema.sql` goes in the repo from day one. Every table gets row-level security on with
an `anon_full_access` policy (see `gotchas.md`); no auth, no login. Say the tradeoff once in the
schema header and the README, then stop mentioning it.

Done when phase 1 screens work against the mock repository with no `.env`.

## 5. Design pass

Before phase 1 is called done, run the `frontend-design` skill once. Mealwright's result was a
named palette in `tailwind.config.js` (brand scale, one accent for a recurring concept, a paper
background, tinted darks), a display face from `@expo-google-fonts/*` loaded in the root layout,
and one signature element. Dark mode through `dark:` classes and `userInterfaceStyle:
"automatic"`.

## 6. Build phase by phase

For each phase: implement, check it in the browser (`npm run web`), run `npm run typecheck`,
commit to `main`, push. Logan has said to commit and push as work finishes, no approval needed.
Update the README status list with one line per shipped phase.

Check on the phone at least once per phase: `npx expo start --tunnel`, scan with the Camera app.
Keyboard handling, line heights and `Alert` behave differently from the web build; the gotchas
file lists the ones already known.

## 7. Connect Supabase

When Logan is ready for shared data (this can wait until phase 1 is in hand):

1. Create a free project at supabase.com. Paste `supabase/schema.sql` into SQL Editor and run.
2. Project Settings -> API: copy the URL and the anon key into `.env`. Restart Expo.
3. Copy [`db-backup.yml`](db-backup.yml) into `.github/workflows/`, change the dump filename
   prefix. Ask Logan for the Session pooler connection string (Supabase dashboard -> Connect),
   then store it with `gh secret set SUPABASE_DB_URL` and run the workflow with
   `gh workflow run db-backup.yml`. Confirm the `db-backups` branch got a file with tables in it.

Nothing here carries over between apps: each app gets its own Supabase project, so the URL,
anon key and connection string are new every time. The logins that do carry over
(`gh auth`, `npx supabase login`, `npx eas-cli login`) already live on this machine.
4. If the app needs an edge function, deploy with `--no-verify-jwt` (reason in `gotchas.md`).

Done when the Settings screen shows "Supabase connected" and the backup run is green.

## 8. Publish so the phone works without the dev server

```bash
npx eas-cli init                 # links the repo to a project on expo.dev
npx eas-cli update:configure     # adds expo-updates and the update URL to app.json
npx eas-cli update --branch main --message "<what shipped>"
```

`app.json` needs `"runtimeVersion": { "policy": "sdkVersion" }` so Expo Go (runtime
`exposdk:<N>.0.0`) can load the update. The phone then opens the app from the project's page on
expo.dev, no laptop running. Re-run the `update` command after each phase.

## Optional: home-screen widget

Expo Go cannot ship widget extensions. Mealwright's workaround is a Scriptable script
(`~/mealwright/scriptable/todays-meals.js`) that reads Supabase directly over REST and stores
the two keys in the iOS keychain on first run, so the script itself stays safe in the repo. Copy
that file as the starting point when the spec asks for a widget.
