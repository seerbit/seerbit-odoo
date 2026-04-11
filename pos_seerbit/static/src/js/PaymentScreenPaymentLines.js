/** @odoo-module **/

import { PaymentScreenPaymentLines } from '@point_of_sale/app/screens/payment_screen/payment_lines/payment_lines';

PaymentScreenPaymentLines.props = {
    ...PaymentScreenPaymentLines.props,
    resendPaymentRequest: { type: Function, optional: true },
};
