import { type Checkout, type ShopperCurrency, type StoreCurrency } from '@bigcommerce/checkout-sdk';
import React, { type FunctionComponent } from 'react';

import { withCheckout } from '../checkout';
import OrderSummary from '../order/OrderSummary';

import EditLink from './EditLink';
import mapToCartSummaryProps from './mapToCartSummaryProps';
import { type RedeemableProps } from './Redeemable';
import withRedeemable from './withRedeemable';
import { useCapabilities } from '@bigcommerce/checkout/contexts';
import { hideEditCartLink } from '@bigcommerce/checkout/utility';
import {
    resolveCatalystCartEditUrl,
    shouldUseCatalystPaymentOnlyMode,
} from '../checkout/catalystCheckoutBridge';

export type WithCheckoutCartSummaryProps = {
    checkout: Checkout;
    cartUrl: string;
    storeCurrency: StoreCurrency;
    shopperCurrency: ShopperCurrency;
    storeCreditAmount?: number;
    isBuyNowCart: boolean;
    isShippingDiscountDisplayEnabled: boolean;
} & RedeemableProps;

const CartSummary: FunctionComponent<
    WithCheckoutCartSummaryProps & {
        isMultiShippingMode: boolean;
    }
    > = ({ cartUrl, isMultiShippingMode, isBuyNowCart, ...props }) => {
    const { userJourney: { disableEditCart } } = useCapabilities();
    const isCatalystPaymentOnlyMode = shouldUseCatalystPaymentOnlyMode();
    const catalystCartUrl = isCatalystPaymentOnlyMode ? resolveCatalystCartEditUrl() : null;
    const editCartUrl = catalystCartUrl || cartUrl;

    const headerLink = hideEditCartLink(isBuyNowCart, disableEditCart) ? null : (
        <EditLink
            isMultiShippingMode={isMultiShippingMode}
            url={editCartUrl}
        />
    );

    return withRedeemable(OrderSummary)({
        ...props,
        cartUrl,
        isBuyNowCart,
        headerLink,
    });
};

export default withCheckout(mapToCartSummaryProps)(CartSummary);
