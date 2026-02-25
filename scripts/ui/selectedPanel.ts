import { typeColor } from "../lib/colors.ts";
import type { Dispatch, State } from "../app/state.ts";
import { getSelectedDevices } from "../app/state.ts";
import { CUSTOM_NETWORK_ID } from "../app/customTopology.ts";

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
    onRenameDevice,
    onChangeDeviceType,
    onUpdateDeviceProperties,
    onDeleteDevice,
  }: {
    selectedDevicesEl: HTMLElement;
    selectedOverlay: HTMLElement | null;
    dispatch: Dispatch;
    onRenameDevice: (deviceId: string, nextName: string) => void;
    onChangeDeviceType: (deviceId: string, nextDeviceTypeSlug: string) => void;
    onUpdateDeviceProperties: (
      deviceId: string,
      propertiesJsonText: string,
    ) => void;
    onDeleteDevice: (deviceId: string) => void;
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
      const isCustomMode = state.networkId === CUSTOM_NETWORK_ID;

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

      if (isCustomMode) {
        const editableProperties = (() => {
          const copy: Record<string, unknown> = { ...d };
          const stripKeys = [
            "id",
            "name",
            "type",
            "deviceKind",
            "deviceTypeSlug",
            "brand",
            "model",
            "ports",
            "thumbPng",
            "thumbJpg",
            "partNumber",
            "layoutTierIndexHint",
            "layoutSiteRank",
            "layoutStableKey",
          ];
          stripKeys.forEach((key) => delete copy[key]);
          return copy;
        })();

        const typeRow = document.createElement("div");
        typeRow.className = "selected-edit-row selected-type-row";

        const typeSelect = document.createElement("select");
        typeSelect.className = "selected-type-select";
        typeSelect.setAttribute("aria-label", `Device type for ${d.name}`);

        Object.keys(state.deviceTypes)
          .sort((left, right) => {
            const leftType = state.deviceTypes[left];
            const rightType = state.deviceTypes[right];
            const leftLabel = `${leftType?.brand ?? ""} ${
              leftType?.model ?? left
            }`
              .trim();
            const rightLabel = `${rightType?.brand ?? ""} ${
              rightType?.model ?? right
            }`
              .trim();
            return leftLabel.localeCompare(rightLabel);
          })
          .forEach((slug) => {
            const type = state.deviceTypes[slug];
            const option = document.createElement("option");
            option.value = slug;
            option.textContent = `${type.brand} ${type.model}`;
            if (slug === d.deviceTypeSlug) option.selected = true;
            typeSelect.appendChild(option);
          });

        const applyTypeBtn = document.createElement("button");
        applyTypeBtn.type = "button";
        applyTypeBtn.className = "selected-action";
        applyTypeBtn.textContent = "Apply type";
        applyTypeBtn.addEventListener("click", () => {
          onChangeDeviceType(d.id, typeSelect.value);
        });

        typeRow.appendChild(typeSelect);
        typeRow.appendChild(applyTypeBtn);

        const editRow = document.createElement("div");
        editRow.className = "selected-edit-row";

        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.className = "selected-name-input";
        nameInput.value = d.name;
        nameInput.setAttribute("aria-label", `Rename ${d.name}`);

        const saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.className = "selected-action";
        saveBtn.textContent = "Rename";
        saveBtn.addEventListener("click", () => {
          onRenameDevice(d.id, nameInput.value);
        });

        nameInput.addEventListener("keydown", (event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          onRenameDevice(d.id, nameInput.value);
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "selected-action danger";
        deleteBtn.textContent = "Delete";
        deleteBtn.addEventListener("click", () => {
          onDeleteDevice(d.id);
        });

        editRow.appendChild(nameInput);
        editRow.appendChild(saveBtn);
        editRow.appendChild(deleteBtn);

        const advancedDetails = document.createElement("details");
        advancedDetails.className = "selected-advanced";

        const advancedSummary = document.createElement("summary");
        advancedSummary.className = "selected-advanced-summary";
        advancedSummary.textContent = "Advanced: edit JSON properties";
        advancedDetails.appendChild(advancedSummary);

        const propertiesLabel = document.createElement("div");
        propertiesLabel.className = "selected-properties-label";
        propertiesLabel.textContent = "Properties (JSON object)";

        const propertiesInput = document.createElement("textarea");
        propertiesInput.className = "selected-properties-input";
        propertiesInput.value = JSON.stringify(editableProperties, null, 2);
        propertiesInput.setAttribute(
          "aria-label",
          `Custom properties JSON for ${d.name}`,
        );

        const propertiesActions = document.createElement("div");
        propertiesActions.className = "selected-properties-actions";

        const savePropertiesBtn = document.createElement("button");
        savePropertiesBtn.type = "button";
        savePropertiesBtn.className = "selected-action";
        savePropertiesBtn.textContent = "Save properties";
        savePropertiesBtn.addEventListener("click", () => {
          onUpdateDeviceProperties(d.id, propertiesInput.value);
        });

        propertiesActions.appendChild(savePropertiesBtn);
        advancedDetails.appendChild(propertiesLabel);
        advancedDetails.appendChild(propertiesInput);
        advancedDetails.appendChild(propertiesActions);

        content.appendChild(typeRow);
        content.appendChild(editRow);
        content.appendChild(advancedDetails);
      }

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
