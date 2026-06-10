"use strict";

interface PopupSwatch {
    name: string;
    hue: number;
}

interface PopupWindowState {
    id: BrowserWindowId;
    swatchIdx: number;
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
        typeof value["swatchIdx"] === "number"
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
                browser.storage.local.get("autoAssign"),
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

            state.swatches.forEach((swatch, swatchIdx) => {
                const dot = document.createElement("button");
                dot.className = `swatch${swatchIdx === win.swatchIdx ? " active" : ""}`;
                dot.style.background = `hsl(${swatch.hue}, 70%, 60%)`;
                dot.title = swatch.name;
                dot.type = "button";
                dot.setAttribute("aria-label", swatch.name);

                dot.addEventListener("click", () => {
                    swatchRow
                        .querySelectorAll<HTMLElement>(".swatch")
                        .forEach((swatchDot, i) => {
                            swatchDot.classList.toggle(
                                "active",
                                i === swatchIdx,
                            );
                        });

                    browser.runtime
                        .sendMessage({
                            type: "SET_SWATCH",
                            windowId: win.id,
                            swatchIdx,
                        })
                        .catch((error: unknown) => {
                            console.error(
                                "[ColorfulBlur] set swatch failed:",
                                error,
                            );
                        });
                });

                swatchRow.appendChild(dot);
            });

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
    } catch (error) {
        document.body.textContent = `Extension error: ${error instanceof Error ? error.message : String(error)}`;
    }
})();
