import React from 'react';

import { useCheckout } from '@bigcommerce/checkout/contexts';
import { TranslatedString } from '@bigcommerce/checkout/locale';
import { Button, ButtonVariant } from '@bigcommerce/checkout/ui';

import { resolveCatalystCheckoutUrl } from '../checkout/catalystCheckoutBridge';

interface RedirectToStorefrontLoginProps {
    isDisabled: boolean;
    isLoading: boolean;
}

export const RedirectToStorefrontLogin: React.FC<RedirectToStorefrontLoginProps> = ({
    isDisabled,
    isLoading,
}) => {
    const { checkoutState: { data: { getConfig } } } = useCheckout();

    const config = getConfig();

    if (!config) {
        return null;
    }

    const { checkoutLink, loginLink } = config.links;

    const handleRedirect = () => {
        const redirectTo = resolveCatalystCheckoutUrl() || checkoutLink;

        return window.location.assign(`${loginLink}?redirectTo=${redirectTo}`);
    }

    return (
        <Button
            className="body-bold"
            disabled={isDisabled}
            id="checkout-customer-continue"
            isLoading={isLoading}
            onClick={handleRedirect}
            testId="customer-continue-button"
            variant={ButtonVariant.Primary}
        >
            <TranslatedString id="customer.sign_in_action" />
        </Button>
    );
};
