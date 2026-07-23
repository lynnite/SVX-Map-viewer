document.addEventListener("DOMContentLoaded", () => {
  const elem = document.getElementById("map-image");
  const listItems = document.querySelectorAll("#image-list li");

const panzoom = Panzoom(elem, {
  maxScale: 50,
  minScale: 0.1,
  step: 0.3,
  canvas: true,
});

const viewport = document.querySelector(".viewport");
viewport.addEventListener("wheel", (event) => {
  panzoom.zoomWithWheel(event, { step: 0.2 });
});

  const viewport = document.querySelector(".viewport");
  viewport.addEventListener("wheel", panzoom.zoomWithWheel);

  document.getElementById("zoom-in").addEventListener("click", panzoom.zoomIn);
  document.getElementById("zoom-out").addEventListener("click", panzoom.zoomOut);
  document.getElementById("reset-view").addEventListener("click", () => panzoom.reset());

  listItems.forEach((item) => {
    item.addEventListener("click", () => {
      listItems.forEach((li) => li.classList.remove("active"));
      item.classList.add("active");

      const newSrc = item.getAttribute("data-src");
      elem.src = newSrc;

      panzoom.reset();
    });
  });
});