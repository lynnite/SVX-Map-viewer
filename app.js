document.addEventListener("DOMContentLoaded", () => {
  const elem = document.getElementById("map-image");
  const viewport = document.querySelector(".viewport");
  const listItems = document.querySelectorAll("#image-list li");

  const panzoom = Panzoom(elem, {
    maxScale: 30,
    minScale: 0.2,
    canvas: true,
  });

  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    panzoom.zoomWithWheel(event, { step: 0.15 });
  }, { passive: false });

  document.getElementById("zoom-in").addEventListener("click", () => panzoom.zoomIn());
  document.getElementById("zoom-out").addEventListener("click", () => panzoom.zoomOut());
  document.getElementById("reset-view").addEventListener("click", () => panzoom.reset());

  listItems.forEach((item) => {
    item.addEventListener("click", () => {
      listItems.forEach((li) => li.classList.remove("active"));
      item.classList.add("active");

      elem.src = item.getAttribute("data-src");
      panzoom.reset();
    });
  });
});