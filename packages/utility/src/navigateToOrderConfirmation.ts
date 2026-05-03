import { noop } from 'lodash';

import isBuyNowCart from './isBuyNowCart';

const CATALYST_RETURN_URL_PARAM = 'catalyst_return_url';
const CATALYST_RETURN_URL_SESSION_KEY = 'catalyst_checkout_return_url';
const CATALYST_CHECKOUT_URL_PARAM = 'catalyst_checkout_url';
const CATALYST_CHECKOUT_URL_SESSION_KEY = 'catalyst_checkout_url';

function readQueryValueWithSession(paramName: string, sessionKey: string): string | null {
    try {
        const queryValue = new URLSearchParams(window.location.search).get(paramName);

        if (queryValue) {
            window.sessionStorage.setItem(sessionKey, queryValue);

            return queryValue;
        }

        return window.sessionStorage.getItem(sessionKey);
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

function resolveCatalystReturnTarget(): URL | null {
    const returnUrlCandidate = readQueryValueWithSession(
        CATALYST_RETURN_URL_PARAM,
        CATALYST_RETURN_URL_SESSION_KEY,
    );

    if (returnUrlCandidate) {
        return toRedirectUrl(returnUrlCandidate);
    }

    const checkoutUrlCandidate = readQueryValueWithSession(
        CATALYST_CHECKOUT_URL_PARAM,
        CATALYST_CHECKOUT_URL_SESSION_KEY,
    );

    if (!checkoutUrlCandidate) {
        return null;
    }

    const checkoutTarget = toRedirectUrl(checkoutUrlCandidate);

    if (!checkoutTarget) {
        return null;
    }

    const normalizedPath = checkoutTarget.pathname.replace(/\/$/, '');

    checkoutTarget.pathname = normalizedPath.endsWith('/checkout')
        ? `${normalizedPath}/order-confirmation`
        : `${normalizedPath}/checkout/order-confirmation`;
    checkoutTarget.search = '';
    checkoutTarget.hash = '';

    return checkoutTarget;
}

function resolveCatalystRedirectUrl(orderId?: number): string | null {
    const target = resolveCatalystReturnTarget();

    if (!target) {
        return null;
    }

    if (!target.searchParams.has('source')) {
        target.searchParams.set('source', 'hosted-checkout');
    }

    if (orderId !== undefined && !target.searchParams.has('orderId')) {
        target.searchParams.set('orderId', orderId.toString());
    }

    try {
        window.sessionStorage.removeItem(CATALYST_RETURN_URL_SESSION_KEY);
        window.sessionStorage.removeItem(CATALYST_CHECKOUT_URL_SESSION_KEY);
    } catch {
        // no-op
    }

    return target.toString();
}

export default function navigateToOrderConfirmation(orderId?: number): Promise<never> {
    const catalystRedirectUrl = resolveCatalystRedirectUrl(orderId);

    if (catalystRedirectUrl) {
        window.location.replace(catalystRedirectUrl);

        return new Promise(noop);
    }

    let url: string;

    if (orderId && isBuyNowCart()) {
        url = `/checkout/order-confirmation/${orderId.toString()}`;
    } else {
        url = `${window.location.pathname.replace(/\/$/, '')}/order-confirmation`;
    }

    window.location.replace(url);

    return new Promise(noop);
}
