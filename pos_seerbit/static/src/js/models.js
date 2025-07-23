/** @odoo-module **/

import PaymentSeerbit from './payment_seerbit';
import { registry } from '@web/core/registry';

// Register your payment method under the POS payments registry
registry.category('pos_payment_method_interface').add('seerbit', PaymentSeerbit);
