// Shared code for every page of The Amazing Race – Family Edition.
// Each page sets data-tag and data-banner on <body>; this file adds the
// tag bar, Jump Code dialog, logo, and banner, plus the clue tracker and
// code checker that the pages call with their own settings.

// ===== Race-wide settings =====
// While testing, every link between pages carries ?test=1 so clue pages
// simulate standing at the destination. Set to false for race day.
const TEST_LINKS = true;

// Tag -> page. Tags double as jump codes for getting back on course.
const PAGES = {
  cube:     "index.html",    // Starting Line
  puppy:    "puppy.html",    // Clue #1
  popcorn:  "popcorn.html",  // Detour #1
  football: "football.html", // Clue #2
  bird:     "bird.html",     // Roadblock #1
  coke:     "coke.html",     // Clue #3
  movie:    "movie.html",    // Detour #2
  golf:     "golf.html",     // Clue #4
  triangle: "triangle.html", // Pit Stop
};

// Logo sources, tried in order. Falls back to plain text if all fail.
const LOGO_SOURCES = [
  "images/image0.jpeg",
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcROOZFzi4L2o4LaXiamn91scJF-pQkm7ZmxfQmoXFjx-w&s",
];
// ==============================

function raceLink(file) {
  return TEST_LINKS ? `${file}?test=1` : file;
}

function logoFallback(img) {
  const attempt = Number(img.dataset.attempt || 0) + 1;
  if (attempt < LOGO_SOURCES.length) {
    img.dataset.attempt = attempt;
    img.src = LOGO_SOURCES[attempt];
  } else {
    img.outerHTML = '<div class="fallback-title">The Amazing Race</div>';
  }
}

// Answers are compared case-insensitively, ignoring spaces.
function normalize(text) {
  return text.toLowerCase().replace(/\s+/g, "");
}

// FNV-1a hash, so the answer codes aren't sitting in the page source.
// To get the hash for a new code, run raceHash("yourcode") in the browser console.
function raceHash(text) {
  let h = 0x811c9dc5;
  for (const ch of normalize(text)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function buildChrome() {
  const { tag, banner } = document.body.dataset;
  document.body.insertAdjacentHTML("afterbegin", `
    <div class="tag-bar">
      <span>Tag: <span class="tag-name">${tag}</span></span>
      <button type="button" class="jump-btn" id="jumpBtn">Jump Code</button>
    </div>
    <header>
      <img class="logo" src="${LOGO_SOURCES[0]}" alt="The Amazing Race" onerror="logoFallback(this)" />
    </header>
    <div class="leg-banner">Family Edition &middot; ${banner}</div>
    <dialog class="jump" id="jumpDialog">
      <form id="jumpForm">
        <h2>Jump Code</h2>
        <p>Enter the tag of the screen you want to go to.</p>
        <input id="jumpInput" autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="Tag" />
        <p class="form-msg bad" id="jumpMsg"></p>
        <div class="dialog-buttons">
          <button type="button" id="jumpCancel">Cancel</button>
          <button type="submit">Go</button>
        </div>
      </form>
    </dialog>`);

  const dialog = document.getElementById("jumpDialog");
  const input = document.getElementById("jumpInput");
  const msg = document.getElementById("jumpMsg");

  // Returns true if the tag matched and we're navigating away.
  function jumpTo(text) {
    const page = PAGES[normalize(text || "")];
    if (page) location.href = raceLink(page);
    return Boolean(page);
  }

  document.getElementById("jumpBtn").addEventListener("click", () => {
    if (typeof dialog.showModal !== "function") {
      // Very old browsers without <dialog> support
      const text = prompt("Enter the tag of the screen you want to go to:");
      if (text && !jumpTo(text)) alert("That tag doesn't match any screen.");
      return;
    }
    input.value = "";
    msg.textContent = "";
    dialog.showModal();
    input.focus();
  });
  document.getElementById("jumpCancel").addEventListener("click", () => dialog.close());
  document.getElementById("jumpForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!jumpTo(input.value)) {
      msg.textContent = "That tag doesn't match any screen. Try again.";
      input.select();
    }
  });
}
document.addEventListener("DOMContentLoaded", buildChrome);

// ----- Clue pages: GPS distance tracker -----

// Great-circle distance in miles (haversine formula)
function distanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth radius in miles
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function startClue({ TARGET, ARRIVAL_RADIUS_MILES, NEXT_LEG_URL, UPDATE_INTERVAL_MS, SHOW_MAP_LINK }) {
  // Add ?test=1 to the URL to simulate standing at the destination.
  const testMode = new URLSearchParams(location.search).has("test");
  const distanceEl = document.getElementById("distance");
  const statusEl = document.getElementById("status");
  const advanceBtn = document.getElementById("advanceBtn");
  const mapLink = document.getElementById("mapLink");

  advanceBtn.href = NEXT_LEG_URL;
  document.getElementById("targetCoords").textContent = `${TARGET.lat.toFixed(5)}, ${TARGET.lon.toFixed(5)}`;
  if (SHOW_MAP_LINK) {
    mapLink.href = `https://www.google.com/maps/search/?api=1&query=${TARGET.lat},${TARGET.lon}`;
  } else {
    mapLink.remove();
  }

  document.getElementById("envelope").addEventListener("click", (e) => {
    e.currentTarget.style.display = "none";
    document.getElementById("clueCard").classList.add("open");
  });

  function showDistance(miles) {
    distanceEl.textContent = miles < 10 ? `${miles.toFixed(2)} mi` : `${miles.toFixed(1)} mi`;
    statusEl.textContent = `Last updated ${new Date().toLocaleTimeString()}`;
    advanceBtn.classList.toggle("show", miles <= ARRIVAL_RADIUS_MILES);
  }

  function update() {
    if (testMode) {
      showDistance(0.05);
      statusEl.textContent += " (test mode)";
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => showDistance(distanceMiles(pos.coords.latitude, pos.coords.longitude, TARGET.lat, TARGET.lon)),
      (err) => {
        statusEl.textContent = err.code === err.PERMISSION_DENIED
          ? "Location access denied. Please allow location for this page and reload."
          : "Unable to get your location. Retrying…";
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  }

  if (!testMode && !("geolocation" in navigator)) {
    statusEl.textContent = "Your browser doesn't support location tracking.";
  } else {
    update();
    setInterval(update, UPDATE_INTERVAL_MS);
  }
}

// ----- Detour / Roadblock pages: code entry -----

function startChallenge({ CODE_HASH, NEXT_LEG_URL }) {
  const input = document.getElementById("codeInput");
  const msg = document.getElementById("codeMsg");
  const advanceBtn = document.getElementById("advanceBtn");
  advanceBtn.href = NEXT_LEG_URL;

  document.getElementById("codeForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const correct = raceHash(input.value) === CODE_HASH;
    msg.className = `form-msg ${correct ? "good" : "bad"}`;
    msg.textContent = correct
      ? "That's correct! Grab your next clue."
      : "Sorry, that's not the code. Check with the race coordinator and try again.";
    advanceBtn.classList.toggle("show", correct);
    if (!correct) input.select();
  });
}
