document.addEventListener("DOMContentLoaded", () => {
  const elem = document.getElementById("map-image");
  const viewport = document.querySelector(".viewport");
  const listItems = document.querySelectorAll("#image-list li");
  const tileHover = document.getElementById("tile-hover");

  const TILE_SIZE = 32;

  const panzoom = Panzoom(elem, {
    maxScale: 50,
    minScale: 0.05,
    canvas: true
  });

  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();

    if (event.deltaY < 0) {
      panzoom.zoomIn({ animate: false });
    } else {
      panzoom.zoomOut({ animate: false });
    }
  }, { passive: false });

  document.getElementById("zoom-in").addEventListener("click", () => panzoom.zoomIn());
  document.getElementById("zoom-out").addEventListener("click", () => panzoom.zoomOut());
  document.getElementById("reset-view").addEventListener("click", () => panzoom.reset());

  function updateTileHover(event) {
    if (!elem.naturalWidth || !elem.naturalHeight || !elem.complete) {
      tileHover.style.display = "none";
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
      return;
    }

    const mouseXOnImage = event.clientX - rect.left;
    const mouseYOnImage = event.clientY - rect.top;

    const scaleRatio = rect.width / elem.naturalWidth;

    const imageX = mouseXOnImage / scaleRatio;
    const imageY = mouseYOnImage / scaleRatio;

    if (
      imageX >= 0 &&
      imageX < elem.naturalWidth &&
      imageY >= 0 &&
      imageY < elem.naturalHeight
    ) {
      const tileX = Math.floor(imageX / TILE_SIZE) * TILE_SIZE;
      const tileY = Math.floor(imageY / TILE_SIZE) * TILE_SIZE;

      tileHover.style.left = `${rect.left - viewportRect.left + tileX * scaleRatio}px`;
      tileHover.style.top = `${rect.top - viewportRect.top + tileY * scaleRatio}px`;
      tileHover.style.width = `${TILE_SIZE * scaleRatio}px`;
      tileHover.style.height = `${TILE_SIZE * scaleRatio}px`;
      tileHover.style.display = "block";
    } else {
      tileHover.style.display = "none";
    }
  }

  window.addEventListener("mousemove", updateTileHover);

  elem.addEventListener("panzoomchange", () => {
    tileHover.style.display = "none";
  });

  listItems.forEach((item) => {
    item.addEventListener("click", () => {
      listItems.forEach((li) => li.classList.remove("active"));
      item.classList.add("active");

      tileHover.style.display = "none";

      const newSrc = item.getAttribute("data-src");
      elem.src = newSrc;

      elem.onload = () => {
        panzoom.reset();
        tileHover.style.display = "none";
      };
    });
  });
});