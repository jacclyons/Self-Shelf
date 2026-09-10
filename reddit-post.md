**Title:** Release: JellyShelf 0.1.0 - An e-book & comic reader for Jellyfin. (iOS and webapp)

**Flair:** Client

---

Hey all,

Jellyfin is great at storing my books and comics. Reading them on a phone was a different story, so I built **JellyShelf**. It signs into your server, pulls down your library, and gets out of the way so you can read.

No ads, no analytics, no JellyShelf account.

- **Web app:** https://jellyshelf.vercel.app (open now, sign in with your own server)
- **iOS:** in TestFlight, App Store release coming soon. [TestFlight link]
- **Source:** https://github.com/jacclyons/JellyShelf

[screenshots]

## What it does

**Library**

- Keep Reading, Recently Added, Readlist and Finished shelves on the home tab
- Full library grid, sort by title, date added, rating or year
- Filter by favorites, unread, in progress or downloaded
- Search your whole server
- Reading progress, favorites and read state sync back to Jellyfin

**Reader**

- EPUB, PDF, CBZ and CBR
- Six themes (Original, Paper, Sepia, Bold, Quiet, Night), plus page dimming for scanned PDFs
- Type size, line spacing, margins, justification, paged or scrolling layout
- Right-to-left mode for manga
- Bookmarks, highlights and notes
- Table of contents, a page scrubber, and pages left in the chapter

**iOS app extras**

- Download books for offline reading
- Drop your own EPUBs and PDFs into the JellyShelf folder in the Files app and they show up on your shelf
- Local-first: your place, bookmarks and settings are stored on the device, so it opens instantly and works on a plane, then syncs when your server is reachable
- Sign in with a password or Quick Connect
- Liquid Glass on iOS 26, haptics, light and dark mode

## Requirements

- A Jellyfin server with the [Bookshelf plugin](https://github.com/jellyfin/jellyfin-plugin-bookshelf) installed
- **For the web app, your server needs an `https://` address.** The site is served over HTTPS, so browsers block requests to plain `http://` servers. The iOS app works fine with `http://` on your LAN.

## Privacy

There's no third-party backend. The app only talks to your Jellyfin server. On iOS your session is stored in the keychain.

## Known limitations (it's 0.1.0)

- Offline downloads and Files-folder import are iOS only for now. On the web, books stream straight from your server.
- Android code paths exist but I haven't shipped a build yet.

This is the first public release, so I'd love feedback, bug reports and feature requests, either here or on GitHub. What would you want from a Jellyfin book reader?

*JellyShelf is an independent project and isn't affiliated with the Jellyfin team.*
