"""
Configuration management for Seerbit Odoo integration.
Loads environment variables with fallbacks to default values.
"""

import os
from pathlib import Path


def get_env_var(key, default=None, required=False):
    """
    Get environment variable with fallback to default value.

    Args:
        key (str): Environment variable name
        default: Default value if environment variable is not set
        required (bool): If True, raises ValueError when variable is not set

    Returns:
        The environment variable value or default

    Raises:
        ValueError: If required=True and variable is not set
    """
    value = os.getenv(key, default)
    if required and value is None:
        raise ValueError(f"Required environment variable {key} is not set")
    return value


class SeerbitConfig:
    """Configuration class for Seerbit integration"""

    # Firebase Configuration
    FIREBASE_CRED_PATH = get_env_var(
        'FIREBASE_CRED_PATH', 'service-account-write.json')
    FIREBASE_DB_URL = get_env_var(
        'FIREBASE_DB_URL', 'https://your-firebase-db.firebaseio.com')

    # Frontend Firebase Configuration (Read-only)
    FIREBASE_API_KEY = get_env_var('FIREBASE_API_KEY', 'YOUR_READONLY_API_KEY')
    FIREBASE_DATABASE_URL = get_env_var(
        'FIREBASE_DATABASE_URL', 'YOUR_DATABASE_URL')
    FIREBASE_PROJECT_ID = get_env_var('FIREBASE_PROJECT_ID', 'YOUR_PROJECT_ID')

    # Seerbit Configuration
    # Note: Seerbit public key is configured per payment method in Odoo, not via environment variables

    # Odoo Configuration
    ODOO_DB_HOST = get_env_var('ODOO_DB_HOST', 'localhost')
    ODOO_DB_PORT = get_env_var('ODOO_DB_PORT', '5432')
    ODOO_DB_NAME = get_env_var('ODOO_DB_NAME', 'odoo')
    ODOO_DB_USER = get_env_var('ODOO_DB_USER', 'odoo')
    ODOO_DB_PASSWORD = get_env_var('ODOO_DB_PASSWORD', 'odoo_password')

    @classmethod
    def validate_config(cls):
        """
        Validate that all required configuration is present.

        Raises:
            ValueError: If required configuration is missing
        """
        required_vars = [
            ('FIREBASE_DB_URL', cls.FIREBASE_DB_URL),
            ('FIREBASE_API_KEY', cls.FIREBASE_API_KEY),
            ('FIREBASE_DATABASE_URL', cls.FIREBASE_DATABASE_URL),
            ('FIREBASE_PROJECT_ID', cls.FIREBASE_PROJECT_ID),
        ]

        missing_vars = []
        for var_name, var_value in required_vars:
            if var_value in ['YOUR_READONLY_API_KEY', 'YOUR_DATABASE_URL', 'YOUR_PROJECT_ID',
                             'https://your-firebase-db.firebaseio.com']:
                missing_vars.append(var_name)

        if missing_vars:
            raise ValueError(
                f"Missing or invalid configuration for: {', '.join(missing_vars)}")

    @classmethod
    def get_firebase_config_for_frontend(cls):
        """
        Get Firebase configuration for frontend (read-only access).

        Returns:
            dict: Firebase configuration object
        """
        return {
            'apiKey': cls.FIREBASE_API_KEY,
            'databaseURL': cls.FIREBASE_DATABASE_URL,
            'projectId': cls.FIREBASE_PROJECT_ID
        }

    @classmethod
    def get_firebase_config_for_backend(cls):
        """
        Get Firebase configuration for backend (write access).

        Returns:
            dict: Firebase configuration object
        """
        return {
            'credPath': cls.FIREBASE_CRED_PATH,
            'databaseURL': cls.FIREBASE_DB_URL
        }


# Global config instance
config = SeerbitConfig()
