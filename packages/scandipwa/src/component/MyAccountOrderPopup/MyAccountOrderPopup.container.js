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

import PropTypes from 'prop-types';
import { PureComponent } from 'react';
import { connect } from 'react-redux';

import OrderQuery from 'Query/Order.query';
import { showNotification } from 'Store/Notification/Notification.action';
import { orderType } from 'Type/Account';
import { isSignedIn } from 'Util/Auth';
import { getIndexedProducts } from 'Util/Product';
import { fetchQuery } from 'Util/Request';

import MyAccountOrderPopup from './MyAccountOrderPopup.component';
import { ORDER_POPUP_ID } from './MyAccountOrderPopup.config';

export const OrderDispatcher = import(
    /* webpackMode: "lazy", webpackChunkName: "dispatchers" */
    'Store/Order/Order.dispatcher'
);

/** @namespace Component/MyAccountOrderPopup/Container/mapStateToProps */
export const mapStateToProps = (state) => ({
    order: state.OrderReducer.order,
    payload: state.PopupReducer.popupPayload[ORDER_POPUP_ID] || {},
    display_tax_in_shipping_amount: state.ConfigReducer.cartDisplayConfig.display_tax_in_shipping_amount
});

/** @namespace Component/MyAccountOrderPopup/Container/mapDispatchToProps */
export const mapDispatchToProps = (dispatch) => ({
    showNotification: (type, message) => dispatch(showNotification(type, message)),
    getOrder: (orderId) => OrderDispatcher.then(
        ({ default: dispatcher }) => dispatcher.getOrderById(dispatch, orderId)
    )
});

/** @namespace Component/MyAccountOrderPopup/Container */
export class MyAccountOrderPopupContainer extends PureComponent {
    static propTypes = {
        payload: PropTypes.shape({
            order: orderType,
            increment_id: PropTypes.string
        }).isRequired,
        showNotification: PropTypes.func.isRequired,
        getOrder: PropTypes.func.isRequired
    };

    state = {
        order: {},
        currency_code: '',
        prevOrderId: 0,
        isLoading: true
    };

    static getDerivedStateFromProps(props, state) {
        const { payload: { increment_id: id } } = props;
        const { prevOrderId } = state;

        if (prevOrderId === id) {
            return null;
        }

        return { order: {}, isLoading: true, prevOrderId: id };
    }

    componentDidUpdate(prevProps) {
        const { payload: { increment_id: prevId } } = prevProps;
        const { payload: { increment_id: id } } = this.props;

        if (id !== prevId) {
            this.requestOrderDetails();
        }
    }

    containerProps = () => {
        const { order: stateOrder, isLoading, currency_code } = this.state;
        const { payload: { order: payloadOrder } } = this.props;

        return {
            isLoading,
            currency_code,
            order: {
                ...payloadOrder,
                ...stateOrder
            }
        };
    };

    requestOrderDetails() {
        const {
            payload: {
                order: {
                    base_order_info: { id } = {}
                } = {}
            } = {}
        } = this.props;

        if (!isSignedIn()) {
            return;
        }

        fetchQuery(OrderQuery.getOrderByIdQuery(id)).then(
            /** @namespace Component/MyAccountOrderPopup/Container/requestOrderDetailsFetchQueryThen */
            ({ getOrderById: rawOrder }) => {
                const { order_products = [] } = rawOrder;
                const indexedProducts = getIndexedProducts(order_products);
                const order = { ...rawOrder, order_products: indexedProducts };
                const { base_order_info: { currency_code } } = order;
                this.setState({ currency_code, order, isLoading: false });
            },
            /** @namespace Component/MyAccountOrderPopup/Container/requestOrderDetailsFetchQueryCatch */
            () => {
                showNotification('error', __('Error getting Order by ID!'));
                this.setState({ isLoading: false });
            }
        );
    }

    render() {
        return (
            <MyAccountOrderPopup
              { ...this.containerProps() }
            />
        );
    }
}

export default connect(mapStateToProps, mapDispatchToProps)(MyAccountOrderPopupContainer);
