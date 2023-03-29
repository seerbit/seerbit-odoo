# Odoo.sh Deployment Guide for Seerbit Module

## 📋 Prerequisites

Before deploying to Odoo.sh, ensure you have:

- ✅ Odoo.sh account with custom module access
- ✅ Firebase project with Realtime Database
- ✅ Seerbit merchant account
- ✅ Git repository access

## 🚀 Step-by-Step Deployment

### Step 1: Prepare Your Local Repository

```bash
# Clone your repository
git clone https://github.com/your-username/seerbit-odoo.git
cd seerbit-odoo

# Ensure you're on the correct branch
git checkout 16.0

# Verify all files are present
ls -la
```

### Step 2: Connect to Odoo.sh Repository

```bash
# Get your Odoo.sh repository URL from your Odoo.sh dashboard
# It will look like: https://github.com/odoo/your-company-your-project.git

# Add Odoo.sh as remote
git remote add odoo-sh https://github.com/odoo/your-company-your-project.git

# Verify remotes
git remote -v
```

### Step 3: Push to Odoo.sh

```bash
# Push your module to Odoo.sh
git push odoo-sh 16.0:master

# If you get conflicts, you may need to:
git pull odoo-sh master
git push odoo-sh 16.0:master
```

### Step 4: Configure Firebase

#### 4.1 Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable Realtime Database
4. Set up security rules:

```json
{
  "rules": {
    "transactions": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "reconciliations": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```

#### 4.2 Create Service Account

1. Go to **Project Settings > Service Accounts**
2. Click **Generate New Private Key**
3. Download the JSON file
4. Rename it to `service-account-write.json`

#### 4.3 Get API Keys

1. Go to **Project Settings > General**
2. Copy the **Web API Key**
3. Note your **Project ID**

### Step 5: Configure Odoo.sh Environment Variables

#### 5.1 Access System Parameters

1. Go to your Odoo.sh instance
2. Navigate to **Settings > Technical > Parameters > System Parameters**
3. Add the following parameters:

| Parameter               | Value                        | Example                               |
| ----------------------- | ---------------------------- | ------------------------------------- |
| `FIREBASE_CRED_PATH`    | `service-account-write.json` | `service-account-write.json`          |
| `FIREBASE_DB_URL`       | Your Firebase DB URL         | `https://your-project.firebaseio.com` |
| `FIREBASE_API_KEY`      | Your Firebase API Key        | `AIzaSyC...`                          |
| `FIREBASE_DATABASE_URL` | Your Firebase DB URL         | `https://your-project.firebaseio.com` |
| `FIREBASE_PROJECT_ID`   | Your Firebase Project ID     | `your-project-id`                     |

#### 5.2 Upload Service Account File

1. Go to **Settings > Technical > Files**
2. Upload your `service-account-write.json` file
3. Note the file path (usually `/web/content/...`)

### Step 6: Install the Module

#### 6.1 Enable Developer Mode

1. Go to **Settings**
2. Click **Activate the developer mode** at the bottom
3. Refresh the page

#### 6.2 Install Module

1. Go to **Apps**
2. Click **Update Apps List** (if needed)
3. Search for "Seerbit"
4. Click **Install**

### Step 7: Configure Payment Method

#### 7.1 Create Payment Method

1. Go to **Point of Sale > Configuration > Payment Methods**
2. Click **Create**
3. Fill in the details:
   - **Name**: Seerbit Terminal
   - **Payment Terminal**: Seerbit
       - **Seerbit Public Key**: Configure this in POS payment method, not via environment variables
4. Click **Save**

#### 7.2 Configure POS

1. Go to **Point of Sale > Configuration > Point of Sale**
2. Edit your POS configuration
3. Add the Seerbit payment method
4. Save

### Step 8: Test the Integration

#### 8.1 Test Payment Flow

1. Open Point of Sale
2. Create a new order
3. Add items to cart
4. Select Seerbit payment method
5. Process payment
6. Check Firebase for transaction data

#### 8.2 Verify Reconciliation

1. Check Firebase `reconciliations` collection
2. Verify payment status updates in Odoo
3. Check payment records are created

## 🔧 Troubleshooting

### Common Issues

#### Module Not Installing

- Check Odoo.sh logs: **Settings > Technical > Logging**
- Verify all dependencies are available
- Check for syntax errors in Python/JavaScript files

#### Firebase Connection Failed

- Verify service account file is uploaded
- Check Firebase database URL is correct
- Ensure Firebase security rules allow read/write

#### Payment Not Reconciling

- Check Firebase security rules
- Verify reconciliation data format
- Check Odoo.sh logs for errors

#### Frontend Errors

- Check browser console for JavaScript errors
- Verify Firebase API key is correct
- Check network connectivity

### Debugging Steps

#### 1. Check Logs

```bash
# In Odoo.sh, go to Settings > Technical > Logging
# Look for Seerbit-related errors
```

#### 2. Test Firebase Connection

```python
# In Odoo shell, test Firebase connection
import firebase_admin
from firebase_admin import credentials, db

# Test connection
cred = credentials.Certificate('path/to/service-account.json')
firebase_admin.initialize_app(cred, {'databaseURL': 'your-db-url'})
ref = db.reference('test')
ref.set({'test': 'data'})
```

#### 3. Verify Environment Variables

```python
# In Odoo shell, check environment variables
import os
print(os.getenv('FIREBASE_DB_URL'))
print(os.getenv('FIREBASE_API_KEY'))
```

## 📞 Support

If you encounter issues:

1. **Check Odoo.sh logs** first
2. **Verify Firebase configuration**
3. **Test with minimal setup**
4. **Contact support** with specific error messages

## 🔄 Updates

To update the module:

```bash
# Make changes locally
git add .
git commit -m "Update description"
git push odoo-sh 16.0:master

# Odoo.sh will automatically rebuild
# Check the build logs for any issues
```

## ✅ Success Checklist

- [ ] Repository pushed to Odoo.sh
- [ ] Firebase project configured
- [ ] Service account uploaded
- [ ] Environment variables set
- [ ] Module installed
- [ ] Payment method configured
- [ ] Test payment successful
- [ ] Reconciliation working
- [ ] Payment records created

Your Seerbit integration should now be fully functional on Odoo.sh! 🎉
