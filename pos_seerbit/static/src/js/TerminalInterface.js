odoo.define('pos_seerbit.TerminalInterface', function(require) {
    "use strict";

    const AbstractReceipt = require('point_of_sale.AbstractReceipt');
    const Registries = require('point_of_sale.Registries');
    const { useState } = owl;

    class SeerbitTerminalInterface extends AbstractReceipt {
        setup() {
            super.setup();
            this.state = useState({
                isProcessing: false,
                status: 'ready', // ready, processing, success, error
                message: ''
            });
        }

        get currentOrder() {
            return this.env.pos.get_order();
        }

        get currentPaymentLine() {
            return this.currentOrder?.selected_paymentline;
        }

        get isSeerbitPayment() {
            return this.currentPaymentLine?.payment_method?.use_payment_terminal === 'seerbit';
        }

        get paymentAmount() {
            return this.currentPaymentLine?.amount || 0;
        }

        formatCurrency(amount) {
            return this.env.pos.format_currency(amount);
        }

        async sendPaymentRequest() {
            if (!this.currentPaymentLine || !this.isSeerbitPayment) {
                return;
            }

            this.state.isProcessing = true;
            this.state.status = 'processing';
            this.state.message = 'Sending payment request...';

            try {
                const paymentTerminal = this.currentPaymentLine.payment_method.payment_terminal;
                if (paymentTerminal && paymentTerminal.send_payment_request) {
                    await paymentTerminal.send_payment_request(this.currentPaymentLine.cid);
                    this.state.status = 'success';
                    this.state.message = 'Payment request sent successfully';
                } else {
                    throw new Error('Payment terminal not available');
                }
            } catch (error) {
                console.error('Payment request failed:', error);
                this.state.status = 'error';
                this.state.message = 'Failed to send payment request';
            } finally {
                this.state.isProcessing = false;
            }
        }

        forceConfirm() {
            if (this.currentPaymentLine) {
                this.currentPaymentLine.set_payment_status('done');
                this.state.status = 'success';
                this.state.message = 'Payment force confirmed';
            }
        }

        retryPayment() {
            this.state.status = 'ready';
            this.state.message = '';
            this.sendPaymentRequest();
        }
    }

    SeerbitTerminalInterface.template = 'SeerbitTerminalInterface';
    SeerbitTerminalInterface.defaultProps = {
        confirmText: 'Send',
        cancelText: 'Cancel',
    };

    Registries.Component.add(SeerbitTerminalInterface);

    return SeerbitTerminalInterface;
}); 