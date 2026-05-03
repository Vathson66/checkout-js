const CATALYST_PAYMENT_ONLY_PARAM = 'catalyst_payment_only';
const CATALYST_PAYMENT_ONLY_SESSION_KEY = 'catalyst_payment_only';
const CATALYST_RETURN_URL_PARAM = 'catalyst_return_url';
const CATALYST_RETURN_URL_SESSION_KEY = 'catalyst_checkout_return_url';
const CATALYST_CHECKOUT_URL_PARAM = 'catalyst_checkout_url';
const CATALYST_CHECKOUT_URL_SESSION_KEY = 'catalyst_checkout_url';
const CATALYST_CART_URL_PARAM = 'catalyst_cart_url';
const CATALYST_CART_URL_SESSION_KEY = 'catalyst_cart_url';
const CATALYST_EDIT_SOURCE = 'hosted-checkout-edit';

function parseBooleanLike(value: string | null): boolean | null {
    if (value === null) {
        return null;
    }

    const normalized = value.trim().toLowerCase();

    if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
        return true;
    }

    if (normalized === '0' || normalized === 'false' || normalized === 'no') {
        return false;
    }

    return null;
}

function readQueryValueWithSession(paramName: string, sessionKey: string): string | null {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const queryValue = new URLSearchParams(window.location.search).get(paramName)?.trim();

        if (queryValue) {
            window.sessionStorage.setItem(sessionKey, queryValue);

            return queryValue;
        }

        const sessionValue = window.sessionStorage.getItem(sessionKey)?.trim();

        return sessionValue || null;
    } catch {
        return null;
    }
}

function toRedirectUrl(url: string): URL | null {
    try {
        return new URL(url);
    } catch {
        try {
            return new URL(url, window.location.origin);
        } catch {
            return null;
        }
    }
}

function resolveCatalystRedirectUrl(paramName: string, sessionKey: string): URL | null {
    const candidate = readQueryValueWithSession(paramName, sessionKey);

    if (!candidate) {
        return null;
    }

    return toRedirectUrl(candidate);
}

function cacheCatalystBridgeUrls(): void {
    readQueryValueWithSession(CATALYST_RETURN_URL_PARAM, CATALYST_RETURN_URL_SESSION_KEY);
    readQueryValueWithSession(CATALYST_CHECKOUT_URL_PARAM, CATALYST_CHECKOUT_URL_SESSION_KEY);
    readQueryValueWithSession(CATALYST_CART_URL_PARAM, CATALYST_CART_URL_SESSION_KEY);
}

export function shouldUseCatalystPaymentOnlyMode(): boolean {
    if (typeof window === 'undefined') {
        return false;
    }

    try {
        cacheCatalystBridgeUrls();

        const queryValue = new URLSearchParams(window.location.search).get(CATALYST_PAYMENT_ONLY_PARAM);
        const parsedQueryValue = parseBooleanLike(queryValue);

        if (parsedQueryValue !== null) {
            window.sessionStorage.setItem(
                CATALYST_PAYMENT_ONLY_SESSION_KEY,
                parsedQueryValue ? '1' : '0',
            );

            return parsedQueryValue;
        }

        return window.sessionStorage.getItem(CATALYST_PAYMENT_ONLY_SESSION_KEY) === '1';
    } catch {
        return false;
    }
}

export function resolveCatalystCheckoutEditUrl(editTarget?: string): string | null {
    const target = resolveCatalystRedirectUrl(
        CATALYST_CHECKOUT_URL_PARAM,
        CATALYST_CHECKOUT_URL_SESSION_KEY,
    );

    if (!target) {
        return null;
    }

    if (editTarget) {
        target.searchParams.set('edit', editTarget);
    }

    if (!target.searchParams.has('source')) {
        target.searchParams.set('source', CATALYST_EDIT_SOURCE);
    }

    return target.toString();
}

export function resolveCatalystCartEditUrl(): string | null {
    const target = resolveCatalystRedirectUrl(CATALYST_CART_URL_PARAM, CATALYST_CART_URL_SESSION_KEY);

    if (!target) {
        return null;
    }

    if (!target.searchParams.has('source')) {
        target.searchParams.set('source', CATALYST_EDIT_SOURCE);
    }

    return target.toString();
}
