# Debugging Payment Terminal Issues

## Error: `paymentTerminal.start_get_status_polling is not a function`

This error occurs when the payment terminal is not properly initialized or the method is not available.

## Debugging Steps

### 1. Check Browser Console

Open your browser's developer tools (F12) and check the console for:

- `PaymentSeerbit initialized` - Should appear when the payment terminal is created
- `PaymentSeerbit class defined with methods:` - Should show all available methods
- `PosSeerbitPaymentScreen: onMounted called` - Should appear when payment screen loads

### 2. Verify Payment Terminal Registration

In the browser console, run:

```javascript
// Check if the payment terminal is registered
console.log('Payment methods:', odoo.__DEBUG__.services['point_of_sale.PaymentInterface'].paymentMethods);

// Check if Seerbit is in the list
const seerbitTerminal = odoo.__DEBUG__.services['point_of_sale.PaymentInterface'].paymentMethods.seerbit;
console.log('Seerbit terminal:', seerbitTerminal);
console.log('Available methods:', seerbitTerminal ? Object.getOwnPropertyNames(seerbitTerminal.prototype) : 'Not found');
```

### 3. Check Payment Method Configuration

1. Go to **Point of Sale** → **Configuration** → **Payment Methods**
2. Find the **"Seerbit Terminal"** payment method
3. Verify:
   - **Use Payment Terminal** is set to "Seerbit"
   - **Seerbit Public Key** is filled in
   - The payment method is **active**

### 4. Check Module Installation

1. Go to **Settings** → **Technical** → **Modules** → **Modules**
2. Search for "pos_seerbit"
3. Verify status is "Installed"

### 5. Check Asset Loading

In browser console, check if assets are loaded:

```javascript
// Check if Firebase is loaded
console.log('Firebase available:', !!window.firebase);

// Check if our modules are loaded
console.log('PaymentSeerbit module:', odoo.__DEBUG__.services['pos_seerbit.payment']);
console.log('FirebaseInit module:', odoo.__DEBUG__.services['pos_seerbit.firebase_init']);
```

## Common Issues and Solutions

### Issue: Payment terminal not found
**Solution:** 
- Verify the payment method is configured with "Seerbit" terminal
- Check that the module is installed
- Clear browser cache and reload

### Issue: Method not available
**Solution:**
- Check that the payment terminal class is properly defined
- Verify the method is added to the prototype
- Check for JavaScript errors in console

### Issue: Firebase not initialized
**Solution:**
- Check Firebase configuration in Settings
- Verify Firebase SDK is loaded
- Check network connectivity

## Testing the Fix

After applying the fixes:

1. **Clear browser cache** and reload the page
2. **Open browser console** to see debug messages
3. **Try to make a payment** with Seerbit
4. **Check console output** for:
   - `PaymentSeerbit initialized`
   - `start_get_status_polling called`
   - No JavaScript errors

## Manual Test

To manually test the payment terminal:

```javascript
// In browser console
const pos = odoo.__DEBUG__.services['point_of_sale.PosGlobalState'].instance;
const paymentMethod = pos.payment_methods.find(pm => pm.use_payment_terminal === 'seerbit');
const terminal = paymentMethod.payment_terminal;

console.log('Terminal available:', !!terminal);
console.log('start_get_status_polling available:', typeof terminal.start_get_status_polling === 'function');
```

If this test fails, the payment terminal is not properly initialized. 