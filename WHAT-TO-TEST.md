# What to Test

Self-Shelf 1.0 (build 3)

Thanks for testing. This build separates reading from downloading, adds a left-hand mode, links books out to their metadata sources, and fixes a batch of reader bugs. Details and things to try are below.

## Reading no longer counts as downloading

Opening a book from Jellyfin now streams it into a "Recently read" cache instead of saving it as a download. Only the Download button keeps a permanent copy. The cache holds up to 1 GB and drops the books you opened longest ago.

- Open a book you haven't downloaded. The loading screen should say "Loading…" rather than "Downloading…", and afterwards the book should **not** show as Downloaded on its detail page or under Settings → Downloads.
- Close and reopen the same book. It should open straight away without loading again.
- Open a book, then tap Download on its detail page. It should complete instantly (the cached copy is moved across), and now show as Downloaded.
- Settings → Storage now shows a "Recently read" size and a "Clear recently read" row. Clear it, then check your downloads and reading positions are still there.
- Books you'd already downloaded in an earlier build should still open offline.

## Left-hand mode

In the reader, open Themes & Settings and turn on **Left-Hand Mode**.

- Tapping the left side of the page should now turn forward, and the right side back.
- Swipes should still go in their natural direction.
- The center tap should still show and hide the controls.
- The setting should stick across books and after restarting the app.

## Find Out More

Book detail pages now show a "Find Out More" row with links to the metadata sources Jellyfin knows about (Google Books, Open Library, Comic Vine), plus the series and issue or book number where there is one.

- Check a few books and comics. Links should open in Safari and land on the right page.
- Books with no metadata IDs should simply not show the row.
- On Jellyfin 12, install the Google Books / Open Library / Comic Vine plugins and run a metadata refresh if you want to see this on more books.

## Reader fixes

- **Table of contents:** some EPUBs (typically ones built with Sigil, where the nav file sits in a subfolder) had a contents list that did nothing when tapped. Those entries should now jump to the right chapter. If you have a book whose contents never worked, this is the one to try.
- **Chapter name in the reader bar:** books that showed no chapter title at the bottom of the page should show one now.
- **Highlights on dark themes:** highlights used to disappear on Night and other dark themes. They should now be visible on every theme, and switch cleanly when you change theme mid-book.
- **Sheet text colours:** with the app in dark mode and a light reader theme (or the other way round), the Contents and Themes sheets sometimes drew near-invisible titles. They should now always match the page.

## Polish

- The Contents tabs and the segmented controls in Themes & Settings now slide a pill between options rather than snapping.
- Switching tabs in Contents, and opening Customize, should ease the sheet to its new height rather than jumping.
- Toggles animate.

## Jellyfin 12

The welcome screens, empty states, README and support page now say that Jellyfin 12 reads books without the Bookshelf plugin. If you're on 12 without Bookshelf and your library shows up fine, that's a pass.

## Known issues

- Android is untested.
- The web version streams books rather than caching them, so the "Recently read" rows don't appear there.

## How to report

Send feedback through TestFlight (screenshot → share → TestFlight) or open an issue on GitHub. Please include your iOS version, Jellyfin version, which book plugins you have, and the file format of the book if it's book-specific.
