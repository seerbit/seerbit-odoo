# -*- coding: utf-8 -*-
"""
ResConfigSettings Extension for Seerbit Module

This module extends Odoo's configuration settings to handle Seerbit payment terminal
configuration. It provides a checkbox in Settings to enable/disable the Seerbit module
and automatically manages payment method configurations when the module is disabled.

Key Features:
- Module enable/disable toggle
- Automatic cleanup of Seerbit payment methods when module is disabled
- Proper access rights handling
- Comprehensive error handling and logging
"""

import logging
from odoo import fields, models
from odoo.exceptions import AccessError

# Set up logging for this module
_logger = logging.getLogger(__name__)


class ResConfigSettings(models.TransientModel):
    """
    Configuration Settings for Seerbit Module
    
    This class extends Odoo's base configuration settings to add Seerbit-specific
    configuration options. It inherits from res.config.settings which is Odoo's
    standard way to handle system configuration.
    """
    _inherit = "res.config.settings"

    # Configuration field for enabling/disabling Seerbit module
    module_pos_seerbit = fields.Boolean(
        string="Seerbit Payment Terminal",
        help="""Enable Seerbit payment terminal integration.
                When enabled, transactions will be processed and synced with your Seerbit POS Terminal.
                Set your terminal credentials on the payment method configuration.""",
    )

    def set_values(self):
        """
        Save configuration values and perform cleanup operations
        
        This method is called when the user saves the configuration settings.
        It handles the logic for enabling/disabling the Seerbit module and
        performs necessary cleanup operations.
        
        Key Operations:
        1. Call parent set_values() to handle standard configuration
        2. Check if Seerbit module is being disabled
        3. If disabled, find and disable all Seerbit payment methods
        4. Handle any access rights or other errors gracefully
        """
        # Call parent method to handle standard configuration saving
        super(ResConfigSettings, self).set_values()
        
        # Check if the Seerbit module is being disabled
        # We use sudo() to bypass access restrictions when reading config parameters
        module_enabled = self.env["ir.config_parameter"].sudo().get_param("pos_seerbit.module_pos_seerbit")
        
        if not module_enabled:
            # Module is being disabled, perform cleanup operations
            try:
                # Use sudo() to bypass access rights for system operations
                # This ensures the cleanup can happen even if the current user
                # doesn't have full access to payment methods
                payment_methods = self.env["pos.payment.method"].sudo()
                
                # Search for all payment methods that use Seerbit terminal
                seerbit_methods = payment_methods.search([
                    ("use_payment_terminal", "=", "seerbit")
                ])
                
                # If we found any Seerbit payment methods, disable them
                if seerbit_methods:
                    # Disable the Seerbit terminal for all found payment methods
                    seerbit_methods.write({"use_payment_terminal": False})
                    
                    # Log the cleanup operation for debugging
                    _logger.info(
                        "Disabled Seerbit payment terminal for %d payment methods: %s",
                        len(seerbit_methods),
                        ", ".join(seerbit_methods.mapped('name'))
                    )
                else:
                    _logger.info("No Seerbit payment methods found to disable")
                    
            except AccessError as e:
                # Handle access rights errors gracefully
                # This can happen if the user doesn't have permission to modify payment methods
                _logger.warning(
                    "Could not disable Seerbit payment methods due to access rights: %s",
                    str(e)
                )
                
            except Exception as e:
                # Handle any other unexpected errors
                # This ensures the configuration save doesn't fail due to cleanup issues
                _logger.error(
                    "Error disabling Seerbit payment methods: %s",
                    str(e)
                )
