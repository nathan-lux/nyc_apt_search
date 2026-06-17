const DEFAULT_DESTINATIONS = [
  {
    name: "Atlassian",
    address: "Atlassian, 888 Broadway, New York, NY 10003",
    lat: 40.73873,
    lon: -73.98947,
  },
  {
    name: "Central Rock Gym Chelsea",
    address: "Central Rock Gym Chelsea, New York, NY",
    lat: null,
    lon: null,
  },
];

const state = {
  listings: [],
  destinations: structuredClone(DEFAULT_DESTINATIONS),
  filters: {
    search: "",
    maxRent: "",
    maxWalk: "",
    dishwasherOnly: false,
    commuteWeight: 55,
    rentWeight: 30,
    amenityWeight: 15,
    sort: "score",
  },
};

const els = {
  csvInput: document.querySelector("#csvInput"),
  exportButton: document.querySelector("#exportButton"),
  geocodeButton: document.querySelector("#geocodeButton"),
  geocodeStatus: document.querySelector("#geocodeStatus"),
  destinationList: document.querySelector("#destinationList"),
  destinationTemplate: document.querySelector("#destinationTemplate"),
  addDestination: document.querySelector("#addDestination"),
  resetFilters: document.querySelector("#resetFilters"),
  searchInput: document.querySelector("#searchInput"),
  maxRentInput: document.querySelector("#maxRentInput"),
  maxWalkInput: document.querySelector("#maxWalkInput"),
  dishwasherOnly: document.querySelector("#dishwasherOnly"),
  commuteWeight: document.querySelector("#commuteWeight"),
  rentWeight: document.querySelector("#rentWeight"),
  amenityWeight: document.querySelector("#amenityWeight"),
  sortSelect: document.querySelector("#sortSelect"),
  listingRows: document.querySelector("#listingRows"),
  totalCount: document.querySelector("#totalCount"),
  visibleCount: document.querySelector("#visibleCount"),
  bestRent: document.querySelector("#bestRent"),
  bestCommute: document.querySelector("#bestCommute"),
  mapSvg: document.querySelector("#mapSvg"),
  mapHint: document.querySelector("#mapHint"),
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function normalizeKey(key) {
  return key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function headerIndex(headers) {
  const aliases = {
    preference: ["pref", "preference", "priority"],
    contactName: ["contact name", "broker", "agent"],
    needsResponse: ["need torespond", "need to respond", "needs response"],
    contacted: ["contacted", "contacted?"],
    moveIn: ["move in", "move in date"],
    verdict: ["verdict notes", "verdict", "decision"],
    notes: ["notes", "note"],
    address: ["address", "addr"],
    link: ["link", "streeteasy", "listing"],
    rent: ["rent", "price"],
    suppliedDistance: ["dist", "distance"],
    type: ["type", "bedrooms", "beds"],
    neighborhood: ["neighborhood", "area"],
    dishwasher: ["dish washer", "dishwasher"],
    sqft: ["sqft", "square feet", "size"],
    gmaps: ["gmaps", "google maps", "maps"],
    otherLink: ["other link", "alt link"],
    amenities: ["amenedies laundrey", "amenities laundry", "amenities", "laundrey", "laundry"],
  };

  const normalized = headers.map(normalizeKey);
  return Object.fromEntries(
    Object.entries(aliases).map(([field, names]) => [
      field,
      normalized.findIndex((header) => names.includes(header)),
    ]),
  );
}

function read(row, idx) {
  return idx >= 0 && idx < row.length ? row[idx].trim() : "";
}

function cleanRent(value) {
  const number = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function cleanNumber(value) {
  const cleaned = String(value).replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function cleanType(value) {
  const text = value.trim().toLowerCase();
  if (!text) return "";
  if (["stuio", "studio apt", "studio apartment"].includes(text)) return "studio";
  if (text === "1b" || text === "1br" || text === "1 bed") return "1 bed";
  if (text === "2b" || text === "2br" || text === "2 bed") return "2 bed";
  return text;
}

function cleanDishwasher(value) {
  const text = value.trim().toLowerCase();
  if (!text) return "";
  if (["yes", "y", "listed", "dishwasher"].includes(text)) return "yes";
  if (["no", "n"].includes(text)) return "no";
  return text;
}

function normalizeListings(rows) {
  if (rows.length < 2) return [];
  const headers = rows[0];
  const idx = headerIndex(headers);

  const listings = rows.slice(1).map((row, index) => {
    const address = read(row, idx.address);
    const suppliedDistance = cleanNumber(read(row, idx.suppliedDistance));
    return {
      id: `apt-${index + 1}`,
      preference: read(row, idx.preference),
      contactName: read(row, idx.contactName),
      needsResponse: read(row, idx.needsResponse),
      contacted: read(row, idx.contacted),
      moveIn: read(row, idx.moveIn),
      verdict: read(row, idx.verdict),
      notes: read(row, idx.notes),
      address,
      link: read(row, idx.link),
      rent: cleanRent(read(row, idx.rent)),
      suppliedDistance,
      type: cleanType(read(row, idx.type)),
      neighborhood: read(row, idx.neighborhood).replace(/\s+/g, " ").trim(),
      dishwasher: cleanDishwasher(read(row, idx.dishwasher)),
      sqft: cleanNumber(read(row, idx.sqft)),
      gmaps: read(row, idx.gmaps),
      otherLink: read(row, idx.otherLink),
      amenities: read(row, idx.amenities),
      lat: null,
      lon: null,
      geocodeLabel: "",
      geocodeError: "",
    };
  }).filter((listing) => listing.address || listing.link || listing.notes);

  const counts = listings.reduce((acc, listing) => {
    const key = listing.address.toLowerCase();
    if (key) acc.set(key, (acc.get(key) || 0) + 1);
    return acc;
  }, new Map());

  return listings.map((listing) => ({
    ...listing,
    duplicateCount: counts.get(listing.address.toLowerCase()) || 1,
  }));
}

function money(value) {
  return value ? `$${Math.round(value).toLocaleString()}` : "-";
}

function minutes(value) {
  return Number.isFinite(value) ? `${Math.round(value)} min` : "-";
}

function miles(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} mi` : "-";
}

function haversineMiles(a, b) {
  if (![a.lat, a.lon, b.lat, b.lon].every(Number.isFinite)) return null;
  const radius = 3958.8;
  const toRad = (degrees) => degrees * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function estimatesFor(listing) {
  const estimates = state.destinations.map((destination, index) => {
    const rawDistance = haversineMiles(listing, destination);
    const distance = rawDistance ?? (index === 0 ? listing.suppliedDistance : null);
    return {
      destination,
      distance,
      walk: distance ? distance / 3.1 * 60 * 1.2 : null,
      bike: distance ? distance / 9.5 * 60 * 1.15 : null,
      mapsUrl: mapsUrl(listing.address, destination.address),
    };
  });
  return estimates;
}

function mapsUrl(origin, destination) {
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "transit",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function scoreListing(listing) {
  const estimates = estimatesFor(listing);
  const distances = estimates.map((estimate) => estimate.distance).filter(Number.isFinite);
  const closestDistance = distances.length ? Math.min(...distances) : 5;
  const rent = listing.rent ?? 4500;
  const rentPenalty = Math.min(45, Math.max(0, (rent - 2500) / 60));
  const commutePenalty = Math.min(55, closestDistance * 16);
  const amenityBoost = [
    listing.dishwasher === "yes" ? 6 : 0,
    /laundry|washer|dryer/i.test(`${listing.amenities} ${listing.notes}`) ? 5 : 0,
    /great|good|cool|pref/i.test(`${listing.preference} ${listing.notes} ${listing.verdict}`) ? 5 : 0,
  ].reduce((sum, item) => sum + item, 0);

  const totalWeight = Number(state.filters.commuteWeight)
    + Number(state.filters.rentWeight)
    + Number(state.filters.amenityWeight);
  const commuteShare = Number(state.filters.commuteWeight) / totalWeight;
  const rentShare = Number(state.filters.rentWeight) / totalWeight;
  const amenityShare = Number(state.filters.amenityWeight) / totalWeight;

  const score = 100
    - commutePenalty * commuteShare
    - rentPenalty * rentShare
    + amenityBoost * amenityShare;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function filteredListings() {
  const query = state.filters.search.trim().toLowerCase();
  const maxRent = cleanRent(state.filters.maxRent);
  const maxWalk = cleanNumber(state.filters.maxWalk);

  const listings = state.listings.filter((listing) => {
    const haystack = [
      listing.address,
      listing.neighborhood,
      listing.notes,
      listing.verdict,
      listing.type,
      listing.amenities,
    ].join(" ").toLowerCase();
    const estimates = estimatesFor(listing);
    const walks = estimates.map((estimate) => estimate.walk).filter(Number.isFinite);
    const shortestWalk = walks.length ? Math.min(...walks) : null;
    if (query && !haystack.includes(query)) return false;
    if (maxRent && listing.rent && listing.rent > maxRent) return false;
    if (maxWalk && shortestWalk && shortestWalk > maxWalk) return false;
    if (state.filters.dishwasherOnly && listing.dishwasher !== "yes") return false;
    return true;
  });

  return listings.sort((a, b) => {
    if (state.filters.sort === "rent") return (a.rent ?? 999999) - (b.rent ?? 999999);
    if (state.filters.sort === "neighborhood") return a.neighborhood.localeCompare(b.neighborhood);
    if (state.filters.sort === "distance") {
      const minDistance = (listing) => Math.min(...estimatesFor(listing)
        .map((estimate) => estimate.distance)
        .filter(Number.isFinite));
      return (minDistance(a) || 99) - (minDistance(b) || 99);
    }
    return scoreListing(b) - scoreListing(a);
  });
}

function renderDestinations() {
  els.destinationList.innerHTML = "";
  state.destinations.forEach((destination, index) => {
    const node = els.destinationTemplate.content.cloneNode(true);
    const row = node.querySelector(".destination-row");
    const name = node.querySelector(".destination-name");
    const address = node.querySelector(".destination-address");
    const remove = node.querySelector(".destination-remove");

    name.value = destination.name;
    address.value = destination.address;
    name.addEventListener("input", () => {
      state.destinations[index].name = name.value;
      renderContent();
    });
    address.addEventListener("input", () => {
      state.destinations[index].address = address.value;
      state.destinations[index].lat = null;
      state.destinations[index].lon = null;
      row.dataset.ready = false;
      renderContent();
    });
    remove.addEventListener("click", () => {
      state.destinations.splice(index, 1);
      render();
    });
    row.dataset.ready = Number.isFinite(destination.lat) && Number.isFinite(destination.lon);
    els.destinationList.appendChild(node);
  });
}

function renderTable(listings) {
  if (!state.listings.length) {
    els.listingRows.innerHTML = `
      <tr><td colspan="8" class="empty-state">Upload the apartment CSV to clean it up and start comparing listings.</td></tr>
    `;
    return;
  }

  if (!listings.length) {
    els.listingRows.innerHTML = `
      <tr><td colspan="8" class="empty-state">No listings match those filters.</td></tr>
    `;
    return;
  }

  els.listingRows.innerHTML = listings.map((listing) => {
    const estimates = estimatesFor(listing).map((estimate) => `
      <a class="estimate" href="${escapeHtml(estimate.mapsUrl)}" target="_blank" rel="noreferrer">
        <strong>${escapeHtml(estimate.destination.name || "Destination")}</strong>
        <span>${miles(estimate.distance)} · walk ${minutes(estimate.walk)} · bike ${minutes(estimate.bike)}</span>
      </a>
    `).join("");
    const status = [listing.preference, listing.contacted, listing.needsResponse, listing.moveIn]
      .filter(Boolean)
      .map((item) => `<span class="pill">${escapeHtml(item)}</span>`)
      .join("");
    const duplicate = listing.duplicateCount > 1 ? `<span class="pill warn">Duplicate x${listing.duplicateCount}</span>` : "";
    const links = [
      listing.link ? `<a href="${escapeHtml(listing.link)}" target="_blank" rel="noreferrer">Listing</a>` : "",
      listing.gmaps ? `<a href="${escapeHtml(listing.gmaps)}" target="_blank" rel="noreferrer">Saved map</a>` : "",
      listing.otherLink ? `<a href="${escapeHtml(listing.otherLink)}" target="_blank" rel="noreferrer">Other</a>` : "",
    ].filter(Boolean).join(" · ");

    return `
      <tr>
        <td><span class="score">${scoreListing(listing)}</span></td>
        <td>
          <strong>${escapeHtml(listing.address || "Missing address")}</strong>
          <small>${links}</small>
          ${listing.geocodeError ? `<small class="error-text">${escapeHtml(listing.geocodeError)}</small>` : ""}
        </td>
        <td>${money(listing.rent)}</td>
        <td>${escapeHtml(listing.neighborhood || "-")}</td>
        <td>${escapeHtml(listing.type || "-")}</td>
        <td class="estimates">${estimates}</td>
        <td>${status || duplicate ? `${status}${duplicate}` : "-"}</td>
        <td>${escapeHtml([listing.verdict, listing.notes, listing.amenities].filter(Boolean).join(" · ") || "-")}</td>
      </tr>
    `;
  }).join("");
}

function renderSummary(listings) {
  els.totalCount.textContent = state.listings.length.toLocaleString();
  els.visibleCount.textContent = listings.length.toLocaleString();
  const rents = listings.map((listing) => listing.rent).filter(Number.isFinite);
  els.bestRent.textContent = rents.length ? money(Math.min(...rents)) : "-";
  const walks = listings.flatMap((listing) => estimatesFor(listing).map((estimate) => estimate.walk))
    .filter(Number.isFinite);
  els.bestCommute.textContent = walks.length ? minutes(Math.min(...walks)) : "-";
}

function renderMap(listings) {
  const plottedListings = listings.filter((listing) => Number.isFinite(listing.lat) && Number.isFinite(listing.lon));
  const plottedDestinations = state.destinations.filter((destination) => Number.isFinite(destination.lat) && Number.isFinite(destination.lon));
  const points = [...plottedListings, ...plottedDestinations];
  els.mapSvg.innerHTML = "";

  if (!points.length) {
    els.mapHint.textContent = "Geocode to plot listings";
    return;
  }

  els.mapHint.textContent = `${plottedListings.length} apartments plotted`;
  const lats = points.map((point) => point.lat);
  const lons = points.map((point) => point.lon);
  const bounds = {
    minLat: Math.min(...lats) - 0.006,
    maxLat: Math.max(...lats) + 0.006,
    minLon: Math.min(...lons) - 0.006,
    maxLon: Math.max(...lons) + 0.006,
  };
  const width = 720;
  const height = 520;
  els.mapSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const project = (point) => ({
    x: ((point.lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * (width - 60) + 30,
    y: height - (((point.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * (height - 60) + 30),
  });

  els.mapSvg.insertAdjacentHTML("beforeend", `<rect x="0" y="0" width="${width}" height="${height}" rx="8" />`);
  plottedDestinations.forEach((destination) => {
    const { x, y } = project(destination);
    els.mapSvg.insertAdjacentHTML("beforeend", `
      <g class="destination-dot" transform="translate(${x} ${y})">
        <circle r="9"></circle>
        <text x="13" y="4">${escapeHtml(destination.name)}</text>
      </g>
    `);
  });
  plottedListings.forEach((listing) => {
    const { x, y } = project(listing);
    const score = scoreListing(listing);
    els.mapSvg.insertAdjacentHTML("beforeend", `
      <a href="${escapeHtml(listing.link || mapsUrl(listing.address, state.destinations[0]?.address || ""))}" target="_blank" rel="noreferrer">
        <g class="apartment-dot" transform="translate(${x} ${y})">
          <circle r="${Math.max(5, Math.min(10, score / 10))}"></circle>
          <title>${escapeHtml(listing.address)} · score ${score}</title>
        </g>
      </a>
    `);
  });
}

function renderContent() {
  const listings = filteredListings();
  renderSummary(listings);
  renderMap(listings);
  renderTable(listings);
  els.exportButton.disabled = !state.listings.length;
  els.geocodeButton.disabled = !state.listings.length;
}

function render() {
  renderDestinations();
  renderContent();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function exportCsv() {
  const headers = [
    "score",
    "address",
    "rent",
    "neighborhood",
    "type",
    "dishwasher",
    "sqft",
    "preference",
    "contacted",
    "move_in",
    "notes",
    "verdict",
    "amenities",
    "listing_link",
    "google_maps_link",
    "duplicate_count",
    "latitude",
    "longitude",
    ...state.destinations.flatMap((destination) => [
      `${destination.name} distance mi`,
      `${destination.name} walk min`,
      `${destination.name} bike min`,
    ]),
  ];

  const rows = state.listings.map((listing) => {
    const estimates = estimatesFor(listing);
    return [
      scoreListing(listing),
      listing.address,
      listing.rent,
      listing.neighborhood,
      listing.type,
      listing.dishwasher,
      listing.sqft,
      listing.preference,
      listing.contacted,
      listing.moveIn,
      listing.notes,
      listing.verdict,
      listing.amenities,
      listing.link,
      listing.gmaps,
      listing.duplicateCount,
      listing.lat,
      listing.lon,
      ...estimates.flatMap((estimate) => [
        estimate.distance?.toFixed(2) ?? "",
        estimate.walk ? Math.round(estimate.walk) : "",
        estimate.bike ? Math.round(estimate.bike) : "",
      ]),
    ];
  });

  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "apartments-cleaned.csv";
  link.click();
  URL.revokeObjectURL(url);
}

async function geocodeOne(query) {
  const cacheKey = `geocode:${query.toLowerCase()}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return JSON.parse(cached);

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", query);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Geocoder returned ${response.status}`);
  const results = await response.json();
  if (!results.length) throw new Error("No match found");
  const value = {
    lat: Number(results[0].lat),
    lon: Number(results[0].lon),
    label: results[0].display_name,
  };
  localStorage.setItem(cacheKey, JSON.stringify(value));
  await new Promise((resolve) => setTimeout(resolve, 1100));
  return value;
}

async function geocodeAll() {
  els.geocodeButton.disabled = true;
  const destinationsNeedingGeocode = state.destinations.filter((destination) => (
    destination.address && (!Number.isFinite(destination.lat) || !Number.isFinite(destination.lon))
  ));
  const listingsNeedingGeocode = state.listings.filter((listing) => (
    listing.address && (!Number.isFinite(listing.lat) || !Number.isFinite(listing.lon))
  ));
  const total = destinationsNeedingGeocode.length + listingsNeedingGeocode.length;
  let completed = 0;

  try {
    for (const destination of destinationsNeedingGeocode) {
      els.geocodeStatus.textContent = `Geocoding destination ${completed + 1} of ${total}`;
      const result = await geocodeOne(destination.address);
      destination.lat = result.lat;
      destination.lon = result.lon;
      completed += 1;
      render();
    }

    for (const listing of listingsNeedingGeocode) {
      els.geocodeStatus.textContent = `Geocoding listing ${completed + 1} of ${total}`;
      try {
        const result = await geocodeOne(`${listing.address}, New York, NY`);
        listing.lat = result.lat;
        listing.lon = result.lon;
        listing.geocodeLabel = result.label;
        listing.geocodeError = "";
      } catch (error) {
        listing.geocodeError = error.message;
      }
      completed += 1;
      render();
    }
    els.geocodeStatus.textContent = `Geocoded ${completed} item${completed === 1 ? "" : "s"}.`;
  } catch (error) {
    els.geocodeStatus.textContent = `Stopped: ${error.message}`;
  } finally {
    els.geocodeButton.disabled = !state.listings.length;
    render();
  }
}

els.csvInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  state.listings = normalizeListings(parseCsv(text));
  els.geocodeStatus.textContent = `${state.listings.length} listings loaded. Geocode when ready.`;
  render();
});

els.exportButton.addEventListener("click", exportCsv);
els.geocodeButton.addEventListener("click", geocodeAll);
els.addDestination.addEventListener("click", () => {
  state.destinations.push({ name: "New destination", address: "", lat: null, lon: null });
  render();
});
els.resetFilters.addEventListener("click", () => {
  Object.assign(state.filters, {
    search: "",
    maxRent: "",
    maxWalk: "",
    dishwasherOnly: false,
    commuteWeight: 55,
    rentWeight: 30,
    amenityWeight: 15,
    sort: "score",
  });
  syncInputs();
  render();
});

[
  ["searchInput", "search"],
  ["maxRentInput", "maxRent"],
  ["maxWalkInput", "maxWalk"],
  ["commuteWeight", "commuteWeight"],
  ["rentWeight", "rentWeight"],
  ["amenityWeight", "amenityWeight"],
  ["sortSelect", "sort"],
].forEach(([element, field]) => {
  els[element].addEventListener("input", () => {
    state.filters[field] = els[element].value;
    render();
  });
});
els.dishwasherOnly.addEventListener("change", () => {
  state.filters.dishwasherOnly = els.dishwasherOnly.checked;
  render();
});

function syncInputs() {
  els.searchInput.value = state.filters.search;
  els.maxRentInput.value = state.filters.maxRent;
  els.maxWalkInput.value = state.filters.maxWalk;
  els.dishwasherOnly.checked = state.filters.dishwasherOnly;
  els.commuteWeight.value = state.filters.commuteWeight;
  els.rentWeight.value = state.filters.rentWeight;
  els.amenityWeight.value = state.filters.amenityWeight;
  els.sortSelect.value = state.filters.sort;
}

syncInputs();
render();
