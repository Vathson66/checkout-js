const APPLE_PAY = 'applepay';
const GOOGLE_PAY = 'googlepay';
const PAYPAL = 'paypal';
type CatalystExpressMethodType = 'applepay' | 'googlepay' | 'paypal';

// TODO: The API should tell UI which payment method offers its own checkout button
export const SUPPORTED_METHODS: string[] = [
    'amazonpay',
    APPLE_PAY,
    'chasepay',
    'bigcommerce_payments',
    'bigcommerce_payments_paylater',
    'bigcommerce_payments_venmo',
    'braintreevisacheckout',
    'braintreepaypal',
    'braintreepaypalcredit',
    'paypalcommerce',
    'paypalcommercevenmo',
    'paypalcommercecredit',
    'googlepayadyenv2',
    'googlepayadyenv3',
    'googlepayauthorizenet',
    'googlepaybnz',
    'googlepaybraintree',
    'googlepaycheckoutcom',
    'googlepaycybersourcev2',
    'googlepayorbital',
    'googlepaystripe',
    'googlepaystripeupe',
    'googlepayworldpayaccess',
    'googlepaypaypalcommerce',
    'googlepaytdonlinemart',
    'stripeocs',
    'googlepaystripeocs',
    'googlepay_bigcommerce_payments',
];

export const getSupportedMethodIds = (methodIds: string[]): string[] => {
    return methodIds.filter((methodId) => SUPPORTED_METHODS.includes(methodId));
}

export function isCatalystExpressMethodType(methodType?: string): methodType is CatalystExpressMethodType {
    return methodType === APPLE_PAY || methodType === GOOGLE_PAY || methodType === PAYPAL;
}

function getExpressGroup(methodId: string): CatalystExpressMethodType | null {
    if (methodId === APPLE_PAY) {
        return APPLE_PAY;
    }

    if (methodId.startsWith(GOOGLE_PAY)) {
        return GOOGLE_PAY;
    }

    if (methodId.includes(PAYPAL)) {
        return PAYPAL;
    }

    return null;
}

function getExpressSortWeight(methodId: string): number {
    if (methodId === APPLE_PAY) {
        return 10;
    }

    if (methodId.startsWith(GOOGLE_PAY)) {
        return 20;
    }

    if (methodId === 'paypalcommerce' || methodId === 'braintreepaypal') {
        return 30;
    }

    if (methodId.includes(PAYPAL) && !methodId.includes('credit') && !methodId.includes('venmo')) {
        return 40;
    }

    if (methodId.includes(PAYPAL) && methodId.includes('credit')) {
        return 50;
    }

    if (methodId.includes(PAYPAL)) {
        return 60;
    }

    return 100;
}

export function getCatalystExpressMethodIds(
    methodIds: string[],
    preferredMethodType?: string,
): string[] {
    const supportedMethodIds = getSupportedMethodIds(methodIds).sort(
        (left, right) => getExpressSortWeight(left) - getExpressSortWeight(right),
    );
    const groupedMethods = new Map<CatalystExpressMethodType, string>();

    supportedMethodIds.forEach((methodId) => {
        const group = getExpressGroup(methodId);

        if (!group || groupedMethods.has(group)) {
            return;
        }

        groupedMethods.set(group, methodId);
    });

    const defaultGroups: CatalystExpressMethodType[] = [APPLE_PAY, GOOGLE_PAY, PAYPAL];
    const preferredGroups: CatalystExpressMethodType[] = isCatalystExpressMethodType(preferredMethodType)
        ? [preferredMethodType, ...defaultGroups.filter((group) => group !== preferredMethodType)]
        : defaultGroups;

    return preferredGroups
        .map((group) => groupedMethods.get(group))
        .filter((methodId): methodId is string => Boolean(methodId));
}
