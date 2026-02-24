import type { Dispatch, State } from "../app/state.ts";
import {
  getClampedPage,
  getFilteredDevices,
  getPageDevices,
  getTotalPages,
} from "../app/state.ts";

const mustStop = (e: Event) => {
  e.preventDefault();
  e.stopPropagation();
};

const clearChildren = (el: Element) => {
  while (el.firstChild) el.removeChild(el.firstChild);
};

export function createSearchPanel(
  {
    searchInput,
    searchShell,
    searchResults,
    searchTbody,
    pageInfo,
    prevPageBtn,
    nextPageBtn,
    clearSearchBtn,
    dispatch,
    getState,
  }: {
    searchInput: HTMLInputElement;
    searchShell: HTMLElement;
    searchResults: HTMLElement;
    searchTbody: HTMLTableSectionElement;
    pageInfo: HTMLElement;
    prevPageBtn: HTMLButtonElement;
    nextPageBtn: HTMLButtonElement;
    clearSearchBtn: HTMLButtonElement;
    dispatch: Dispatch;
    getState: () => State;
  },
) {
  let hasWired = false;

  const hideResults = () => {
    searchResults.classList.remove("visible");
  };

  const wire = () => {
    if (hasWired) return;
    hasWired = true;

    searchInput.addEventListener("input", (e: Event) => {
      const target = e.target;
      if (target instanceof HTMLInputElement) {
        dispatch({ type: "setFilter", filter: target.value });
      }
    });

    searchInput.addEventListener("focus", () => {
      // No state change, but render should show visible results.
      render(getState());
    });

    clearSearchBtn.addEventListener("click", (e) => {
      mustStop(e);
      dispatch({ type: "clearFilter" });
      searchInput.value = "";
      hideResults();
    });

    prevPageBtn.addEventListener("click", (e) => {
      mustStop(e);
      dispatch({ type: "prevPage" });
    });

    nextPageBtn.addEventListener("click", (e) => {
      mustStop(e);
      dispatch({ type: "nextPage" });
    });

    document.addEventListener("click", (e: MouseEvent) => {
      if (!(e.target instanceof Node)) return;
      const insideShell = searchShell.contains(e.target);
      if (!searchResults.contains(e.target) && !insideShell) {
        hideResults();
      }
    });
  };

  const render = (state: State) => {
    wire();
    const results = getFilteredDevices(state);
    const totalPages = getTotalPages(state);
    const page = getClampedPage(state);
    const pageItems = getPageDevices(state);

    clearChildren(searchTbody);
    pageItems.forEach((d) => {
      const tr = document.createElement("tr");
      tr.classList.toggle("is-selected", state.selected.has(d.id));

      const tdName = document.createElement("td");
      tdName.textContent = `${state.selected.has(d.id) ? "✓ " : ""}${d.name}`;

      const tdBrand = document.createElement("td");
      tdBrand.textContent = d.brand;

      const tdModel = document.createElement("td");
      tdModel.textContent = d.model;

      const tdType = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = d.type;
      tdType.appendChild(badge);

      tr.appendChild(tdName);
      tr.appendChild(tdBrand);
      tr.appendChild(tdModel);
      tr.appendChild(tdType);

      tr.addEventListener("click", () => {
        dispatch({ type: "toggleSelect", id: d.id, forceOn: true });
        hideResults();
      });
      searchTbody.appendChild(tr);
    });

    pageInfo.textContent = `Page ${page} / ${totalPages}`;
    prevPageBtn.disabled = page === 1;
    nextPageBtn.disabled = page === totalPages;

    searchResults.classList.toggle(
      "visible",
      results.length > 0 && state.filter.trim().length > 0,
    );
  };

  return { render };
}
