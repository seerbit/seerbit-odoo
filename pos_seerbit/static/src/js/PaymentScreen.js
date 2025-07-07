odoo.define('pos_seerbit.PaymentScreen', function(require) {
    "use strict";

    const PaymentScreen = require('point_of_sale.PaymentScreen');
    const Registries = require('point_of_sale.Registries');
    const { onMounted } = owl;

    const PosSeerbitPaymentScreen = PaymentScreen => class extends PaymentScreen {
        setup() {
            super.setup();
            onMounted(() => {
                console.log('PosSeerbitPaymentScreen: onMounted called');
                this._handleSeerbitPayments();
            });
        }

        _handleSeerbitPayments() {
            if (!this.currentOrder?.paymentlines) {
                console.log('No current order or payment lines available');
                return;
            }

            // Find Seerbit payment lines
            const seerbitPaymentLines = this.currentOrder.paymentlines.filter(
                paymentLine => paymentLine?.payment_method?.use_payment_terminal === 'seerbit'
            );

            console.log('Found Seerbit payment lines:', seerbitPaymentLines);

            seerbitPaymentLines.forEach(paymentLine => {
                console.log('Processing Seerbit payment line:', paymentLine);
                
                // Check if this payment line needs processing
                if (!paymentLine.is_done() && paymentLine.get_payment_status() !== 'done') {
                    console.log('Payment line needs processing, status:', paymentLine.get_payment_status());
                    
                    // If status is not waitingSeerbit, set it
                    if (paymentLine.get_payment_status() !== 'waitingSeerbit') {
                        console.log('Setting payment status to waitingSeerbit');
                        paymentLine.set_payment_status('waitingSeerbit');
                    }
                    
                    // Start polling for this payment
                    this._startSeerbitPolling(paymentLine);
                }
            });
        }

        _startSeerbitPolling(paymentLine) {
            console.log('Starting Seerbit polling for payment line:', paymentLine);
            
            const paymentTerminal = paymentLine?.payment_method?.payment_terminal;
            
            if (paymentTerminal?.start_get_status_polling) {
                console.log('Payment terminal polling method available');
                
                paymentTerminal.start_get_status_polling().then(isPaymentSuccessful => {
                    console.log('Payment polling result:', isPaymentSuccessful);
                    if (isPaymentSuccessful) {
                        console.log('Payment successful, setting status to done');
                        paymentLine.set_payment_status('done');
                        paymentLine.can_be_reversed = paymentTerminal.supports_reversals || false;
                    } else {
                        console.log('Payment polling completed without success - keeping waitingSeerbit status');
                        // Keep the waiting status to show force confirm option
                        paymentLine.set_payment_status('waitingSeerbit');
                    }
                }).catch(error => {
                    console.error('Error during payment polling:', error);
                    console.log('Payment polling error - keeping waitingSeerbit status for force confirm');
                    // Keep the waiting status to show force confirm option
                    paymentLine.set_payment_status('waitingSeerbit');
                });
            } else {
                console.warn('Payment terminal or start_get_status_polling method not available');
                console.warn('Payment terminal:', paymentTerminal);
                // Set a default status if terminal is not available
                paymentLine.set_payment_status('waitingSeerbit');
            }
        }

        // Override the send_payment_request method to handle Seerbit payments
        async send_payment_request(line) {
            console.log('send_payment_request called for line:', line);
            
            // Check if this is a Seerbit payment
            if (line?.payment_method?.use_payment_terminal === 'seerbit') {
                console.log('Handling Seerbit payment request');
                
                // Set status to waitingSeerbit immediately
                line.set_payment_status('waitingSeerbit');
                
                // Get the payment terminal
                const paymentTerminal = line.payment_method.payment_terminal;
                
                if (paymentTerminal?.send_payment_request_retry) {
                    console.log('Calling Seerbit retry method');
                    return paymentTerminal.send_payment_request_retry(line);
                } else {
                    console.error('Seerbit payment terminal retry method not available');
                    // Keep waiting status
                    line.set_payment_status('waitingSeerbit');
                    return Promise.resolve();
                }
            } else {
                // Call the original method for non-Seerbit payments
                console.log('Calling original send_payment_request for non-Seerbit payment');
                return super.send_payment_request(line);
            }
        }

        // Override the send_force_done method to handle Seerbit payments
        send_force_done(line) {
            console.log('send_force_done called for line:', line);
            
            // Check if this is a Seerbit payment
            if (line?.payment_method?.use_payment_terminal === 'seerbit') {
                console.log('Handling Seerbit force done');
                
                // Get the payment terminal
                const paymentTerminal = line.payment_method.payment_terminal;
                
                if (paymentTerminal?.send_force_done) {
                    console.log('Calling Seerbit force done method');
                    paymentTerminal.send_force_done(line);
                } else {
                    console.error('Seerbit payment terminal force done method not available');
                    // Set status to done manually
                    line.set_payment_status('done');
                }
            } else {
                // Call the original method for non-Seerbit payments
                console.log('Calling original send_force_done for non-Seerbit payment');
                return super.send_force_done(line);
            }
        }

        // Override to prevent standard payment terminal UI for Seerbit
        show_payment_terminal_ui(line) {
            console.log('show_payment_terminal_ui called for line:', line);
            
            // Check if this is a Seerbit payment
            if (line?.payment_method?.use_payment_terminal === 'seerbit') {
                console.log('Preventing standard payment terminal UI for Seerbit');
                // Return false to prevent standard UI
                return false;
            } else {
                // Call the original method for non-Seerbit payments
                return super.show_payment_terminal_ui(line);
            }
        }

        // Override to prevent standard payment terminal status for Seerbit
        show_payment_terminal_status(line, status) {
            console.log('show_payment_terminal_status called for line:', line, 'status:', status);
            
            // Check if this is a Seerbit payment
            if (line?.payment_method?.use_payment_terminal === 'seerbit') {
                console.log('Preventing standard payment terminal status for Seerbit');
                // Return false to prevent standard status display
                return false;
            } else {
                // Call the original method for non-Seerbit payments
                return super.show_payment_terminal_status(line, status);
            }
        }
    };

    Registries.Component.extend(PaymentScreen, PosSeerbitPaymentScreen);

    return PaymentScreen;
});
