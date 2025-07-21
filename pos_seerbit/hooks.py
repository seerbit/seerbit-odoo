from odoo import api, SUPERUSER_ID


def post_init_hook(cr, registry):
    """
    Ensure the Seerbit journal exists after module installation.
    Use the main company currency if available, otherwise use USD.
    """
    env = api.Environment(cr, SUPERUSER_ID, {})
    company = env['res.company'].search([], limit=1)
    currency = company.currency_id
    if not currency:
        currency = env.ref('base.USD', raise_if_not_found=False)

    journal = env['account.journal'].search([('code', '=', 'SEER')], limit=1)
    if not journal and currency:
        env['account.journal'].create({
            'name': 'Seerbit',
            'type': 'bank',
            'code': 'SEER',
            'currency_id': currency.id,
            'company_id': company.id,
            'show_on_dashboard': True,
            'active': True,
        }) 