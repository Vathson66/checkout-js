import { type CheckoutService, createCheckoutService } from '@bigcommerce/checkout-sdk';
import React from 'react';

import { CheckoutProvider } from '@bigcommerce/checkout/contexts';
import { render } from '@bigcommerce/checkout/test-utils';

import { getCheckout } from '../checkout/checkouts.mock';
import { getStoreConfig } from '../config/config.mock';

import PaymentRedeemables from './PaymentRedeemables';

describe('PaymentRedeemables', () => {
  let checkoutService: CheckoutService;

  beforeEach(() => {
    checkoutService = createCheckoutService();

    jest.spyOn(checkoutService.getState().data, 'getConfig').mockReturnValue(getStoreConfig());
    jest.spyOn(checkoutService.getState().data, 'getCheckout').mockReturnValue(getCheckout());
  });

  it('does not render the final payment redeemable entry', () => {
    const { container } = render(
      <CheckoutProvider checkoutService={checkoutService}>
        <PaymentRedeemables />
      </CheckoutProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
