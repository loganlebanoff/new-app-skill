# new-app skill

A Claude Code skill that starts a new personal mobile app on a stack that costs nothing: Expo Go
on an iPhone, the Expo web build for day-to-day development on Linux, the Supabase free tier for
data shared between phones, no login, and no Apple developer fee.

It came out of building several small apps this way. Each gotcha in it cost real time once.

Files:

- `SKILL.md`: the steps, in order.
- `stack.md`: the locked stack, why each piece won, and the code to copy.
- `gotchas.md`: bugs a new app on this stack will hit, with the fix for each.
- `db-backup.yml`: nightly `pg_dump` GitHub Actions workflow to copy into a new repo.
- `testing.md` and `playwright-helper.js`: the throwaway Playwright loop against the web build.
- `scriptable-widget.js`: a home-screen widget for the Scriptable app, since Expo Go cannot ship
  one.

Install: clone this repo and symlink it as `~/.claude/skills/new-app`.

## The tradeoff

The apps have no login. The Supabase anon key ships inside the app bundle, and anyone who has it
can read and write every table. That is fine for an app shared by a household and kept in a
private repo. Add Supabase Auth and real row-level security policies before handing the app to
anyone you would not give the database to.
