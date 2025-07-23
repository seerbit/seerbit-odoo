from odoo import api
import base64
import os
import logging

_logger = logging.getLogger(__name__)


def post_init_hook(env):
    """
    Safely ensure the Seerbit journal and payment method exist after module installation.
    This function handles existing records gracefully and updates them if needed.
    """
    try:
        company = env['res.company'].search([], limit=1)
        if not company:
            _logger.warning("No company found, skipping Seerbit setup")
            return
            
        currency = company.currency_id
        if not currency:
            currency = env.ref('base.USD', raise_if_not_found=False)
            if not currency:
                _logger.warning("No currency found, skipping Seerbit setup")
                return

        # Safely handle the Seerbit journal
        journal = env['account.journal'].search([('code', '=', 'SEER')], limit=1)
        if not journal:
            # Create new journal
            journal = env['account.journal'].create({
                'name': 'Seerbit',
                'type': 'bank',
                'code': 'SEER',
                'currency_id': currency.id,
                'company_id': company.id,
                'show_on_dashboard': True,
                'active': True,
            })
            _logger.info("Created Seerbit journal with ID: %s", journal.id)
        else:
            # Update existing journal if needed
            update_values = {}
            if journal.name != 'Seerbit':
                update_values['name'] = 'Seerbit'
            if journal.currency_id != currency:
                update_values['currency_id'] = currency.id
            if not journal.show_on_dashboard:
                update_values['show_on_dashboard'] = True
            if not journal.active:
                update_values['active'] = True
                
            if update_values:
                journal.write(update_values)
                _logger.info("Updated Seerbit journal with values: %s", update_values)

        # Safely handle the Seerbit payment method
        payment_method = env['pos.payment.method'].search([('name', '=', 'Seerbit POS')], limit=1)
        
        if not payment_method:
            # Create new payment method
            receivable_account = journal.default_account_id
            if not receivable_account:
                # Try to find a suitable receivable account
                receivable_account = env['account.account'].search([
                    ('account_type', '=', 'asset_receivable'),
                    ('company_id', '=', company.id),
                    ('deprecated', '=', False)
                ], limit=1)
            
            if receivable_account:
                payment_method = env['pos.payment.method'].create({
                    'name': 'Seerbit POS',
                    'journal_id': journal.id,
                    'use_payment_terminal': 'seerbit',
                    'receivable_account_id': receivable_account.id,
                    'is_cash_count': False,
                })
                _logger.info("Created Seerbit payment method with ID: %s", payment_method.id)
            else:
                _logger.warning("No suitable receivable account found, payment method not created")
        else:
            # Check if this payment method has associated payments
            has_payments = env['pos.payment'].search_count([('payment_method_id', '=', payment_method.id)]) > 0
            
            if has_payments:
                _logger.info("Payment method has associated payments, updating in place instead of recreating")
                # Update existing payment method if needed
                update_values = {}
                if payment_method.journal_id != journal:
                    update_values['journal_id'] = journal.id
                if payment_method.use_payment_terminal != 'seerbit':
                    update_values['use_payment_terminal'] = 'seerbit'
                
                # Check if receivable account needs updating
                if not payment_method.receivable_account_id:
                    receivable_account = journal.default_account_id
                    if not receivable_account:
                        receivable_account = env['account.account'].search([
                            ('account_type', '=', 'asset_receivable'),
                            ('company_id', '=', company.id),
                            ('deprecated', '=', False)
                        ], limit=1)
                    if receivable_account:
                        update_values['receivable_account_id'] = receivable_account.id
                
                if update_values:
                    payment_method.write(update_values)
                    _logger.info("Updated existing Seerbit payment method with values: %s", update_values)
            else:
                # No associated payments, we can safely recreate
                _logger.info("No associated payments found, recreating payment method")
                try:
                    # Archive the old payment method
                    payment_method.write({'active': False})
                    
                    # Create new payment method
                    receivable_account = journal.default_account_id
                    if not receivable_account:
                        receivable_account = env['account.account'].search([
                            ('account_type', '=', 'asset_receivable'),
                            ('company_id', '=', company.id),
                            ('deprecated', '=', False)
                        ], limit=1)
                    
                    if receivable_account:
                        payment_method = env['pos.payment.method'].create({
                            'name': 'Seerbit POS',
                            'journal_id': journal.id,
                            'use_payment_terminal': 'seerbit',
                            'receivable_account_id': receivable_account.id,
                            'is_cash_count': False,
                        })
                        _logger.info("Recreated Seerbit payment method with ID: %s", payment_method.id)
                    else:
                        _logger.warning("No suitable receivable account found, payment method not recreated")
                except Exception as e:
                    _logger.error("Failed to recreate payment method: %s", str(e))
                    # Reactivate the old one if recreation failed
                    payment_method.write({'active': True})
        
        # Set image for Seerbit payment method if it exists
        if payment_method:
            logo_path = os.path.join(os.path.dirname(__file__), '../static/description/seerbit_logo.png')
            logo_path = os.path.abspath(logo_path)
            if os.path.exists(logo_path):
                try:
                    with open(logo_path, 'rb') as f:
                        image_data = base64.b64encode(f.read())
                        payment_method.write({'image_128': image_data})
                    _logger.info("Set Seerbit payment method logo")
                except Exception as e:
                    _logger.warning("Failed to set payment method logo: %s", str(e))
            else:
                _logger.warning("Logo file not found at: %s", logo_path)
                
        _logger.info("Seerbit setup completed successfully")
        
    except Exception as e:
        _logger.error("Error during Seerbit setup: %s", str(e))
        # Don't raise the exception to prevent module installation failure
        # The module can still work without the journal/payment method 