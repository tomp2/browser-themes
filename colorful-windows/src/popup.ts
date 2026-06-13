"use strict";

interface PopupSwatch {
    name: string;
    hue: number;
}

interface PopupWindowState {
    id: BrowserWindowId;
    hue: number;
}

interface PopupStateResponse {
    windows: PopupWindowState[];
    swatches: PopupSwatch[];
}

interface StoredError {
    context: string;
    message: string;
    timestamp: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isPopupSwatch(value: unknown): value is PopupSwatch {
    return (
        isRecord(value) &&
        typeof value["name"] === "string" &&
        typeof value["hue"] === "number"
    );
}

function isPopupWindowState(value: unknown): value is PopupWindowState {
    return (
        isRecord(value) &&
        typeof value["id"] === "number" &&
        typeof value["hue"] === "number"
    );
}

function isPopupStateResponse(value: unknown): value is PopupStateResponse {
    return (
        isRecord(value) &&
        Array.isArray(value["windows"]) &&
        value["windows"].every(isPopupWindowState) &&
        Array.isArray(value["swatches"]) &&
        value["swatches"].every(isPopupSwatch)
    );
}

function isStoredError(value: unknown): value is StoredError {
    return (
        isRecord(value) &&
        typeof value["context"] === "string" &&
        typeof value["message"] === "string" &&
        typeof value["timestamp"] === "number"
    );
}

function getRequiredElement<TElement extends HTMLElement>(
    id: string,
    ctor: new () => TElement,
): TElement {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing required element: #${id}`);
    if (!(element instanceof ctor)) {
        throw new TypeError(
            `#${id}: expected ${ctor.name}, got ${element.constructor.name}`,
        );
    }
    return element;
}

async function dismissError(banner: HTMLElement): Promise<void> {
    try {
        await browser.storage.local.remove("lastError");
        await browser.browserAction.setBadgeText({ text: "" });
    } catch {
        // best effort
    }
    banner.remove();
}

void (async () => {
    try {
        const [rawState, currentWindow, stored, errorStorage] =
            await Promise.all([
                browser.runtime.sendMessage({ type: "GET_STATE" }),
                browser.windows.getCurrent(),
                browser.storage.local.get(["autoAssign", "swatchOrder"]),
                browser.storage.local.get("lastError"),
            ]);

        if (!isPopupStateResponse(rawState)) {
            throw new Error(
                "Unexpected response from background: state is malformed",
            );
        }

        const state = rawState;
        const autoAssign =
            typeof stored["autoAssign"] === "boolean"
                ? stored["autoAssign"]
                : true;

        const rawOrder = stored["swatchOrder"];
        const knownNames = new Set(state.swatches.map((s) => s.name));
        let swatchOrder: string[] =
            Array.isArray(rawOrder) && rawOrder.every((x) => typeof x === "string")
                ? (rawOrder as string[])
                : state.swatches.map((s) => s.name);
        // Drop stale names, append any swatches missing from the saved order
        swatchOrder = [
            ...swatchOrder.filter((n) => knownNames.has(n)),
            ...state.swatches
                .filter((s) => !swatchOrder.includes(s.name))
                .map((s) => s.name),
        ];

        function getOrderedSwatches(): PopupSwatch[] {
            return swatchOrder
                .map((name) => state.swatches.find((s) => s.name === name))
                .filter((s): s is PopupSwatch => s !== undefined);
        }

        const list = getRequiredElement("windows-list", HTMLDivElement);

        const lastError = isStoredError(errorStorage["lastError"])
            ? errorStorage["lastError"]
            : null;
        if (lastError) {
            const banner = document.createElement("div");
            banner.className = "error-banner";

            const text = document.createElement("span");
            text.textContent = `${lastError.context}: ${lastError.message}`;

            const dismiss = document.createElement("button");
            dismiss.textContent = "×";
            dismiss.type = "button";
            dismiss.className = "error-dismiss";
            dismiss.addEventListener("click", () => {
                void dismissError(banner);
            });

            banner.appendChild(text);
            banner.appendChild(dismiss);
            list.parentElement?.insertBefore(banner, list);
        }

        const allRows: Array<{ row: HTMLDivElement; win: PopupWindowState }> =
            [];
        let dragSrcName: string | null = null;

        function renderSwatchRow(
            row: HTMLDivElement,
            win: PopupWindowState,
        ): void {
            row.innerHTML = "";
            const ordered = getOrderedSwatches();

            ordered.forEach((swatch) => {
                const dot = document.createElement("button");
                dot.className = `swatch${swatch.hue === win.hue ? " active" : ""}`;
                dot.style.background = `hsl(${swatch.hue}, 70%, 60%)`;
                dot.title = swatch.name;
                dot.type = "button";
                dot.setAttribute("aria-label", swatch.name);
                dot.setAttribute("draggable", "true");

                dot.addEventListener("click", () => {
                    row.querySelectorAll<HTMLElement>(".swatch").forEach(
                        (d, i) => {
                            d.classList.toggle(
                                "active",
                                ordered[i]?.hue === swatch.hue,
                            );
                        },
                    );
                    browser.runtime
                        .sendMessage({
                            type: "SET_SWATCH",
                            windowId: win.id,
                            hue: swatch.hue,
                        })
                        .catch((error: unknown) => {
                            console.error(
                                "[ColorfulBlur] set swatch failed:",
                                error,
                            );
                        });
                });

                dot.addEventListener("dragstart", (e) => {
                    dragSrcName = swatch.name;
                    dot.classList.add("dragging");
                    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
                });

                dot.addEventListener("dragend", () => {
                    dot.classList.remove("dragging");
                    document
                        .querySelectorAll(".swatch.drag-over")
                        .forEach((el) => el.classList.remove("drag-over"));
                    dragSrcName = null;
                });

                dot.addEventListener("dragover", (e) => {
                    e.preventDefault();
                    if (!dragSrcName || dragSrcName === swatch.name) return;
                    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                    document
                        .querySelectorAll(".swatch.drag-over")
                        .forEach((el) => el.classList.remove("drag-over"));
                    dot.classList.add("drag-over");
                });

                dot.addEventListener("drop", (e) => {
                    e.preventDefault();
                    if (!dragSrcName || dragSrcName === swatch.name) return;
                    const srcIdx = swatchOrder.indexOf(dragSrcName);
                    const dstIdx = swatchOrder.indexOf(swatch.name);
                    if (srcIdx === -1 || dstIdx === -1) return;
                    const newOrder = [...swatchOrder];
                    const [moved] = newOrder.splice(srcIdx, 1) as [string];
                    newOrder.splice(dstIdx, 0, moved);
                    swatchOrder = newOrder;
                    void browser.storage.local.set({ swatchOrder });
                    allRows.forEach(({ row: r, win: w }) =>
                        renderSwatchRow(r, w),
                    );
                });

                row.appendChild(dot);
            });
        }

        state.windows.forEach((win, idx) => {
            const isCurrent =
                currentWindow.id != null && win.id === currentWindow.id;

            const entry = document.createElement("div");
            entry.className = `window-entry${isCurrent ? " current" : ""}`;

            const label = document.createElement("div");
            label.className = "window-label";
            label.textContent = isCurrent
                ? `Window ${idx + 1} (this window)`
                : `Window ${idx + 1}`;
            entry.appendChild(label);

            const swatchRow = document.createElement("div");
            swatchRow.className = "swatches";

            allRows.push({ row: swatchRow, win });
            renderSwatchRow(swatchRow, win);

            entry.appendChild(swatchRow);
            list.appendChild(entry);
        });

        const divider = document.createElement("hr");
        document.body.appendChild(divider);

        const settingsRow = document.createElement("label");
        settingsRow.className = "setting-row";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = autoAssign;
        checkbox.addEventListener("change", () => {
            void browser.storage.local.set({ autoAssign: checkbox.checked });
        });

        settingsRow.appendChild(checkbox);
        settingsRow.appendChild(
            document.createTextNode(" Auto-assign colors to new windows"),
        );
        document.body.appendChild(settingsRow);

        const hint = document.createElement("p");
        hint.className = "drag-hint";
        hint.textContent = "Drag colors to reorder.";
        document.body.appendChild(hint);
    } catch (error) {
        document.body.textContent = `Extension error: ${error instanceof Error ? error.message : String(error)}`;
    }
})();
