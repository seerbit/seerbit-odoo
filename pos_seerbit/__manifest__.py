# -*- coding: utf-8 -*-
{
    "name": "Seerbit Odoo Point of Sale",
    "version": "0.1.5",
    "category": "Sales/Point of Sale",
    "summary": "Integrate your POS with a Seerbit payment terminal with real-time payment and reconciliation.",
    "description": """
        Seerbit Odoo Point of Sale Integration
        
        This module integrates Seerbit payment terminals with Odoo Point of Sale.
        Features:
        - Real-time payment processing
        - Firestore integration for payment reconciliation
        - Automatic payment status updates
        - Configurable through Odoo settings
        
        # Compatibility:
        - Odoo 16.0, 17.0, 18.0
    """,
    "author": "Seerbit",
    "website": "https://github.com/seerbit/seerbit-odoo",
    "data": [
        "security/ir.model.access.csv",
        # "data/account_journal.xml",
        "data/pos.payment.method.csv",
        "views/res_config_settings_views.xml",
        "views/pos_payment_method_views.xml",
    ],
    "depends": [
        "point_of_sale",
        "account",
    ],
    "installable": True,
    "application": False,
    "post_init_hook": "post_init_hook",
    "assets": {
        "point_of_sale.assets": [
            "pos_seerbit/static/src/js/payment_seerbit.js",
            "pos_seerbit/static/src/js/PaymentScreen.js",
            "pos_seerbit/static/src/js/models.js",
            "pos_seerbit/static/src/js/firebase_init.js",
            "pos_seerbit/static/src/js/firebase_listener.js",
            "pos_seerbit/static/src/xml/PaymentScreenPaymentLines.xml",
            "pos_seerbit/static/src/scss/pos.scss",
        ],
    },
    "license": "OPL-1",
    "images": ["static/description/seerbit.gif"],
    "external_dependencies": {
        "python": [
            "firebase-admin>=2.0.0",
            "google-cloud-firestore>=2.0.0",
            "google-auth>=2.0.0",
        ],
    },
}
