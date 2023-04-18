# -*- coding: utf-8 -*-
{
    'name': 'Seerbit Odoo Point of Sale',
    'version': '0.1.2',
    'category': 'Sales/Point of Sale',
    'summary': 'Integrate your POS with a Seerbit payment terminal',
    "author": "Seerbit",
    "website": "https://github.com/seerbit/seerbit-odoo",
    'data': [
        'data/account_journal.xml',
        'data/pos.payment.method.csv',
        'views/res_config_settings_views.xml',
        'views/pos_payment_method_views.xml',
    ],
    'depends': ['point_of_sale'],
    'installable': True,
    'assets': {
        'point_of_sale.assets': [
            'pos_seerbit/static/src/**/*',
        ],
    },
    'license': 'OPL-1',
    'images': ['static/description/seerbit.gif']
}
