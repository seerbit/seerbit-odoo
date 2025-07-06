<div align="center">
 <img width="400" valign="top" src="./pos_seerbit/static/description/seerbit_logo.png"/>
</div>

<h1 align="center">
    <a href="https://apps.odoo.com/apps/modules/16.0/pos_seerbit/">
    Seerbit Odoo Point of Sale</a><br/>
</h1>
<h2 align="center">
An Odoo Integration for Seerbit POS Terminal (Now with Firebase Reconciliation)
</h2>

## Version: 0.1.3

> **Note:** As of v0.1.3, this module uses Firebase Realtime Database for payment requests and reconciliation, replacing the previous webhook-based approach. Payment requests are sent to the `transactions` collection, and reconciliation events are received from the `reconciliations` collection via Firebase listeners in the POS frontend.

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

## 🚀 Odoo.sh Installation

### Prerequisites

- Odoo.sh account with access to custom modules
- Firebase project with Realtime Database
- Seerbit merchant account
- Git installed on your system

### Quick Deployment (Recommended)

#### Option 1: Python Script (Cross-platform)

```bash
python deploy-to-odoo-sh.py
```

#### Option 2: PowerShell (Windows)

```powershell
.\deploy-to-odoo-sh.ps1
```

#### Option 3: Batch File (Windows)

```cmd
deploy-to-odoo-sh.bat
```

#### Option 4: Manual Deployment

```bash
git clone https://github.com/your-username/seerbit-odoo.git
cd seerbit-odoo
git remote add odoo-sh https://github.com/odoo/your-odoo-sh-repo.git
git push odoo-sh 16.0:master
```

### After Deployment

- Configure environment variables in Odoo.sh (see ODOO_SH_DEPLOYMENT.md)
- Upload your Firebase service account JSON
- Install the module from Apps
- Configure the payment method in Point of Sale

### Configuration

#### Firebase Setup

1. Create a Firebase project
2. Enable Realtime Database
3. Get your firebase service account json for backend access
4. Get API key for frontend access

#### Seerbit Setup

1. Get your public key from Seerbit dashboard
2. Configure webhook endpoints (if using webhook fallback)
3. Test payment flow

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
