# coding: utf-8
import requests
import json
import logging
import pprint

from odoo import http

_logger = logging.getLogger(__name__)


class PosSeerbitController(http.Controller):
    '''
    This is the webhook intended for listening to only Seerbit notifications
    It is understandable that a bad actor can choose post a fake "Seerbit-like"
        notification to this endpoint and in turn leads to wrong validation,
        as such, received notifications needs to be re-verified.
    '''
    @http.route('/pos_seerbit/notification', type='json', methods=['POST'], auth='none', csrf=False)
    def notification(self):
        data = json.loads(http.request.httprequest.data)
        # Ignore unknown ill-formed data
        try:
            notification = data.get('notificationItems')[0]["notificationRequestItem"]
            # ignore none transaction notification
            if notification["eventType"] != "transaction":
                return
            payment_method = http.request.env['pos.payment.method'].sudo().search(
                [('seerbit_public_key', '=', notification["data"]["publicKey"])], limit=1)

            if payment_method:
                # This notification is valid
                if (notification["data"]["code"] == "00"):# and
                    #self.is_verified(notification)):
                    payment_method.seerbit_latest_response = json.dumps(notification)
                    _logger.info('A payment notification has been saved')
                else:
                    _logger.info('A non-approved notification received from seerbit:\n%s',
                                pprint.pformat(data))
            else:
                _logger.error('Received a message with an invalid publickey: %s',
                            notification["data"]["publicKey"])
        
        except Exception as e:
            _logger.info('Unable to process notification:\n%s', pprint.pformat(data))
            _logger.info('Encounted Exception:\n%s', e)
