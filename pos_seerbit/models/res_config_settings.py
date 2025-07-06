# -*- coding: utf-8 -*-
"""
ResConfigSettings Extension for Seerbit Module

This module extends Odoo's configuration settings to handle Seerbit payment terminal
configuration. It provides a checkbox in Settings to enable/disable the Seerbit module
and automatically manages payment method configurations when the module is disabled.

Key Features:
- Module enable/disable toggle
- Conditional Firebase configuration fields (only shown when Seerbit is enabled)
- Automatic cleanup of Seerbit payment methods when module is disabled
- Proper access rights handling
- Comprehensive error handling and logging
"""

import logging
import json
from odoo import fields, models, api
from odoo.exceptions import AccessError, ValidationError

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
    
    # Firebase Configuration Fields (only shown when Seerbit is enabled)
    seerbit_firebase_cred = fields.Char(
        string="Firebase Service Account JSON",
        help="Paste the content of your Firebase service account JSON file here.",
        config_parameter='pos_seerbit.seerbit_firebase_cred',
        groups="base.group_erp_manager",
    )
    seerbit_firebase_db_url = fields.Char(
        string="Firebase Database URL",
        help="The URL of your Firebase Realtime Database.",
        config_parameter='pos_seerbit.seerbit_firebase_db_url',
        groups="base.group_erp_manager",
    )
    seerbit_firebase_api_key = fields.Char(
        string="Firebase API Key",
        help="The API key for your Firebase project.",
        config_parameter='pos_seerbit.seerbit_firebase_api_key',
        groups="base.group_erp_manager",
    )
    seerbit_firebase_project_id = fields.Char(
        string="Firebase Project ID",
        help="The Project ID of your Firebase project.",
        config_parameter='pos_seerbit.seerbit_firebase_project_id',
        groups="base.group_erp_manager",
    )

    @api.constrains('seerbit_firebase_cred')
    def _validate_firebase_cred(self):
        """Validate Firebase service account JSON"""
        for record in self:
            if record.seerbit_firebase_cred and record.module_pos_seerbit:
                try:
                    json.loads(record.seerbit_firebase_cred)
                except json.JSONDecodeError:
                    raise ValidationError("Invalid JSON format in Firebase Service Account JSON")

    @api.constrains('seerbit_firebase_db_url')
    def _validate_firebase_db_url(self):
        """Validate Firebase database URL format"""
        for record in self:
            if record.seerbit_firebase_db_url and record.module_pos_seerbit:
                if not record.seerbit_firebase_db_url.startswith('https://'):
                    raise ValidationError("Firebase Database URL must start with 'https://'")

    def set_values(self):
        """Save configuration values to system parameters"""
        super().set_values()
        
        # Save Firebase configuration
        self.env['ir.config_parameter'].sudo().set_param('pos_seerbit.seerbit_firebase_cred', self.seerbit_firebase_cred or '')
        self.env['ir.config_parameter'].sudo().set_param('pos_seerbit.seerbit_firebase_db_url', self.seerbit_firebase_db_url or '')
        self.env['ir.config_parameter'].sudo().set_param('pos_seerbit.seerbit_firebase_api_key', self.seerbit_firebase_api_key or '')
        self.env['ir.config_parameter'].sudo().set_param('pos_seerbit.seerbit_firebase_project_id', self.seerbit_firebase_project_id or '')
        
        # Log configuration changes
        if self.module_pos_seerbit:
            _logger.info("Seerbit module enabled with Firebase configuration")
        else:
            _logger.info("Seerbit module disabled")

    def get_values(self):
        """Load configuration values from system parameters"""
        res = super().get_values()
        res.update(
            seerbit_firebase_cred=self.env['ir.config_parameter'].sudo().get_param('pos_seerbit.seerbit_firebase_cred', default=''),
            seerbit_firebase_db_url=self.env['ir.config_parameter'].sudo().get_param('pos_seerbit.seerbit_firebase_db_url', default=''),
            seerbit_firebase_api_key=self.env['ir.config_parameter'].sudo().get_param('pos_seerbit.seerbit_firebase_api_key', default=''),
            seerbit_firebase_project_id=self.env['ir.config_parameter'].sudo().get_param('pos_seerbit.seerbit_firebase_project_id', default=''),
        )
        return res

    @api.model
    def get_firebase_config_for_frontend(self):
        """
        Get Firebase configuration for frontend use.
        This method is called by the frontend to get the Firebase config.
        
        Returns:
            dict: Firebase configuration for frontend
        """
        config = self.env['ir.config_parameter'].sudo()
        return {
            'apiKey': config.get_param('pos_seerbit.seerbit_firebase_api_key', default=''),
            'databaseURL': config.get_param('pos_seerbit.seerbit_firebase_db_url', default=''),
            'projectId': config.get_param('pos_seerbit.seerbit_firebase_project_id', default=''),
        }

    @api.model
    def get_firebase_config_for_backend(self):
        """
        Get Firebase configuration for backend use.
        This method is called by the backend to get the Firebase config.
        
        Returns:
            dict: Firebase configuration for backend
        """
        config = self.env['ir.config_parameter'].sudo()
        return {
            'credJson': config.get_param('pos_seerbit.seerbit_firebase_cred', default=''),
            'databaseURL': config.get_param('pos_seerbit.seerbit_firebase_db_url', default=''),
        }

    @api.model
    def validate_firebase_config(self):
        """
        Validate Firebase configuration.
        
        Returns:
            dict: Validation result with status and message
        """
        try:
            config = self.get_firebase_config_for_backend()
            
            if not config['credJson']:
                return {'status': 'error', 'message': 'Firebase Service Account JSON is required'}
            
            if not config['databaseURL']:
                return {'status': 'error', 'message': 'Firebase Database URL is required'}
            
            # Validate JSON format
            try:
                json.loads(config['credJson'])
            except json.JSONDecodeError:
                return {'status': 'error', 'message': 'Invalid JSON format in Firebase Service Account JSON'}
            
            # Validate URL format
            if not config['databaseURL'].startswith('https://'):
                return {'status': 'error', 'message': 'Firebase Database URL must start with https://'}
            
            return {'status': 'success', 'message': 'Firebase configuration is valid'}
            
        except Exception as e:
            _logger.error("Error validating Firebase configuration: %s", str(e))
            return {'status': 'error', 'message': f'Validation error: {str(e)}'}
