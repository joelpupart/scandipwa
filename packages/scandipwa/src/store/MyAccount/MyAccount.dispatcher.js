/**
 * ScandiPWA - Progressive Web App for Magento
 *
 * Copyright © Scandiweb, Inc. All rights reserved.
 * See LICENSE for license details.
 *
 * @license OSL-3.0 (Open Software License ("OSL") v. 3.0)
 * @package scandipwa/base-theme
 * @link https://github.com/scandipwa/base-theme
 */

import MyAccountQuery from 'Query/MyAccount.query';
import {
    updateCustomerDetails,
    updateCustomerPasswordForgotStatus,
    updateCustomerPasswordResetStatus,
    updateCustomerSignInStatus,
    updateIsLoading
} from 'Store/MyAccount/MyAccount.action';
import { showNotification } from 'Store/Notification/Notification.action';
import { ORDERS } from 'Store/Order/Order.reducer';
import {
    deleteAuthorizationToken,
    setAuthorizationToken
} from 'Util/Auth';
import BrowserDatabase from 'Util/BrowserDatabase';
import { deleteGuestQuoteId, getGuestQuoteId, setGuestQuoteId } from 'Util/Cart';
import { prepareQuery } from 'Util/Query';
import { executePost, fetchMutation, getErrorMessage } from 'Util/Request';

export const CartDispatcher = import(
    /* webpackMode: "lazy", webpackChunkName: "dispatchers" */
    'Store/Cart/Cart.dispatcher'
);

export const WishlistDispatcher = import(
    /* webpackMode: "lazy", webpackChunkName: "dispatchers" */
    'Store/Wishlist/Wishlist.dispatcher'
);

export const ProductCompareDispatcher = import(
    /* webpackMode: "lazy", webpackChunkName: "dispatchers" */
    'Store/ProductCompare/ProductCompare.dispatcher'
);

export const CUSTOMER = 'customer';

export const ONE_MONTH_IN_SECONDS = 2628000;

/**
 * My account actions
 * @class MyAccount
 * @namespace Store/MyAccount/Dispatcher
 */
export class MyAccountDispatcher {
    requestCustomerData(dispatch) {
        const query = MyAccountQuery.getCustomerQuery();

        const customer = BrowserDatabase.getItem(CUSTOMER) || {};
        if (customer.id) {
            dispatch(updateCustomerDetails(customer));
        }

        return executePost(prepareQuery([query])).then(
            /** @namespace Store/MyAccount/Dispatcher/requestCustomerDataExecutePostThen */
            ({ customer }) => {
                dispatch(updateCustomerDetails(customer));
                BrowserDatabase.setItem(customer, CUSTOMER, ONE_MONTH_IN_SECONDS);
            },
            /** @namespace Store/MyAccount/Dispatcher/requestCustomerDataExecutePostError */
            (error) => dispatch(showNotification('error', getErrorMessage(error)))
        );
    }

    logout(authTokenExpired = false, dispatch) {
        if (authTokenExpired) {
            dispatch(showNotification('error', __('Your session is over, you are logged out!')));
        } else {
            deleteAuthorizationToken();
            dispatch(showNotification('success', __('You are successfully logged out!')));
        }

        deleteGuestQuoteId();
        BrowserDatabase.deleteItem(ORDERS);
        BrowserDatabase.deleteItem(CUSTOMER);

        dispatch(updateCustomerSignInStatus(false));
        dispatch(updateCustomerDetails({}));

        // After logout cart, wishlist and compared product list is always empty.
        // There is no need to fetch it from the backend.
        CartDispatcher.then(
            ({ default: dispatcher }) => {
                dispatcher.resetGuestCart(dispatch);
                dispatcher.createGuestEmptyCart(dispatch);
            }
        );
        WishlistDispatcher.then(
            ({ default: dispatcher }) => dispatcher.resetWishlist(dispatch)
        );
        ProductCompareDispatcher.then(
            ({ default: dispatcher }) => dispatcher.resetComparedProducts(dispatch)
        );
    }

    /**
     * Forgot password action
     * @param {{email: String}} [options={}]
     * @returns {Promise<{status: String}>} Reset password token
     * @memberof MyAccountDispatcher
     */
    forgotPassword(options = {}, dispatch) {
        const mutation = MyAccountQuery.getForgotPasswordMutation(options);
        return fetchMutation(mutation).then(
            /** @namespace Store/MyAccount/Dispatcher/forgotPasswordFetchMutationThen */
            () => dispatch(updateCustomerPasswordForgotStatus()),
            /** @namespace Store/MyAccount/Dispatcher/forgotPasswordFetchMutationError */
            (error) => dispatch(showNotification('error', getErrorMessage(error)))
        );
    }

    /**
     * Reset password action
     * @param {{token: String, password: String, password_confirmation: String}} [options={}]
     * @returns {Promise<{status: String}>} Reset password token
     * @memberof MyAccountDispatcher
     */
    resetPassword(options = {}, dispatch) {
        const mutation = MyAccountQuery.getResetPasswordMutation(options);

        return fetchMutation(mutation).then(
            /** @namespace Store/MyAccount/Dispatcher/resetPasswordFetchMutationThen */
            ({ s_resetPassword: { status } }) => dispatch(updateCustomerPasswordResetStatus(status)),
            /** @namespace Store/MyAccount/Dispatcher/resetPasswordFetchMutationError */
            () => dispatch(updateCustomerPasswordResetStatus('error'))
        );
    }

    /**
     * Create account action
     * @param {{customer: Object, password: String}} [options={}]
     * @memberof MyAccountDispatcher
     */
    createAccount(options = {}, dispatch) {
        const { customer: { email }, password } = options;
        const mutation = MyAccountQuery.getCreateAccountMutation(options);
        dispatch(updateIsLoading(true));

        return fetchMutation(mutation).then(
            /** @namespace Store/MyAccount/Dispatcher/createAccountFetchMutationThen */
            (data) => {
                const { createCustomer: { customer } } = data;
                const { confirmation_required } = customer;

                if (confirmation_required) {
                    dispatch(updateIsLoading(false));
                    return 2;
                }

                return this.signIn({ email, password }, dispatch);
            },

            /** @namespace Store/MyAccount/Dispatcher/createAccountFetchMutationError */
            (error) => {
                dispatch(showNotification('error', getErrorMessage(error)));
                Promise.reject();
                dispatch(updateIsLoading(false));

                return false;
            }
        );
    }

    /**
     * Confirm account action
     * @param {{key: String, email: String, password: String}} [options={}]
     * @memberof MyAccountDispatcher
     */
    confirmAccount(options = {}, dispatch) {
        const mutation = MyAccountQuery.getConfirmAccountMutation(options);

        return fetchMutation(mutation).then(
            /** @namespace Store/MyAccount/Dispatcher/confirmAccountFetchMutationThen */
            () => dispatch(showNotification('success', __('Your account is confirmed!'))),
            /** @namespace Store/MyAccount/Dispatcher/confirmAccountFetchMutationError */
            (error) => dispatch(
                showNotification(
                    'error',
                    getErrorMessage(error, __('Something went wrong! Please, try again!'))
                )
            )
        );
    }

    /**
     * Sign in action
     * @param {{email: String, password: String}} [options={}]
     * @memberof MyAccountDispatcher
     */
    async signIn(options = {}, dispatch) {
        const mutation = MyAccountQuery.getSignInMutation(options);

        const result = await fetchMutation(mutation);
        const { generateCustomerToken: { token } } = result;

        setAuthorizationToken(token);
        dispatch(updateCustomerSignInStatus(true));
        dispatch(showNotification('success', __('You are successfully logged in!')));

        const cartDispatcher = (await CartDispatcher).default;
        const guestCartToken = getGuestQuoteId();
        // if customer is authorized, `createEmptyCart` mutation returns customer cart token
        const customerCartToken = await cartDispatcher.createGuestEmptyCart(dispatch);

        if (guestCartToken) {
            // merge guest cart id and customer cart id using magento capabilities
            await cartDispatcher.mergeCarts(guestCartToken, customerCartToken, dispatch);
        }

        setGuestQuoteId(customerCartToken);
        cartDispatcher.updateInitialCartData(dispatch);

        WishlistDispatcher.then(
            ({ default: dispatcher }) => dispatcher.updateInitialWishlistData(dispatch)
        );
        ProductCompareDispatcher.then(
            ({ default: dispatcher }) => dispatcher.updateInitialProductCompareData(dispatch)
        );

        await this.requestCustomerData(dispatch);
        dispatch(updateIsLoading(false));

        return true;
    }
}

export default new MyAccountDispatcher();
