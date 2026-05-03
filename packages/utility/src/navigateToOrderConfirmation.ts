import { noop } from 'lodash';

import isBuyNowCart from './isBuyNowCart';

const CATALYST_RETURN_URL_PARAM = 'catalyst_return_url';
const CATALYST_RETURN_URL_SESSION_KEY = 'catalyst_checkout_return_url';

function readCatalystReturnUrl(): string | null {
    try {
        const queryValue = new URLSearchParams(window.location.search).get(CATALYST_RETURN_URL_PARAM);

        if (queryValue) {
            window.sessionStorage.setItem(CATALYST_RETURN_URL_SESSION_KEY, queryValue);

            return queryValue;
        }

        return window.sessionStorage.getItem(CATALYST_RETURN_URL_SESSION_KEY);
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

function resolveCatalystRedirectUrl(orderId?: number): string | null {
    const candidate = readCatalystReturnUrl();

    if (!candidate) {
        return null;
    }

    const target = toRedirectUrl(candidate);

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
