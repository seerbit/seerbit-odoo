odoo.define('pos_seerbit.PaymentScreen', function(require) {
    "use strict";

    const PaymentScreen = require('point_of_sale.PaymentScreen');
    const Registries = require('point_of_sale.Registries');
    const { onMounted, useState } = owl;
    const SeerbitTerminalInterface = require('pos_seerbit.TerminalInterface');

    const PosSeerbitPaymentScreen = PaymentScreen => class extends PaymentScreen {
        setup() {
            super.setup();
            this.state = useState({
                showTerminal: false
            });
            
            onMounted(() => {
                this.checkForSeerbitPayment();
            });
        }

        checkForSeerbitPayment() {
            const currentPaymentLine = this.currentOrder?.selected_paymentline;
            if (currentPaymentLine?.payment_method?.use_payment_terminal === 'seerbit') {
                this.state.showTerminal = true;
                this.showSeerbitTerminal();
            } else {
                this.state.showTerminal = false;
            }
        }

        showSeerbitTerminal() {
            if (!this.state.showTerminal) return;
            
            // Show the Seerbit terminal interface
            this.env.services.gui.showPopup('SeerbitTerminalInterface', {
                title: 'Seerbit Payment Terminal',
                body: 'Complete your payment using the Seerbit terminal',
                paymentLine: this.currentOrder?.selected_paymentline,
                onClose: () => {
                    this.state.showTerminal = false;
                }
            });
        }

        get currentOrder() {
            return this.env.pos.get_order();
        }
    }

    Registries.Component.extend(PaymentScreen, PosSeerbitPaymentScreen);
    return PaymentScreen;
});
