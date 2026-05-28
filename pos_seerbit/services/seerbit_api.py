import requests
import logging
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

class SeerbitAPI:
    def __init__(self, env):
        self.env = env
        
        # Get Secret Key from config
        self.secret_key = self.env['ir.config_parameter'].sudo().get_param('pos_seerbit.seerbit_secret_key', default='')
        
        # Get Public Key from config
        self.public_key = self.env['ir.config_parameter'].sudo().get_param('pos_seerbit.seerbit_public_key', default='')
        
        self._encrypted_key = None
        
        if not self.secret_key or not self.public_key:
            _logger.warning("Seerbit Secret Key or Public Key is not configured.")

    def _get_encrypted_key(self):
        if self._encrypted_key:
            return self._encrypted_key
            
        if not self.secret_key or not self.public_key:
             raise UserError("Seerbit keys are missing. Please configure them in Settings.")

        url = 'https://seerbitapi.com/api/v2/encrypt/keys'
        payload = {
            "key": f"{self.secret_key}.{self.public_key}"
        }
        try:
            response = requests.post(url, json=payload, headers={'Content-Type': 'application/json'}, timeout=10)
            response.raise_for_status()
            res_data = response.json()
            if res_data.get('status') == 'SUCCESS' and 'data' in res_data:
                data = res_data['data']
                if 'EncryptedSecKey' in data and 'encryptedKey' in data['EncryptedSecKey']:
                    self._encrypted_key = data['EncryptedSecKey']['encryptedKey']
                    return self._encrypted_key
            raise UserError("Failed to parse encrypted key from Seerbit response")
        except Exception as e:
            _logger.error(f"Seerbit Encrypt Key Error: {e}")
            raise UserError(f"Failed to authenticate with Seerbit: {str(e)}")

    def _get_headers(self):
        return {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self._get_encrypted_key()}'
        }

    # Virtual Accounts
    def create_virtual_account(self, full_name, reference, email, currency="NGN", country="NG"):
        url = 'https://seerbitapi.com/api/v2/virtual-accounts'
        payload = {
            "publicKey": self.public_key,
            "fullName": full_name,
            "bankVerificationNumber": "",
            "currency": currency,
            "country": country,
            "reference": reference,
            "email": email
        }
        
        try:
            response = requests.post(url, headers=self._get_headers(), json=payload, timeout=10)
            _logger.info("Seerbit HTTPS Response [POST %s]: Status %s - Body: %s", url, response.status_code, response.text)
            response.raise_for_status()
            res_data = response.json()
            if res_data.get('status') == 'SUCCESS' and 'data' in res_data:
                return res_data['data']
            raise UserError(f"Seerbit Error: {res_data.get('message', 'Unknown Error')}")
        except UserError:
            raise
        except Exception as e:
            _logger.error(f"Seerbit Create VA Error: {e}")
            raise UserError(f"Failed to create Virtual Account: {str(e)}")

    def delete_virtual_account(self, reference):
        url = f'https://seerbitapi.com/api/v2/virtual-accounts/{reference}'
        try:
            response = requests.delete(url, headers=self._get_headers(), timeout=10)
            _logger.info("Seerbit HTTPS Response [DELETE %s]: Status %s - Body: %s", url, response.status_code, response.text)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            _logger.error(f"Seerbit Delete VA Error: {e}")
            return False

    # Invoicing
    def create_invoice(self, order_no, due_date, currency, receivers_name, customer_email, invoice_items):
        url = 'https://merchant.seerbitapi.com/invoice/create'
        payload = {
            "publicKey": self.public_key,
            "orderNo": order_no,
            "dueDate": due_date,
            "currency": currency,
            "receiversName": receivers_name,
            "customerEmail": customer_email,
            "invoiceItems": invoice_items
        }
        
        try:
            response = requests.post(url, headers=self._get_headers(), json=payload, timeout=10)
            _logger.info("Seerbit HTTPS Response [POST %s]: Status %s - Body: %s", url, response.status_code, response.text)
            response.raise_for_status()
            res_data = response.json()
            if res_data.get('code') == '00':
                return res_data['payload']
            raise UserError(f"Seerbit Error: {res_data.get('message', 'Unknown Error')}")
        except UserError:
            raise
        except Exception as e:
            _logger.error(f"Seerbit Create Invoice Error: {e}")
            raise UserError(f"Failed to create Seerbit Invoice: {str(e)}")

    def get_invoice(self, invoice_no):
        url = f'https://merchant.seerbitapi.com/invoice/{self.public_key}/{invoice_no}'
        try:
            response = requests.get(url, headers=self._get_headers(), timeout=10)
            _logger.info("Seerbit HTTPS Response [GET %s]: Status %s - Body: %s", url, response.status_code, response.text)
            response.raise_for_status()
            res_data = response.json()
            if res_data.get('code') == '00':
                return res_data['payload']
            return False
        except Exception as e:
            _logger.error(f"Seerbit Get Invoice Error: {e}")
            return None

    def send_invoice(self, invoice_no):
        """
        Triggers Seerbit to send the invoice to the customer's email.
        """
        if not self.public_key:
            raise UserError("Seerbit Public Key is not configured. Please check your POS settings.")
            
        url = f"https://merchant.seerbitapi.com/invoice/{self.public_key}/send/{invoice_no}"
        
        try:
            response = requests.get(url, headers=self._get_headers(), timeout=10)
            _logger.info("Seerbit HTTPS Response [GET %s]: Status %s - Body: %s", url, response.status_code, response.text)
            
            response.raise_for_status()
            res_data = response.json()
            
            if res_data.get('status') == 'SUCCESS' or str(res_data.get('code')) in ('00', '200'):
                return True
                
            raise UserError(f"Seerbit Error: {res_data.get('message', 'Unknown Error')}")
            
        except UserError:
            raise
        except Exception as e:
            _logger.error(f"Seerbit Send Invoice Error: {e}")
            raise UserError(f"Failed to send Seerbit Invoice: {str(e)}")

    def delete_invoice(self, invoice_no):
        url = f'https://merchant.seerbitapi.com/invoice/{self.public_key}/{invoice_no}'
        try:
            response = requests.delete(url, headers=self._get_headers(), timeout=10)
            _logger.info("Seerbit HTTPS Response [DELETE %s]: Status %s - Body: %s", url, response.status_code, response.text)
            response.raise_for_status()
            return True
        except Exception as e:
            _logger.warning(f"Seerbit Delete Invoice Error: {e}")
            return False

    # Payment Links
    def create_payment_link(self, amount, currency, email, description, paymentLinkName, oneTime=True):
        import uuid
        url = 'https://paymentlink.seerbitapi.com/paymentlink/v2/payLinks/api'
        payload = {
            "status": "ACTIVE",
            "paymentLinkName": paymentLinkName,
            "description": description,
            "currency": currency,
            "amount": str(amount),
            "successMessage": "Thank you for your payment",
            "publicKey": self.public_key,
            "customizationName": f"Odoo-{uuid.uuid4().hex[:8]}",
            "paymentFrequency": "ONE_TIME",
            "email": email,
            "requiredFields": {
                "address": False,
                "amount": True,
                "customerName": True,
                "mobileNumber": False,
                "invoiceNumber": False
            },
            "linkExpirable": False,
            "oneTime": oneTime
        }
        
        try:
            response = requests.post(url, headers=self._get_headers(), json=payload, timeout=15)
            _logger.info("Seerbit HTTPS Response [POST %s]: Status %s - Body: %s", url, response.status_code, response.text)
            response.raise_for_status()
            res_data = response.json()
            if res_data.get('data') and 'paymentLinks' in res_data['data']:
                return res_data['data']['paymentLinks']
            raise UserError(f"Seerbit Error: {res_data.get('message', 'Unknown Error')}")
        except UserError:
            raise
        except Exception as e:
            _logger.error(f"Seerbit Create Payment Link Error: {e}")
            raise UserError(f"Failed to create Seerbit Payment Link: {str(e)}")

    def update_payment_link(self, payment_link_id, amount, currency, email, description, paymentLinkName, oneTime=True):
        import uuid
        url = 'https://paymentlink.seerbitapi.com/paymentlink/v2/payLinks/api'
        payload = {
            "paymentLinkId": payment_link_id,
            "status": "ACTIVE",
            "paymentLinkName": paymentLinkName,
            "description": description,
            "currency": currency,
            "amount": str(amount),
            "successMessage": "Thank you for your payment",
            "publicKey": self.public_key,
            "customizationName": f"Odoo-{uuid.uuid4().hex[:8]}",
            "paymentFrequency": "ONE_TIME",
            "email": email,
            "requiredFields": {
                "address": False,
                "amount": True,
                "customerName": True,
                "mobileNumber": False,
                "invoiceNumber": False
            },
            "linkExpirable": False,
            "oneTime": oneTime
        }
        
        try:
            response = requests.put(url, headers=self._get_headers(), json=payload, timeout=15)
            _logger.info("Seerbit HTTPS Response [PUT %s]: Status %s - Body: %s", url, response.status_code, response.text)
            response.raise_for_status()
            res_data = response.json()
            if res_data.get('status') == 'SUCCESS' or str(res_data.get('code')) in ('00', '200'):
                return True
            raise UserError(f"Seerbit Error: {res_data.get('message', 'Unknown Error')}")
        except UserError:
            raise
        except Exception as e:
            _logger.error(f"Seerbit Update Payment Link Error: {e}")
            raise UserError(f"Failed to update Seerbit Payment Link: {str(e)}")

    def delete_payment_link(self, payment_link_id):
        url = f'https://paymentlink.seerbitapi.com/paymentlink/v2/payLinks/api/deleteLink/{payment_link_id}'
        try:
            response = requests.delete(url, headers=self._get_headers(), timeout=15)
            _logger.info("Seerbit HTTPS Response [DELETE %s]: Status %s - Body: %s", url, response.status_code, response.text)
            response.raise_for_status()
            res_data = response.json()
            if res_data.get('status') == 'Deleted':
                return True
            raise UserError(f"Seerbit Error: {res_data.get('message', 'Unknown Error')}")
        except UserError:
            raise
        except Exception as e:
            _logger.error(f"Seerbit Delete Payment Link Error: {e}")
            raise UserError(f"Failed to delete Seerbit Payment Link: {str(e)}")
