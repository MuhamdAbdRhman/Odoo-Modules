X2M Search Module
=================

This module adds Odoo's native search view functionality to One2Many (O2M) 
and Many2Many (M2M) tree views embedded in form views.

Features
--------

* **Native Odoo Search View**: Uses Odoo's standard search view component
* **XML Configuration**: Add `<search>` tag in tree view XML to enable search
* **Filters and Group By**: Supports filters and group by from search view arch
* **Field-specific Search**: Searches in fields defined in search view
* **Automatic Detection**: Automatically detects when search tag is present

Installation
------------

1. Copy the module to your Odoo addons directory
2. Update the apps list
3. Install the "X2M Search" module

Usage
-----

The search view is **automatically displayed** if the relation model has a search view defined in `ir.ui.view`.

**No configuration needed!** Just make sure:

1. The related model has a search view defined in `ir.ui.view`
2. The search view contains fields, filters, and/or group bys as needed

**Example:**

In the Sale app, a sales order form has an O2M field for order lines:

.. code-block:: xml

    <field name="order_line">
        <tree>
            <field name="product_id"/>
            <field name="name"/>
            <field name="product_uom_qty"/>
            <field name="price_unit"/>
        </tree>
    </field>

The related model `sale.order.line` has a search view defined in Odoo. With X2M Search installed, the search bar automatically appears above the order lines tree so you can search and filter lines without leaving the form.

**Screenshots:** See ``static/description/images/`` for order lines filter (e.g. Quantity >= 5) and group by (e.g. Unit of Measure). Also shown on the App Store description page and in **USER_GUIDE.md**.

**How It Works:**

1. When an O2M/M2M field is rendered, the module checks if the relation model has a search view
2. If a search view exists in `ir.ui.view` for that model, it is automatically loaded and displayed
3. The search view uses Odoo's standard structure with filters and group by options
4. Search filters the tree rows based on the search input and field definitions from the search view
5. Filters and group bys from the search view are also displayed and functional

How It Works
------------

1. When a form with an O2M/M2M tree is loaded, the module checks if the **related model** has a search view in `ir.ui.view`
2. If yes, it loads that search view and mounts Odoo's standard SearchBar above the tree
3. If no search view exists, a minimal search bar (one text field) is still shown
4. Filtering and group-by run **client-side** on the rows already loaded in the tree (no server domain change)

Technical (short)
-----------------

* Patches Odoo's list renderer; injects the search bar when the list is inside an X2Many field
* Search view is loaded from `ir.ui.view` for the list's model (priority desc, id desc)
* SearchArchParser is patched so fields in the search view that are missing from the tree are skipped (no crash)
* Rows are filtered and grouped in the DOM based on search domain, filters, and group-by

Advanced documentation
----------------------

See **USER_GUIDE.md** for: when the bar appears, search view tips, limitations (client-side only), troubleshooting, and technical details.

Author
------

Muhamed Abd El-Rhman (https://www.linkedin.com/in/muhamdabdrhman/)

Documentation
-------------

See **USER_GUIDE.md** for installation, usage, and developer notes.

License and pricing
-------------------

* **License:** Odoo Proprietary License v1.0 (OPL-1). See the ``LICENSE`` and ``COPYRIGHT`` files in this module.
* **Price:** 30 USD (one-time purchase via Odoo App Store).
* **Support:** muhamed.inbox@gmail.com
