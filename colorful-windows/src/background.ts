"use strict";

interface HslColor {
    h: number;
    s: number;
    l: number;
}

interface RgbObject {
    r: number;
    g: number;
    b: number;
}

interface Swatch {
    name: string;
    hue: number;
    hueAttraction?: number;
}

interface WindowState {
    id: BrowserWindowId;
    hue: number;
}

interface StateResponse {
    windows: WindowState[];
    swatches: readonly Swatch[];
}

interface SetSwatchMessage {
    type: "SET_SWATCH";
    windowId: BrowserWindowId;
    hue: number;
}

interface GetStateMessage {
    type: "GET_STATE";
}

interface StoredError {
    context: string;
    message: string;
    timestamp: number;
}

type RuntimeMessage = GetStateMessage | SetSwatchMessage;

function isNormalWindow(
    win: BrowserWindowInfo,
): win is BrowserWindowInfo & { id: BrowserWindowId } {
    return win.type === "normal" && win.id != null;
}

function rgbToHsl(r: number, g: number, b: number): HslColor {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    if (max === min) {
        return { h: 0, s: 0, l };
    }

    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h: number;

    switch (max) {
        case r:
            h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            break;
        case g:
            h = ((b - r) / d + 2) / 6;
            break;
        default:
            h = ((r - g) / d + 4) / 6;
            break;
    }

    return { h: h * 360, s, l };
}

function hslToRgb(h: number, s: number, l: number): RgbObject {
    h /= 360;

    if (s === 0) {
        const v = Math.round(l * 255);
        return { r: v, g: v, b: v };
    }

    const hueToRgb = (p: number, q: number, t: number): number => {
        if (t < 0) {
            t += 1;
        }
        if (t > 1) {
            t -= 1;
        }
        if (t < 1 / 6) {
            return p + (q - p) * 6 * t;
        }
        if (t < 1 / 2) {
            return q;
        }
        if (t < 2 / 3) {
            return p + (q - p) * (2 / 3 - t) * 6;
        }
        return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    return {
        r: Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
        g: Math.round(hueToRgb(p, q, h) * 255),
        b: Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
    };
}

function circularHueDiff(h1: number, h2: number): number {
    const diff = ((h1 - h2) % 360 + 360) % 360;
    return diff > 180 ? diff - 360 : diff;
}

function applyHueAttraction(hue: number, targetHue: number, attraction: number): number {
    if (attraction === 0) return hue;
    const diff = circularHueDiff(hue, targetHue);
    return (targetHue + diff * (1 - attraction) + 360) % 360;
}

function shiftColorHue(color: ThemeColor, hueShift: number, targetHue?: number, hueAttraction?: number): ThemeColor {
    const [r, g, b] = color;
    const { h, s, l } = rgbToHsl(r, g, b);

    if (s < 0.05) {
        return color;
    }

    let newHue = (h + hueShift + 360) % 360;
    if (targetHue !== undefined && hueAttraction) {
        newHue = applyHueAttraction(newHue, targetHue, hueAttraction);
    }
    const shifted = hslToRgb(newHue, s, l);
    return color.length === 4
        ? [shifted.r, shifted.g, shifted.b, color[3]]
        : [shifted.r, shifted.g, shifted.b];
}

const BASE_COLORS = {
    frame: [40, 44, 52],
    frame_inactive: [40, 44, 52],
    toolbar: [40, 44, 52, 0.5],
    toolbar_bottom_separator: [40, 44, 52, 0.5],
    toolbar_field_separator: [205, 87, 183],
    toolbar_top_separator: [40, 44, 52, 0.0],
    toolbar_vertical_separator: [180, 87, 183],
    toolbar_field: [149, 38, 108, 0.4],
    toolbar_field_focus: [139, 30, 100, 0.9],
    toolbar_field_text: [255, 255, 255],
    toolbar_field_text_focus: [255, 255, 255],
    toolbar_field_border: [200, 45, 142, 0.35],
    toolbar_field_border_focus: [205, 87, 183, 0.55],
    toolbar_field_highlight: [200, 45, 142],
    toolbar_field_highlight_text: [255, 255, 255],
    tab_background_separator: [255, 255, 255],
    tab_background_text: [255, 255, 255],
    tab_line: [205, 87, 183],
    tab_loading: [255, 255, 255],
    tab_selected: [200, 25, 142, 0.7],
    tab_text: [255, 255, 255],
    button_background_active: [149, 38, 108, 0.8],
    button_background_hover: [149, 38, 145, 0.3],
    icons: [255, 255, 255],
    icons_attention: [231, 181, 52],
    ntp_background: [40, 44, 52],
    ntp_text: [255, 255, 255],
    popup: [40, 44, 52],
    popup_text: [255, 255, 255],
    popup_border: [200, 45, 142, 0.35],
    popup_highlight: [101, 41, 132, 0.8],
    popup_highlight_text: [255, 255, 255],
    sidebar: [40, 44, 52],
    sidebar_highlight: [149, 38, 108, 0.7],
    sidebar_highlight_text: [255, 255, 255],
    sidebar_text: [199, 199, 199],
    sidebar_border: [149, 38, 108],
} satisfies Record<string, ThemeColor>;

const REFERENCE_HUE = rgbToHsl(...BASE_COLORS.toolbar_field_separator).h;

const SWATCHES: readonly Swatch[] = [
    { name: "Original", hue: REFERENCE_HUE },
    { name: "Purple", hue: 275, hueAttraction: 0.6 },
    { name: "Red", hue: 0 },
    { name: "Orange", hue: 30, hueAttraction: 0.6 },
    { name: "Yellow", hue: 50, hueAttraction: 0.6 },
    { name: "Green", hue: 120 },
    { name: "Cyan", hue: 180, hueAttraction: 0.3 },
    { name: "Blue", hue: 210 },
];

const imagePromiseCache = new Map<string, Promise<string>>();

const windowSwatches = new Map<BrowserWindowId, number>();

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isRuntimeMessage(message: unknown): message is RuntimeMessage {
    if (!isRecord(message)) return false;
    if (message["type"] === "GET_STATE") return true;
    return (
        message["type"] === "SET_SWATCH" &&
        typeof message["windowId"] === "number" &&
        typeof message["hue"] === "number"
    );
}

function isHue(value: unknown): value is number {
    return typeof value === "number" && isFinite(value);
}

function getSwatchForHue(hue: number): Swatch {
    return SWATCHES.find((s) => s.hue === hue) ?? { name: "Custom", hue };
}

function getNextFreeHue(): number {
    const used = new Set(windowSwatches.values());
    return (
        SWATCHES.find((s) => !used.has(s.hue))?.hue ??
        SWATCHES[windowSwatches.size % SWATCHES.length]!.hue
    );
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function reportError(context: string, error: unknown): Promise<void> {
    const message = getErrorMessage(error);
    console.error(`[ColorfulBlur] ${context}:`, error);
    try {
        const stored: StoredError = { context, message, timestamp: Date.now() };
        await browser.storage.local.set({ lastError: stored });
        await browser.browserAction.setBadgeText({ text: "!" });
        await browser.browserAction.setBadgeBackgroundColor({
            color: "#cc0000",
        });
    } catch {}
}

function loadImageToCanvas(url: string): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;

            const ctx = canvas.getContext("2d");
            if (!ctx) {
                reject(new Error("Failed to create canvas context"));
                return;
            }

            ctx.fillStyle = "#282c34";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            resolve(canvas);
        };

        img.onerror = () =>
            reject(new Error("Failed to load background image"));
        img.src = url;
    });
}

async function loadAndProcessImage(hueShift: number, targetHue?: number, hueAttraction?: number): Promise<string> {
    const canvas = await loadImageToCanvas(
        browser.runtime.getURL("images/background.png"),
    );
    const ctx = canvas.getContext("2d");

    if (!ctx) {
        throw new Error("Failed to create canvas context");
    }

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    rotateImageHue(imageData.data, hueShift, targetHue, hueAttraction);
    ctx.putImageData(imageData, 0, 0);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    canvas.width = 0;
    return dataUrl;
}

function getHueShiftedImageUrl(hueShift: number, targetHue?: number, hueAttraction?: number): Promise<string> {
    const key = `${Math.round(hueShift)}_${targetHue ?? 0}_${Math.round((hueAttraction ?? 0) * 100)}`;
    const cached = imagePromiseCache.get(key);
    if (cached !== undefined) return cached;

    const promise = loadAndProcessImage(hueShift, targetHue, hueAttraction);
    imagePromiseCache.set(key, promise);
    // Evict on failure so next call retries
    promise.catch(() => imagePromiseCache.delete(key));
    return promise;
}

function rotateImageHue(data: Uint8ClampedArray, hueShift: number, targetHue?: number, hueAttraction?: number): void {
    for (let i = 0; i < data.length; i += 4) {
        const r0 = data[i]!;
        const g0 = data[i + 1]!;
        const b0 = data[i + 2]!;
        const { h, s, l } = rgbToHsl(r0, g0, b0);

        if (s < 0.05) {
            continue;
        }

        let newHue = (h + hueShift + 360) % 360;
        if (targetHue !== undefined && hueAttraction) {
            newHue = applyHueAttraction(newHue, targetHue, hueAttraction);
        }
        const { r, g, b } = hslToRgb(newHue, s, l);
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
    }
}

function persistSwatch(windowId: BrowserWindowId, hue: number): void {
    browser.sessions
        .setWindowValue(windowId, "swatchHue", hue)
        .catch((error: unknown) => {
            console.warn(
                "[ColorfulBlur] failed to persist swatch for window",
                windowId,
                ":",
                getErrorMessage(error),
            );
        });
}

async function setSwatch(
    windowId: BrowserWindowId,
    hue: number,
): Promise<void> {
    windowSwatches.set(windowId, hue);
    persistSwatch(windowId, hue);
    await applyThemeToWindow(windowId);
}

async function loadWindowColors(): Promise<void> {
    const windows = await browser.windows.getAll();

    for (const win of windows.filter(isNormalWindow)) {
        let saved: unknown;

        try {
            saved = await browser.sessions.getWindowValue(win.id, "swatchHue");
        } catch (_error) {
            saved = undefined;
        }

        if (isHue(saved)) {
            windowSwatches.set(win.id, saved);
        } else {
            const hue = getNextFreeHue();
            windowSwatches.set(win.id, hue);
            persistSwatch(win.id, hue);
        }
    }
}

async function applyThemeToWindow(windowId: BrowserWindowId): Promise<void> {
    const hue = windowSwatches.get(windowId) ?? SWATCHES[0]!.hue;
    const swatch = getSwatchForHue(hue);
    const hueShift = hue - REFERENCE_HUE;
    const { hueAttraction } = swatch;
    const shiftedColors: Record<string, ThemeColor> = {};

    for (const [key, value] of Object.entries(BASE_COLORS)) {
        shiftedColors[key] = shiftColorHue(value, hueShift, hue, hueAttraction);
    }

    let imageUrl: string | null = null;

    try {
        imageUrl = await getHueShiftedImageUrl(hueShift, hue, hueAttraction);
    } catch (error) {
        console.warn(
            "[ColorfulBlur] image processing failed, applying colors only:",
            getErrorMessage(error),
        );
    }

    const themeUpdate: BrowserThemeUpdate = { colors: shiftedColors };

    if (imageUrl) {
        themeUpdate.images = {
            theme_frame: imageUrl,
            additional_backgrounds: [imageUrl],
        };
        themeUpdate.properties = {
            additional_backgrounds_alignment: ["right bottom"],
            additional_backgrounds_tiling: ["no-repeat"],
        };
    }

    try {
        await browser.theme.update(windowId, themeUpdate);
        return;
    } catch (firstError) {
        if (!imageUrl) {
            await reportError("theme update failed", firstError);
            return;
        }
        console.warn(
            "[ColorfulBlur] theme update failed (image likely too large), retrying without image:",
            getErrorMessage(firstError),
        );
    }

    try {
        await browser.theme.update(windowId, { colors: shiftedColors });
    } catch (retryError) {
        await reportError(
            "theme update failed (no image fallback)",
            retryError,
        );
    }
}

async function applyThemeToAllWindows(): Promise<void> {
    const windows = await browser.windows.getAll();
    await Promise.all(
        windows.filter(isNormalWindow).map((win) => applyThemeToWindow(win.id)),
    );
}

browser.windows.onCreated.addListener(async (win) => {
    if (win.type !== "normal" || win.id == null) return;
    try {
        const stored = await browser.storage.local.get("autoAssign");
        const autoAssign = stored["autoAssign"] !== false;
        const hue = autoAssign ? getNextFreeHue() : SWATCHES[0]!.hue;
        await setSwatch(win.id, hue);
    } catch (error) {
        await reportError("new window setup failed", error);
    }
});

browser.windows.onRemoved.addListener((windowId) => {
    windowSwatches.delete(windowId);
});

browser.runtime.onMessage.addListener((message) => {
    if (!isRuntimeMessage(message)) {
        return undefined;
    }

    if (message.type === "GET_STATE") {
        return browser.windows.getAll().then<StateResponse>((windows) => ({
            windows: windows.filter(isNormalWindow).map((win) => ({
                id: win.id,
                hue: windowSwatches.get(win.id) ?? SWATCHES[0]!.hue,
            })),
            swatches: SWATCHES,
        }));
    }

    return setSwatch(message.windowId, message.hue).then(() => ({
        ok: true,
    }));
});

void (async () => {
    try {
        await loadWindowColors();
        await applyThemeToAllWindows();
    } catch (error) {
        await reportError("startup failed", error);
    }
})();
