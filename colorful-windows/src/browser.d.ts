type BrowserWindowId = number;

type ThemeColor =
    | readonly [number, number, number]
    | readonly [number, number, number, number];

interface BrowserWindowInfo {
    id?: BrowserWindowId;
    type?: string;
}

type StoredValues = Record<string, unknown>;

interface BrowserStorageArea {
    get(keys?: string | string[] | StoredValues | null): Promise<StoredValues>;
    set(values: StoredValues): Promise<void>;
    remove(keys: string | string[]): Promise<void>;
}

interface BrowserRuntime {
    getURL(path: string): string;
    sendMessage<TResponse = unknown>(message: unknown): Promise<TResponse>;
    onMessage: {
        addListener(
            listener: (
                message: unknown,
                sender?: unknown,
                sendResponse?: (response?: unknown) => void,
            ) => unknown,
        ): void;
    };
}

interface BrowserWindows {
    getAll(): Promise<BrowserWindowInfo[]>;
    getCurrent(): Promise<BrowserWindowInfo>;
    onCreated: {
        addListener(
            listener: (windowInfo: BrowserWindowInfo) => void | Promise<void>,
        ): void;
    };
    onRemoved: {
        addListener(listener: (windowId: BrowserWindowId) => void): void;
    };
}

interface BrowserSessions {
    getWindowValue<TValue = unknown>(
        windowId: BrowserWindowId,
        key: string,
    ): Promise<TValue | undefined>;
    setWindowValue(
        windowId: BrowserWindowId,
        key: string,
        value: unknown,
    ): Promise<void>;
}

interface BrowserThemeUpdate {
    colors: Record<string, ThemeColor>;
    images?: {
        theme_frame?: string;
        additional_backgrounds?: string[];
    };
    properties?: {
        additional_backgrounds_alignment?: string[];
        additional_backgrounds_tiling?: string[];
    };
}

interface BrowserTheme {
    update(
        windowId: BrowserWindowId,
        details: BrowserThemeUpdate,
    ): Promise<void>;
}

interface BrowserActionApi {
    setBadgeText(details: {
        text: string;
        windowId?: BrowserWindowId;
    }): Promise<void>;
    setBadgeBackgroundColor(details: {
        color: string;
        windowId?: BrowserWindowId;
    }): Promise<void>;
}

interface BrowserApi {
    runtime: BrowserRuntime;
    windows: BrowserWindows;
    sessions: BrowserSessions;
    storage: {
        local: BrowserStorageArea;
    };
    theme: BrowserTheme;
    browserAction: BrowserActionApi;
}

declare const browser: BrowserApi;
