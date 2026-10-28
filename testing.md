# Checking a change in the browser

The dev loop is the Expo web build driven by a throwaway Playwright script. No test framework
in the app repo; the scripts live in the session scratchpad and are deleted with it. Keep the
phone for the once-per-phase check in step 6.

## Setup, once per session

```bash
cd <scratchpad>
npm init -y >/dev/null && npm install playwright   # Chromium is already in ~/.cache/ms-playwright
cp ~/.claude/skills/new-app/playwright-helper.js helper.js
mkdir -p shots
```

Start the app in the background and note the port Metro prints (8081 unless taken):

```bash
cd <app> && npm run web   # run_in_background, read the port from its output
```

## Writing a check

One script per change, built on `helper.js`: iPhone viewport (390x844), page errors and console
errors collected, `shot(page, name)` saves to `shots/`, `reportErrors(errors)` prints PASS or
FAIL at the end. Print a `PASS:`/`FAIL:` line for every assertion so the output reads without
opening screenshots, then look at the screenshots anyway for anything the assertions cannot see
(overlap, clipping, wrong colour).

```js
const { launch, go, shot, reportErrors } = require('./helper');
const ok = (cond, msg) => console.log((cond ? 'PASS' : 'FAIL') + ': ' + msg);

(async () => {
  const { browser, page, errors } = await launch();
  await go(page, '/');
  await page.getByText('Recipes', { exact: true }).first().waitFor();
  ok((await page.getByText('Chicken Marsala', { exact: true }).count()) >= 1, 'library lists the seeded recipe');
  await shot(page, 'library');
  reportErrors(errors);
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED:', e); process.exit(1); });
```

Run with `BASE=http://localhost:<port> node check.js`.

## Rules that came from Mealwright

- Wait on an element (`waitFor`) rather than a fixed `waitForTimeout`. The seed load takes a
  few seconds on first paint, and timeouts either flake or waste the whole run.
- expo-router keeps the previous stack screens mounted and hidden after a push. A `count()` on
  text that also appears on the list underneath over-counts. Assert on text unique to the new
  screen, or `go()` straight to the route to reset the stack.
- Target icon-only buttons through their `accessibilityLabel` (`getByLabel`). It is why the
  app gives them one.
- Without a `.env` the app runs on demo data, so scripts can create, edit and delete freely.
  Changes reset on reload. Against Supabase, clean up what the script created.
- The web build is not the phone. Keyboard insets, `Alert`, text-input line heights and the
  wake lock all differ; `gotchas.md` has the known ones. Check the phone before calling a phase
  done.
