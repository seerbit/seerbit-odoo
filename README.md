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

## How to Use
A user guide is available [here](https://apps.odoo.com/apps/modules/16.0/pos_seerbit/)

## Version History
## **[0.1.1]** 17/04/2023
### Impacted Versions:
- Odoo16 - 18/04/2023
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
