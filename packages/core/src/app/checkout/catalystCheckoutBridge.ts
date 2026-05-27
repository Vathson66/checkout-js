const CATALYST_HANDOFF_TOKEN_PARAM = 'catalyst_handoff';
const CATALYST_HANDOFF_TOKEN_SESSION_KEY = 'catalyst_handoff';
const CATALYST_BRIDGE_STATE_SESSION_KEY = 'catalyst_checkout_bridge_state';
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
const CATALYST_HANDOFF_VERSION = 1;

export interface CatalystPaymentSelection {
    gatewayId?: string;
    methodId?: string;
    methodType?: string;
}

interface CatalystCheckoutBridgeState {
    cartUrl?: string;
    checkoutUrl?: string;
    paymentOnly: boolean;
    paymentSelection?: CatalystPaymentSelection;
    returnUrl?: string;
}

interface CatalystCheckoutHandoffPayload {
    version: number;
    paymentOnly?: boolean;
    returnUrl?: string;
    checkoutUrl?: string;
    cartUrl?: string;
    paymentMethodId?: string;
    paymentGatewayId?: string;
    paymentMethodType?: string;
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

function resolveCatalystRedirectUrl(url?: string | null): URL | null {
    if (!url) {
        return null;
    }

    return toRedirectUrl(url);
}

function isString(value: unknown): value is string {
    return typeof value === 'string' && value.trim() !== '';
}

function decodeBase64Url(value: string): string | null {
    try {
        const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
        const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));

        return window.atob(`${normalized}${padding}`);
    } catch {
        return null;
    }
}

function parseCatalystCheckoutHandoffPayload(
    token: string,
): CatalystCheckoutHandoffPayload | null {
    if (typeof window === 'undefined') {
        return null;
    }

    const [encodedPayload] = token.split('.');

    if (!encodedPayload) {
        return null;
    }

    const decodedPayload = decodeBase64Url(encodedPayload);

    if (!decodedPayload) {
        return null;
    }

    try {
        const parsed = JSON.parse(decodedPayload) as Partial<CatalystCheckoutHandoffPayload>;

        if (parsed.version !== CATALYST_HANDOFF_VERSION) {
            return null;
        }

        return parsed as CatalystCheckoutHandoffPayload;
    } catch {
        return null;
    }
}

function normalizeBridgeState(
    payload: CatalystCheckoutHandoffPayload,
): CatalystCheckoutBridgeState | null {
    const paymentOnly = Boolean(payload.paymentOnly);
    const paymentMethodId = isString(payload.paymentMethodId)
        ? payload.paymentMethodId.trim()
        : undefined;
    const paymentGatewayId = isString(payload.paymentGatewayId)
        ? payload.paymentGatewayId.trim()
        : undefined;
    const paymentMethodType = isString(payload.paymentMethodType)
        ? payload.paymentMethodType.trim()
        : undefined;
    const returnUrl = isString(payload.returnUrl) ? payload.returnUrl.trim() : undefined;
    const checkoutUrl = isString(payload.checkoutUrl) ? payload.checkoutUrl.trim() : undefined;
    const cartUrl = isString(payload.cartUrl) ? payload.cartUrl.trim() : undefined;

    if (!paymentOnly && !returnUrl && !checkoutUrl && !cartUrl && !paymentMethodId && !paymentGatewayId && !paymentMethodType) {
        return null;
    }

    return {
        paymentOnly,
        returnUrl,
        checkoutUrl,
        cartUrl,
        paymentSelection:
            paymentMethodId || paymentGatewayId || paymentMethodType
                ? {
                    methodId: paymentMethodId,
                    gatewayId: paymentGatewayId,
                    methodType: paymentMethodType,
                }
                : undefined,
    };
}

function readCachedBridgeState(): CatalystCheckoutBridgeState | null {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const raw = window.sessionStorage.getItem(CATALYST_BRIDGE_STATE_SESSION_KEY);

        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw) as Partial<CatalystCheckoutBridgeState>;

        return {
            paymentOnly: Boolean(parsed.paymentOnly),
            returnUrl: isString(parsed.returnUrl) ? parsed.returnUrl.trim() : undefined,
            checkoutUrl: isString(parsed.checkoutUrl) ? parsed.checkoutUrl.trim() : undefined,
            cartUrl: isString(parsed.cartUrl) ? parsed.cartUrl.trim() : undefined,
            paymentSelection: parsed.paymentSelection
                ? {
                    methodId: isString(parsed.paymentSelection.methodId)
                        ? parsed.paymentSelection.methodId.trim()
                        : undefined,
                    gatewayId: isString(parsed.paymentSelection.gatewayId)
                        ? parsed.paymentSelection.gatewayId.trim()
                        : undefined,
                    methodType: isString(parsed.paymentSelection.methodType)
                        ? parsed.paymentSelection.methodType.trim()
                        : undefined,
                }
                : undefined,
        };
    } catch {
        return null;
    }
}

function setSessionStorageValue(key: string, value?: string): void {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        if (isString(value)) {
            window.sessionStorage.setItem(key, value.trim());
        } else {
            window.sessionStorage.removeItem(key);
        }
    } catch {
        // Ignore session cache failures and continue with in-memory state.
    }
}

function cacheBridgeState(state: CatalystCheckoutBridgeState): CatalystCheckoutBridgeState {
    if (typeof window !== 'undefined') {
        try {
            window.sessionStorage.setItem(
                CATALYST_BRIDGE_STATE_SESSION_KEY,
                JSON.stringify(state),
            );

            if (state.paymentOnly) {
                window.sessionStorage.setItem(CATALYST_PAYMENT_ONLY_SESSION_KEY, '1');
            } else {
                window.sessionStorage.removeItem(CATALYST_PAYMENT_ONLY_SESSION_KEY);
            }

            setSessionStorageValue(CATALYST_RETURN_URL_SESSION_KEY, state.returnUrl);
            setSessionStorageValue(CATALYST_CHECKOUT_URL_SESSION_KEY, state.checkoutUrl);
            setSessionStorageValue(CATALYST_CART_URL_SESSION_KEY, state.cartUrl);
            setSessionStorageValue(
                CATALYST_PAYMENT_METHOD_ID_SESSION_KEY,
                state.paymentSelection?.methodId,
            );
            setSessionStorageValue(
                CATALYST_PAYMENT_GATEWAY_ID_SESSION_KEY,
                state.paymentSelection?.gatewayId,
            );
            setSessionStorageValue(
                CATALYST_PAYMENT_METHOD_TYPE_SESSION_KEY,
                state.paymentSelection?.methodType,
            );
        } catch {
            // Ignore session cache failures and continue with in-memory state.
        }
    }

    return state;
}

function readBridgeStateFromHandoffToken(): CatalystCheckoutBridgeState | null {
    const token = readQueryValueWithSession(
        CATALYST_HANDOFF_TOKEN_PARAM,
        CATALYST_HANDOFF_TOKEN_SESSION_KEY,
    );

    if (!token) {
        return null;
    }

    const payload = parseCatalystCheckoutHandoffPayload(token);

    if (!payload) {
        return null;
    }

    const state = normalizeBridgeState(payload);

    return state ? cacheBridgeState(state) : null;
}

function readLegacyBridgeState(): CatalystCheckoutBridgeState | null {
    const paymentOnly = parseBooleanLike(
        readQueryValueWithSession(CATALYST_PAYMENT_ONLY_PARAM, CATALYST_PAYMENT_ONLY_SESSION_KEY),
    );
    const returnUrl = readQueryValueWithSession(
        CATALYST_RETURN_URL_PARAM,
        CATALYST_RETURN_URL_SESSION_KEY,
    );
    const checkoutUrl = readQueryValueWithSession(
        CATALYST_CHECKOUT_URL_PARAM,
        CATALYST_CHECKOUT_URL_SESSION_KEY,
    );
    const cartUrl = readQueryValueWithSession(CATALYST_CART_URL_PARAM, CATALYST_CART_URL_SESSION_KEY);
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

    if (
        paymentOnly === null &&
        !returnUrl &&
        !checkoutUrl &&
        !cartUrl &&
        !methodId &&
        !gatewayId &&
        !methodType
    ) {
        return null;
    }

    return cacheBridgeState({
        paymentOnly: paymentOnly === true,
        returnUrl: returnUrl || undefined,
        checkoutUrl: checkoutUrl || undefined,
        cartUrl: cartUrl || undefined,
        paymentSelection:
            methodId || gatewayId || methodType
                ? {
                    methodId: methodId || undefined,
                    gatewayId: gatewayId || undefined,
                    methodType: methodType || undefined,
                }
                : undefined,
    });
}

function readCatalystBridgeState(): CatalystCheckoutBridgeState | null {
    return (
        readBridgeStateFromHandoffToken() ||
        readCachedBridgeState() ||
        readLegacyBridgeState()
    );
}

function resolveCatalystStorefrontTarget(): URL | null {
    const state = readCatalystBridgeState();
    const target =
        resolveCatalystRedirectUrl(state?.checkoutUrl) ||
        resolveCatalystRedirectUrl(state?.cartUrl) ||
        resolveCatalystRedirectUrl(state?.returnUrl);

    if (!target) {
        return null;
    }

    target.pathname = resolveStorefrontPath(target.pathname);
    target.search = '';
    target.hash = '';

    return target;
}

export function shouldUseCatalystPaymentOnlyMode(): boolean {
    const state = readCatalystBridgeState();

    return Boolean(state?.paymentOnly);
}

export function resolveCatalystPaymentSelection(): CatalystPaymentSelection | null {
    const selection = readCatalystBridgeState()?.paymentSelection;

    if (!selection?.methodId && !selection?.gatewayId && !selection?.methodType) {
        return null;
    }

    return selection;
}

export function resolveCatalystCheckoutEditUrl(editTarget?: string): string | null {
    const target = resolveCatalystRedirectUrl(readCatalystBridgeState()?.checkoutUrl);

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
    const target = resolveCatalystRedirectUrl(readCatalystBridgeState()?.checkoutUrl);

    return target ? target.toString() : null;
}

export function resolveCatalystCartEditUrl(): string | null {
    const target = resolveCatalystRedirectUrl(readCatalystBridgeState()?.cartUrl);

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
