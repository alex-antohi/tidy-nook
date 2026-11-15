# Tidy Nook

A cozy little home page that runs on your own computer: your most-used links, a jar of ideas to research, a watch-later wall for YouTube, and a little radio for background music.

## Run it

```
node server.js
```

Then open **http://localhost:4321**.

To have it start silently whenever you log in:

```
powershell -ExecutionPolicy Bypass -File install-startup.ps1
```

(Add `-Remove` to undo.)

### Make it your browser's home

- **Chrome / Edge:** Settings → *On startup* → *Open a specific page* → `http://localhost:4321`. Also turn on *Show home button* and set it to the same address.
- **Firefox:** Settings → Home → *Homepage and new windows* → Custom URLs → `http://localhost:4321`. You can set *New tabs* there too.

Chrome and Edge only let you change the new-tab page with an extension.

## What's inside

- **Shelf of links**: shows the sites you use most first, and counts each click. You can switch to *my order* (drag tiles around) or *recent*. Give links a shelf name (work, fun…) to filter them. Right-click a tile, or use ✎, to edit it.
- **Search bar**: typing filters your links. Enter opens the only match, opens an address you typed, or runs a Google search. Press `/` to jump to it.
- **Ideas to look into**: jot down notes, use `#tags` to group them, and tick them off when you're done. 🔍 / ▶ search Google or YouTube for the idea. Double-click an idea to edit it.
- **Watch later**: paste a YouTube link. Clicking the picture plays it in a pop-up, and your music pauses until you close it.
- **Little radio**: paste YouTube links, or drop audio files (mp3, m4a, ogg, flac, wav…) into the `music` folder and click ↻. It has shuffle, repeat and volume, and your keyboard's media keys work.
- **Tidy up** (`t`): straightens every crooked card.

Keyboard: `/` search · `space` play/pause · `n` next song · `t` tidy.

## Your data

Everything is saved to `data.json` in this folder, and the previous version is kept as `data.json.bak`. A copy is also kept in your browser. Use *export backup* / *import* in the footer to move your data around.
