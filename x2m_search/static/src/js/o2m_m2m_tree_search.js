/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ListRenderer } from "@web/views/list/list_renderer";
import { useService } from "@web/core/utils/hooks";
import { SearchModel } from "@web/search/search_model";
import { SearchArchParser } from "@web/search/search_arch_parser";
import { SearchBar } from "@web/search/search_bar/search_bar";
import { App } from "@odoo/owl";
import { templates } from "@web/core/assets";
import { _t } from "@web/core/l10n/translation";
import { Domain } from "@web/core/domain";
import { onMounted, onPatched } from "@odoo/owl";

/**
 * Patch SearchArchParser so search view parsing does not crash when a field
 * in the search arch is missing from the fields dictionary (e.g. when x2m_search
 * loads search view with list-view fields only). Plain JS classes don't get
 * _super from patch(), so we keep and call the original methods explicitly.
 */
const _originalVisitField = SearchArchParser.prototype.visitField;
const _originalVisitFilter = SearchArchParser.prototype.visitFilter;

patch(SearchArchParser.prototype, {
    visitField(node) {
        if (node.hasAttribute("name")) {
            const name = node.getAttribute("name");
            if (!this.fields[name]) {
                return; // skip field not in fields dictionary
            }
        }
        return _originalVisitField.call(this, node);
    },
    visitFilter(node) {
        if (node.hasAttribute("date")) {
            const fieldName = node.getAttribute("date");
            if (!this.fields[fieldName]) {
                return; // skip date filter when field not in fields dictionary
            }
        }
        return _originalVisitFilter.call(this, node);
    },
});

/**
 * Patch ListRenderer: when the list is inside an X2Many field, inject and mount the
 * search bar as the first child of the list renderer root so it renders with the tree.
 */
patch(ListRenderer.prototype, {
    setup() {
        super.setup();
        this._x2mOrm = useService("orm");
        this._x2mViewService = useService("view");
        this._x2mFieldService = useService("field");
        this._x2mUserService = useService("user");
        this._x2mNameService = useService("name");
        this._x2mSearchViewDataPromise = null;
        onMounted(() => this._x2mTryAddSearchView());
        onPatched(() => this._x2mTryAddSearchView());
    },

    _x2mTryAddSearchView() {
        const root = this.rootRef?.el;
        if (!root) return;
        if (!root.closest(".o_field_x2many")) return;
        const relationModel = this.props?.list?.resModel;
        if (!relationModel) return;
        if (root.querySelector(".x2m_search_bar_container")) return;
        // Start preload immediately so data may be ready when we await
        if (!this._x2mSearchViewDataPromise) {
            this._x2mSearchViewDataPromise = this._x2mPreloadSearchViewData(relationModel);
        }
        // Insert container synchronously so layout space appears with the tree (no delay)
        const container = document.createElement("div");
        container.className =
            "x2m_search_bar_container o_control_panel_actions d-empty-none d-flex align-items-center justify-content-start justify-content-lg-around order-2 order-lg-1 w-100 w-lg-auto";
        // No inline styles – appearance is unified in CSS for o2m and m2m
        const listViewId = root.id || `list-view-${Date.now()}`;
        container.setAttribute("data-list-view-id", listViewId);
        if (!root.id) root.id = listViewId;
        root.insertBefore(container, root.firstChild);
        // Placeholder so the bar isn’t empty while SearchBar loads
        const placeholder = document.createElement("div");
        placeholder.className = "x2m_search_placeholder text-muted small";
        placeholder.setAttribute("aria-hidden", "true");
        placeholder.textContent = "";
        placeholder.style.cssText = "min-height: 2rem;";
        container.appendChild(placeholder);
        this._x2mAddSearchView(container, placeholder);
    },

    async _x2mAddSearchView(container, placeholder) {
        const root = this.rootRef?.el;
        if (!root || !container?.parentElement) return;
        const removeContainer = () => {
            placeholder?.remove();
            container.remove();
        };
        const model = this.props.list.resModel;
        const listFields = this.props.list.fields || {};
        const preloaded = await this._x2mSearchViewDataPromise;
        const hasSearchView =
            preloaded !== null || (await this._x2mCheckIfSearchViewExists(model));

        let searchViewArch = null;
        let searchViewId = null;
        let searchViewFields = {};
        if (hasSearchView && preloaded) {
            searchViewArch = preloaded.searchViewArch;
            searchViewId = preloaded.searchViewId;
            searchViewFields = preloaded.searchViewFields;
        } else if (hasSearchView) {
            try {
                const searchViews = await this._x2mOrm.searchRead(
                    "ir.ui.view",
                    [["model", "=", model], ["type", "=", "search"]],
                    ["id", "arch"],
                    { limit: 1, order: "priority desc, id desc" }
                );
                if (searchViews?.[0]) {
                    searchViewId = searchViews[0].id;
                    searchViewArch = searchViews[0].arch;
                }
                const viewResult = await this._x2mViewService.loadViews(
                    { resModel: model, views: [[false, "list"]] },
                    { loadIrFilters: false }
                );
                searchViewFields = viewResult.fields || {};
            } catch {
                removeContainer();
                return;
            }
        }
        if (!searchViewArch) {
            searchViewArch = this._x2mBuildDefaultSearchArch(listFields);
            searchViewFields = listFields;
        }
        placeholder?.remove();

        const services = {
            field: this._x2mFieldService,
            name: this._x2mNameService,
            orm: this._x2mOrm,
            user: this._x2mUserService,
            view: this._x2mViewService,
        };
        const searchModel = new SearchModel(this.env, services);
        await searchModel.load({
            resModel: model,
            searchViewArch,
            searchViewFields,
            searchViewId: searchViewId || false,
            loadIrFilters: false,
            searchMenuTypes: ["filter", "groupBy"],
            display: { searchBar: true },
        });

        let updateTimeout = null;
        searchModel.addEventListener("update", () => {
            if (updateTimeout) clearTimeout(updateTimeout);
            updateTimeout = setTimeout(() => {
                this._x2mApplySearchModelToList(root, searchModel);
            }, 150);
        });

        await this._x2mMountSearchBar(container, searchModel);
        this._x2mApplySearchModelToList(root, searchModel);
    },

    async _x2mPreloadSearchViewData(model) {
        try {
            const searchViews = await this._x2mOrm.searchRead(
                "ir.ui.view",
                [["model", "=", model], ["type", "=", "search"]],
                ["id", "arch"],
                { limit: 1, order: "priority desc, id desc" }
            );
            if (!searchViews?.length) return null;
            const viewResult = await this._x2mViewService.loadViews(
                { resModel: model, views: [[false, "list"]] },
                { loadIrFilters: false }
            );
            return {
                searchViewArch: searchViews[0].arch,
                searchViewId: searchViews[0].id,
                searchViewFields: viewResult.fields || {},
            };
        } catch {
            return null;
        }
    },

    async _x2mCheckIfSearchViewExists(model) {
        try {
            const searchViews = await this._x2mOrm.searchRead(
                "ir.ui.view",
                [["model", "=", model], ["type", "=", "search"]],
                ["id", "name"],
                { limit: 1, order: "priority desc, id desc" }
            );
            return searchViews && searchViews.length > 0;
        } catch {
            return false;
        }
    },

    _x2mBuildDefaultSearchArch(listFields) {
        const searchable = ["char", "text", "html"];
        const prefer = ["name", "display_name", "subject", "title"];
        let name = null;
        for (const n of prefer) {
            if (listFields[n] && searchable.includes(listFields[n].type)) {
                name = n;
                break;
            }
        }
        if (!name) {
            const entry = Object.entries(listFields).find(
                ([, f]) => f && searchable.includes(f.type)
            );
            name = entry ? entry[0] : "name";
        }
        return `<search><field name="${name}"/></search>`;
    },

    async _x2mMountSearchBar(container, searchModel) {
        const wrapperEnv = {
            ...this.env,
            services: this.env.services,
            searchModel,
        };
        if (Object.getPrototypeOf(this.env)) {
            Object.setPrototypeOf(wrapperEnv, Object.getPrototypeOf(this.env));
        }
        const app = new App(SearchBar, {
            env: wrapperEnv,
            templates,
            dev: this.env.debug,
            warnIfNoStaticProps: false,
            name: "EmbeddedSearchBar",
            translatableAttributes: ["data-tooltip"],
            translateFn: _t,
        });
        await app.mount(container);
    },

    _x2mApplySearchModelToList(listViewEl, searchModel) {
        const groupBy = searchModel.groupBy || [];
        const facets = searchModel.facets || [];
        const table = listViewEl?.querySelector("table.o_list_table");
        if (!table) return;
        const tbody = table.querySelector("tbody");
        if (!tbody) return;
        const list = this.props.list;
        const allRows = Array.from(tbody.querySelectorAll("tr.o_data_row"));
        const hasGroupByFacet = facets.some((f) => f.type === "groupBy");
        const filterFacets = facets.filter((f) => f.type === "filter");
        let combinedDomain = searchModel.domain || [];
        if (combinedDomain.length === 0 && filterFacets.length > 0) {
            const filterDomains = [];
            filterFacets.forEach((facet) => {
                if (facet.domain) {
                    try {
                        filterDomains.push(new Domain(facet.domain).toList());
                    } catch {}
                }
            });
            if (filterDomains.length > 0) {
                combinedDomain =
                    filterDomains.length === 1
                        ? filterDomains[0]
                        : Domain.and(
                              filterDomains.map((d) => new Domain(d))
                          ).toList();
            }
        }
        const updates = [];
        allRows.forEach((row) => {
            let shouldShow = true;
            if (combinedDomain.length > 0) {
                shouldShow = this._x2mEvaluateDomainForRow(row, combinedDomain, listViewEl);
            }
            updates.push({ row, display: shouldShow ? "" : "none" });
        });
        updates.forEach(({ row, display }) => {
            row.style.display = display;
        });
        const visibleRows = allRows.filter(
            (row) =>
                !row.classList.contains("o_group_header") && row.style.display !== "none"
        );
        if (groupBy.length > 0 && hasGroupByFacet) {
            this._x2mApplyGroupByToRows(tbody, visibleRows, groupBy, listViewEl, allRows);
            return;
        }
        this._x2mRestoreUngroupedRows(tbody, allRows);
        allRows.forEach((row) => {
            if (row.classList.contains("o_group_header")) return;
            let shouldShow = true;
            if (combinedDomain.length > 0) {
                shouldShow = this._x2mEvaluateDomainForRow(row, combinedDomain, listViewEl);
            }
            row.style.display = shouldShow ? "" : "none";
        });
    },

    _x2mApplyGroupByToRows(tbody, visibleRows, groupBy, listViewEl, allRows) {
        const groupByField = groupBy[0];
        if (!groupByField) {
            this._x2mRestoreUngroupedRows(tbody, allRows || visibleRows);
            return;
        }
        const fieldName = groupByField.split(":")[0];
        const order = groupByField.includes(":desc") ? "desc" : "asc";
        const table = listViewEl.querySelector("table.o_list_table");
        const thead = table?.querySelector("thead");
        let columnIndex = -1;
        let columnCount = 0;
        if (thead) {
            const headers = thead.querySelectorAll("th");
            columnCount = headers.length;
            headers.forEach((th, index) => {
                const attr =
                    th.getAttribute("name") ||
                    th.getAttribute("data-name") ||
                    th.querySelector("field")?.getAttribute("name");
                if (attr === fieldName) columnIndex = index;
            });
        }
        const list = this.props.list;
        const fieldDef = list?.fields?.[fieldName];
        const getGroupDisplayValue = (value) => {
            if (value == null || value === "") return "None";
            if (fieldDef?.type === "selection" && Array.isArray(fieldDef.selection)) {
                const pair = fieldDef.selection.find((p) => p[0] === value || String(p[0]) === String(value));
                return pair ? pair[1] : value;
            }
            if (fieldDef?.type === "many2one") {
                if (Array.isArray(value) && value.length >= 2) return value[1] || "None";
                if (value && typeof value === "object" && "display_name" in value) return value.display_name || "None";
                if (typeof value === "string" && /^\d+,/.test(value)) return value.replace(/^\d+,/, "").trim();
                return value;
            }
            return value;
        };
        const getGroupKey = (value) => {
            if (fieldDef?.type === "many2one") {
                if (Array.isArray(value) && value.length >= 1) return value[0];
                if (value && typeof value === "object" && "id" in value) return value.id;
                if (typeof value === "string" && /^\d+,/.test(value)) return value.split(",")[0];
                return value;
            }
            return value;
        };
        const groups = new Map();
        visibleRows.forEach((row) => {
            if (row.classList.contains("o_group_header")) return;
            let rawValue = null;
            let groupValue = null;
            let displayValue = "None";
            const recordId = row.getAttribute("data-id");
            const record = recordId && list?.records ? list.records.find((r) => String(r.id) === String(recordId)) : null;
            if (record?.data && fieldName in record.data) {
                rawValue = record.data[fieldName];
                groupValue = getGroupKey(rawValue);
                displayValue = getGroupDisplayValue(rawValue);
            }
            if (rawValue === undefined || rawValue === null) {
                let cell = row.querySelector(`td[name="${fieldName}"]`);
                if (!cell && columnIndex >= 0) {
                    const cells = row.querySelectorAll("td");
                    if (cells[columnIndex]) cell = cells[columnIndex];
                }
                if (cell) {
                    const fieldEl = cell.querySelector("field");
                    if (fieldEl) {
                        rawValue = fieldEl.getAttribute("value") ?? fieldEl.getAttribute("data-value") ?? fieldEl.textContent.trim();
                    } else {
                        rawValue = cell.textContent.trim();
                    }
                    rawValue = rawValue || null;
                    groupValue = getGroupKey(rawValue);
                    displayValue = getGroupDisplayValue(rawValue);
                }
            }
            if (groupValue === "true" || groupValue === true) displayValue = "Yes";
            else if (groupValue === "false" || groupValue === false) displayValue = "No";
            else if (groupValue == null || groupValue === "") displayValue = "None";
            if (!groups.has(groupValue)) groups.set(groupValue, { displayValue, rows: [] });
            groups.get(groupValue).rows.push(row);
        });
        const sortedGroups = Array.from(groups.entries()).sort((a, b) => {
            const aVal = a[0];
            const bVal = b[0];
            const aDisplay = a[1].displayValue;
            const bDisplay = b[1].displayValue;
            if (aVal == null) return 1;
            if (bVal == null) return -1;
            if (fieldDef?.type === "many2one") {
                return order === "desc"
                    ? String(bDisplay).localeCompare(String(aDisplay))
                    : String(aDisplay).localeCompare(String(bDisplay));
            }
            const aNum = parseFloat(aVal);
            const bNum = parseFloat(bVal);
            if (!isNaN(aNum) && !isNaN(bNum)) {
                return order === "desc" ? bNum - aNum : aNum - bNum;
            }
            const aStr = String(aVal);
            const bStr = String(bVal);
            return order === "desc" ? bStr.localeCompare(aStr) : aStr.localeCompare(bStr);
        });
        if (!tbody._originalRows && allRows) tbody._originalRows = Array.from(allRows);
        tbody.querySelectorAll("tr.o_group_header").forEach((h) => h.remove());
        visibleRows.forEach((row) => {
            if (row.parentElement === tbody) tbody.removeChild(row);
        });
        if (sortedGroups.length === 0) return;
        let insertBeforeRow = this._x2mFindFirstNonDataRow(tbody);
        sortedGroups.forEach(([groupValue, groupData]) => {
            const { displayValue, rows: groupRows } = groupData;
            const groupHeader = document.createElement("tr");
            groupHeader.className = "o_group_has_content o_group_header cursor-pointer";
            groupHeader.setAttribute("data-group-value", groupValue ?? "");
            groupHeader.setAttribute("data-group-folded", "true");
            const colspan = Math.max(1, columnCount);
            groupHeader.innerHTML = `
                <th class="o_group_name fs-6 fw-bold text-700" colspan="${colspan}" tabindex="-1">
                    <div class="d-flex align-items-center">
                        <span class="o_group_caret fa fa-fw fa-caret-right me-1" style="--o-list-group-level: 0"></span>
                        <span>${displayValue} (${groupRows.length})</span>
                    </div>
                </th>
            `;
            groupHeader.onclick = (e) => {
                e.stopPropagation();
                this._x2mToggleGroup(groupHeader, groupRows);
            };
            if (insertBeforeRow) tbody.insertBefore(groupHeader, insertBeforeRow);
            else tbody.appendChild(groupHeader);
            [...groupRows].reverse().forEach((row) => {
                row.style.display = "none";
                row.setAttribute("data-group-value", groupValue ?? "");
                if (insertBeforeRow) tbody.insertBefore(row, insertBeforeRow);
                else tbody.appendChild(row);
            });
            insertBeforeRow = groupHeader;
        });
    },

    _x2mToggleGroup(groupHeader, groupRows) {
        const isFolded = groupHeader.getAttribute("data-group-folded") === "true";
        const newFolded = !isFolded;
        groupHeader.setAttribute("data-group-folded", String(newFolded));
        if (newFolded) {
            groupHeader.classList.remove("o_group_open");
            groupHeader.classList.add("o_group_closed");
            const caret = groupHeader.querySelector(".o_group_caret");
            if (caret) {
                caret.classList.remove("fa-caret-down");
                caret.classList.add("fa-caret-right");
            }
        } else {
            groupHeader.classList.add("o_group_open");
            groupHeader.classList.remove("o_group_closed");
            const caret = groupHeader.querySelector(".o_group_caret");
            if (caret) {
                caret.classList.add("fa-caret-down");
                caret.classList.remove("fa-caret-right");
            }
        }
        groupRows.forEach((row) => {
            row.style.display = newFolded ? "none" : "";
        });
    },

    _x2mEvaluateDomainForRow(row, domain, listViewEl) {
        const list = this.props.list;
        let rowData = {};
        const recordId = row.getAttribute("data-id");
        if (list?.records && recordId) {
            const record = list.records.find((r) => String(r.id) === String(recordId));
            if (record?.data) rowData = { ...record.data };
        }
        if (Object.keys(rowData).length === 0) {
            const table = listViewEl.querySelector("table.o_list_table");
            const thead = table?.querySelector("thead");
            if (thead) {
                const headers = thead.querySelectorAll("th");
                const cells = row.querySelectorAll("td");
                headers.forEach((th, index) => {
                    const name = th.getAttribute("name") || th.getAttribute("data-name");
                    if (name && cells[index]) {
                        const cell = cells[index];
                        const fieldEl = cell.querySelector("field");
                        if (fieldEl) {
                            let value = fieldEl.getAttribute("value") ?? fieldEl.getAttribute("data-value") ?? fieldEl.textContent.trim();
                            if (fieldEl.querySelector("input[type='checkbox']")) {
                                value = fieldEl.querySelector("input[type='checkbox']").checked;
                            }
                            rowData[name] = value;
                        } else {
                            const checkbox = cell.querySelector("input[type='checkbox']");
                            rowData[name] = checkbox ? checkbox.checked : cell.textContent.trim();
                        }
                    }
                });
            }
        }
        try {
            if (Object.keys(rowData).length === 0) return true;
            if (!domain?.length) return true;
            const domainObj = new Domain(domain);
            const normalizedRowData = { ...rowData };
            const domainFields = [];
            const extract = (d) => {
                if (Array.isArray(d)) {
                    d.forEach((item) => {
                        if (Array.isArray(item) && item.length >= 3 && typeof item[0] === "string") {
                            if (!domainFields.includes(item[0])) domainFields.push(item[0]);
                        } else if (Array.isArray(item)) extract(item);
                    });
                }
            };
            extract(domain);
            domainFields.forEach((field) => {
                const value = rowData[field];
                if (value !== undefined && value !== null) {
                    if (Array.isArray(value) && value.length > 0) {
                        const idVal = value[0];
                        if (typeof idVal === "number" || (typeof idVal === "string" && !isNaN(idVal))) {
                            normalizedRowData[field] = typeof idVal === "string" ? parseInt(idVal, 10) : idVal;
                        }
                    } else {
                        normalizedRowData[field] = value;
                    }
                } else {
                    normalizedRowData[field] = value;
                }
            });
            return domainObj.contains(normalizedRowData);
        } catch {
            return true;
        }
    },

    _x2mFindFirstNonDataRow(tbody) {
        return Array.from(tbody.children).find(
            (row) =>
                !row.classList.contains("o_data_row") && !row.classList.contains("o_group_header")
        );
    },

    _x2mRemoveDataAndGroupRows(tbody) {
        [...tbody.querySelectorAll("tr.o_data_row"), ...tbody.querySelectorAll("tr.o_group_header")].forEach(
            (row) => {
                if (row.parentElement === tbody) tbody.removeChild(row);
            }
        );
    },

    _x2mRestoreUngroupedRows(tbody, rows) {
        tbody.querySelectorAll("tr.o_group_header").forEach((h) => h.remove());
        if (tbody._originalRows?.length > 0) {
            this._x2mRemoveDataAndGroupRows(tbody);
            const firstNonDataRow = this._x2mFindFirstNonDataRow(tbody);
            [...tbody._originalRows].reverse().forEach((row) => {
                row.removeAttribute("data-group-value");
                if (firstNonDataRow) tbody.insertBefore(row, firstNonDataRow);
                else tbody.appendChild(row);
            });
        } else {
            const dataRows = Array.from(tbody.querySelectorAll("tr.o_data_row"));
            if (dataRows.length > 0) {
                if (!tbody._originalRows) tbody._originalRows = Array.from(dataRows);
                dataRows.forEach((r) => r.removeAttribute("data-group-value"));
            } else if (rows?.length > 0) {
                this._x2mRemoveDataAndGroupRows(tbody);
                const firstNonDataRow = Array.from(tbody.children).find(
                    (r) => !r.classList.contains("o_data_row") && !r.classList.contains("o_group_header")
                );
                [...rows].reverse().forEach((row) => {
                    row.removeAttribute("data-group-value");
                    if (firstNonDataRow) tbody.insertBefore(row, firstNonDataRow);
                    else tbody.appendChild(row);
                });
            }
        }
    },
});
