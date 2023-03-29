# [POS_SEERBIT](http://apps.odoo.com/module/v16/pos_seerbit/)

![Banner](./static/description/seerbit.gif)   

## How to Use
---
A user guide is available [here](https://apps.odoo.com/apps/modules/16.0/seerbit/)

## Version History
---
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