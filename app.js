document.addEventListener("DOMContentLoaded", () => {
  const elem = document.getElementById("map-image");
  const viewport = document.querySelector(".viewport");
  const listItems = document.querySelectorAll("#image-list li");
  const tileHover = document.getElementById("tile-hover");
  const coordsDisplay = document.getElementById("tile-coords");
  const contextMenu = document.getElementById("context-menu");
  const entityList = document.getElementById("entity-list");
  const menuTitle = document.getElementById("menu-tile-title");

  const TILE_SIZE = 32;
  let parsedEntities = [];

  const BLACKLISTED_KEYWORDS = [
    "weather",
    "lightning",
    "thunder",
    "storm",
    "rain",
    "fog"
  ];

  const ignoreUnknownTags = ['scalar', 'sequence', 'mapping'].map(kind => 
    new jsyaml.Type('!', {
      kind: kind,
      multi: true,
      construct: data => data
    })
  );
  const SS14_SCHEMA = jsyaml.DEFAULT_SCHEMA.extend(ignoreUnknownTags);

  const panzoom = Panzoom(elem, {
    maxScale: 50,
    minScale: 0.05,
    canvas: true
  });

  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    if (event.deltaY < 0) panzoom.zoomIn({ animate: false });
    else panzoom.zoomOut({ animate: false });
  }, { passive: false });

  document.getElementById("zoom-in").addEventListener("click", () => panzoom.zoomIn());
  document.getElementById("zoom-out").addEventListener("click", () => panzoom.zoomOut());
  document.getElementById("reset-view").addEventListener("click", () => panzoom.reset());

  function extractTransformPos(components) {
    if (!Array.isArray(components)) return null;

    for (const comp of components) {
      if (!comp) continue;
      const compType = comp.type || comp.Type;
      if (compType === "Transform" || compType === "transform") {
        const pos = comp.pos || comp.position || comp.Pos || comp.Position;
        if (!pos) return null;

        if (typeof pos === "string") {
          const parts = pos.split(",");
          if (parts.length >= 2) {
            return { x: parseFloat(parts[0]), y: parseFloat(parts[1]) };
          }
        } else if (typeof pos === "object") {
          const x = pos.x ?? pos.X;
          const y = pos.y ?? pos.Y;
          if (x !== undefined && y !== undefined) {
            return { x: parseFloat(x), y: parseFloat(y) };
          }
        }
      }
    }
    return null;
  }

  function processEntityNode(ent) {
    if (!ent || typeof ent !== "object") return;

    const protoName = ent.protoId || ent.proto || ent.type || ent.id;
    
    if (protoName && typeof protoName === "string") {
      const isBlacklisted = BLACKLISTED_KEYWORDS.some(keyword => 
        protoName.toLowerCase().includes(keyword.toLowerCase())
      );

      if (!isBlacklisted && ent.components) {
        const coords = extractTransformPos(ent.components);
        if (coords && !isNaN(coords.x) && !isNaN(coords.y)) {
          const tileX = Math.floor(coords.x);
          const tileY = Math.floor(Math.abs(coords.y));

          parsedEntities.push({
            proto: protoName,
            uid: ent.uid || ent.id || "?",
            tileX: tileX,
            tileY: tileY
          });
        }
      }
    }

    if (Array.isArray(ent.entities)) {
      ent.entities.forEach(sub => processEntityNode(sub));
    }
  }

  function scanDataTree(node) {
    if (!node || typeof node !== "object") return;

    if (Array.isArray(node)) {
      node.forEach(item => scanDataTree(item));
      return;
    }

    processEntityNode(node);

    if (node.entities && Array.isArray(node.entities)) {
      node.entities.forEach(ent => scanDataTree(ent));
    }
  }

  async function loadMapData(mapUrl) {
    parsedEntities = [];
    if (!mapUrl) return;

    try {
      const response = await fetch(mapUrl);
      if (!response.ok) return;

      let yamlText = await response.text();
      yamlText = yamlText.replace(/!<?!?type:[^\s\n>]+>?/gi, '');

      const yamlData = jsyaml.load(yamlText, { schema: SS14_SCHEMA });
      if (!yamlData) return;

      scanDataTree(yamlData);

      console.log(`Successfully loaded ${parsedEntities.length} entities from ${mapUrl}`);
    } catch (err) {
      console.warn("Map file failed to load or parse:", err);
    }
  }

  loadMapData(document.querySelector("#image-list li.active")?.getAttribute("data-map"));

  let currentTileX = null;
  let currentTileY = null;

  function updateTileHover(event) {
    if (!elem.naturalWidth || !elem.naturalHeight || !elem.complete) {
      tileHover.style.display = "none";
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
      tileHover.style.display = "none";
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
      tileHover.style.display = "none";
      coordsDisplay.textContent = "X: --, Y: --";
      currentTileX = null;
      currentTileY = null;
    }
  }

  window.addEventListener("mousemove", updateTileHover);

  viewport.addEventListener("contextmenu", (event) => {
    event.preventDefault();

    if (currentTileX === null || currentTileY === null) {
      contextMenu.style.display = "none";
      return;
    }

    const matches = parsedEntities.filter(
      e => e.tileX === currentTileX && e.tileY === currentTileY
    );

    menuTitle.textContent = `Tile (${currentTileX}, ${currentTileY})`;
    entityList.innerHTML = "";

    if (matches.length > 0) {
      matches.forEach(item => {
        const li = document.createElement("li");
        li.textContent = `${item.proto} [${item.uid}]`;
        entityList.appendChild(li);
      });
    } else {
      const li = document.createElement("li");
      li.textContent = "No entity prototypes";
      li.className = "no-entities";
      entityList.appendChild(li);
    }

    const viewportRect = viewport.getBoundingClientRect();
    contextMenu.style.left = `${event.clientX - viewportRect.left}px`;
    contextMenu.style.top = `${event.clientY - viewportRect.top}px`;
    contextMenu.style.display = "block";
  });

  window.addEventListener("click", () => {
    contextMenu.style.display = "none";
  });

  listItems.forEach((item) => {
    item.addEventListener("click", () => {
      listItems.forEach((li) => li.classList.remove("active"));
      item.classList.add("active");

      tileHover.style.display = "none";
      contextMenu.style.display = "none";
      coordsDisplay.textContent = "X: --, Y: --";

      const newSrc = item.getAttribute("data-src");
      const mapSrc = item.getAttribute("data-map");

      elem.src = newSrc;
      loadMapData(mapSrc);

      elem.onload = () => {
        panzoom.reset();
        tileHover.style.display = "none";
      };
    });
  });
});