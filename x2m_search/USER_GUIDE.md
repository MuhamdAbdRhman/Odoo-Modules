# X2M Search – User Guide

## Overview

**X2M Search** adds a search bar above One2Many (O2M) and Many2Many (M2M) tree views inside form views. You get search, filters, and group-by on embedded trees without changing any XML.

**Price:** 30 USD (one-time, per database)  
**License:** Odoo Proprietary License v1.0 (OPL-1). See `LICENSE` and `COPYRIGHT` in the module folder.

---

## Installation

1. Install **X2M Search** from the Odoo App Store (or from your addons path).
2. If manual: update the Apps list, then click **Install** on X2M Search.
3. No extra configuration. The bar appears automatically where it applies.

---

## Usage

### When does the search bar appear?

The bar appears **only** when:

- The tree is **inside a form** (e.g. order lines on a sales order).
- The list is an **O2M or M2M** field.
- The **related model** (the model of the lines) has at least one **search view** in Odoo (`ir.ui.view`, type = Search).

If the model has **no** search view, the module still adds a small search bar that filters on one text field (e.g. `name`).

### What you can do

- **Search** – Type in the box. The tree filters in real time on the fields defined in the search view.
- **Filters** – Use the filter menu to apply filters from the search view (e.g. "Quantity >= 5").
- **Group by** – Use the group-by menu to group rows (e.g. by Unit of Measure).

Behaviour is the same as in Odoo list views: same search bar, filters, and group-by.

### Example (Sales Order)

Sales order form has an O2M field for order lines:

```xml
<field name="order_line">
    <tree>
        <field name="product_id"/>
        <field name="name"/>
        <field name="product_uom_qty"/>
        <field name="price_unit"/>
    </tree>
</field>
```

The model `sale.order.line` has a search view in standard Odoo. With X2M Search installed, opening a quotation shows the search bar above the lines. You can search, filter, and group by without leaving the form. Same idea for purchase order lines, invoice lines, project tasks, etc., as long as the related model has a search view.

### Screenshots

**Filter (e.g. Quantity >= 5)**  
Only lines matching the filter are shown.

![Order lines filtered by Quantity >= 5](static/description/images/order_lines_filter.png)

**Group by (e.g. Unit of Measure)**  
Rows are grouped (e.g. Units, Dozens) in the tree.

![Order lines grouped by Unit of Measure](static/description/images/order_lines_group_by.png)

---

## Advanced

### How filtering and group-by work

- Filtering and group-by apply **only to the rows already loaded** in the tree (client-side).
- The module does **not** change the domain sent to the server. So if the form loads 50 lines, you can only filter/group those 50. To show more or fewer lines from the server, use Odoo’s normal limits or domain on the field.
- Search uses the same logic as Odoo’s search view: it builds a domain from your input and hides rows that don’t match. Filters and group-by also run in the browser on the current rows.

### Making the most of the search view

- **Searchable fields** – Put `<field name="..."/>` in the search view for every field you want to search in. Only fields that exist in the **list** (tree) view are used; others are skipped so the bar still works.
- **Filters** – Add `<filter>` in the search view (e.g. "Quantity >= 5"). They appear in the filter dropdown. Use `domain` and optionally `name` and `string`.
- **Group by** – Add `<group by>` in the search view. The field must exist in the tree (or at least be loadable). Many2one, selection, and simple types work; groups are built from the loaded rows.
- **Priority** – Odoo uses the search view with highest priority (and latest id). One search view per model is enough; X2M Search uses that one.

### Where it works

- **Works:** O2M and M2M tree views **inside a form** (e.g. notebook, sub-view).
- **Does not add a bar:** Standalone list views (they already have their own search). Also not on kanban or other view types.

### Default when there is no search view

If the related model has **no** search view, the module builds a minimal one: a single searchable field. It picks the first text-like field it finds (`name`, `display_name`, `subject`, `title`, or any char/text). So you still get a simple search bar.

---

## Technical (short)

- The module **patches** Odoo’s list renderer. When the list is inside an X2Many field (`.o_field_x2many`), it injects a container above the tree and mounts Odoo’s standard **SearchBar** there.
- The search view is loaded from **ir.ui.view** for the list’s **resModel** (same model as the tree). No `<search>` in the tree XML is required.
- **SearchArchParser** is patched so that fields or filters in the search view that are missing from the list’s fields are skipped. That avoids crashes when the search view has more fields than the embedded tree.
- Filtering: domain from the search model is evaluated **per row** in the DOM (using row data and cell content). Rows that don’t match are hidden.
- Grouping: rows are grouped in the DOM by the group-by field value; group headers are inserted and rows can be collapsed/expanded.

---

## Requirements

- **Odoo:** 17.0 (or compatible version where the module is supported).
- **Dependencies:** `base`, `web` (standard Odoo).

---

## Support and license

- **Support:** **muhamed.inbox@gmail.com**
- **License:** Odoo Proprietary License v1.0 (OPL-1). Use only with a valid license (e.g. purchase via Odoo Apps) or written agreement. See `LICENSE` in the module folder.

---

## Changelog

- **1.0.0** – Search, filter, and group-by for O2M/M2M tree views in forms.
