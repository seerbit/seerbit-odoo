/** @odoo-module **/

import { PaymentScreen } from '@point_of_sale/app/screens/payment_screen/payment_screen';
import { patch } from '@web/core/utils/patch';
import { onMounted } from '@odoo/owl';

// Patch PaymentScreen to handle Seerbit payment line status
patch(PaymentScreen.prototype, {
    setup() {
        super.setup();
        onMounted(() => {
            // Set pending Seerbit payments to waiting status
            const pendingPaymentLine = this.env.services.pos.getPendingPaymentLine('seerbit')
            if (pendingPaymentLine) {
                pendingPaymentLine.set_payment_status('waitingSeerbit');
            }
            
            // Clean up any stale localStorage items when screen loads
            this._cleanupStaleSeerbitTransactions();
        });

    },
    
    _cleanupStaleSeerbitTransactions() {
        // Clean up localStorage if there are no active Seerbit payment lines
        const currentOrder = this.env.services.pos.get_order();
        if (currentOrder) {
            const seerbitPaymentLines = currentOrder.get_paymentlines().filter(line => 
                line.payment_method_id && line.payment_method_id.use_payment_terminal === 'seerbit'
            );
            
            // If no Seerbit payment lines exist, clean up localStorage
            if (seerbitPaymentLines.length === 0) {
                localStorage.removeItem('pending_transaction');
                localStorage.removeItem('completed_transaction');
            }
        }
    },
    
    async sendForceDone(line) {
        const payment_terminal = line.payment_method_id.payment_terminal;
         await payment_terminal.send_force_done(
            line
        );
    }
});