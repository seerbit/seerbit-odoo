/** @odoo-module **/

import { PaymentScreen } from '@point_of_sale/app/screens/payment_screen/payment_screen';
import { patch } from '@web/core/utils/patch';

patch(PaymentScreen.prototype, {
    setup(superSetup) {
        superSetup();
        this.send_force_done = this.send_force_done.bind(this);
        this.send_payment_request = this.send_payment_request.bind(this);
    },
    send_force_done(line) {
        if (line && line.payment_method && line.payment_method.payment_terminal) {
            const iface = this.pos.payment_interfaces[line.payment_method.payment_terminal];
            if (iface && iface.send_force_done) {
                iface.send_force_done(line);
            }
        }
    },
    send_payment_request(line) {
        if (line && line.payment_method && line.payment_method.payment_terminal) {
            const iface = this.pos.payment_interfaces[line.payment_method.payment_terminal];
            if (iface && iface.send_payment_request) {
                iface.send_payment_request(line.cid);
            }
        }
    },
    render(superRender) {
        const vnode = superRender();
        if (vnode && vnode.children) {
            for (const child of vnode.children) {
                if (child && child.type && child.type.name === 'PaymentScreenPaymentLines') {
                    child.props = {
                        ...child.props,
                        send_force_done: this.send_force_done,
                        send_payment_request: this.send_payment_request,
                    };
                }
            }
        }
        return vnode;
    },
});
