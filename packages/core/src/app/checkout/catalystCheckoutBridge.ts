const CATALYST_PAYMENT_ONLY_PARAM = 'catalyst_payment_only';
const CATALYST_PAYMENT_ONLY_SESSION_KEY = 'catalyst_payment_only';
const CATALYST_PAYMENT_METHOD_ID_PARAM = 'catalyst_payment_method_id';
const CATALYST_PAYMENT_METHOD_ID_SESSION_KEY = 'catalyst_payment_method_id';
const CATALYST_PAYMENT_GATEWAY_ID_PARAM = 'catalyst_payment_gateway_id';
const CATALYST_PAYMENT_GATEWAY_ID_SESSION_KEY = 'catalyst_payment_gateway_id';
const CATALYST_PAYMENT_METHOD_TYPE_PARAM = 'catalyst_payment_method_type';
const CATALYST_PAYMENT_METHOD_TYPE_SESSION_KEY = 'catalyst_payment_method_type';
const CATALYST_RETURN_URL_PARAM = 'catalyst_return_url';
const CATALYST_RETURN_URL_SESSION_KEY = 'catalyst_checkout_return_url';
const CATALYST_CHECKOUT_URL_PARAM = 'catalyst_checkout_url';
const CATALYST_CHECKOUT_URL_SESSION_KEY = 'catalyst_checkout_url';
const CATALYST_CART_URL_PARAM = 'catalyst_cart_url';
const CATALYST_CART_URL_SESSION_KEY = 'catalyst_cart_url';
const CATALYST_EDIT_SOURCE = 'hosted-checkout-edit';

export interface CatalystPaymentSelection {
    gatewayId?: string;
    methodId?: string;
    methodType?: string;
}

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
        if (typeof window === 'undefined') {
            return null;
        }

        try {
            return new URL(url, window.location.origin);
        } catch {
            return null;
        }
    }
}

function stripTrailingSlash(pathname: string): string {
    if (pathname === '/') {
        return '/';
    }

    return pathname.replace(/\/+$/, '') || '/';
}

function resolveStorefrontPath(pathname: string): string {
    const normalizedPath = stripTrailingSlash(pathname);
    const withoutCheckout = normalizedPath.replace(/\/checkout(?:\/.*)?$/, '');

    if (withoutCheckout !== normalizedPath) {
        return withoutCheckout || '/';
    }

    const withoutCart = normalizedPath.replace(/\/cart(?:\/.*)?$/, '');

    if (withoutCart !== normalizedPath) {
        return withoutCart || '/';
    }

    return '/';
}

function resolveCatalystRedirectUrl(paramName: string, sessionKey: string): URL | null {
    const candidate = readQueryValueWithSession(paramName, sessionKey);

    if (!candidate) {
        return null;
    }

    return toRedirectUrl(candidate);
}

function resolveCatalystStorefrontTarget(): URL | null {
    const target =
        resolveCatalystRedirectUrl(CATALYST_CHECKOUT_URL_PARAM, CATALYST_CHECKOUT_URL_SESSION_KEY) ||
        resolveCatalystRedirectUrl(CATALYST_CART_URL_PARAM, CATALYST_CART_URL_SESSION_KEY) ||
        resolveCatalystRedirectUrl(CATALYST_RETURN_URL_PARAM, CATALYST_RETURN_URL_SESSION_KEY);

    if (!target) {
        return null;
    }

    target.pathname = resolveStorefrontPath(target.pathname);
    target.search = '';
    target.hash = '';

    return target;
}

function cacheCatalystBridgeUrls(): void {
    readQueryValueWithSession(CATALYST_RETURN_URL_PARAM, CATALYST_RETURN_URL_SESSION_KEY);
    readQueryValueWithSession(CATALYST_CHECKOUT_URL_PARAM, CATALYST_CHECKOUT_URL_SESSION_KEY);
    readQueryValueWithSession(CATALYST_CART_URL_PARAM, CATALYST_CART_URL_SESSION_KEY);
    readQueryValueWithSession(CATALYST_PAYMENT_METHOD_ID_PARAM, CATALYST_PAYMENT_METHOD_ID_SESSION_KEY);
    readQueryValueWithSession(CATALYST_PAYMENT_GATEWAY_ID_PARAM, CATALYST_PAYMENT_GATEWAY_ID_SESSION_KEY);
    readQueryValueWithSession(
        CATALYST_PAYMENT_METHOD_TYPE_PARAM,
        CATALYST_PAYMENT_METHOD_TYPE_SESSION_KEY,
    );
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

export function resolveCatalystPaymentSelection(): CatalystPaymentSelection | null {
    const methodId = readQueryValueWithSession(
        CATALYST_PAYMENT_METHOD_ID_PARAM,
        CATALYST_PAYMENT_METHOD_ID_SESSION_KEY,
    );
    const gatewayId = readQueryValueWithSession(
        CATALYST_PAYMENT_GATEWAY_ID_PARAM,
        CATALYST_PAYMENT_GATEWAY_ID_SESSION_KEY,
    );
    const methodType = readQueryValueWithSession(
        CATALYST_PAYMENT_METHOD_TYPE_PARAM,
        CATALYST_PAYMENT_METHOD_TYPE_SESSION_KEY,
    );

    if (!methodId && !gatewayId && !methodType) {
        return null;
    }

    return {
        gatewayId: gatewayId || undefined,
        methodId: methodId || undefined,
        methodType: methodType || undefined,
    };
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

export function resolveCatalystCheckoutUrl(): string | null {
    const target = resolveCatalystRedirectUrl(
        CATALYST_CHECKOUT_URL_PARAM,
        CATALYST_CHECKOUT_URL_SESSION_KEY,
    );

    return target ? target.toString() : null;
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

export function resolveCatalystStorefrontUrl(fallbackUrl = '/'): string {
    const target = resolveCatalystStorefrontTarget();

    if (target) {
        return target.toString();
    }

    return fallbackUrl || '/';
}

export function resolveCatalystStorefrontOrigin(fallbackOrigin = ''): string {
    const target = resolveCatalystStorefrontTarget();

    if (target) {
        return target.origin;
    }

    if (!fallbackOrigin) {
        return '';
    }

    const fallbackTarget = toRedirectUrl(fallbackOrigin);

    return fallbackTarget ? fallbackTarget.origin : fallbackOrigin;
}
