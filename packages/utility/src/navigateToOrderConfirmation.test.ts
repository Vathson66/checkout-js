import navigateToOrderConfirmation from './navigateToOrderConfirmation';

describe('navigateToOrderConfirmation', () => {
    beforeEach(() => {
        window.sessionStorage.clear();

        Object.defineProperty(window, 'location', {
            value: {
                href: 'https://store.com/checkout',
                origin: 'https://store.com',
                pathname: '/checkout',
                search: '',
                replace: jest.fn(),
            },
            writable: true,
        });
    });

    it('navigates to order confirmation page based on its current path', () => {
        void navigateToOrderConfirmation();

        expect(window.location.replace).toHaveBeenCalledWith('/checkout/order-confirmation');
    });

    it('navigates to order confirmation page with orderId in the URL when it is a buy now cart checkout', () => {
        window.location.search = '?action=buy&products=123:1';

        void navigateToOrderConfirmation(100);

        expect(window.location.replace).toHaveBeenCalledWith('/checkout/order-confirmation/100');
    });

    it('discards any query params when navigating to order confirmation page', () => {
        window.location.href = 'https://store.com/embedded-checkout?setCurrencyId=1';
        window.location.pathname = '/embedded-checkout';

        void navigateToOrderConfirmation();

        expect(window.location.replace).toHaveBeenCalledWith(
            '/embedded-checkout/order-confirmation',
        );
    });

    it('redirects to Catalyst return URL when the custom query param is present', () => {
        window.location.search =
            '?catalyst_return_url=https%3A%2F%2Fcatalyst.example%2Fcheckout%2Forder-confirmation%3Fcurrency%3DUSD';

        void navigateToOrderConfirmation(123);

        expect(window.location.replace).toHaveBeenCalledWith(
            'https://catalyst.example/checkout/order-confirmation?currency=USD&source=hosted-checkout&orderId=123',
        );
    });

    it('uses stored Catalyst return URL when query param is no longer present', () => {
        window.sessionStorage.setItem(
            'catalyst_checkout_return_url',
            'https://catalyst.example/checkout/order-confirmation',
        );

        void navigateToOrderConfirmation(456);

        expect(window.location.replace).toHaveBeenCalledWith(
            'https://catalyst.example/checkout/order-confirmation?source=hosted-checkout&orderId=456',
        );
    });
});
