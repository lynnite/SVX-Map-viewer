document.addEventListener("DOMContentLoaded", () => {
  const elem = document.getElementById("map-image");
  const viewport = document.querySelector(".viewport");
  const initialListItems = document.querySelectorAll("#image-list li");
  const tileHover = document.getElementById("tile-hover");
  const coordsDisplay = document.getElementById("tile-coords");
  const contextMenu = document.getElementById("context-menu");
  const entityList = document.getElementById("entity-list");
  const menuTitle = document.getElementById("menu-tile-title");
  const sidebarFooter = document.querySelector(".sidebar-footer");
  const themeToggleBtn = document.getElementById("theme-toggle");

  // light and dark mode
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "light") {
    document.body.classList.add("light-mode");
  } else {
    document.body.classList.remove("light-mode");
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      document.body.classList.toggle("light-mode");
      const isLight = document.body.classList.contains("light-mode");
      localStorage.setItem("theme", isLight ? "light" : "dark");
    });
  }

  const TILE_SIZE = 32;

  let allParsedEntities = [];
  let visibleEntities = [];
  let insertDataMap = new Map();
  let availableInserts = new Map();
  let isPanning = false;

  const BLACKLISTED_KEYWORDS = [
    "weather",
    "lightning",
    "thunder",
    "storm",
    "rain",
    "fog"
  ];

  function hideHoverTile() {
    tileHover.style.display = "none";
  }

  // --- MAP CONTAINER SETUP ---
  const mapContainer = document.createElement("div");
  mapContainer.id = "map-container";
  mapContainer.style.cssText = `
    position: relative;
    display: inline-block;
  `;

  elem.parentNode.insertBefore(mapContainer, elem);
  mapContainer.appendChild(elem);
  elem.style.display = "block";

  // --- COORD LABEL CLEANUP ---
  if (coordsDisplay) {
    const coordLabel = coordsDisplay.previousElementSibling;
    if (coordLabel && coordLabel.classList.contains("coord-label")) {
      coordLabel.remove();
    }
  }

  // --- SIDEBAR DROPDOWN CATEGORIES SETUP ---
  const imageListContainer = document.getElementById("image-list");

  function setupMapCategories() {
    if (!imageListContainer) return;

    const svxDetails = document.createElement("details");
    svxDetails.className = "sidebar-category";
    const svxSummary = document.createElement("summary");
    svxSummary.innerHTML = `<span class="category-arrow">▶</span><span class="category-title">SvX maps</span>`;
    svxSummary.style.setProperty("--peek-img", 'url("svx.png")');
    svxDetails.appendChild(svxSummary);
    const svxUl = document.createElement("ul");
    svxDetails.appendChild(svxUl);

    const rmcDetails = document.createElement("details");
    rmcDetails.className = "sidebar-category";
    const rmcSummary = document.createElement("summary");
    rmcSummary.innerHTML = `<span class="category-arrow">▶</span><span class="category-title">RMC14 maps</span>`;
    rmcSummary.style.setProperty("--peek-img", 'url("rmc.png")');
    rmcDetails.appendChild(rmcSummary);
    const rmcUl = document.createElement("ul");
    rmcDetails.appendChild(rmcUl);

    const uncategorizedItems = [];

    initialListItems.forEach(li => {
      const category = (li.getAttribute("data-category") || "").toLowerCase();
      if (category === "svx") {
        svxUl.appendChild(li);
      } else if (category === "rmc14" || category === "rmc") {
        rmcUl.appendChild(li);
      } else {
        uncategorizedItems.push(li);
      }
    });

    imageListContainer.innerHTML = "";
    if (svxUl.children.length > 0) imageListContainer.appendChild(svxDetails);
    if (rmcUl.children.length > 0) imageListContainer.appendChild(rmcDetails);
    uncategorizedItems.forEach(li => imageListContainer.appendChild(li));
  }

  setupMapCategories();

  //  map preview
  initialListItems.forEach(li => {
    const src = li.getAttribute("data-src");
    if (!src) return;

    const slashIndex = src.lastIndexOf("/");
    const thumbSrc = slashIndex === -1
      ? `thumbs/${src}`
      : `${src.slice(0, slashIndex)}/thumbs/${src.slice(slashIndex + 1)}`;

    li.style.setProperty("--peek-img", `url("${thumbSrc}")`);

    const label = document.createElement("span");
    label.className = "map-name-text";
    label.textContent = li.textContent;
    li.textContent = "";
    li.appendChild(label);
  });

  // --- SIDEBAR SEARCH & RECOMMENDATIONS INTEGRATION ---
  const sidebarControlsGroup = document.createElement("div");
  sidebarControlsGroup.id = "sidebar-controls-group";
  sidebarControlsGroup.style.cssText = `
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    margin-bottom: 0.75rem;
  `;

  const searchWrapper = document.createElement("div");
  searchWrapper.style.cssText = `
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    align-items: center;
  `;

  const searchBox = document.createElement("div");
  searchBox.id = "search-menu-box";
  searchBox.style.cssText = `
    display: flex;
    width: 100%;
    box-sizing: border-box;
    align-items: center;
  `;

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search name, entity ID, or UID...";

  const searchNav = document.createElement("div");
  searchNav.id = "search-nav-controls";
  searchNav.style.cssText = `
    display: none;
    align-items: center;
    gap: 4px;
    margin-left: 6px;
    flex-shrink: 0;
  `;

  const prevMatchBtn = document.createElement("button");
  prevMatchBtn.innerHTML = "&lt;";
  prevMatchBtn.title = "Previous match (Left arrow)";

  const searchCountDisplay = document.createElement("span");

  const nextMatchBtn = document.createElement("button");
  nextMatchBtn.innerHTML = "&gt;";
  nextMatchBtn.title = "Next match (Right arrow / Enter)";

  searchNav.appendChild(prevMatchBtn);
  searchNav.appendChild(searchCountDisplay);
  searchNav.appendChild(nextMatchBtn);

  searchBox.appendChild(searchInput);
  searchBox.appendChild(searchNav);
  searchWrapper.appendChild(searchBox);

  const recommendationsBox = document.createElement("div");
  recommendationsBox.id = "search-recommendations";
  searchWrapper.appendChild(recommendationsBox);

  sidebarControlsGroup.appendChild(searchWrapper);

  if (sidebarFooter && coordsDisplay) {
    sidebarFooter.insertBefore(sidebarControlsGroup, coordsDisplay);
  }

  // --- SEARCH HIGHLIGHT MARKER ---
  let searchHighlight = document.getElementById("search-highlight");
  if (!searchHighlight) {
    searchHighlight = document.createElement("div");
    searchHighlight.id = "search-highlight";
    mapContainer.appendChild(searchHighlight);
  }

  searchHighlight.style.cssText = `
    position: absolute;
    display: none;
    width: ${TILE_SIZE}px;
    height: ${TILE_SIZE}px;
    border: 1px solid #ffffff;
    background-color: rgba(255, 255, 255, 0.2);
    pointer-events: none;
    z-index: 5;
    transition: left 0.2s ease, top 0.2s ease;
  `;

  // --- INSERT MENU CONTAINER ---
  const insertContainer = document.createElement("div");
  insertContainer.id = "insert-menu-container";
  insertContainer.className = "insert-controls";
  viewport.appendChild(insertContainer);

  // --- PANZOOM SETUP ---
  const panzoom = Panzoom(mapContainer, {
    maxScale: 50,
    minScale: 0.05,
    canvas: true,
    step: 0.15
  });

  mapContainer.addEventListener("panzoomstart", () => {
    isPanning = true;
    hideHoverTile();
  });

  mapContainer.addEventListener("panzoomchange", () => {
    if (isPanning) hideHoverTile();
  });

  mapContainer.addEventListener("panzoomend", () => {
    isPanning = false;
  });

  window.addEventListener("pointerdown", (e) => {
    if (e.button === 0) hideHoverTile();
  }, true);

  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    if (event.deltaY < 0) panzoom.zoomIn({ animate: false });
    else panzoom.zoomOut({ animate: false });
  }, { passive: false });

  function resetToFit(animate = false) {
    const mapWidth = elem.naturalWidth || elem.clientWidth;
    const mapHeight = elem.naturalHeight || elem.clientHeight;
    const vpWidth = viewport.clientWidth;
    const vpHeight = viewport.clientHeight;

    if (!mapWidth || !mapHeight || !vpWidth || !vpHeight) {
      panzoom.reset({ animate });
      return;
    }

    const scaleX = (vpWidth * 0.95) / mapWidth;
    const scaleY = (vpHeight * 0.95) / mapHeight;
    const fitScale = Math.min(scaleX, scaleY, 1.0);

    panzoom.zoom(fitScale, { animate });
    panzoom.pan(0, 0, { animate });
  }

  elem.addEventListener("load", () => {
    resetToFit(false);
  });

  document.getElementById("zoom-in").addEventListener("click", () => panzoom.zoomIn());
  document.getElementById("zoom-out").addEventListener("click", () => panzoom.zoomOut());
  document.getElementById("reset-view").addEventListener("click", () => resetToFit(true));

  // --- SEARCH EXECUTION & RECOMMENDATIONS LOGIC ---
  let currentSearchResults = [];
  let currentSearchIndex = 0;

  function updateSearchNavUI() {
    if (currentSearchResults.length > 1) {
      searchNav.style.display = "flex";
      searchCountDisplay.textContent = `${currentSearchIndex + 1}/${currentSearchResults.length}`;
    } else {
      searchNav.style.display = "none";
    }
  }

  function goToMatch(index) {
    if (currentSearchResults.length === 0) return;
    currentSearchIndex = (index + currentSearchResults.length) % currentSearchResults.length;
    updateSearchNavUI();
    const match = currentSearchResults[currentSearchIndex];
    if (match) {
      bringToEntity(match);
    }
  }

  prevMatchBtn.addEventListener("click", () => {
    goToMatch(currentSearchIndex - 1);
  });

  nextMatchBtn.addEventListener("click", () => {
    goToMatch(currentSearchIndex + 1);
  });

  function applyHighlight(match) {
    if (match && match.tileX !== null && match.tileY !== null) {
      const pxX = match.tileX * TILE_SIZE;
      const pxY = match.tileY * TILE_SIZE;

      searchHighlight.style.left = `${pxX}px`;
      searchHighlight.style.top = `${pxY}px`;
      searchHighlight.style.display = "block";
    } else {
      searchHighlight.style.display = "none";
    }
  }

  function bringToEntity(match) {
    if (!match || match.tileX === null || match.tileY === null) {
      searchHighlight.style.display = "none";
      return;
    }

    applyHighlight(match);

    const mapWidth = elem.naturalWidth || mapContainer.clientWidth;
    const mapHeight = elem.naturalHeight || mapContainer.clientHeight;

    if (!mapWidth || !mapHeight) return;

    const tileCenterX = match.tileX * TILE_SIZE + TILE_SIZE / 2;
    const tileCenterY = match.tileY * TILE_SIZE + TILE_SIZE / 2;

    const currentScale = panzoom.getScale();
    const targetScale = Math.max(currentScale, 2.0);

    const targetX = mapWidth / 2 - tileCenterX;
    const targetY = mapHeight / 2 - tileCenterY;

    panzoom.zoom(targetScale, { animate: true });
    panzoom.pan(targetX, targetY, { animate: true });
  }

  function entityMatchesQuery(e, query) {
    if (!e.proto) return false;
    const tokens = query.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return false;
    const haystack = (e.proto + " " + getEntityDisplayName(e.proto)).toLowerCase();
    return tokens.every(t => haystack.includes(t));
  }

  function executeSearch(queryOverride) {
    const query = (queryOverride !== undefined ? queryOverride : searchInput.value).trim().toLowerCase();
    recommendationsBox.style.display = "none";
    if (!query) {
      currentSearchResults = [];
      currentSearchIndex = 0;
      updateSearchNavUI();
      searchHighlight.style.display = "none";
      return;
    }

    const uidMatches = visibleEntities.filter(e => e.uid && String(e.uid) === query);

    let resultsPool;
    if (uidMatches.length > 0) {
      resultsPool = uidMatches;
    } else {
      const broadMatches = visibleEntities.filter(e => entityMatchesQuery(e, query));

      const bestProto = pickBestMatchingProto(broadMatches, query);
      resultsPool = bestProto
        ? broadMatches.filter(e => e.proto === bestProto)
        : broadMatches;
    }

    currentSearchResults = resultsPool;

    if (currentSearchResults.length > 0) {
      currentSearchIndex = 0;
      goToMatch(0);
      const resolvedProto = currentSearchResults[0].proto;
      if (resolvedProto) {
        searchInput.value = getEntityDisplayName(resolvedProto);
      }
    } else {
      currentSearchResults = [];
      currentSearchIndex = 0;
      updateSearchNavUI();
      alert(`No entity matching "${query}" found on this map.`);
      searchHighlight.style.display = "none";
    }
  }

  function pickBestMatchingProto(matches, query) {
    if (matches.length === 0) return null;

    const seen = new Map();
    for (const e of matches) {
      if (e.proto && !seen.has(e.proto)) {
        seen.set(e.proto, getEntityDisplayName(e.proto).toLowerCase());
      }
    }
    if (seen.size <= 1) return matches[0].proto || null;

    const tokens = query.split(/\s+/).filter(Boolean);

    let best = null;
    let bestScore = Infinity;
    for (const [proto, name] of seen) {
      const protoLower = proto.toLowerCase();
      const nameWords = name.split(/\W+/).filter(Boolean);
      let score;
      if (name === query) score = 0;
      else if (protoLower === query) score = 1;
      else if (name.startsWith(query)) score = 2;
      else if (protoLower.startsWith(query)) score = 3;
      else if (tokens.every(t => nameWords.includes(t))) score = 4;
      else if (name.includes(query)) score = 5;
      else if (protoLower.includes(query)) score = 6;
      else score = 7;

      if (score < bestScore || (score === bestScore && name.length < seen.get(best).length)) {
        bestScore = score;
        best = proto;
      }
    }
    return best;
  }

  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();
    recommendationsBox.innerHTML = "";

    if (!query || visibleEntities.length === 0) {
      recommendationsBox.style.display = "none";
      return;
    }

    const rawMatches = visibleEntities.filter(e =>
      entityMatchesQuery(e, query) || (e.uid && String(e.uid) === query)
    );

    const grouped = new Map();
    for (const e of rawMatches) {
      if (!e.proto) continue;
      if (!grouped.has(e.proto)) grouped.set(e.proto, { entity: e, count: 0 });
      grouped.get(e.proto).count++;
    }
    const matches = Array.from(grouped.values()).slice(0, 10);

    if (matches.length > 0) {
      recommendationsBox.style.display = "block";
      matches.forEach(({ entity: match, count }) => {
        const item = document.createElement("div");
        item.className = "recommendation-item";
        const displayName = getEntityDisplayName(match.proto);
        const countLabel = count > 1 ? ` (${count} on map)` : "";
        item.textContent = displayName !== match.proto
          ? `${displayName} — ${match.proto}${countLabel}`
          : `${match.proto}${countLabel}`;

        item.addEventListener("click", () => {
          searchInput.value = displayName;
          recommendationsBox.style.display = "none";

          currentSearchResults = visibleEntities.filter(e => e.proto === match.proto);

          const foundIndex = currentSearchResults.findIndex(e => e === match || (e.uid && e.uid === match.uid));
          goToMatch(foundIndex !== -1 ? foundIndex : 0);
        });

        recommendationsBox.appendChild(item);
      });
    } else {
      recommendationsBox.style.display = "none";
    }
  });

  document.addEventListener("click", (e) => {
    if (!searchWrapper.contains(e.target)) {
      recommendationsBox.style.display = "none";
    }
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      recommendationsBox.style.display = "none";
      if (currentSearchResults.length > 1) {
        goToMatch(currentSearchIndex + 1);
      } else {
        executeSearch();
      }
    } else if (e.key === "ArrowRight") {
      if (currentSearchResults.length > 1) {
        e.preventDefault();
        goToMatch(currentSearchIndex + 1);
      }
    } else if (e.key === "ArrowLeft") {
      if (currentSearchResults.length > 1) {
        e.preventDefault();
        goToMatch(currentSearchIndex - 1);
      }
    }
  });

  // --- HELPER FUNCTIONS ---
  function getMapFolderName(mapUrl) {
    if (!mapUrl) return "default";
    const filename = mapUrl.split('/').pop().split('\\').pop();
    return filename.substring(0, filename.lastIndexOf('.')) || filename;
  }

  function formatChance(rawChance) {
    if (rawChance === undefined || rawChance === null) return null;
    const num = parseFloat(rawChance);
    if (isNaN(num)) return String(rawChance);
    if (num <= 1 && num > 0) return `${Math.round(num * 100)}%`;
    return `${num}%`;
  }

  // Generic offset parser to extract [x, y] coordinates from any format
  function parseOffset(rawOffset) {
    if (!rawOffset) return null;

    if (Array.isArray(rawOffset) && rawOffset.length >= 2) {
      const x = parseFloat(rawOffset[0]);
      const y = parseFloat(rawOffset[1]);
      if (!isNaN(x) && !isNaN(y)) return [x, y];
    }

    if (typeof rawOffset === "object") {
      const x = parseFloat(rawOffset.x ?? rawOffset[0]);
      const y = parseFloat(rawOffset.y ?? rawOffset[1]);
      if (!isNaN(x) && !isNaN(y)) return [x, y];
    }

    if (typeof rawOffset === "string") {
      const matches = rawOffset.match(/-?\d+(?:\.\d+)?/g);
      if (matches && matches.length >= 2) {
        const x = parseFloat(matches[0]);
        const y = parseFloat(matches[1]);
        if (!isNaN(x) && !isNaN(y)) return [x, y];
      }
    }

    return null;
  }

  async function loadInsertMetadata(mapFolderName) {
    insertDataMap.clear();
    const yamlUrl = `inserts/${mapFolderName}/inserts.yml`;

    try {
      const response = await fetch(yamlUrl);
      if (!response.ok) return;

      const rawText = await response.text();
      const parsedYaml = jsyaml.load(rawText);
      if (!parsedYaml) return;

      const items = Array.isArray(parsedYaml) ? parsedYaml : (parsedYaml.inserts || [parsedYaml]);

      items.forEach(item => {
        if (!item) return;
        const insertId = item.id || item.type || item.proto;
        if (!insertId) return;

        let parentDirection = item.direction || item.dir || item.orientation || null;
        let parentOffset = parseOffset(item.offset);

        // If a valid offset exists, discard direction logic
        if (parentOffset) {
          parentDirection = null;
        }

        const parentChance = formatChance(item.chance ?? item.probability ?? item.spawnChance ?? item.weight);

        const rawVariations = item.variations;
        const variationList = [];

        if (Array.isArray(rawVariations)) {
          let currentVarObj = null;

          rawVariations.forEach(v => {
            if (typeof v === 'object' && v !== null) {
              if (v.id || v.proto) {
                if (currentVarObj) variationList.push(currentVarObj);

                let varOffset = parseOffset(v.offset) || parentOffset;
                let varDir = v.direction || parentDirection;

                if (varOffset) {
                  varDir = null;
                }

                currentVarObj = {
                  id: v.id || v.proto,
                  chance: formatChance(v.chance ?? v.probability ?? v.weight),
                  direction: varDir,
                  offset: varOffset
                };
              } else if (v.chance !== undefined && currentVarObj) {
                currentVarObj.chance = formatChance(v.chance);
              }
            }
          });
          if (currentVarObj) variationList.push(currentVarObj);
        }

        const normalizedParentKey = String(insertId).trim().toLowerCase();

        insertDataMap.set(normalizedParentKey, {
          id: insertId,
          direction: parentDirection,
          offset: parentOffset,
          chance: parentChance,
          variations: variationList
        });

        variationList.forEach(v => {
          const varKey = String(v.id).trim().toLowerCase();
          insertDataMap.set(varKey, {
            id: v.id,
            direction: v.direction || parentDirection,
            offset: v.offset || parentOffset,
            chance: v.chance,
            parentProto: insertId,
            isVariation: true
          });
        });
      });
    } catch (err) {
      console.warn(`[Inserts] Failed reading YAML from ${yamlUrl}:`, err);
    }
  }

  function clearOverlayImages() {
    availableInserts.forEach(insertData => {
      if (insertData.imgElem && insertData.imgElem.parentNode) {
        insertData.imgElem.parentNode.removeChild(insertData.imgElem);
      }
    });
    availableInserts.clear();
  }

  function loadImageDimensions(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ width: TILE_SIZE, height: TILE_SIZE });
      img.src = src;
    });
  }

  function parseYMLToEntities(rawText) {
    const rawEntities = [];
    const uidMap = new Map();
    const protoBlocks = rawText.split(/(?=\n\s*-\s*proto:|\n\s*proto:)/g);

    protoBlocks.forEach(protoBlock => {
      const protoMatch = protoBlock.match(/proto:\s*["']?([^\s"'#\n]+)/i);
      if (!protoMatch) return;

      const currentProto = protoMatch[1];
      const entitySubBlocks = protoBlock.split(/(?=\n\s*-\s*uid:)/g);

      entitySubBlocks.forEach(entityBlock => {
        const uidMatch = entityBlock.match(/uid:\s*([0-9]+)/i);
        if (!uidMatch) return;

        const uid = uidMatch[1];
        const parentMatch = entityBlock.match(/parent:\s*([0-9]+)/i);
        const parentUid = parentMatch ? parentMatch[1] : null;

        let localPos = null;
        const posMatch = entityBlock.match(/pos:\s*["']?(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i) ||
          entityBlock.match(/position:\s*["']?(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i);

        if (posMatch) {
          localPos = { x: parseFloat(posMatch[1]), y: parseFloat(posMatch[2]) };
        }

        const containedUIDs = [];

        const entsBlockMatch = entityBlock.match(/ents:\s*([\s\S]*?)(?=\n\s*[\w_]+:|$)/i);
        if (entsBlockMatch) {
          const itemUidMatches = entsBlockMatch[1].matchAll(/-\s*([0-9]+)/g);
          for (const match of itemUidMatches) {
            containedUIDs.push(match[1]);
          }
        }

        const singleEntMatch = entityBlock.match(/ent:\s*([0-9]+)/i);
        if (singleEntMatch) {
          containedUIDs.push(singleEntMatch[1]);
        }

        if (uid) {
          uidMap.set(String(uid), {
            uid: String(uid),
            proto: currentProto,
            parentUid: parentUid ? String(parentUid) : null,
            localPos: localPos,
            containedUIDs: containedUIDs
          });
        }
      });
    });

    uidMap.forEach(node => {
      const isBlacklisted = BLACKLISTED_KEYWORDS.some(keyword =>
        node.proto.toLowerCase().includes(keyword.toLowerCase())
      );
      if (isBlacklisted) return;

      let worldX = node.localPos ? node.localPos.x : null;
      let worldY = node.localPos ? node.localPos.y : null;
      let currentParent = node.parentUid;
      let depth = 0;

      while (currentParent && uidMap.has(currentParent) && depth < 10) {
        const parentNode = uidMap.get(currentParent);
        if (parentNode) {
          if (parentNode.localPos) {
            worldX = (worldX || 0) + parentNode.localPos.x;
            worldY = (worldY || 0) + parentNode.localPos.y;
          }
          currentParent = parentNode.parentUid;
        } else break;
        depth++;
      }

      const crateContents = [];
      if (node.containedUIDs && node.containedUIDs.length > 0) {
        node.containedUIDs.forEach(childUid => {
          const childNode = uidMap.get(childUid);
          if (childNode) {
            crateContents.push({
              proto: childNode.proto,
              uid: childNode.uid
            });
          }
        });
      }

      rawEntities.push({
        proto: node.proto,
        uid: node.uid,
        rawX: worldX,
        rawY: worldY,
        contents: crateContents
      });
    });

    return rawEntities;
  }

  function registerInsertPlaceholder(protoName, tileX, tileY, customData, mapFolderName) {
    return {
      protoName: protoName,
      enabled: false,
      isLoaded: false,
      webpUrl: `inserts/${mapFolderName}/${protoName}.webp`,
      ymlUrl: `inserts/${mapFolderName}/${protoName}.yml`,
      imgElem: null,
      tileX: tileX,
      tileY: tileY,
      chance: customData.chance,
      dir: customData.direction,
      offset: customData.offset || null,
      parentProto: customData.parentProto || null,
      variations: customData.variations || [],
      entities: []
    };
  }

  async function loadInsertAssets(insertObj) {
    if (insertObj.isLoaded) return;

    const dims = await loadImageDimensions(insertObj.webpUrl);
    const tilesTall = Math.round(dims.height / TILE_SIZE);
    const tilesWide = Math.round(dims.width / TILE_SIZE);

    let targetTileX = insertObj.tileX;
    let targetTileY = insertObj.tileY;

    // Apply any explicit [x, y] offset values directly, ignoring direction calculations
    if (insertObj.offset && Array.isArray(insertObj.offset)) {
      targetTileX += insertObj.offset[0];
      targetTileY += insertObj.offset[1];
    } else if (insertObj.dir) {
      const dir = String(insertObj.dir).trim().toLowerCase();
      if (dir === "north" || dir === "0") {
        targetTileY = insertObj.tileY - (tilesTall - 1);
      } else if (dir === "west" || dir === "270") {
        targetTileX = insertObj.tileX - (tilesWide - 1);
      }
    }

    const overlayImg = document.createElement("img");
    overlayImg.src = insertObj.webpUrl;
    overlayImg.alt = insertObj.protoName;
    overlayImg.style.cssText = `
      position: absolute;
      pointer-events: none;
      z-index: 2;
      display: none;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    `;

    overlayImg.style.left = `${targetTileX * TILE_SIZE}px`;
    overlayImg.style.top = `${targetTileY * TILE_SIZE}px`;

    mapContainer.appendChild(overlayImg);
    insertObj.imgElem = overlayImg;

    let insertEntities = [];
    try {
      const insertResponse = await fetch(insertObj.ymlUrl);
      if (insertResponse.ok) {
        const insertText = await insertResponse.text();
        const rawInsertEntities = parseYMLToEntities(insertText);

        if (rawInsertEntities.length > 0) {
          let insertMinX = Infinity;
          let insertMaxY = -Infinity;
          rawInsertEntities.forEach(ie => {
            if (ie.rawX !== null && ie.rawX < insertMinX) insertMinX = ie.rawX;
            if (ie.rawY !== null && ie.rawY > insertMaxY) insertMaxY = ie.rawY;
          });

          insertEntities = rawInsertEntities.map(ie => ({
            proto: ie.proto,
            uid: ie.uid,
            contents: ie.contents,
            isInsertContent: true,
            insertProto: insertObj.protoName,
            tileX: ie.rawX !== null ? targetTileX + Math.floor(ie.rawX - insertMinX) : null,
            tileY: ie.rawY !== null ? targetTileY + Math.floor(insertMaxY - ie.rawY) : null
          }));
        }
      }
    } catch (e) {
      console.warn(`Could not load insert YML file at ${insertObj.ymlUrl}`, e);
    }

    insertObj.entities = insertEntities;
    insertObj.isLoaded = true;
  }

  async function parseEntitiesProtoGrouped(rawText, mapFolderName) {
    const rawEntities = parseYMLToEntities(rawText);
    if (rawEntities.length === 0) return [];

    let minX = Infinity;
    let maxY = -Infinity;

    rawEntities.forEach(item => {
      if (item.rawX !== null && item.rawX < minX) minX = item.rawX;
      if (item.rawY !== null && item.rawY > maxY) maxY = item.rawY;
    });

    const parsed = rawEntities.map(item => ({
      proto: item.proto,
      uid: item.uid,
      contents: item.contents,
      isInsert: item.proto.toLowerCase().includes("insert") || insertDataMap.has(item.proto.toLowerCase()),
      rawX: item.rawX,
      rawY: item.rawY,
      tileX: item.rawX !== null ? Math.floor(item.rawX - minX) : null,
      tileY: item.rawY !== null ? Math.floor(maxY - item.rawY) : null
    }));

    for (const entity of parsed) {
      if (entity.isInsert && entity.tileX !== null && !availableInserts.has(entity.proto)) {
        const normalizedProto = entity.proto.toLowerCase();
        const customData = insertDataMap.get(normalizedProto) || { direction: null, offset: null, chance: null, variations: [] };

        const parentData = registerInsertPlaceholder(entity.proto, entity.tileX, entity.tileY, customData, mapFolderName);
        availableInserts.set(entity.proto, parentData);

        if (customData.variations && customData.variations.length > 0) {
          for (const varItem of customData.variations) {
            if (!availableInserts.has(varItem.id)) {
              const varCustomData = {
                direction: varItem.direction || customData.direction,
                offset: varItem.offset || customData.offset,
                chance: varItem.chance,
                parentProto: entity.proto
              };
              const varData = registerInsertPlaceholder(varItem.id, entity.tileX, entity.tileY, varCustomData, mapFolderName);
              availableInserts.set(varItem.id, varData);
            }
          }
        }
      }
    }

    return parsed;
  }

  function filterActiveEntities() {
    visibleEntities = allParsedEntities.filter(entity => {
      if (!entity.isInsert) return true;
      const insertData = availableInserts.get(entity.proto);
      return insertData ? insertData.enabled : false;
    });
  }

  function renderInsertControls() {
    insertContainer.innerHTML = "";

    if (availableInserts.size === 0) {
      insertContainer.style.display = "none";
      return;
    }

    insertContainer.style.display = "block";

    const title = document.createElement("div");
    title.className = "insert-title";
    title.textContent = `Map Inserts`;
    insertContainer.appendChild(title);

    const topLevelInserts = [];
    const variationMap = new Map();

    availableInserts.forEach((data, protoName) => {
      if (data.parentProto) {
        if (!variationMap.has(data.parentProto)) {
          variationMap.set(data.parentProto, []);
        }
        variationMap.get(data.parentProto).push({ name: protoName, data });
      } else {
        topLevelInserts.push({ name: protoName, data });
      }
    });

    topLevelInserts.forEach(({ name: parentName, data: parentData }) => {
      const childVars = variationMap.get(parentName) || [];

      if (childVars.length > 0) {
        const details = document.createElement("details");
        details.className = "insert-dropdown";

        const summary = document.createElement("summary");

        const arrow = document.createElement("span");
        arrow.className = "dropdown-arrow";
        arrow.textContent = "▶";

        const cleanParentName = parentName.replace(/^RMCMapInsert/i, "");
        const chanceSuffix = parentData.chance ? ` (${parentData.chance})` : "";

        const parentLabelText = document.createElement("span");
        parentLabelText.textContent = `${cleanParentName}${chanceSuffix}`;
        parentLabelText.style.fontSize = "0.85rem";

        summary.appendChild(arrow);
        summary.appendChild(parentLabelText);
        details.appendChild(summary);

        const subMenuContainer = document.createElement("div");
        subMenuContainer.className = "insert-submenu";

        childVars.forEach(({ name: childName, data: childData }) => {
          const row = document.createElement("div");
          row.className = "insert-row child-row";

          const label = document.createElement("label");
          label.className = "insert-label";

          const isNoDisplay = childName.toLowerCase().includes("nodisplay");

          if (!isNoDisplay) {
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = childData.enabled;

            checkbox.addEventListener("change", async (e) => {
              const isChecked = e.target.checked;
              childData.enabled = isChecked;

              if (isChecked) {
                await loadInsertAssets(childData);
                if (childData.imgElem) childData.imgElem.style.display = "block";
              } else {
                if (childData.imgElem) childData.imgElem.style.display = "none";
              }

              filterActiveEntities();
            });

            label.appendChild(checkbox);
          }

          const cleanChildName = childName.replace(/^RMCMapInsert/i, "");
          const varChanceSuffix = childData.chance ? ` (${childData.chance})` : "";

          const textSpan = document.createElement("span");
          textSpan.textContent = `${cleanChildName}${varChanceSuffix}`;
          textSpan.style.fontSize = "0.8rem";

          label.appendChild(textSpan);
          row.appendChild(label);
          subMenuContainer.appendChild(row);
        });

        details.appendChild(subMenuContainer);
        insertContainer.appendChild(details);
      } else {
        const row = document.createElement("div");
        row.className = "insert-row";

        const label = document.createElement("label");
        label.className = "insert-label";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = parentData.enabled;

        const cleanName = parentName.replace(/^RMCMapInsert/i, "");
        const chanceSuffix = parentData.chance ? ` (${parentData.chance})` : "";

        checkbox.addEventListener("change", async (e) => {
          const isChecked = e.target.checked;
          parentData.enabled = isChecked;

          if (isChecked) {
            await loadInsertAssets(parentData);
            if (parentData.imgElem) parentData.imgElem.style.display = "block";
          } else {
            if (parentData.imgElem) parentData.imgElem.style.display = "none";
          }

          filterActiveEntities();
        });

        label.appendChild(checkbox);

        const textSpan = document.createElement("span");
        textSpan.textContent = `${cleanName}${chanceSuffix}`;
        textSpan.style.fontSize = "0.85rem";

        label.appendChild(textSpan);
        row.appendChild(label);
        insertContainer.appendChild(row);
      }
    });
  }

  async function loadMapData(mapUrl) {
    resetToFit(false);
    allParsedEntities = [];
    visibleEntities = [];

    clearOverlayImages();
    insertDataMap.clear();
    searchInput.value = "";
    currentSearchResults = [];
    currentSearchIndex = 0;
    updateSearchNavUI();
    recommendationsBox.style.display = "none";
    searchHighlight.style.display = "none";

    insertContainer.style.display = "none";

    if (!mapUrl) return;

    try {
      const response = await fetch(mapUrl);
      if (!response.ok) return;

      const rawText = await response.text();
      const mapFolderName = getMapFolderName(mapUrl);

      await loadInsertMetadata(mapFolderName);
      allParsedEntities = await parseEntitiesProtoGrouped(rawText, mapFolderName);

      renderInsertControls();
      filterActiveEntities();
    } catch (err) {
      console.warn("Map file failed to load or parse:", err);
    }
  }

  loadMapData(document.querySelector("#image-list li.active")?.getAttribute("data-map"));

  let currentTileX = null;
  let currentTileY = null;

  if (coordsDisplay) {
    coordsDisplay.textContent = "X: --, Y: --";
  }

  function updateTileHover(event) {
    if (!coordsDisplay) return;

    if (isPanning || (event.buttons & 1) === 1 || !elem.naturalWidth || !elem.naturalHeight || !elem.complete) {
      hideHoverTile();
      coordsDisplay.textContent = "X: --, Y: --";
      return;
    }

    const rect = elem.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();

    if (
      event.clientX < viewportRect.left ||
      event.clientX > viewportRect.right ||
      event.clientY < viewportRect.top ||
      event.clientY > viewportRect.bottom
    ) {
      hideHoverTile();
      coordsDisplay.textContent = "X: --, Y: --";
      currentTileX = null;
      currentTileY = null;
      return;
    }

    const mouseXOnImage = event.clientX - rect.left;
    const mouseYOnImage = event.clientY - rect.top;
    const scaleRatio = rect.width / elem.naturalWidth;

    const imageX = mouseXOnImage / scaleRatio;
    const imageY = mouseYOnImage / scaleRatio;

    if (
      imageX >= 0 && imageX < elem.naturalWidth &&
      imageY >= 0 && imageY < elem.naturalHeight
    ) {
      currentTileX = Math.floor(imageX / TILE_SIZE);
      currentTileY = Math.floor(imageY / TILE_SIZE);

      const tileX = currentTileX * TILE_SIZE;
      const tileY = currentTileY * TILE_SIZE;

      tileHover.style.left = `${rect.left - viewportRect.left + tileX * scaleRatio}px`;
      tileHover.style.top = `${rect.top - viewportRect.top + tileY * scaleRatio}px`;
      tileHover.style.width = `${TILE_SIZE * scaleRatio}px`;
      tileHover.style.height = `${TILE_SIZE * scaleRatio}px`;
      tileHover.style.display = "block";

      coordsDisplay.textContent = `X: ${currentTileX}, Y: ${currentTileY}`;
    } else {
      hideHoverTile();
      coordsDisplay.textContent = "X: --, Y: --";
      currentTileX = null;
      currentTileY = null;
    }
  }

  window.addEventListener("mousemove", updateTileHover, true);

  function renderEntityMenuItem(item, isInsert) {
    const li = document.createElement("li");
    const itemName = getEntityDisplayName(item.proto);
    li.textContent = itemName !== item.proto
      ? `${itemName} (${item.proto}) [${item.uid}]`
      : `${item.proto} [${item.uid}]`;
    if (isInsert) li.style.color = "#4db8ff";
    entityList.appendChild(li);

    if (item.contents && item.contents.length > 0) {
      item.contents.forEach(child => {
        const childLi = document.createElement("li");
        const childName = getEntityDisplayName(child.proto);
        childLi.textContent = childName !== child.proto
          ? `↳ In: ${childName} (${child.proto}) [${child.uid}]`
          : `↳ In: ${child.proto} [${child.uid}]`;
        childLi.style.paddingLeft = "16px";
        childLi.style.opacity = "0.85";
        childLi.style.fontSize = "0.85em";
        if (isInsert) childLi.style.color = "#80d4ff";
        entityList.appendChild(childLi);
      });
    }
  }

  viewport.addEventListener("contextmenu", (event) => {
    event.preventDefault();

    if (currentTileX === null || currentTileY === null) {
      contextMenu.style.display = "none";
      return;
    }

    let activeInsertEntitiesOnTile = [];
    availableInserts.forEach(insertData => {
      if (insertData.enabled && insertData.entities) {
        const matches = insertData.entities.filter(
          e => e.tileX === currentTileX && e.tileY === currentTileY
        );
        activeInsertEntitiesOnTile.push(...matches);
      }
    });

    menuTitle.textContent = `Tile (${currentTileX}, ${currentTileY})`;
    entityList.innerHTML = "";

    if (activeInsertEntitiesOnTile.length > 0) {
      activeInsertEntitiesOnTile.forEach(item => renderEntityMenuItem(item, true));
    } else {
      const baseMatches = visibleEntities.filter(
        e => e.tileX === currentTileX && e.tileY === currentTileY && !e.isInsert
      );

      if (baseMatches.length > 0) {
        baseMatches.forEach(item => renderEntityMenuItem(item, false));
      } else {
        const li = document.createElement("li");
        li.textContent = "No entity prototypes";
        li.className = "no-entities";
        entityList.appendChild(li);
      }
    }

    const viewportRect = viewport.getBoundingClientRect();
    contextMenu.style.left = `${event.clientX - viewportRect.left}px`;
    contextMenu.style.top = `${event.clientY - viewportRect.top}px`;
    contextMenu.style.display = "block";
  });

  window.addEventListener("click", () => {
    contextMenu.style.display = "none";
  });

  // Event Listener for Map list items
  if (imageListContainer) {
    imageListContainer.addEventListener("click", (event) => {
      const item = event.target.closest("li");
      if (!item) return;

      document.querySelectorAll("#image-list li").forEach(li => li.classList.remove("active"));
      item.classList.add("active");

      const mapUrl = item.getAttribute("data-map");
      const imgUrl = item.getAttribute("data-src");

      if (imgUrl) {
        elem.src = imgUrl;
      }

      loadMapData(mapUrl);
    });
  }
});