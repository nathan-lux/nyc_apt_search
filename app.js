const DEFAULT_DESTINATIONS = [
  {
    name: "Atlassian",
    address: "Atlassian, 888 Broadway, New York, NY 10003",
    lat: 40.73873,
    lon: -73.98947,
  },
  {
    name: "CRG / Chelsea anchor",
    address: "Chelsea, New York, NY",
    lat: 40.7465,
    lon: -74.0014,
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
  columns: {
    area: true,
    type: true,
    status: true,
    notes: true,
  },
  map: null,
  mapLayers: [],
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
  map: document.querySelector("#map"),
  mapHint: document.querySelector("#mapHint"),
  columnToggles: document.querySelectorAll(".column-toggle"),
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

function manualCoordinate(value) {
  const text = String(value).trim();
  if (!text) return null;
  const number = Number(text);
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

function coordinatesFromGoogleMaps(url) {
  const text = String(url || "");
  const matches = [...text.matchAll(/!1d(-?\d+(?:\.\d+)?)!2d(-?\d+(?:\.\d+)?)/g)];
  if (!matches.length) return null;
  const [, lon, lat] = matches[matches.length - 1];
  return {
    lat: Number(lat),
    lon: Number(lon),
  };
}

function normalizeListings(rows) {
  if (rows.length < 2) return [];
  const headers = rows[0];
  const idx = headerIndex(headers);

  const listings = rows.slice(1).map((row, index) => {
    const address = read(row, idx.address);
    const suppliedDistance = cleanNumber(read(row, idx.suppliedDistance));
    const gmaps = read(row, idx.gmaps);
    const coordinates = coordinatesFromGoogleMaps(gmaps);
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
      gmaps,
      otherLink: read(row, idx.otherLink),
      amenities: read(row, idx.amenities),
      lat: coordinates?.lat ?? null,
      lon: coordinates?.lon ?? null,
      geocodeLabel: coordinates ? "From saved Google Maps link" : "",
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
    const directDistance = haversineMiles(listing, destination);
    const distance = directDistance ? directDistance * 1.25 : (index === 0 ? listing.suppliedDistance : null);
    return {
      destination,
      distance,
      bike: distance ? distance / 8.5 * 60 : null,
      bikeUrl: mapsUrl(listing.address, destination.address, "bicycling"),
      transitUrl: mapsUrl(listing.address, destination.address, "transit"),
    };
  });
  return estimates;
}

function mapsUrl(origin, destination, travelmode = "transit") {
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode,
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
    const bikes = estimates.map((estimate) => estimate.bike).filter(Number.isFinite);
    const shortestBike = bikes.length ? Math.min(...bikes) : null;
    if (query && !haystack.includes(query)) return false;
    if (maxRent && listing.rent && listing.rent > maxRent) return false;
    if (maxWalk && shortestBike && shortestBike > maxWalk) return false;
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
    const lat = node.querySelector(".destination-lat");
    const lon = node.querySelector(".destination-lon");
    const remove = node.querySelector(".destination-remove");

    name.value = destination.name;
    address.value = destination.address;
    lat.value = Number.isFinite(destination.lat) ? destination.lat.toFixed(5) : "";
    lon.value = Number.isFinite(destination.lon) ? destination.lon.toFixed(5) : "";
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
    lat.addEventListener("input", () => {
      state.destinations[index].lat = manualCoordinate(lat.value);
      row.dataset.ready = Number.isFinite(state.destinations[index].lat) && Number.isFinite(state.destinations[index].lon);
      renderContent();
    });
    lon.addEventListener("input", () => {
      state.destinations[index].lon = manualCoordinate(lon.value);
      row.dataset.ready = Number.isFinite(state.destinations[index].lat) && Number.isFinite(state.destinations[index].lon);
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
      <div class="estimate">
        <strong>${escapeHtml(estimate.destination.name || "Destination")}</strong>
        <span>${miles(estimate.distance)} · bike ${minutes(estimate.bike)}</span>
        <span class="estimate-links">
          <a href="${escapeHtml(estimate.bikeUrl)}" target="_blank" rel="noreferrer">Bike route</a>
          <a href="${escapeHtml(estimate.transitUrl)}" target="_blank" rel="noreferrer">Transit</a>
        </span>
      </div>
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
        <td data-column="area">${escapeHtml(listing.neighborhood || "-")}</td>
        <td data-column="type">${escapeHtml(listing.type || "-")}</td>
        <td class="estimates">${estimates}</td>
        <td data-column="status">${status || duplicate ? `${status}${duplicate}` : "-"}</td>
        <td class="notes-cell" data-column="notes">${escapeHtml([listing.verdict, listing.notes, listing.amenities].filter(Boolean).join(" · ") || "-")}</td>
      </tr>
    `;
  }).join("");
  applyColumnVisibility();
}

function renderSummary(listings) {
  els.totalCount.textContent = state.listings.length.toLocaleString();
  els.visibleCount.textContent = listings.length.toLocaleString();
  const rents = listings.map((listing) => listing.rent).filter(Number.isFinite);
  els.bestRent.textContent = rents.length ? money(Math.min(...rents)) : "-";
  const bikes = listings.flatMap((listing) => estimatesFor(listing).map((estimate) => estimate.bike))
    .filter(Number.isFinite);
  els.bestCommute.textContent = bikes.length ? minutes(Math.min(...bikes)) : "-";
}

function renderMap(listings) {
  const plottedListings = listings.filter((listing) => Number.isFinite(listing.lat) && Number.isFinite(listing.lon));
  const plottedDestinations = state.destinations.filter((destination) => Number.isFinite(destination.lat) && Number.isFinite(destination.lon));
  const points = [...plottedDestinations, ...plottedListings];

  if (!window.L) {
    renderFallbackMap(plottedListings, plottedDestinations);
    return;
  }

  if (!state.map) {
    els.map.classList.remove("fallback-map");
    state.map = L.map(els.map, {
      scrollWheelZoom: false,
    }).setView([40.735, -73.99], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(state.map);
  }

  state.mapLayers.forEach((layer) => layer.remove());
  state.mapLayers = [];
  setTimeout(() => state.map.invalidateSize(), 0);

  plottedDestinations.forEach((destination) => {
    const marker = L.marker([destination.lat, destination.lon], { title: destination.name })
      .bindPopup(`<strong>${escapeHtml(destination.name)}</strong><br>${escapeHtml(destination.address)}`)
      .addTo(state.map);
    state.mapLayers.push(marker);
  });

  plottedListings.forEach((listing) => {
    const score = scoreListing(listing);
    const estimateLines = estimatesFor(listing).map((estimate) => (
      `<br>${escapeHtml(estimate.destination.name)}: ${miles(estimate.distance)}, bike ${minutes(estimate.bike)}`
    )).join("");
    const marker = L.circleMarker([listing.lat, listing.lon], {
      radius: Math.max(5, Math.min(10, score / 10)),
      color: "#ffffff",
      weight: 2,
      fillColor: "#1f7a6a",
      fillOpacity: 0.85,
    }).bindPopup(`
      <strong>${escapeHtml(listing.address)}</strong><br>
      Score ${score} · ${money(listing.rent)}<br>
      ${estimateLines}
      ${listing.link ? `<a href="${escapeHtml(listing.link)}" target="_blank" rel="noreferrer">Open listing</a>` : ""}
    `).addTo(state.map);
    state.mapLayers.push(marker);
  });

  if (points.length) {
    state.map.fitBounds(points.map((point) => [point.lat, point.lon]), { padding: [28, 28], maxZoom: 14 });
  }
  els.mapHint.textContent = plottedListings.length
    ? `${plottedListings.length} apartments plotted`
    : "Known destinations shown. Geocode listings to add apartments.";
}

function renderFallbackMap(plottedListings, plottedDestinations) {
  const points = [...plottedDestinations, ...plottedListings];
  els.map.innerHTML = "";
  els.map.classList.add("fallback-map");

  if (!points.length) {
    els.mapHint.textContent = "Geocode to plot listings";
    els.map.innerHTML = `<div class="map-empty">No mapped points yet</div>`;
    return;
  }

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
  const project = (point) => ({
    x: ((point.lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * (width - 70) + 35,
    y: height - (((point.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * (height - 70) + 35),
  });

  const destinationDots = plottedDestinations.map((destination) => {
    const { x, y } = project(destination);
    return `
      <g class="fallback-destination" transform="translate(${x} ${y})">
        <circle r="9"></circle>
        <text x="13" y="4">${escapeHtml(destination.name)}</text>
      </g>
    `;
  }).join("");
  const listingDots = plottedListings.map((listing) => {
    const { x, y } = project(listing);
    const score = scoreListing(listing);
    const estimateTitle = estimatesFor(listing)
      .map((estimate) => `${estimate.destination.name}: ${miles(estimate.distance)}, bike ${minutes(estimate.bike)}`)
      .join(" | ");
    return `
      <a href="${escapeHtml(listing.link || mapsUrl(listing.address, state.destinations[0]?.address || ""))}" target="_blank" rel="noreferrer">
        <g class="fallback-apartment" transform="translate(${x} ${y})">
          <circle r="${Math.max(5, Math.min(10, score / 10))}"></circle>
          <title>${escapeHtml(listing.address)} · score ${score} · ${escapeHtml(estimateTitle)}</title>
        </g>
      </a>
    `;
  }).join("");

  els.map.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Approximate apartment map">
      <rect x="0" y="0" width="${width}" height="${height}" rx="8"></rect>
      <path d="M120 0V520M240 0V520M360 0V520M480 0V520M600 0V520M0 130H720M0 260H720M0 390H720"></path>
      ${destinationDots}
      ${listingDots}
    </svg>
  `;
  els.mapHint.textContent = plottedListings.length
    ? `${plottedListings.length} apartments plotted`
    : "Known destinations shown. Geocode listings to add apartments.";
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
      `${destination.name} bike min`,
      `${destination.name} transit link`,
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
        estimate.bike ? Math.round(estimate.bike) : "",
        estimate.transitUrl,
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
els.columnToggles.forEach((toggle) => {
  toggle.addEventListener("change", () => {
    state.columns[toggle.dataset.column] = toggle.checked;
    applyColumnVisibility();
  });
});

function applyColumnVisibility() {
  Object.entries(state.columns).forEach(([column, visible]) => {
    document.querySelectorAll(`[data-column="${column}"]`).forEach((cell) => {
      cell.hidden = !visible;
    });
  });
}

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
