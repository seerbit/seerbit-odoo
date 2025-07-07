# -*- coding: utf-8 -*-
{
    "name": "Seerbit Odoo Point of Sale",
    "version": "0.1.4",
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
    """,
    "author": "Seerbit",
    "website": "https://github.com/seerbit/seerbit-odoo",
    "data": [
        "security/ir.model.access.csv",
        "data/account_journal.xml",
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
    "auto_install": False,
    "assets": {
        # Firestore SDK - Local files for better reliability
        "web.assets_backend": [
            "pos_seerbit/static/lib/firestore/firebase-app-compat.js",
            "pos_seerbit/static/lib/firestore/firebase-firestore-compat.js",
        ],
        "point_of_sale.assets": [
            # Seerbit assets
            "pos_seerbit/static/src/js/**/*",
            "pos_seerbit/static/src/scss/**/*",
            "pos_seerbit/static/src/xml/**/*",
        ],
    },
    "license": "OPL-1",
    "images": ["static/description/seerbit.gif"],
    "external_dependencies": {
        "python": [
            "firebase-admin>=6.2.0",
            "google-cloud-firestore>=2.11.0",
            "google-auth>=2.17.0",
        ],
    },
}
