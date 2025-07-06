# Seerbit Odoo Module Installation Guide

## Prerequisites

1. **Odoo 16.0** or later
2. **Python 3.8+** with pip
3. **Firebase project** with Realtime Database enabled
4. **Seerbit payment terminal** and credentials

## Installation Steps

### 1. Install Python Dependencies

```bash
pip install firebase-admin
```

### 2. Install the Module

#### Option A: Manual Installation
1. Copy the `pos_seerbit` folder to your Odoo addons directory
2. Restart Odoo server
3. Go to **Apps** → **Update Apps List**
4. Search for "Seerbit" and install the module

#### Option B: Odoo.sh Installation
1. Push the module to your Odoo.sh repository
2. The module will be automatically installed on the next deployment

### 3. Configure the Module

After installation:

1. **Go to Settings** → **General Settings**
2. **Scroll down** to find the **"Seerbit"** section
3. **Check the box** "Seerbit Payment Terminal" to enable the module
4. **Configure Firebase settings**:
   - **Firebase Database URL**: `https://your-project.firebaseio.com`
   - **Firebase API Key**: Your Firebase project API key
   - **Firebase Project ID**: Your Firebase project ID
   - **Firebase Service Account JSON**: Paste the entire content of your service account JSON file

### 4. Configure Payment Method

1. Go to **Point of Sale** → **Configuration** → **Payment Methods**
2. Find the **"Seerbit Terminal"** payment method
3. Click **Edit** and configure:
   - **Terminal ID**: Your Seerbit terminal ID
   - **Terminal Key**: Your Seerbit terminal key
   - **Terminal Secret**: Your Seerbit terminal secret

### 5. Configure Point of Sale

1. Go to **Point of Sale** → **Configuration** → **Point of Sale**
2. Edit your POS configuration
3. In the **Payment Methods** section, add the **"Seerbit Terminal"** payment method
4. Save the configuration

## Troubleshooting

### Module Not Visible in Apps
- Make sure the module is in the correct addons directory
- Check that `__manifest__.py` is properly formatted
- Restart Odoo server and update apps list

### Configuration Not Visible in Settings
- Ensure the module is properly installed
- Check that you have **Administrator** or **Settings** access rights
- Clear your browser cache and refresh the page

### Firebase Configuration Issues
- Verify your Firebase project is set up correctly
- Ensure the service account JSON is valid
- Check that the Realtime Database is enabled

### Payment Method Not Working
- Verify terminal credentials are correct
- Check that the payment method is added to your POS configuration
- Ensure Firebase configuration is complete

## Support

If you encounter issues:
1. Check the Odoo server logs for error messages
2. Verify all configuration steps are completed
3. Contact Seerbit support with your terminal details

## Security Notes

- Keep your Firebase service account JSON secure
- Never share terminal credentials
- Use HTTPS for all external connections
- Regularly update your Odoo installation 