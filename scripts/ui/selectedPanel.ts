import { typeColor } from "../lib/colors.ts";
import type { Dispatch, State } from "../app/state.ts";
import { getSelectedDevices } from "../app/state.ts";

const PLACEHOLDER_THUMB =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

const clearChildren = (el: Element) => {
  while (el.firstChild) el.removeChild(el.firstChild);
};

export function createSelectedPanel(
  {
    selectedDevicesEl,
    selectedOverlay,
    dispatch,
  }: {
    selectedDevicesEl: HTMLElement;
    selectedOverlay: HTMLElement | null;
    dispatch: Dispatch;
  },
) {
  let lastThumbWired = 0;

  const wireThumbFallbacks = () => {
    // Ensure we don't wire too aggressively if repeated renders happen.
    const now = Date.now();
    if (now - lastThumbWired < 10) return;
    lastThumbWired = now;

    selectedDevicesEl.querySelectorAll<HTMLImageElement>("img.thumb").forEach(
      (img) => {
        if ((img as unknown as { __wired?: boolean }).__wired) return;
        (img as unknown as { __wired?: boolean }).__wired = true;
        img.addEventListener(
          "error",
          () => {
            const fallback = img.getAttribute("data-fallback") ||
              PLACEHOLDER_THUMB;
            if (img.src !== fallback) {
              img.src = fallback;
              return;
            }
            // If even fallback fails (shouldn't), ensure we stabilize on placeholder.
            img.src = PLACEHOLDER_THUMB;
          },
          { once: true },
        );
      },
    );
  };

  const render = (state: State) => {
    clearChildren(selectedDevicesEl);
    const selectedList = getSelectedDevices(state);

    if (selectedOverlay) {
      selectedOverlay.classList.toggle("is-hidden", selectedList.length === 0);
    }

    if (!selectedList.length) {
      const empty = document.createElement("span");
      empty.className = "status";
      empty.textContent = "No devices selected";
      selectedDevicesEl.appendChild(empty);
      return;
    }

    selectedList.forEach((d) => {
      const card = document.createElement("div");
      card.className = "selected-card";

      const makeThumb = () => {
        const img = document.createElement("img");
        img.className = "thumb";
        img.alt = "";
        img.loading = "lazy";

        const src = d.thumbPng ?? d.thumbJpg ?? PLACEHOLDER_THUMB;
        const fallback = d.thumbJpg ?? PLACEHOLDER_THUMB;
        img.src = src;
        img.setAttribute("data-fallback", fallback);
        return img;
      };

      card.appendChild(makeThumb());

      const content = document.createElement("div");
      content.className = "content";

      const title = document.createElement("div");
      title.className = "title";

      const dot = document.createElement("span");
      dot.style.width = "10px";
      dot.style.height = "10px";
      dot.style.borderRadius = "50%";
      dot.style.background = typeColor(d.deviceKind);
      dot.style.display = "inline-block";

      const titleText = document.createElement("span");
      titleText.textContent = d.name;

      title.appendChild(dot);
      title.appendChild(document.createTextNode(" "));
      title.appendChild(titleText);

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = `${d.brand} • ${d.model}`;

      const typePill = document.createElement("div");
      typePill.className = "type-pill";
      typePill.textContent = d.type;

      content.appendChild(title);
      content.appendChild(meta);
      content.appendChild(typePill);

      const removeBtn = document.createElement("button");
      removeBtn.className = "remove";
      removeBtn.type = "button";
      removeBtn.title = "Remove";
      removeBtn.setAttribute("aria-label", "Remove");
      removeBtn.textContent = "×";
      removeBtn.dataset.id = d.id;
      removeBtn.addEventListener(
        "click",
        () => dispatch({ type: "toggleSelect", id: d.id }),
      );

      card.appendChild(content);
      card.appendChild(removeBtn);
      selectedDevicesEl.appendChild(card);
    });

    wireThumbFallbacks();
  };

  return { render };
}
