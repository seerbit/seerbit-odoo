from odoo import api
import base64
import os


def post_init_hook(env):
    """
    Ensure the Seerbit journal and payment method exist after module installation.
    Use the main company currency if available, otherwise use USD.
    Set the Seerbit logo as the image for the payment method.
    """
    company = env['res.company'].search([], limit=1)
    currency = company.currency_id
    if not currency:
        currency = env.ref('base.USD', raise_if_not_found=False)

    journal = env['account.journal'].search([('code', '=', 'SEER')], limit=1)
    if not journal and currency:
        journal = env['account.journal'].create({
            'name': 'Seerbit',
            'type': 'bank',
            'code': 'SEER',
            'currency_id': currency.id,
            'company_id': company.id,
            'show_on_dashboard': True,
            'active': True,
        })
    else:
        journal = journal[:1]

    # Set image for Seerbit payment method
    payment_method = env['pos.payment.method'].search([('id', '=', env.ref('pos_seerbit.seerbit_pos', raise_if_not_found=False).id if env.ref('pos_seerbit.seerbit_pos', raise_if_not_found=False) else False)], limit=1)
    if not payment_method:
        payment_method = env['pos.payment.method'].search([('name', '=', 'Seerbit POS')], limit=1)
    if payment_method:
        logo_path = os.path.join(os.path.dirname(__file__), '../static/description/seerbit_logo.png')
        logo_path = os.path.abspath(logo_path)
        if os.path.exists(logo_path):
            with open(logo_path, 'rb') as f:
                image_data = base64.b64encode(f.read())
                payment_method.write({'image_128': image_data}) 