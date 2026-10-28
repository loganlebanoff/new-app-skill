# new-app skill

A Claude Code skill that starts a new personal mobile app the way Mealwright was built:
Expo Go on iPhone, Expo web build for development on Linux, Supabase free tier for shared
data, no login, no Apple fee.

Files:

- `SKILL.md`: the steps, in order.
- `stack.md`: the locked stack, why each piece won, and the code shapes to copy.
- `gotchas.md`: every bug Mealwright hit that a new app will hit again.
- `db-backup.yml`: nightly `pg_dump` GitHub Actions workflow to copy into a new repo.

Install: clone this repo and symlink it as `~/.claude/skills/new-app`.
