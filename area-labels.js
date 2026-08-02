/*
 * ADDING A NEW MAP
 * 1. Drop area JSON in area-data/<MapBaseName>.json
 *    and map protections JSON in area-data/<MapBaseName>-protections.json.
 * 2. Add to AREA_DATA_SOURCES / AREA_PROTECTION_SOURCES.
 */
(function () {
  

  const AREA_DATA_SOURCES = {
    RMCchances: "area-data/RMCchances.json",
    RMChybrisa: "area-data/RMChybrisa.json",
    RMCkutjevo: "area-data/RMCkutjevo.json",
    RMClv624: "area-data/RMClv624.json",
    RMCprison: "area-data/RMCprison.json",
    RMCshiva: "area-data/RMCshiva.json",
    RMCsolaris: "area-data/RMCsolaris.json",
    RMCsorokyne: "area-data/RMCsorokyne.json",
    RMCtrijent: "area-data/RMCtrijent.json",
    RMCvaradero: "area-data/RMCvaradero.json",
  };

  const AREA_PROTECTION_SOURCES = {
    RMCchances: "area-data/RMCchances-protections.json",
    RMChybrisa: "area-data/RMChybrisa-protections.json",
    RMCkutjevo: "area-data/RMCkutjevo-protections.json",
    RMClv624: "area-data/RMClv624-protections.json",
    RMCprison: "area-data/RMCprison-protections.json",
    RMCshiva: "area-data/RMCshiva-protections.json",
    RMCsolaris: "area-data/RMCsolaris-protections.json",
    RMCsorokyne: "area-data/RMCsorokyne-protections.json",
    RMCtrijent: "area-data/RMCtrijent-protections.json",
    RMCvaradero: "area-data/RMCvaradero-protections.json",
  };

  const TILE_SIZE = 32; // must match app.js
  const MIN_CLUSTER_TILES = 3;    // drop tiny/noisy fragments
  const DEDUPE_RADIUS_TILES = 25; // same-named rooms closer than this share one text label
  const REVEAL_RADIUS_TILES = 55; // how close a room needs to be to a clicked big label to show its name
  const EXCLUDE_NAME_PATTERNS = [/oob/i, /^RMCAreaSpace$/i]; // void / out-of-bounds tiles

  const areaCache = new Map();       // mapBaseName -> clusters[] | null
  const protectionCache = new Map(); // mapBaseName -> { areaId: flags } | null

  let subLayer = null;        // nested inside #map-labels-layer (free show/hide-all)
  let labelEntries = [];      // one per possible text label: { el, tileX, tileY }
  let tileLookup = new Map(); // "tx,ty" -> { name, flags } — for the hover tooltip
  let expandedBigLabel = null;
  let currentMapHasData = false;
  let toggleBtn = null;
  let hoverInfoEnabled = localStorage.getItem("hoverInfoEnabled") === "true";
  let hookFiredAtLeastOnce = false;

  const STRIP_WORDS = new Set(["glass", "damage"]);

  function prettifyName(raw) {
    let n = raw.replace(/^RMCArea/, "");
    n = n.replace(/Lv\d+/g, "");
    n = n.replace(/^(Indoors|Outdoors|Atmos)/, "");
    n = n.replace(/^LoneBuildings/, "");
    n = n.replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
    n = n.replace(/([a-z])([A-Z])/g, "$1 $2");
    n = n.replace(/([A-Za-z])(\d)/g, "$1 $2");
    n = n.replace(/(\d)([A-Za-z])/g, "$1 $2");
    n = n
      .split(/\s+/)
      .filter((word) => word && !STRIP_WORDS.has(word.toLowerCase()))
      .join(" ")
      .trim();
    return n || raw;
  }

  function shouldExclude(name) {
    return EXCLUDE_NAME_PATTERNS.some((re) => re.test(name));
  }

  async function loadProtections(mapBaseName) {
    if (protectionCache.has(mapBaseName)) return protectionCache.get(mapBaseName);
    const src = AREA_PROTECTION_SOURCES[mapBaseName];
    if (!src) {
      protectionCache.set(mapBaseName, null);
      return null;
    }
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      protectionCache.set(mapBaseName, data);
      return data;
    } catch (err) {
      
      protectionCache.set(mapBaseName, null);
      return null;
    }
  }

  function flagsSummary(flags) {
    if (!flags) return "No protection data for this room.";
    return (
      `CAS: ${flags.CAS ? "yes" : "no"} | Mortar Fire: ${flags.mortarFire ? "yes" : "no"} | OB: ${flags.OB ? "yes" : "no"}\n` +
      `Medevac: ${flags.medevac ? "yes" : "no"} | Mortar Placement: ${flags.mortarPlacement ? "yes" : "no"}\n` +
      `Fulton: ${flags.fulton ? "yes" : "no"} | Lasing: ${flags.lasing ? "yes" : "no"} | Paradrop: ${flags.paradropping ? "yes" : "no"} | Supply Drop: ${flags.supplyDrop ? "yes" : "no"}`
    );
  }

  // Flood-fills the sparse tile dictionary into one cluster per contiguous
  // same-named blob, keeping every tile (needed for the hover lookup), not
  // just a centroid.
  async function loadAreaClusters(mapBaseName) {
    if (areaCache.has(mapBaseName)) return areaCache.get(mapBaseName);
    const src = AREA_DATA_SOURCES[mapBaseName];
    if (!src) {
      areaCache.set(mapBaseName, null);
      return null;
    }

    let raw;
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      raw = await res.json();
    } catch (err) {
      
      areaCache.set(mapBaseName, null);
      return null;
    }

    const tiles = new Map(Object.entries(raw));
    const coordOf = (key) => {
      const [x, y] = key.split(",").map(Number);
      return { x, y };
    };

    const visited = new Set();
    const clusters = [];

    for (const key of tiles.keys()) {
      if (visited.has(key)) continue;
      const name = tiles.get(key);
      if (shouldExclude(name)) {
        visited.add(key);
        continue;
      }

      const stack = [key];
      visited.add(key);
      const comp = [];
      while (stack.length) {
        const k = stack.pop();
        comp.push(k);
        const { x, y } = coordOf(k);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nk = `${x + dx},${y + dy}`;
          if (tiles.has(nk) && !visited.has(nk) && tiles.get(nk) === name) {
            visited.add(nk);
            stack.push(nk);
          }
        }
      }
      if (comp.length < MIN_CLUSTER_TILES) continue;

      let sx = 0, sy = 0;
      const rawTiles = comp.map((k) => {
        const { x, y } = coordOf(k);
        sx += x;
        sy += y;
        return [x, y];
      });

      clusters.push({
        name: prettifyName(name),
        rawName: name,
        rawTileX: sx / comp.length,
        rawTileY: sy / comp.length,
        rawTiles,
        size: comp.length,
      });
    }

    areaCache.set(mapBaseName, clusters);
    return clusters;
  }

  // Only thins out which fragments get their own TEXT label — every
  // fragment still gets hover data regardless.
  function dedupeClusters(clusters) {
    const sorted = [...clusters].sort((a, b) => b.size - a.size);
    const kept = [];
    for (const c of sorted) {
      const dupe = kept.some(
        (k) =>
          k.name === c.name &&
          Math.hypot(k.rawTileX - c.rawTileX, k.rawTileY - c.rawTileY) <= DEDUPE_RADIUS_TILES
      );
      if (!dupe) kept.push(c);
    }
    return kept;
  }

  function ensureToggleButton() {
    if (toggleBtn && document.body.contains(toggleBtn)) return toggleBtn;
    const controls = document.querySelector(".floating-controls");
    if (!controls) return null;

    toggleBtn = document.createElement("button");
    toggleBtn.id = "toggle-area-info";
    toggleBtn.title = "Toggle hover-for-info (CAS / Mortar / OB / Medevac)";
    toggleBtn.setAttribute("aria-label", "Toggle Area Info On Hover");
    toggleBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2"
           fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 9v4"></path>
        <path d="M12 17h.01"></path>
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"></path>
      </svg>
    `;
    toggleBtn.classList.toggle("active", hoverInfoEnabled);
    toggleBtn.addEventListener("click", () => {
      hoverInfoEnabled = !hoverInfoEnabled;
      localStorage.setItem("hoverInfoEnabled", hoverInfoEnabled ? "true" : "false");
      toggleBtn.classList.toggle("active", hoverInfoEnabled);
      
      if (!hoverInfoEnabled) {
        hideHoverTooltip();
        lastHoverKey = null;
      }
    });
    toggleBtn.style.display = "none"; // shown once we know the active map has area data
    controls.appendChild(toggleBtn);
    return toggleBtn;
  }

  function ensureHoverTooltip() {
    let tip = document.getElementById("area-tile-tooltip");
    if (tip) return tip;
    tip = document.createElement("div");
    tip.id = "area-tile-tooltip";
    tip.style.cssText = `
      position: fixed;
      z-index: 41;
      display: none;
      padding: 0.5rem 0.65rem;
      background-color: var(--floating-bg);
      backdrop-filter: blur(12px);
      border: 1px solid var(--floating-border);
      box-shadow: var(--floating-shadow);
      border-radius: 0px;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      line-height: 1.5;
      color: var(--btn-text, var(--text-main));
      white-space: pre;
      pointer-events: none;
      user-select: none;
    `;
    document.body.appendChild(tip);
    return tip;
  }

  function hideHoverTooltip() {
    const tip = document.getElementById("area-tile-tooltip");
    if (tip) tip.style.display = "none";
  }

  // ---------------------------------------------------------------------
  // Room-name reveal (click a big label)
  // ---------------------------------------------------------------------

  function collapseLabels() {
    labelEntries.forEach(({ el }) => {
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
    });
    if (expandedBigLabel) expandedBigLabel.classList.remove("expanded");
    expandedBigLabel = null;
  }

  function expandLabelsNear(bigEl, tileX, tileY) {
    labelEntries.forEach(({ el, tileX: tx, tileY: ty }) => {
      const near = Math.hypot(tx - tileX, ty - tileY) <= REVEAL_RADIUS_TILES;
      el.style.opacity = near ? "1" : "0";
      el.style.pointerEvents = near ? "auto" : "none";
    });
    if (expandedBigLabel && expandedBigLabel !== bigEl) {
      expandedBigLabel.classList.remove("expanded");
    }
    bigEl.classList.add("expanded");
    expandedBigLabel = bigEl;
  }

  document.addEventListener("click", (e) => {
    const bigEl = e.target.closest(".big-map-label");
    if (bigEl) {
      e.stopPropagation();
      const tileX = parseFloat(bigEl.dataset.tileX);
      const tileY = parseFloat(bigEl.dataset.tileY);
      if (Number.isNaN(tileX) || Number.isNaN(tileY)) return;
      if (expandedBigLabel === bigEl) collapseLabels();
      else expandLabelsNear(bigEl, tileX, tileY);
      return;
    }
    if (e.target.closest(".area-sub-label")) return; // reading a revealed label shouldn't collapse it
    if (expandedBigLabel) collapseLabels();
  });

  // ---------------------------------------------------------------------
  // Layer + data build
  // ---------------------------------------------------------------------

  function ensureSubLayer() {
    const labelsLayer = document.getElementById("map-labels-layer");
    if (!labelsLayer) return null;
    if (!subLayer || !labelsLayer.contains(subLayer)) {
      subLayer = document.createElement("div");
      subLayer.id = "map-area-labels-layer";
      subLayer.style.cssText =
        "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;";
      labelsLayer.appendChild(subLayer);
    }
    return subLayer;
  }

  async function buildAreaData(mapBaseName) {
    
    hookFiredAtLeastOnce = true;
    const layer = ensureSubLayer();
    ensureToggleButton();
    if (layer) layer.innerHTML = "";
    labelEntries = [];
    tileLookup = new Map();
    expandedBigLabel = null;
    currentMapHasData = false;
    hideHoverTooltip();

    const hasSource = mapBaseName in AREA_DATA_SOURCES;
    

    const [clusters, protections] = await Promise.all([
      loadAreaClusters(mapBaseName),
      loadProtections(mapBaseName),
    ]);
    
    currentMapHasData = !!clusters;
    if (toggleBtn) toggleBtn.style.display = clusters ? "flex" : "none";
    
    if (!clusters) return;

    // Set by app.js (parseEntitiesProtoGrouped) right before this hook
    // fires, so it always reflects the map that's currently loading.
    const origin = window.__mapTileOrigin || { minX: 0, maxY: 0 };
    // Must match app.js's entity tile math (Math.floor AFTER subtracting the
    // origin) or these keys silently drift off-integer whenever origin.minX /
    // origin.maxY land on a fractional world coordinate, breaking every
    // hover lookup at once.
    const toNormalized = (rawX, rawY) => [Math.floor(rawX - origin.minX), Math.floor(origin.maxY - rawY)];

    clusters.forEach((c) => {
      const flags = protections ? protections[c.rawName] : null;
      c.rawTiles.forEach(([rx, ry]) => {
        const [tx, ty] = toNormalized(rx, ry);
        tileLookup.set(`${tx},${ty}`, { name: c.name, flags });
      });
    });

    if (layer) {
      dedupeClusters(clusters).forEach((c) => {
        const [tileX, tileY] = toNormalized(c.rawTileX, c.rawTileY);
        const pixelX = tileX * TILE_SIZE + TILE_SIZE / 2;
        const pixelY = tileY * TILE_SIZE + TILE_SIZE / 2;
        const flags = protections ? protections[c.rawName] : null;

        const el = document.createElement("div");
        el.className = "area-sub-label";
        el.textContent = c.name;
        if (flags) el.title = flagsSummary(flags);
        el.style.cssText = `
          position: absolute;
          left: ${pixelX}px;
          top: ${pixelY}px;
          transform: translate(-50%, -50%);
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
        `;
        layer.appendChild(el);
        labelEntries.push({ el, tileX, tileY });
      });
    }
  }

  // ---------------------------------------------------------------------
  // Hover tooltip — active any time the current map has area data.
  // ---------------------------------------------------------------------

  let lastHoverKey = null;

  function handleHoverMove(event) {
    if (!hoverInfoEnabled || !currentMapHasData) {
      hideHoverTooltip();
      lastHoverKey = null;
      return;
    }

    const img = document.getElementById("map-image");
    if (!img || !img.naturalWidth || !img.complete) {
      
      return;
    }

    const rect = img.getBoundingClientRect();
    if (
      event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom
    ) {
      hideHoverTooltip();
      lastHoverKey = null;
      return;
    }

    const scaleRatio = rect.width / img.naturalWidth;
    const imageX = (event.clientX - rect.left) / scaleRatio;
    const imageY = (event.clientY - rect.top) / scaleRatio;
    const tileX = Math.floor(imageX / TILE_SIZE);
    const tileY = Math.floor(imageY / TILE_SIZE);
    const key = `${tileX},${tileY}`;

    const info = tileLookup.get(key);
    const tip = ensureHoverTooltip();
    
    if (!info) {
      tip.style.display = "none";
      lastHoverKey = null;
      return;
    }

    if (key !== lastHoverKey) {
      tip.textContent = `${info.name}\n${flagsSummary(info.flags)}`;
      lastHoverKey = key;
    }
    tip.style.left = `${event.clientX + 16}px`;
    tip.style.top = `${event.clientY + 16}px`;
    tip.style.display = "block";
    
  }

  window.addEventListener("mousemove", handleHoverMove, true);
  

  // Called by app.js's loadMapData() once a map's .yml has been parsed
  // and window.__mapTileOrigin is known for that map.
  window.onAreaDataMapLoaded = function (mapFolderName) {
    buildAreaData(mapFolderName);
  };
  

  // Watchdog: if app.js never calls the hook above within a few seconds of
  // page load, something upstream (script order, a missing edit in
  // app.js's loadMapData) is preventing it from firing at all.
  setTimeout(() => {
    if (!hookFiredAtLeastOnce) {
      
    }
  }, 5000);
})();
