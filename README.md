# GTS Cricket League — Season 2

A responsive cricket player auction dashboard for running a league auction from a laptop, following it on a phone, or presenting it on a large screen. Built with HTML, vanilla JavaScript, and locally compiled Tailwind CSS.

![Desktop auction dashboard showing Nilesh Shinde, the current bid, and Team D leading](docs/images/auction-desktop.png)

## Auction experience

- **Live auction stage:** player name, category, base price, current bid, and a large team-colored panel identifying the leading team and its owners.
- **Team bidding controls:** place bids with buttons or number keys; view remaining purses, roster counts, and the leading team.
- **11-player squads:** pre-signed players count toward the squad size. Full squads cannot acquire another player through bidding, random allocation, or the player editor.
- **Player management:** filter the pool, edit player details, assign teams, release players, re-auction players, and return unsold players to the pool.
- **Sale announcements:** show the player's name, winning team, owners, and final price in a dismissible result dialog.
- **Undo controls:** undo the latest bid or sale. Bid history is retained internally for undo; the small history strip beneath the leading team is intentionally omitted.
- **Presentation and display modes:** hide operator controls for a cleaner audience view, with a touch-friendly exit from presentation mode.
- **Responsive and accessible layouts:** wrapping names, labeled fields, visible keyboard focus, large touch targets, reduced-motion support, and scrollable result dialogs.

### Leading team display

The current leader is the main visual feature beneath the price. It uses the team's color, a large team name, and bracketed owner names. Each new bid or undo updates this panel.

![Auction stage with the enlarged Team D leading panel and no bid-history strip](docs/images/leading-team.png)

### Mobile views

These are captures of the working interface in an isolated browser session using the included player records.

<p>
  <img src="docs/images/auction-mobile.png" alt="Mobile auction stage with a large leading team name" width="300">
  <img src="docs/images/sold-mobile.png" alt="Mobile player sold announcement naming the team, owners, and final bid" width="300">
</p>

<details>
<summary>View an 11-slot squad card on mobile</summary>

<img src="docs/images/squad-mobile.png" alt="Mobile squad card with player details and open slots up to eleven" width="320">

</details>

## Run locally

Use Node.js 22 or later with npm. From the repository directory:

```bash
npm ci
npm run build
npm run dev
```

Open **http://127.0.0.1:4173**. The preview serves the current source files; rerun the build after changing Tailwind classes or styles, then refresh the browser. Stop the preview with `Ctrl+C`.

The generated stylesheet is committed in `assets/styles.css`, so the HTML can also be served by a basic static server. Styling does not depend on a Tailwind CDN. The existing Google Fonts link loads Bebas Neue and Rajdhani when available, with local font fallbacks.

## Running an auction

1. Open **Setup** to review team names, owners, purse, squad size, bid increment, reserve, and the player list. Applying setup resets the auction and requires a second click on its reset button.
2. Open **Auction**, optionally choose a category, and select **Draw next**.
3. Select a team to place its bid. The price and large leading-team panel update immediately.
4. Select **SOLD** to assign the player to the leading team, or **Unsold** to move the player to the unsold list.
5. Review rosters under **Squads**. Use **Players** and **Unsold** for individual changes or the accelerated round.
6. Use **Show results CSV** under Setup to display the team/player/category/price export for copying.

The starting configuration is a **₹2,00,000 purse**, **11 slots per team**, **₹1,000 bid increment**, and **₹2,000 female-player reserve**. The reserve reduces a team's available bidding budget until its roster includes a female player, except when bidding for a female player.

The initial teams are:

- **Team A** (Tejas & Rohit)
- **Team B** (Avneesh & Vinay)
- **Team C** (Manmohan / Nahas / Priya Singh)
- **Team D** (Rakshit & Pallavi)
- **Team E** (Ashutosh & Alok)
- **Dhurandhar** (Sudip & Kunal)

Team names, owners, and colors can be edited in Setup. The setup parser supports up to eight teams; that team count is separate from the 11 slots per squad.

### Keyboard controls

Shortcuts work outside editable fields. Auction action shortcuts apply on the Auction view.

- `1`–`8`: place a bid for the corresponding team.
- `N`: draw the next player.
- `S` or `Enter`: sell to the leading team.
- `U`: mark the current player unsold.
- `Z`: undo the latest bid.
- `X`: undo the latest sale.
- `M`: toggle sound.
- `H`: toggle presentation mode.
- `Escape`: dismiss an open result dialog.

**Present** hides operator controls in the current tab. **Open display** opens the same auction at `#display` in another tab and follows its stored Auction/Squads view. Same-origin tabs receive saved state changes through the browser's storage event.

## Architecture

The app is a static frontend. The browser owns the auction rules, state, rendering, audio, and result animations. Node.js is used for development, CSS compilation, and browser tests; it is not an application backend.

```mermaid
flowchart TD
    Operator[Operator: buttons and keyboard] --> Actions[Action handlers]
    Actions --> Rules[Budget, reserve and squad checks]
    Rules --> State[Shared auction state S]
    State --> Render[Render stage, teams, squads and players]
    Render --> Browser[Responsive browser UI]
    State --> Save[save]
    Save --> Local[(Browser localStorage)]
    Local --> OtherTabs[Same-origin display tabs]
    OtherTabs --> State
    Save -. when connected .-> Push[Host database adapter]
    Push -. writes .-> Remote[(auction/state)]
    Remote -. snapshot updates .-> Apply[applyRemote and migration]
    Apply --> State
```

### State and persistence

The state includes auction configuration, teams, player records, current player and bid history, sale order, the latest result event, and the selected view. Team and player IDs connect rosters, budgets, and sale history.

- **Browser storage:** `save()` stores JSON under `gts-auction-v3`. Refreshing the same browser origin restores the auction. Different origins and browser profiles have separate storage.
- **Existing auctions:** a versioned migration updates the old eight-slot default to eleven and replaces the known legacy team labels. It preserves player records, current bids, sales, and custom team names.
- **Optional host sync:** when the embedding host provides `window.claude.use('db')` and a user adapter, the app reads/writes the `json` field of `auction/state` and listens for snapshots. Host edit permissions determine whether the interface displays editing controls.
- **Standalone hosting:** a normal static/Vercel deployment does not provide that host adapter. It uses browser storage and same-origin tabs; cross-device sync requires a connected host integration.

### Player flow

```mermaid
flowchart LR
    Pool[Player pool] -->|Draw next or Auction now| Stage[Player on stage]
    Stage -->|Team bids| Leading[Current leading team]
    Leading -->|Another bid| Leading
    Leading -->|SOLD| Squad[Winning team's squad]
    Stage -->|Unsold| Unsold[Unsold list]
    Unsold -->|Back to pool| Pool
    Unsold -->|Random allocation| Squad
    Squad -->|Release| Pool
    Squad -->|Undo latest sale| Stage
```

## Project structure

```text
.
├── index.html                       # Canonical UI and inline auction JavaScript
├── GTS Cricket League Season 2.html # Synchronized alternative filename
├── src/styles.css                   # Tailwind theme and shared components
├── assets/
│   ├── styles.css                   # Generated stylesheet, committed for static use
│   └── globe-teleservices-logo.jpg   # Bundled header logo
├── scripts/
│   ├── build.mjs                    # Compile CSS, synchronize HTML, prepare dist
│   ├── serve.mjs                    # Local preview server
│   └── screenshots.mjs              # Reproduce README screenshots
├── tests/ui.test.mjs                 # Playwright browser regression checks
├── docs/images/                      # Committed UI screenshots
├── vercel.json                       # Build output and routing configuration
├── package.json
└── package-lock.json
```

`dist/`, `node_modules/`, and `test-results/` are generated and ignored by Git.

### Editing and building

Edit **`index.html`** for markup, Tailwind utility classes, and auction behavior. Edit **`src/styles.css`** for theme tokens and shared styles. Then run:

```bash
npm run build
```

The build compiles Tailwind into `assets/styles.css`, copies the canonical HTML to the alternative filename, and prepares both HTML files plus all local assets under `dist/`. Make changes to the canonical file so the next build retains them.

## Testing

```bash
npm test
```

The suite uses installed Chrome/Edge on Windows, `CHROME_PATH` if supplied, or Playwright's Chromium. If no browser is available, install the Playwright browser once:

```bash
npx playwright install chromium
```

Checks cover all five views across phone, tablet, desktop, and landscape sizes; text reflow; long names; larger text; bid/undo/sold/unsold flows; 11-player squads; existing-state migration; result dialogs; presentation/display modes; and the enlarged leading-team panel. Tests use isolated browser storage and do not connect to a live auction database. External font requests are blocked to verify that the interface still works with fallback fonts. Test screenshots go to `test-results/`.

### Refresh the README images

```bash
npm run build
npm run screenshots
```

The screenshot script starts a temporary server and browser profile, stages Nilesh Shinde with Team D leading at ₹21,000, captures the desktop/mobile interface and sold result, then closes its resources. It updates the five committed images in `docs/images/` without touching an existing browser's auction data.

## Deployment

The repository includes Vercel configuration that runs **`npm run build`** and serves **`dist/`**. Deploy the repository using that configuration, or upload the contents of `dist/` to a static host. Keep `assets/styles.css` alongside the HTML and serve it as a static asset.

## Branding

The header displays the Globe Teleservices logo beside **GTS Cricket League Season 2**. The logo is bundled locally and keeps its original proportions and colors on a white panel. Its source is the [Globe Teleservices press-release logo](https://mma.prnewswire.com/media/2155167/Globe_Teleservices_Logo.jpg). Existing auctions using the former GTS Premier League title are renamed automatically without resetting auction progress.
