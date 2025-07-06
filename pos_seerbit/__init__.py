# coding: utf-8
from . import config, controllers, models, utils

# Validate configuration on module load
try:
    config.config.validate_config()
except ValueError as e:
    import logging
    _logger = logging.getLogger(__name__)
    _logger.warning("Seerbit configuration validation failed: %s", str(e))
    _logger.warning(
        "Please check your .env file and ensure all required variables are set")
