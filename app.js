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

  async function loadMapData(mapUrl) {
    parsedEntities = [];
    if (!mapUrl) return;

    try {
      const response = await fetch(mapUrl);
      if (!response.ok) return;

      const yamlText = await response.text();
      const yamlData = jsyaml.load(yamlText);

      if (!yamlData) return;

      const blocks = Array.isArray(yamlData) ? yamlData : [yamlData];

      blocks.forEach(block => {
        const currentProto = block.proto;
        const entitiesGroup = block.entities;

        if (currentProto && Array.isArray(entitiesGroup)) {
          entitiesGroup.forEach(ent => {
            if (!ent.components) return;

            const transform = ent.components.find(c => c.type === "Transform");
            if (transform && transform.pos) {
              const [xStr, yStr] = transform.pos.split(",");
              const rawX = parseFloat(xStr);
              const rawY = parseFloat(yStr);

              const tileX = Math.floor(rawX);
              const tileY = Math.floor(Math.abs(rawY));

              parsedEntities.push({
                proto: currentProto,
                uid: ent.uid,
                tileX: tileX,
                tileY: tileY
              });
            }
          });
        }
      });

      console.log(`Successfully loaded ${parsedEntities.length} entities from ${mapUrl}`);
    } catch (err) {
      console.warn("Map file failed to load or parse:", err);
    }
  }
  loadMapData(document.querySelector("#image-list li.active").getAttribute("data-map"));

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
        li.textContent = item.proto;
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