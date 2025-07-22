/** @odoo-module **/

import { PaymentScreen } from '@point_of_sale/app/screens/payment_screen/payment_screen';
import { Registries } from '@point_of_sale/app/store/registries';
import { onMounted } from 'owl';

const PosSeerbitPaymentScreen = (PaymentScreen) => class extends PaymentScreen {
    setup() {
        super.setup();
        onMounted(() => {
            const pendingPaymentLine = this.currentOrder.paymentlines.find(
                paymentLine => paymentLine.payment_method.use_payment_terminal === 'seerbit' &&
                    (!paymentLine.is_done() && paymentLine.get_payment_status() !== 'pending')
            );
            if (pendingPaymentLine) {
                const paymentTerminal = pendingPaymentLine.payment_method.payment_terminal;
                pendingPaymentLine.set_payment_status('waitingSeerbit');
                paymentTerminal.start_get_status_polling().then(isPaymentSuccessful => {
                    if (isPaymentSuccessful) {
                        pendingPaymentLine.set_payment_status('done');
                        pendingPaymentLine.can_be_reversed = paymentTerminal.supports_reversals;
                    } else {
                        pendingPaymentLine.set_payment_status('retry');
                    }
                });
            }
        });
    }
};

Registries.Component.extend(PaymentScreen, PosSeerbitPaymentScreen);

export default PosSeerbitPaymentScreen;
