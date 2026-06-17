# NYC Apartment Compass

A static GitHub Pages app for turning a messy apartment-hunting CSV into a sortable, filterable decision board.

## What it does

- Uploads a local CSV in the browser.
- Cleans common apartment-sheet columns like address, rent, type, neighborhood, dishwasher, amenities, notes, and contact status.
- Preserves subjective notes and verdicts.
- Scores listings using commute, rent, and amenities weights.
- Shows rough distance, walking, and biking estimates for saved destinations.
- Generates Google Maps direction links for each apartment/destination pair.
- Optionally geocodes addresses with OpenStreetMap Nominatim and plots them on a simple map.
- Exports a cleaned CSV with scores and estimate columns.

## Privacy model

The app does not require the apartment CSV to be committed to the repo. When hosted on GitHub Pages, your partner can open the page, upload the CSV locally, and export a cleaned copy. If they click **Geocode addresses**, addresses are sent to OpenStreetMap's Nominatim service from their browser so coordinates can be found.

## GitHub Pages setup

1. Push this repo to GitHub.
2. In the GitHub repo, go to **Settings** -> **Pages**.
3. Set **Source** to deploy from the `main` branch and `/root`.
4. Save.
5. Share the Pages URL in Discord.

No build step is needed. The app is just `index.html`, `styles.css`, and `app.js`.

## Current limitations

- The walk/bike times are rough estimates, not live MTA or Google Maps commute results.
- Transit directions are linked out to Google Maps instead of calculated in the app.
- CSV upload is supported now. XLSX support can be added later if the spreadsheet moves away from CSV exports.
