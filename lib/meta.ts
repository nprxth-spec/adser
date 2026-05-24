// Facebook/Meta Marketing API helpers.
// Requires env: FACEBOOK_APP_ID, FACEBOOK_APP_SECRET.

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const OAUTH_DIALOG = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;

// Permissions needed to read ad accounts + the businesses that own them.
export const META_SCOPES = ["public_profile", "ads_read", "business_management"];

export interface MetaAppConfig {
    appId: string;
    appSecret: string;
}

export function getMetaAppConfig(): MetaAppConfig {
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (!appId || !appSecret) {
        throw new Error(
            "Meta app is not configured. Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET.",
        );
    }
    return { appId, appSecret };
}

export function isMetaConfigured(): boolean {
    return Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
}

/** The OAuth redirect URI must match exactly what is whitelisted in the FB app. */
export function getMetaRedirectUri(origin: string): string {
    return `${origin.replace(/\/$/, "")}/api/connectors/meta/callback`;
}

/**
 * Resolve the public app origin. Prefer an explicit env URL (canonical, matches
 * what is whitelisted in the FB app) and fall back to the request headers.
 */
export function getAppOriginFromRequest(request: Request): string {
    const envUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
    if (envUrl) return envUrl.replace(/\/$/, "");
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
    return `${proto}://${host}`;
}

export function buildMetaAuthUrl(params: {
    redirectUri: string;
    state: string;
}): string {
    const { appId } = getMetaAppConfig();
    const url = new URL(OAUTH_DIALOG);
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("state", params.state);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", META_SCOPES.join(","));
    return url.toString();
}

async function graphGet<T>(path: string, searchParams: Record<string, string>): Promise<T> {
    const url = new URL(`${GRAPH_BASE}${path}`);
    for (const [k, v] of Object.entries(searchParams)) url.searchParams.set(k, v);
    const res = await fetch(url.toString(), { method: "GET" });
    const json = await res.json();
    if (!res.ok) {
        const message = json?.error?.message || `Graph API request failed (${res.status})`;
        throw new Error(message);
    }
    return json as T;
}

export interface MetaTokenResult {
    accessToken: string;
    /** Seconds until expiry, when provided by Graph. */
    expiresIn?: number;
}

/** Exchange an OAuth code for a short-lived user access token. */
export async function exchangeCodeForToken(
    code: string,
    redirectUri: string,
): Promise<MetaTokenResult> {
    const { appId, appSecret } = getMetaAppConfig();
    const json = await graphGet<{ access_token: string; expires_in?: number }>(
        "/oauth/access_token",
        {
            client_id: appId,
            client_secret: appSecret,
            redirect_uri: redirectUri,
            code,
        },
    );
    return { accessToken: json.access_token, expiresIn: json.expires_in };
}

/** Exchange a short-lived token for a long-lived (~60 day) user access token. */
export async function getLongLivedToken(shortToken: string): Promise<MetaTokenResult> {
    const { appId, appSecret } = getMetaAppConfig();
    const json = await graphGet<{ access_token: string; expires_in?: number }>(
        "/oauth/access_token",
        {
            grant_type: "fb_exchange_token",
            client_id: appId,
            client_secret: appSecret,
            fb_exchange_token: shortToken,
        },
    );
    return { accessToken: json.access_token, expiresIn: json.expires_in };
}

export interface MetaProfile {
    id: string;
    name?: string;
}

export async function getMeProfile(accessToken: string): Promise<MetaProfile> {
    return graphGet<MetaProfile>("/me", {
        fields: "id,name",
        access_token: accessToken,
    });
}

export interface MetaAdAccountRaw {
    id: string;
    account_id?: string;
    name?: string;
    account_status?: number;
    timezone_name?: string;
    currency?: string;
    business?: { id?: string; name?: string };
}

/** Fetch all ad accounts the connected user can access (handles pagination). */
export async function fetchAdAccounts(accessToken: string): Promise<MetaAdAccountRaw[]> {
    const fields = "account_id,name,account_status,timezone_name,currency,business{id,name}";
    const all: MetaAdAccountRaw[] = [];

    let json = await graphGet<{
        data: MetaAdAccountRaw[];
        paging?: { next?: string; cursors?: { after?: string } };
    }>("/me/adaccounts", {
        fields,
        limit: "200",
        access_token: accessToken,
    });
    all.push(...(json.data ?? []));

    // Follow cursor-based pagination, bounded to avoid runaway loops.
    let guard = 0;
    while (json.paging?.next && guard < 25) {
        guard += 1;
        const res = await fetch(json.paging.next, { method: "GET" });
        const next = await res.json();
        if (!res.ok) break;
        json = next;
        all.push(...(json.data ?? []));
    }

    return all;
}

const ACCOUNT_STATUS_LABELS: Record<number, string> = {
    1: "Active",
    2: "Disabled",
    3: "Unsettled",
    7: "Pending risk review",
    8: "Pending settlement",
    9: "In grace period",
    100: "Pending closure",
    101: "Closed",
    201: "Any active",
    202: "Any closed",
};

export function accountStatusLabel(status: number | null | undefined): string {
    if (status == null) return "Unknown";
    return ACCOUNT_STATUS_LABELS[status] ?? `Status ${status}`;
}
