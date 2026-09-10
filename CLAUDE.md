# Self-Shelf: notes for Claude

Handoff from earlier sessions: what this project is, how it fits together, and the rules that
aren't obvious from the code. Anything under a date is a snapshot. Check it's still true before
acting on it.

## What this is

Self-Shelf (called **JellyShelf** until the rebrand on 2026-09-10) is an Expo / React Native reader
for the books, comics and PDFs on the user's own Jellyfin server (the server needs the Bookshelf
plugin). It also reads EPUBs and PDFs dropped into the app's folder in the Files app. It's built for
iOS first (iOS 26, Liquid Glass). The same code also ships as a web SPA on Vercel. The Android config
exists but is untested. It's a solo project by Jack, and the iOS build is in TestFlight beta.

## Commands

| Command | Notes |
| --- | --- |
| `npm run typecheck` | The reliable check. Run it after every change. |
| `npm run lint` | **Broken:** eslint isn't installed and Expo's auto-install fails. Don't rely on it. |
| `npm run ios` | Builds a dev client. Expo Go won't work (native modules). |
| `npm run prebuild` | `expo prebuild --clean`: **deletes** and regenerates `ios/` and `android/` from `app.json`. |
| `npm run web` / `export:web` | Both run `sync:reader` first, which copies `assets/reader/` into gitignored `public/reader/` and renames `.jstxt` → `.js`. |

Vercel runs `export:web`. `vercel.json` rewrites `/about` and `/support` to the static pages in
`public/` and sends everything else to the SPA.

## Architecture

```
src/api/      Hand-written slice of the Jellyfin API (client.ts, types.ts) + React Query hooks
src/app/      expo-router screens, typed routes. _layout.tsx gates onboarding → sign-in → tabs
src/reader/   WebView bridge (ReaderView), sheets, scrubber, protocol.ts
src/state/    auth session, local store (db), reader prefs, appearance
src/lib/      on-disk layout (storage), local book scanning, metadata lookup, platform shims
src/ui/       theme, Glass surface primitive, covers, shelves, Logo (wordmark)
assets/reader/  reader.html + vendored epub.js, pdf.js, JSZip, unrar.wasm (stored as .jstxt)
public/       static marketing/support site (about.html, support.html, site/)
```

- **Platform twins.** `foo.ts` and `foo.web.ts` export the same API, and Metro picks one per
  platform. Always change both. The pairs are storage, db, secretStore, localBooks, alert, prompt,
  appChrome, webChrome, Icon and ReaderView. The db twins share their row types through
  `state/rows.ts` so they can't drift apart.
- **Local-first store.** `state/db.ts` uses expo-sqlite with synchronous reads. The routing gate,
  the shelves and the reader all call it during render, so it has to stay synchronous. On web,
  `db.web.ts` keeps the data in memory, persists it to IndexedDB, and hydrates before the app mounts.
  It avoids SQLite on web because that needs the COOP/COEP headers. Reading progress is pushed up to
  Jellyfin when possible (the flush on foreground in `api/hooks.ts`).
- **Reader engine.** One HTML file plus vendored libraries. The libraries are stored as `.jstxt` so
  Metro treats them as assets (`metro.config.js` adds html, jstxt and wasm). On native, the engine is
  copied to `Documents/.jellyshelf/engine/` and loaded in a WebView over `file://`. On web, it's an
  iframe from `/reader/`, and books stream from Jellyfin with `api_key` in the query string. The two
  sides talk through the typed messages in `src/reader/protocol.ts`, so update both together.
- **On-disk layout (native).** `Documents/` is the folder the Files app shows as "Self-Shelf". It
  holds the user's own books, which `lib/localBooks.ts` scans. `Documents/.jellyshelf/` holds the
  engine and Jellyfin downloads.
- **Theme.** `ui/theme.ts` is a warm, papery palette so covers stay loudest. The brand gradient is
  `shelf.green #7FCA83` → `shelf.teal #2C8A8D`. `ui/Glass.tsx` is the one surface primitive: real
  Liquid Glass where it's available, a blur fallback elsewhere.
- **Close buttons** use `useDismissTo` from `lib/navigation.ts`, because web deep links start with
  no history to go back to.

## Conventions

- Comments explain *why*, in full sentences, with JSDoc on modules and exports. Match that density.
- Single quotes, 2-space indent, and `@/` resolves to `src/`.
- Only mention Jellyfin as the server the app connects to. Don't use Jellyfin's logo, its colours
  (the purple `#AA5CC3` and blue `#00A4DC` were deliberately removed) or a "Jelly-" name. That's
  what the rebrand was for. Keep the "not affiliated with Jellyfin" disclaimers.

## Branding

- The name is **Self-Shelf**: hyphenated, both S's capitalised. Lowercase identifiers use
  `self-shelf` (slug, npm package name, file names). The URL scheme is `selfshelf`.
- Source art in `assets/images/`:
  - `self-shelf.svg`: the colour mark (a bookmark with signal arcs)
  - `self-shelf-mono-icon.svg`: the single-colour mark, with cut-outs so the arcs read against the
    bookmark. Use this whenever the mark is one colour.
  - `self-shelf-full-logo.svg`: the colour lockup (mark + wordmark)
  - `self-shelf-mono-logo.svg`: the single-colour lockup. It's the source for the Wordmark in
    `ui/Logo.tsx` and for `public/site/wordmark.svg`, which `site.css` uses as a CSS mask.
- The iOS icon is the Icon Composer bundle `assets/images/self-shelf.icon`, which `app.json` points
  to as `ios.icon`. Jack edits it in Icon Composer, so don't rewrite it by hand unless asked.
- Exported PNGs: `icon.png` (1024), `adaptive-icon.png` (white glyph on transparent over the Android
  background `#279677`), `splash-icon.png` (512, colour mark), `favicon.png` (48),
  `public/site/icon.png` (256) and `assets/readme-banner.png` (1280×720).
- **Re-exporting the PNGs.** ImageMagick is installed, but its built-in SVG renderer gets these
  gradients wrong. Render with headless Chrome
  (`--headless=new --screenshot --default-background-color=00000000 --window-size=W,H`), then
  finish with `magick`. The README banner's background is a pure left-to-right gradient. To swap its
  wordmark, copy pixel row y=5 down over the band y≈103–293, then composite the new logo on top.

## Old names kept on purpose: don't "fix" these

These still say `jellyshelf` because renaming them would sign existing TestFlight and web users out,
or strand their data. Each one has a comment in the code. Write a migration before renaming any of
them.

- `SESSION_KEY` / `DEVICE_KEY` in `state/auth.tsx`
- `jellyshelf.db` in `state/db.ts`, and the IndexedDB `DB_NAME` in `state/db.web.ts`
- `Documents/.jellyshelf/`: `PRIVATE_DIR` in `lib/storage.ts`, also listed in `INTERNAL_DIRS` in
  `lib/localBooks.ts`
- The bundle ID / Android package `com.jacklyons.jellyshelf` in `app.json` (see open threads)

## Native projects (`ios/`, `android/`): gitignored, generated

- They're regenerated from `app.json` by prebuild, so anything changed only in Xcode disappears on
  the next `npm run prebuild`. Put settings that need to last in `app.json`. The signing team is
  `ios.appleTeamId` (`3272AWQ475`) for that reason: a prebuild on 2026-09-10 wiped the team and a
  hand-edited bundle ID from the Xcode project.
- The iOS project is `ios/SelfShelf/` (prebuild renamed it from `ios/JellyShelf/` on 2026-09-10).
  Don't rename it by hand: the Xcode project file, the Podfile and the build settings all refer to
  it by name.
- Icon Composer names the image inside `self-shelf.icon/Assets/` after the layer (currently
  `self-shelf 2.svg`), and `icon.json` refers to it by that name. If you rename the file, change
  `image-name` in `icon.json` to match.
- If the `.icon` bundle is renamed or replaced without a prebuild, the Xcode project file keeps
  pointing at the old path. You'll first see the actool error
  `attempt to insert nil object from objects[0]`, then
  `None of the input catalogs contained a matching ... icon stack named "self-shelf"`. Fix it with a
  prebuild, or by repointing the file reference in `project.pbxproj` and copying the bundle into
  `ios/<Project>/`.
- To test an icon bundle on its own:
  `xcrun actool <x.icon> ios/SelfShelf/Images.xcassets --compile <out> --platform iphoneos
  --minimum-deployment-target 15.1 --app-icon self-shelf --target-device iphone --target-device ipad
  --output-partial-info-plist <out>/p.plist`

## Open threads (last checked 2026-09-10; check before acting)

- **Bundle ID not decided.** `app.json` and the Xcode project both say `com.jacklyons.jellyshelf`,
  the ID current TestFlight testers have. (An earlier hand edit to `com.jacklyons.selfshelf` in Xcode
  was wiped by the 2026-09-10 prebuild.) A new ID means a new App Store Connect app: testers have to
  join again, and it installs next to the old app instead of replacing it. Ask Jack before touching
  it. If switching, change `bundleIdentifier` and `android.package` in `app.json`, then prebuild.
- The iOS icon is now the colour mark on a light (`system-light`) background, but the other PNGs are
  still a white glyph on the gradient. I offered to re-export them to match.
- Some URLs still use the old name: `jellyshelf.vercel.app` and `github.com/jacclyons/JellyShelf`,
  in the README, the site's links, and `USER_AGENT` in `lib/metadata.ts`. Update them once Jack
  renames the repo and domain.
- The README banner's phone screenshots show older UI (a purple Continue button).

## Working with Jack

- Messages are short and sometimes have typos. When a message and the files disagree (Jack typed
  "Shelf-Shelf", but the logo and filenames say "Self-Shelf"), go with the files and say so.
- Check first before anything that affects TestFlight users, stored data, or App Store identity.
- Commit only when asked.
