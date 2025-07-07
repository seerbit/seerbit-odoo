# -*- coding: utf-8 -*-
{
    "name": "Seerbit Odoo Point of Sale",
    "version": "0.1.4",
    "category": "Sales/Point of Sale",
    "summary": "Integrate your POS with a Seerbit payment terminal using Firebase for real-time payment and reconciliation.",
    "description": """
        Seerbit Odoo Point of Sale Integration
        
        This module integrates Seerbit payment terminals with Odoo Point of Sale.
        Features:
        - Real-time payment processing
        - Firebase integration for payment reconciliation
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
        # Option 1: Current setup (RECOMMENDED)
        # Firebase in web.assets_backend for global availability
        "web.assets_backend": [
            # Firebase SDK - Local files for better reliability
            "pos_seerbit/static/lib/firebase/firebase-app-compat.js",
            "pos_seerbit/static/lib/firebase/firebase-database-compat.js",
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
        "python": ["firebase-admin"],
    },
}
