/** @odoo-module **/

import { registry } from '@web/core/registry';
import SeerbitPayment from './payment_seerbit';

registry.category('payment_terminals').add('seerbit', SeerbitPayment);