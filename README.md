<div align="center">
 <img width="400" valign="top" src="https://assets.seerbitapi.com/images/seerbit_logo_type.png"/>
</div>

<h1 align="center">
    <a href="https://apps.odoo.com/apps/modules/16.0/pos_seerbit/">
  POS SEERBIT</a><br/>
  
</h1>
<h2 align="center">
An Odoo Integration for Seerbit POS Terminal
</h2>

## How to Use
A user guide is available [here](https://apps.odoo.com/apps/modules/16.0/seerbit/)

## Version History
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
