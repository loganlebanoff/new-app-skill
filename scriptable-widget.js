// Home-screen widget for the free Scriptable app. Expo Go can't ship native widget
// extensions, so this reads Supabase directly over its REST API.
//
// Adapt: set APP, QUERY and the row layout in addRow() to the app's own table.
//
// Install on the iPhone:
//   1. Install "Scriptable" from the App Store.
//   2. In Scriptable, create a new script and paste this whole file into it.
//   3. Run it once inside Scriptable. It asks for the two EXPO_PUBLIC_ values from .env
//      and stores them in the iOS keychain. They never live in the script text, so this
//      file is safe to commit.
//   4. Long-press the home screen -> + -> Scriptable -> small or medium widget ->
//      long-press the new widget -> Edit Widget -> Script: the one from step 2.
//
// Same tradeoff as the app: the anon key is the only gate, so treat it like a password.

const APP = 'myapp';
// PostgREST query for today's rows. {today} is replaced with the local date, YYYY-MM-DD.
const QUERY = 'items?select=title,done&due=eq.{today}&order=title';

const KEY_URL = `${APP}.supabaseUrl`;
const KEY_ANON = `${APP}.supabaseAnonKey`;

const COLOR_BG = Color.dynamic(new Color('#FAF9F6'), new Color('#101314'));
const COLOR_TEXT = Color.dynamic(new Color('#18181B'), new Color('#FAFAFA'));
const COLOR_MUTED = Color.dynamic(new Color('#71717A'), new Color('#A1A1AA'));

async function ensureConfig() {
  if (Keychain.contains(KEY_URL) && Keychain.contains(KEY_ANON)) return true;
  if (config.runsInWidget) return false;
  const alert = new Alert();
  alert.title = `${APP} setup`;
  alert.message = 'Paste the two EXPO_PUBLIC_ values from .env';
  alert.addTextField('EXPO_PUBLIC_SUPABASE_URL');
  alert.addTextField('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  alert.addAction('Save');
  alert.addCancelAction('Cancel');
  if ((await alert.present()) === -1) return false;
  const url = alert.textFieldValue(0).trim();
  const anon = alert.textFieldValue(1).trim();
  if (!url || !anon) return false;
  Keychain.set(KEY_URL, url);
  Keychain.set(KEY_ANON, anon);
  return true;
}

function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function fetchRows() {
  const base = Keychain.get(KEY_URL).replace(/\/+$/, '');
  const anon = Keychain.get(KEY_ANON);
  const req = new Request(`${base}/rest/v1/${QUERY.replace('{today}', todayISO())}`);
  req.headers = { apikey: anon, Authorization: `Bearer ${anon}` };
  return req.loadJSON();
}

function addRow(widget, row) {
  const text = widget.addText(row.title);
  text.font = Font.mediumSystemFont(14);
  text.textColor = row.done ? COLOR_MUTED : COLOR_TEXT;
  text.lineLimit = 1;
}

function buildWidget(rows) {
  const w = new ListWidget();
  w.backgroundColor = COLOR_BG;
  w.setPadding(14, 14, 14, 14);
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

  const df = new DateFormatter();
  df.dateFormat = 'EEEE, MMM d';
  const header = w.addText(df.string(new Date()));
  header.font = Font.boldSystemFont(12);
  header.textColor = COLOR_MUTED;
  w.addSpacer(6);

  if (rows.length === 0) {
    const empty = w.addText('Nothing today');
    empty.font = Font.mediumSystemFont(14);
    empty.textColor = COLOR_MUTED;
  }
  for (const row of rows.slice(0, 5)) {
    addRow(w, row);
    w.addSpacer(4);
  }
  w.addSpacer();
  return w;
}

function messageWidget(text) {
  const w = new ListWidget();
  w.backgroundColor = COLOR_BG;
  const t = w.addText(text);
  t.font = Font.mediumSystemFont(13);
  t.textColor = COLOR_MUTED;
  t.centerAlignText();
  return w;
}

let widget;
if (await ensureConfig()) {
  try {
    widget = buildWidget(await fetchRows());
  } catch (e) {
    widget = messageWidget(`Couldn't reach Supabase: ${e.message}`);
    widget.refreshAfterDate = new Date(Date.now() + 10 * 60 * 1000);
  }
} else {
  widget = messageWidget('Open Scriptable and run this script once to set it up.');
}

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}
Script.complete();
