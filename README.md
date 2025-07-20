<div align="center">
 <img width="400" valign="top" src="./pos_seerbit/static/description/seerbit_logo.png"/>
</div>

<h1 align="center">
    <a href="https://apps.odoo.com/apps/modules/16.0/pos_seerbit/">
    Seerbit Odoo Point of Sale</a><br/>
</h1>
<h2 align="center">
An Odoo Integration for Seerbit POS Terminal 
</h2>

## Version: 0.1.3

> **Note:** As of v0.1.3, this module uses Firebase Realtime Database for payment requests and reconciliation, replacing the previous webhook-based approach. 

## How to Use

A user guide is available [here](https://apps.odoo.com/apps/modules/16.0/pos_seerbit/)

## Version History

## **[0.1.3]** 07/07/2025
### Impacted Versions:

- Odoo16 - 18/04/2023
- Odoo15 - 18/04/2023

### Changes:

- Firebase replaces webhooks now for payment reconciliation

## Version History

## **[0.1.2]** 18/04/2023

### Impacted Versions:

- Odoo16 - 18/04/2023
- Odoo15 - 18/04/2023

### Changes:

- Elimination of the need of Seerbit account `SECRET KEY`
- Code refactoring

## Version History

## **[0.1.1]** 17/04/2023

### Impacted Versions:

- Odoo16 - 17/04/2023
- Odoo15 - 17/04/2023

### Changes:

- Moved payment matching logic to python layer
- Ensures that latest response gets deleted after consumption

## **[0.0.1]** 30/03/2023

### Impacted Versions:

- Odoo16 - 30/03/2023

### Changes:

- creates the Seerbit bank journal at installation.
- creates a manual Seerbit payment method at installation.
- listens for Seerbit's notification at `your_odoo_url/pos_seerbit/notification`.
- requires Seerbit's public key for automatic confirmation.
- introduced `waitingSeerbit` payment status
- introduced a sensitive action button CSS class named `dangerous`.
- Cashiers can force payment confirmation while waiting for automatic confirmation.

# Seerbit Odoo POS Integration

Firebase-based payment reconciliation for Odoo Point of Sale with Seerbit payment terminals.

## 🚀 Configuration

After installing the module, you need to configure it from the Odoo settings.

1.  Go to **Settings > General Settings > Seerbit**.
2.  Enable the **Seerbit Payment Terminal**.
3.  Fill in the Firebase credentials:
    *   **Firebase Service Account JSON**: Paste the content of your Firebase service account JSON file.
    *   **Firebase Database URL**: The URL of your Firebase Realtime Database.
    *   **Firebase API Key**: The API key for your Firebase project.
    *   **Firebase Project ID**: The Project ID of your Firebase project.
4.  Click **Save**.

### Seerbit Setup

1.  Get your public key from the Seerbit dashboard.
2.  Go to **Point of Sale > Configuration > Payment Methods** and select your Seerbit payment method.
3.  Paste the public key in the **Seerbit Public Key** field.
4.  Test the payment flow.

### Development

#### Local Development

```bash
# Install development dependencies
pip install -r requirements-dev.txt

# Run tests
pytest tests/ -v

# Run development tools
python dev-tools.py
```

#### Odoo.sh Development

1. Make changes in your local repository
2. Push to Odoo.sh branch
3. Test in Odoo.sh environment
4. Merge to production when ready

### Troubleshooting

#### Common Issues

1. **Firebase connection failed**: Check service account and database URL
2. **Payment not reconciling**: Verify Firebase security rules
3. **Module not installing**: Check Odoo.sh logs for errors

#### Logs

- Check Odoo.sh logs in **Settings > Technical > Logging**
- Look for Seerbit-related errors
- Verify Firebase configuration

### Support

For issues and questions:

- Check the logs in Odoo.sh
- Review Firebase configuration
- Verify Seerbit integration settings

## Features

- ✅ Firebase-based payment reconciliation
- ✅ Environment variable configuration
- ✅ Complete payment record creation
- ✅ Comprehensive error handling
- ✅ Test suite (16 tests)
- ✅ Odoo.sh compatible

## Version History

- **v0.1.3**: Firebase integration with environment config
- **v0.1.2**: Initial Seerbit integration
- **v0.1.1**: Basic POS payment terminal
