import {
    type Address,
    type Cart,
    type CheckoutParams,
    type CheckoutSelectors,
    type CheckoutStoreSelector,
    type Consignment,
    type EmbeddedCheckoutMessenger,
    type EmbeddedCheckoutMessengerOptions,
    type FlashMessage,
    type PaymentMethod,
    type Promotion,
    type RequestOptions,
} from '@bigcommerce/checkout-sdk/essential';
import classNames from 'classnames';
import { find, findIndex } from 'lodash';
import React, {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { type AnalyticsContextProps, type ExtensionContextProps, useCapabilities, withExtension } from '@bigcommerce/checkout/contexts';
import { type ErrorLogger } from '@bigcommerce/checkout/error-handling-utils';
import { withLanguage, type WithLanguageProps } from '@bigcommerce/checkout/locale';
import { OrderConfirmationPageSkeleton } from '@bigcommerce/checkout/ui';
import { navigateToOrderConfirmation as navigateToOrderConfirmationUtility } from '@bigcommerce/checkout/utility';

import { withAnalytics } from '../analytics';
import { getAddressContent } from '../address/SingleLineStaticAddress';
import { EmptyCartMessage } from '../cart';
import { withCheckout } from '../checkout';
import { CustomError, ErrorModal, isCustomError, isErrorWithType } from '../common/error';
import {
    type CustomerSignOutEvent,
    CustomerViewType,
} from '../customer';
import { getSupportedMethodIds } from '../customer/getSupportedMethods';
import { SubscribeSessionStorage } from '../customer/SubscribeSessionStorage';
import { type EmbeddedCheckoutStylesheet, isEmbedded } from '../embeddedCheckout';
import { hasSelectedShippingOptions, isUsingMultiShipping } from '../shipping';
import { ShippingOptionExpiredError } from '../shipping/shippingOption';

import type CheckoutStepStatus from './CheckoutStepStatus';
import CheckoutStepType from './CheckoutStepType';
import type CheckoutSupport from './CheckoutSupport';
import { BillingStep, CartSummary, CheckoutHeader, CustomerStep, PaymentStep, ShippingStep } from './components';
import {
    resolveCatalystCartEditUrl,
    resolveCatalystCheckoutEditUrl,
    resolveCatalystStorefrontOrigin,
    resolveCatalystStorefrontUrl,
    shouldUseCatalystPaymentOnlyMode,
} from './catalystCheckoutBridge';
import { mapCheckoutComponentErrorMessage } from './mapErrorMessage';
import mapToCheckoutProps from './mapToCheckoutProps';
import useB2BToken from './hooks/useB2BToken';

function mapCheckoutStepToCatalystEditTarget(type: CheckoutStepType): string {
    switch (type) {
        case CheckoutStepType.Customer:
            return 'customer';

        case CheckoutStepType.Shipping:
            return 'shipping';

        case CheckoutStepType.Billing:
            return 'billing';

        case CheckoutStepType.Payment:
            return 'payment';

        default:
            return 'checkout';
    }
}

function shouldRenderCatalystSingleStepPayment(
    steps: CheckoutStepStatus[],
    isCatalystPaymentOnlyMode: boolean,
): boolean {
    if (!isCatalystPaymentOnlyMode) {
        return false;
    }

    const paymentStep = steps.find((step) => step.type === CheckoutStepType.Payment);

    if (!paymentStep) {
        return false;
    }

    return steps
        .filter((step) => step.type !== CheckoutStepType.Payment && step.isRequired)
        .every((step) => step.isComplete);
}

function getCatalystAddressSummary(address?: Address): string {
    if (!address) {
        return 'Saved in Catalyst';
    }

    return (
        getAddressContent(address) ||
        [address.address1, address.city, address.stateOrProvince, address.postalCode]
            .filter(Boolean)
            .join(', ') ||
        'Saved in Catalyst'
    );
}

function getCatalystShippingSummary(consignments?: Consignment[]): string {
    const selectedConsignment = consignments?.find((consignment) => consignment.selectedShippingOption);
    const selectedShippingOption = selectedConsignment?.selectedShippingOption;

    return selectedShippingOption?.description || selectedShippingOption?.id || 'Delivery selected';
}

interface CatalystPaymentReviewProps {
    billingAddress?: Address;
    contactEmail?: string;
    consignments?: Consignment[];
    steps: CheckoutStepStatus[];
}

interface CatalystHostedHeaderProps {
    cartUrl: string;
    storefrontUrl: string;
    storeName: string;
}

const CatalystHostedHeader = ({
    cartUrl,
    storefrontUrl,
    storeName,
}: CatalystHostedHeaderProps): ReactElement => (
    <header className="catalyst-checkout-shell-header" data-test="catalyst-checkout-shell-header">
        <div className="catalyst-checkout-shell-headerInner">
            <a className="catalyst-checkout-shell-brand" href={storefrontUrl}>
                {storeName}
            </a>

            <nav aria-label="Storefront shortcuts" className="catalyst-checkout-shell-nav">
                <a className="catalyst-checkout-shell-link" href={storefrontUrl}>
                    Continue shopping
                </a>
                <a className="catalyst-checkout-shell-link" href={cartUrl}>
                    Edit cart
                </a>
            </nav>
        </div>
    </header>
);

const CatalystPaymentReview = ({
    billingAddress,
    contactEmail,
    consignments,
    steps,
}: CatalystPaymentReviewProps): ReactElement => {
    const customerStep = steps.find((step) => step.type === CheckoutStepType.Customer);
    const shippingStep = steps.find((step) => step.type === CheckoutStepType.Shipping);
    const billingStep = steps.find((step) => step.type === CheckoutStepType.Billing);
    const paymentStep = steps.find((step) => step.type === CheckoutStepType.Payment);
    const isCustomerComplete = customerStep?.isComplete ?? Boolean(contactEmail);
    const isShippingComplete = shippingStep?.isComplete ?? Boolean(
        consignments?.some((consignment) => consignment.selectedShippingOption),
    );
    const isBillingComplete =
        billingStep?.isComplete ??
        Boolean(billingAddress && getCatalystAddressSummary(billingAddress) !== 'Saved in Catalyst');
    const isPaymentComplete = paymentStep?.isComplete ?? false;
    const shippingAddress = consignments?.[0]?.shippingAddress;
    const contactEditUrl = resolveCatalystCheckoutEditUrl('customer');
    const deliveryEditUrl = resolveCatalystCheckoutEditUrl('shipping');
    const billingEditUrl = resolveCatalystCheckoutEditUrl('billing');
    const renderEditLink = (url: string | null, label: string) =>
        url ? (
            <a className="catalyst-payment-review-edit" href={url}>
                {label}
            </a>
        ) : null;

    return (
        <section className="catalyst-payment-review" data-test="catalyst-payment-review">
            <h1 className="catalyst-payment-review-heading">Delivery & billing</h1>

            <div className="catalyst-payment-review-panel">
                <div className="catalyst-payment-progress" aria-label="Checkout progress">
                    <span
                        className={classNames('catalyst-payment-progress-step', {
                            'is-complete': isCustomerComplete,
                            'is-current': !isCustomerComplete,
                        })}
                        data-step="1"
                    >
                        Contact
                    </span>
                    <span
                        className={classNames('catalyst-payment-progress-line', {
                            'is-complete': isCustomerComplete && isShippingComplete,
                        })}
                    />
                    <span
                        className={classNames('catalyst-payment-progress-step', {
                            'is-complete': isShippingComplete && isBillingComplete,
                            'is-current': !isShippingComplete || !isBillingComplete,
                        })}
                        data-step="2"
                    >
                        Delivery
                    </span>
                    <span
                        className={classNames('catalyst-payment-progress-line', {
                            'is-complete': isPaymentComplete,
                        })}
                    />
                    <span
                        className={classNames('catalyst-payment-progress-step', {
                            'is-complete': isPaymentComplete,
                            'is-current': !isPaymentComplete,
                        })}
                        data-step="3"
                    >
                        Payment
                    </span>
                </div>

                <div className="catalyst-payment-review-grid">
                    <section className="catalyst-payment-review-cell">
                        <div className="catalyst-payment-review-cellHeader">
                            <span>Contact</span>
                            <span
                                className={classNames('catalyst-payment-review-badge', {
                                    'is-complete': isCustomerComplete,
                                })}
                            >
                                {isCustomerComplete ? 'Completed' : 'Pending'}
                            </span>
                        </div>
                        <p>{contactEmail || 'Contact saved'}</p>
                        {renderEditLink(contactEditUrl, 'Edit')}
                    </section>

                    <section className="catalyst-payment-review-cell">
                        <div className="catalyst-payment-review-cellHeader">
                            <span>Delivery</span>
                            <span
                                className={classNames('catalyst-payment-review-badge', {
                                    'is-complete': isShippingComplete,
                                })}
                            >
                                {isShippingComplete ? 'Completed' : 'Pending'}
                            </span>
                        </div>
                        <p>
                            {getCatalystAddressSummary(shippingAddress)}
                            <span>{getCatalystShippingSummary(consignments)}</span>
                        </p>
                        {renderEditLink(deliveryEditUrl, 'Edit')}
                    </section>

                    <section className="catalyst-payment-review-cell">
                        <div className="catalyst-payment-review-cellHeader">
                            <span>Billing</span>
                            <span
                                className={classNames('catalyst-payment-review-badge', {
                                    'is-complete': isBillingComplete,
                                })}
                            >
                                {isBillingComplete ? 'Completed' : 'Pending'}
                            </span>
                        </div>
                        <p>{getCatalystAddressSummary(billingAddress)}</p>
                        {renderEditLink(billingEditUrl, 'Edit')}
                    </section>

                    <section className="catalyst-payment-review-cell">
                        <div className="catalyst-payment-review-cellHeader">
                            <span>Payment</span>
                            <span
                                className={classNames('catalyst-payment-review-badge', {
                                    'is-complete': isPaymentComplete,
                                })}
                            >
                                {isPaymentComplete ? 'Completed' : 'Pending'}
                            </span>
                        </div>
                        <p>
                            {isPaymentComplete
                                ? 'Payment details are confirmed.'
                                : 'Enter payment details to place your order.'}
                        </p>
                    </section>
                </div>
            </div>
        </section>
    );
};

export interface CheckoutProps {
    checkoutId: string;
    containerId: string;
    data?: CheckoutStoreSelector;
    embeddedStylesheet: EmbeddedCheckoutStylesheet;
    embeddedSupport: CheckoutSupport;
    errorLogger: ErrorLogger;
    themeV2?:boolean;
    createEmbeddedMessenger(options: EmbeddedCheckoutMessengerOptions): EmbeddedCheckoutMessenger;
}

export interface CheckoutState {
    activeStepType?: CheckoutStepType;
    isBillingSameAsShipping: boolean;
    customerViewType?: CustomerViewType;
    defaultStepType?: CheckoutStepType;
    error?: Error;
    flashMessages?: FlashMessage[];
    isMultiShippingMode: boolean;
    isCartEmpty: boolean;
    isRedirecting: boolean;
    hasSelectedShippingOptions: boolean;
    isSubscribed: boolean;
    buttonConfigs: PaymentMethod[];
}

export interface WithCheckoutProps {
    billingAddress?: Address;
    cart?: Cart;
    consignments?: Consignment[];
    data: CheckoutStoreSelector;
    error?: Error;
    hasCartChanged: boolean;
    flashMessages?: FlashMessage[];
    isGuestEnabled: boolean;
    isLoadingCheckout: boolean;
    isPending: boolean;
    isPriceHiddenFromGuests: boolean;
    isShowingWalletButtonsOnTop: boolean;
    isShippingDiscountDisplayEnabled: boolean;
    loginUrl: string;
    cartUrl: string;
    createAccountUrl: string;
    promotions?: Promotion[];
    steps: CheckoutStepStatus[];
    clearError(error?: Error): void;
    loadCheckout(id: string, options?: RequestOptions<CheckoutParams>): Promise<CheckoutSelectors>;
    loadPaymentMethodByIds(methodIds: string[]): Promise<CheckoutSelectors>;
    subscribeToConsignments(subscriber: (state: CheckoutSelectors) => void): () => void;
}

type CheckoutPageProps = CheckoutProps &
    WithCheckoutProps &
    WithLanguageProps &
    AnalyticsContextProps &
    ExtensionContextProps;

const Checkout = ({
                      createAccountUrl,
                      createEmbeddedMessenger,
                      embeddedSupport,
                      billingAddress,
                      consignments,
                      cart,
                      data,
                      errorLogger,
                      isGuestEnabled,
                      isShowingWalletButtonsOnTop,
                      hasCartChanged,
                      isShippingDiscountDisplayEnabled,
                      clearError,
                      error,
                      steps,
                      analyticsTracker,
                      loginUrl,
                      language,
                      cartUrl,
                      isPending,
                      isPriceHiddenFromGuests,
                      containerId,
                      embeddedStylesheet,
                      loadPaymentMethodByIds,
                      subscribeToConsignments,
                      themeV2
                  }: CheckoutPageProps):ReactElement => {
    const { userJourney: { requiresB2BToken } } = useCapabilities();
    const { fetchB2BToken } = useB2BToken();

    const [state, setState] = useState<CheckoutState>({
        isBillingSameAsShipping: true,
        isCartEmpty: false,
        isRedirecting: false,
        isMultiShippingMode: false,
        hasSelectedShippingOptions: false,
        isSubscribed: false,
        buttonConfigs: [],
    });
    const isCatalystPaymentOnlyMode = shouldUseCatalystPaymentOnlyMode();

    // Initialize refs 1/2
    const stepsRef = useRef<CheckoutStepStatus[]>(steps);
    const embeddedMessenger = useRef<EmbeddedCheckoutMessenger>();
    const stateRef = useRef<{
        hasSelectedShippingOptions: boolean;
        activeStepType?: CheckoutStepType;
        defaultStepType?: CheckoutStepType;
    }>({
        hasSelectedShippingOptions: state.hasSelectedShippingOptions,
    });

    const { orderConfirmation: { invoiceRedirect } } = useCapabilities();

    const navigateToStep = useCallback((type: CheckoutStepType, options?: { isDefault?: boolean }):void => {
        const step = find(stepsRef.current, { type });

        if (!step) {
            return;
        }

        if (state.activeStepType === step.type) {
            return;
        }

        if (options && options.isDefault) {
            setState(prevState => ({
                ...prevState,
                defaultStepType: step.type,
            }));
        } else {
            // TODO: setting activeStepType here is causing significant delay in rendering guest shopper form
            // When converting functional component, we should set activeStepType before rendering <CheckoutPage />
            // This would be done in the next ticket
            setState(prevState => ({
                ...prevState,
                activeStepType: step.type,
            }));
        }

        if (error) {
            clearError(error);
        }
    }, [state.activeStepType, error, clearError]);

    const navigateToNextIncompleteStep = useCallback((options?: { isDefault?: boolean }):void => {
        const activeStepIndex = findIndex(stepsRef.current, { isActive: true });
        const activeStep = activeStepIndex >= 0 && stepsRef.current[activeStepIndex];

        if (!activeStep) {
            return;
        }

        const previousStep = stepsRef.current[Math.max(activeStepIndex - 1, 0)];

        if (previousStep) {
            analyticsTracker.trackStepCompleted(previousStep.type);
        }

        navigateToStep(activeStep.type, options);
    }, [analyticsTracker, navigateToStep]);

    const handleToggleMultiShipping = useCallback(():void => {
        setState((prevState) => ({ ...prevState, isMultiShippingMode: !prevState.isMultiShippingMode }));
    },[]);

    const navigateToOrderConfirmation = useCallback((orderId?: number):void => {
        analyticsTracker.trackStepCompleted(stepsRef.current[stepsRef.current.length - 1].type);

        if (embeddedMessenger.current) {
            embeddedMessenger.current.postComplete();
        }

        SubscribeSessionStorage.removeSubscribeStatus();

        setState(prevState => ({ ...prevState, isRedirecting: true }));

        if (invoiceRedirect && orderId !== undefined) {
            const { links: { siteLink = '' } = {} } = data.getConfig() || {};
            const storefrontUrl = resolveCatalystStorefrontUrl(siteLink).replace(/\/$/, '');

            // TODO: CHECKOUT-9813 Get receiptId via B2B v1 API, more details in CHECKOUT-9813
            window.location.replace(`${storefrontUrl}/#/invoice?receiptId=`);

            return;
        }

        void navigateToOrderConfirmationUtility(orderId);
    }, []);

    const checkEmbeddedSupport = useCallback((methodIds: string[]): boolean => {
        return embeddedSupport.isSupported(...methodIds);
    }, [embeddedSupport]);

    const setCustomerViewType = useCallback((customerViewType: CustomerViewType): void => {
        if (customerViewType === CustomerViewType.CreateAccount && isEmbedded()) {
            if (window.top) {
                window.top.location.replace(createAccountUrl);
            }

            return;
        }

        navigateToStep(CheckoutStepType.Customer);
        setState( prevState => ({ ...prevState, customerViewType }));
    },[createAccountUrl, navigateToStep]);

    const handleCartChangedError = useCallback(():void => {
        navigateToStep(CheckoutStepType.Shipping);
    }, [navigateToStep]);

    const handleConsignmentsUpdated = ({ data }: CheckoutSelectors):void => {
        const { hasSelectedShippingOptions: prevHasSelectedShippingOptions, activeStepType, defaultStepType } =
            stateRef.current;

        const newHasSelectedShippingOptions = hasSelectedShippingOptions(
            data.getConsignments() || [],
        );

        const isDefaultStepPaymentOrBilling =
            !activeStepType &&
            (defaultStepType === CheckoutStepType.Payment ||
                defaultStepType === CheckoutStepType.Billing);

        const isShippingStepFinished =
            findIndex(stepsRef.current, { type: CheckoutStepType.Shipping }) <
            findIndex(stepsRef.current, { type: activeStepType }) || isDefaultStepPaymentOrBilling;

        if (
            prevHasSelectedShippingOptions &&
            !newHasSelectedShippingOptions &&
            isShippingStepFinished
        ) {
            navigateToStep(CheckoutStepType.Shipping);
            setState(prevState => ({ ...prevState, error: new ShippingOptionExpiredError() }));
        }

        setState(prevState => ({ ...prevState, hasSelectedShippingOptions: newHasSelectedShippingOptions }));
    };

    const handleCloseErrorModal = useCallback((): void => {
        setState(prevState => ({ ...prevState, error: undefined }));
    }, []);

    const handleExpanded = useCallback((type: CheckoutStepType): void => {
        analyticsTracker.trackStepViewed(type);
    }, []);

    const handleError = useCallback((error: Error): void => {
        if (isErrorWithType(error) && error.type === 'empty_cart') {
            setState(prevState => ({ ...prevState, error }));

            return;
        }

        errorLogger.log(error);

        if (embeddedMessenger.current) {
            embeddedMessenger.current.postError(error);
        }
    }, []);

    const handleUnhandledError = useCallback((error: Error): void => {
        handleError(error);

        // For errors that are not caught and handled by child components, we
        // handle them here by displaying a generic error modal to the shopper.
        setState(prevState => ({ ...prevState, error }));
    }, []);

    const handleEditStep = useCallback((type: CheckoutStepType): void => {
        if (isCatalystPaymentOnlyMode && type !== CheckoutStepType.Payment) {
            const target = resolveCatalystCheckoutEditUrl(
                mapCheckoutStepToCatalystEditTarget(type),
            );

            if (target) {
                if (window.top) {
                    window.top.location.assign(target);
                } else {
                    window.location.assign(target);
                }

                return;
            }
        }

        navigateToStep(type);
    }, [isCatalystPaymentOnlyMode, navigateToStep]);

    const handleReady = useCallback((): void => {
        navigateToNextIncompleteStep({ isDefault: true });
    }, [navigateToNextIncompleteStep]);

    const handleNewsletterSubscription = useCallback((subscribed: boolean): void => {
        setState(prevState => ({ ...prevState, isSubscribed: subscribed }));
    }, []);

    const handleSignOut = useCallback(({ isCartEmpty }: CustomerSignOutEvent): void => {
        if (isPriceHiddenFromGuests && window.top) {
            window.top.location.href = cartUrl;

            return;
        }

        if (embeddedMessenger.current) {
            embeddedMessenger.current.postSignedOut();
        }

        if (isGuestEnabled) {
            setCustomerViewType(CustomerViewType.Guest);
        }

        if (isCartEmpty) {
            setState(prevState => ({ ...prevState, isCartEmpty: true }));

            if (!isEmbedded() && window.top) {
                window.top.location.assign(loginUrl);

                return;
            }
        }

        navigateToStep(CheckoutStepType.Customer);
    }, [
        loginUrl, cartUrl, isPriceHiddenFromGuests, isGuestEnabled, setCustomerViewType, navigateToStep
    ]);

    const handleShippingNextStep = useCallback((isBillingSameAsShipping: boolean): void => {
        setState(prev => ({ ...prev, isBillingSameAsShipping }));

        if (isBillingSameAsShipping) {
            navigateToNextIncompleteStep();
        } else {
            navigateToStep(CheckoutStepType.Billing);
        }
    }, [navigateToNextIncompleteStep, navigateToStep]);

    const handleShippingSignIn = useCallback((): void => {
        setCustomerViewType(CustomerViewType.Login);
    }, [setCustomerViewType]);

    const handleShippingCreateAccount = useCallback((): void => {
        setCustomerViewType(CustomerViewType.CreateAccount);
    }, [setCustomerViewType]);

    const handleBeforeExit = useCallback((): void => {
        analyticsTracker.exitCheckout();
    }, []);

    const handleWalletButtonClick = useCallback((methodName: string): void => {
        analyticsTracker.walletButtonClick(methodName);
    }, []);

    const reloadWindow = useCallback((): void => {
        setState(prevState => ({ ...prevState, error: undefined }));

        window.location.reload();
    }, []);

    const handleSetIsMultishippingMode = useCallback((value: boolean): void => {
        setState(prevState => ({ ...prevState, isMultiShippingMode: value }));
    }, []);

    const renderStep = (step: CheckoutStepStatus): ReactNode =>{
        const {
            customerViewType = isGuestEnabled ? CustomerViewType.Guest : CustomerViewType.Login,
            isSubscribed,
            isBillingSameAsShipping,
            isMultiShippingMode,
        } = state;

        switch (step.type) {
            case CheckoutStepType.Customer:
                return <CustomerStep
                    checkEmbeddedSupport={checkEmbeddedSupport}
                    isSubscribed={isSubscribed}
                    isWalletButtonsOnTop={isShowingWalletButtonsOnTop}
                    onAccountCreated={navigateToNextIncompleteStep}
                    onChangeViewType={setCustomerViewType}
                    onContinueAsGuest={navigateToNextIncompleteStep}
                    onContinueAsGuestError={handleError}
                    onEdit={handleEditStep}
                    onExpanded={handleExpanded}
                    onReady={handleReady}
                    onSignIn={navigateToNextIncompleteStep}
                    onSignInError={handleError}
                    onSignOut={handleSignOut}
                    onSignOutError={handleError}
                    onSubscribeToNewsletter={handleNewsletterSubscription}
                    onUnhandledError={handleUnhandledError}
                    onWalletButtonClick={handleWalletButtonClick}
                    step={step}
                    viewType={customerViewType}
                />;

            case CheckoutStepType.Shipping:
                return <ShippingStep
                    cart={cart}
                    cartHasChanged={hasCartChanged}
                    consignments={consignments || []}
                    isBillingSameAsShipping={isBillingSameAsShipping}
                    isMultiShippingMode={isMultiShippingMode}
                    isShippingDiscountDisplayEnabled={isShippingDiscountDisplayEnabled}
                    navigateNextStep={handleShippingNextStep}
                    onCreateAccount={handleShippingCreateAccount}
                    onEdit={handleEditStep}
                    onExpanded={handleExpanded}
                    onReady={handleReady}
                    onSignIn={handleShippingSignIn}
                    onToggleMultiShipping={handleToggleMultiShipping}
                    onUnhandledError={handleUnhandledError}
                    setIsMultishippingMode={handleSetIsMultishippingMode}
                    step={step}
                />;

            case CheckoutStepType.Billing:
                return <BillingStep
                    billingAddress={billingAddress}
                    navigateNextStep={navigateToNextIncompleteStep}
                    onEdit={handleEditStep}
                    onExpanded={handleExpanded}
                    onReady={handleReady}
                    onUnhandledError={handleUnhandledError}
                    step={step}
                />;

            case CheckoutStepType.Payment:
                return <PaymentStep
                    cart={cart}
                    checkEmbeddedSupport={checkEmbeddedSupport}
                    consignments={consignments}
                    errorLogger={errorLogger}
                    isEmbedded={isEmbedded()}
                    isUsingMultiShipping={
                        cart && consignments
                            ? isUsingMultiShipping(consignments, cart.lineItems)
                            : false
                    }
                    onCartChangedError={handleCartChangedError}
                    onEdit={handleEditStep}
                    onExpanded={handleExpanded}
                    onFinalize={navigateToOrderConfirmation}
                    onReady={handleReady}
                    onSubmit={navigateToOrderConfirmation}
                    onSubmitError={handleError}
                    onUnhandledError={handleUnhandledError}
                    step={step}
                />

            default:
                return null;
        }
    }

    // Initialize refs 2/2
    const handleConsignmentsUpdatedRef = useRef<(selectors:CheckoutSelectors) => void>(handleConsignmentsUpdated);
    const handleBeforeExitRef = useRef<() => void>(handleBeforeExit);

    // Update refs
    stepsRef.current = steps;
    stateRef.current = {
        hasSelectedShippingOptions: state.hasSelectedShippingOptions,
        activeStepType: state.activeStepType,
        defaultStepType: state.defaultStepType,
    };
    handleConsignmentsUpdatedRef.current = handleConsignmentsUpdated;
    handleBeforeExitRef.current = handleBeforeExit;

    const shouldUseCatalystSingleStepPayment = shouldRenderCatalystSingleStepPayment(
        stepsRef.current,
        isCatalystPaymentOnlyMode,
    );
    const visibleSteps = shouldUseCatalystSingleStepPayment
        ? stepsRef.current.filter((step) => step.type === CheckoutStepType.Payment)
        : stepsRef.current.filter((step) => step.isRequired);
    const storefrontUrl = resolveCatalystStorefrontUrl(data.getConfig()?.links?.siteLink || '/');
    const catalystCartUrl = resolveCatalystCartEditUrl() || cartUrl;
    const checkoutHost = data.getConfig()?.storeProfile?.storeName || 'store';
    const checkout = data.getCheckout();
    const customer = data.getCustomer();
    const checkoutBillingAddress = checkout?.billingAddress as (Address & { email?: string }) | undefined;
    const currentBillingAddress = billingAddress as (Address & { email?: string }) | undefined;
    const contactEmail =
        checkoutBillingAddress?.email || currentBillingAddress?.email || customer?.email || undefined;

    useEffect(() => {
        if (!isCatalystPaymentOnlyMode || typeof MutationObserver === 'undefined') {
            return;
        }

        const getStripeFloatingContainer = (element: Element): HTMLElement | null => {
            let current: HTMLElement | null = element instanceof HTMLElement ? element : element.parentElement;

            while (current && current !== document.body) {
                const style = window.getComputedStyle(current);
                const rect = current.getBoundingClientRect();
                const isPinned =
                    style.position === 'fixed' ||
                    style.position === 'sticky' ||
                    (style.position === 'absolute' &&
                        rect.bottom >= window.innerHeight - 24 &&
                        rect.right >= window.innerWidth - 24);
                const isNearBottomRight =
                    rect.width > 0 &&
                    rect.height > 0 &&
                    rect.bottom >= window.innerHeight - 24 &&
                    rect.right >= window.innerWidth - 24;
                const isOverlaySized = rect.width <= 280 && rect.height <= 140;

                if (isPinned && isNearBottomRight && isOverlaySized) {
                    return current;
                }

                current = current.parentElement;
            }

            return null;
        };

        const hideFloatingStripeBranding = (root: ParentNode = document) => {
            root.querySelectorAll<HTMLElement>('iframe, div, a, span, button').forEach((node) => {
                if (!(node instanceof Element)) {
                    return;
                }

                const text = (node.textContent || '').trim().toLowerCase();
                const hasStripeHint =
                    text === 'stripe >' ||
                    text === 'stripe>' ||
                    text.includes('powered by stripe') ||
                    `${node.className || ''}`.toLowerCase().includes('stripe') ||
                    (node.id || '').toLowerCase().includes('stripe') ||
                    (node.getAttribute('title') || '').toLowerCase().includes('stripe') ||
                    (node.getAttribute('aria-label') || '').toLowerCase().includes('stripe') ||
                    (node instanceof HTMLIFrameElement &&
                        (((node.src || '').toLowerCase().includes('stripe')) ||
                            ((node.name || '').toLowerCase().includes('stripe')))) ||
                    Boolean(
                        node.querySelector(
                            'iframe[src*="stripe"], iframe[name*="stripe"], [id*="stripe" i], [class*="stripe" i], [title*="stripe" i], [aria-label*="stripe" i]',
                        ),
                    );

                if (!hasStripeHint) {
                    return;
                }

                const container = getStripeFloatingContainer(node);

                if (container) {
                    container.style.display = 'none';
                }
            });
        };

        const handleWindowResize = () => {
            hideFloatingStripeBranding();
        };

        hideFloatingStripeBranding();

        const observer = new MutationObserver((mutations) => {
            mutations.forEach(({ addedNodes }) => {
                addedNodes.forEach((node) => {
                    if (node instanceof Element) {
                        hideFloatingStripeBranding(node);
                    }
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('resize', handleWindowResize);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', handleWindowResize);
        };
    }, [isCatalystPaymentOnlyMode]);

    useEffect(() => {
        const unsubscribeFromConsignments = subscribeToConsignments(
            handleConsignmentsUpdatedRef.current,
        );

        const init = async () => {
            try {
                const providers = data.getConfig()?.checkoutSettings?.remoteCheckoutProviders || [];

                const supportedProviders = getSupportedMethodIds(providers);

                if (providers.length > 0) {
                    const configs = await loadPaymentMethodByIds(supportedProviders);

                    setState(prevState => ({
                        ...prevState,
                        buttonConfigs: configs.data.getPaymentMethods() || [],
                    }));
                }

                const errorFlashMessages = data.getFlashMessages('error') || [];

                if (errorFlashMessages.length) {
                    setState(prevState => ({
                            ...prevState,
                            error: new CustomError({
                                title:
                                    errorFlashMessages[0].title ||
                                    language.translate('common.error_heading'),
                                message: errorFlashMessages[0].message,
                                data: {},
                                name: 'default',
                            }),
                        })
                    );
                }

                const { links: { siteLink = '' } = {} } = data.getConfig() || {};
                const parentOrigin = resolveCatalystStorefrontOrigin(siteLink) || siteLink;
                const headerHomeUrl = resolveCatalystStorefrontUrl(siteLink);
                const messenger = createEmbeddedMessenger({ parentOrigin });

                document.querySelectorAll<HTMLAnchorElement>('a.checkoutHeader-link').forEach((link) => {
                    link.href = headerHomeUrl;
                    link.target = '_top';
                });

                messenger.receiveStyles((styles) => embeddedStylesheet.append(styles));
                messenger.postFrameLoaded({ contentId: containerId });
                messenger.postLoaded();

                embeddedMessenger.current = messenger;

                if (document.prerendering) {
                    document.addEventListener('prerenderingchange', () => {
                        analyticsTracker.checkoutBegin();
                    }, { once: true });
                }
                else {
                    analyticsTracker.checkoutBegin();
                }

                const consignments = data.getConsignments();
                const cart = data.getCart();

                const hasMultiShippingEnabled =
                    data.getConfig()?.checkoutSettings.hasMultiShippingEnabled;
                const checkoutBillingSameAsShippingEnabled =
                    data.getConfig()?.checkoutSettings.checkoutBillingSameAsShippingEnabled ?? true;
                const defaultNewsletterSignupOption =
                    data.getConfig()?.shopperConfig.defaultNewsletterSignup ??
                    false;
                const isMultiShippingMode =
                    !!cart &&
                    !!consignments &&
                    hasMultiShippingEnabled &&
                    isUsingMultiShipping(consignments, cart.lineItems);

                setState(
                    prevState => ({
                        ...prevState,
                        isBillingSameAsShipping: checkoutBillingSameAsShippingEnabled,
                        isSubscribed: defaultNewsletterSignupOption,
                    })
                );

                if (isMultiShippingMode) {
                    setState(
                        prevState => ({
                            ...prevState,
                            isMultiShippingMode,
                        })
                    );
                }

                window.addEventListener('beforeunload', handleBeforeExitRef.current);

                if (requiresB2BToken && !data.getCustomer()?.isGuest) {
                    void fetchB2BToken();
                }

                handleReady();
            } catch (error) {
                if (error instanceof Error) {
                    handleUnhandledError(error);
                }
            }
        };

      void init();

        return (): void => {
            const deInit = () => {
                if (unsubscribeFromConsignments) {
                    unsubscribeFromConsignments();
                }

                window.removeEventListener('beforeunload', handleBeforeExitRef.current);

                handleBeforeExitRef.current();
            }

            deInit();
        };
    }, []);

    if (state.isRedirecting){
        return <OrderConfirmationPageSkeleton />;
    }

    let errorModal = null;

    if (state.error) {
        if (isCustomError(state.error)) {
            errorModal = (
                <ErrorModal
                    error={state.error}
                    onClose={handleCloseErrorModal}
                    title={state.error.title}
                />
            );
        } else {
            const { message, action } = mapCheckoutComponentErrorMessage(state.error, language.translate.bind(language));

            errorModal = <ErrorModal
                error={state.error}
                message={message}
                onClose={action === 'reload' ? reloadWindow : handleCloseErrorModal}
            />;
        }
    }

    return (
        <div
            className={classNames(
                'remove-checkout-step-numbers',
                { 'is-embedded': isEmbedded() },
                { 'themeV2': themeV2 },
                { 'catalyst-payment-only': isCatalystPaymentOnlyMode },
                { 'catalyst-payment-only-single-step': shouldUseCatalystSingleStepPayment },
            )}
            data-test="checkout-page-container"
            id="checkout-page-container"
        >
            {isCatalystPaymentOnlyMode && (
                <CatalystHostedHeader
                    cartUrl={catalystCartUrl}
                    storefrontUrl={storefrontUrl}
                    storeName={checkoutHost}
                />
            )}

            <div className="layout optimizedCheckout-contentPrimary">
                {state.isCartEmpty ?
                    <EmptyCartMessage loginUrl={loginUrl} waitInterval={3000} />
                    :<>
                        {shouldUseCatalystSingleStepPayment && (
                            <CatalystPaymentReview
                                billingAddress={billingAddress}
                                consignments={consignments}
                                contactEmail={contactEmail}
                                steps={stepsRef.current}
                            />
                        )}

                        <div className="layout-main">
                            <CheckoutHeader
                                activeStepType={state.activeStepType}
                                buttonConfigs={state.buttonConfigs}
                                checkEmbeddedSupport={checkEmbeddedSupport}
                                defaultStepType={state.defaultStepType}
                                onUnhandledError={handleUnhandledError}
                                onWalletButtonClick={handleWalletButtonClick}
                            />

                            <ol className="checkout-steps">
                                {visibleSteps
                                    .map((step) =>
                                        renderStep({
                                            ...step,
                                            isActive: state.activeStepType
                                                ? state.activeStepType === step.type
                                                : state.defaultStepType === step.type,
                                            isBusy: isPending,
                                        }),
                                    )}
                            </ol>
                        </div>
                    </>
                }
                <CartSummary isMultiShippingMode={state.isMultiShippingMode} />
            </div>

            {errorModal}
        </div>
    );
};

export default withExtension(
    withAnalytics(withLanguage(withCheckout(mapToCheckoutProps)(Checkout))),
);
