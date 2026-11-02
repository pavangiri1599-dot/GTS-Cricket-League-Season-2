# GTS Cricket League — Season 2

Responsive, browser-based auction dashboard. Player records and auction storage keep the existing `gts-auction-v3` format.

Run `npm ci`, `npm run build`, then `npm run dev` to open the local preview at http://127.0.0.1:4173.

Edit `index.html` for the interface and `src/styles.css` for Tailwind theme tokens and shared components. Run `npm run build` after changes; it compiles `assets/styles.css`, synchronizes the original HTML filename, and prepares `dist/` for Vercel. The generated stylesheet is committed so either HTML file can also be opened directly with its adjacent `assets/` directory. No Tailwind CDN is needed.

Run `npm test` for Playwright checks covering navigation, responsive layouts, full player names, auction actions, result dialogs, persistence, presentation, and read-only/display modes. Tests use isolated browser storage and never connect to the live auction database. They use installed Chrome/Edge on Windows, `CHROME_PATH` when supplied, or Playwright's Chromium (`npx playwright install chromium`). Screenshots are written to the ignored `test-results/` directory.
