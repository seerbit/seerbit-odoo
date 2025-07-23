/** @odoo-module **/

import { Registries } from '@web/core/registry';
import PaymentSeerbit from './payment_seerbit';

Registries.Model.add('seerbit', PaymentSeerbit);