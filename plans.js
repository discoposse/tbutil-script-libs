/*global client,exports,writeTable*/
/*jslint plusplus: true*/

/**
 * A class containing base functionality for all plan types. Intended as a class
 * to be extended/inherited from, but the tbutil JS engine doesn't seem to support
 * it. Namely the `Object.create` function.
 * @class
 */
var Plan = (function () {
        "use strict";

        /**
         * Set at construct time. The payload of a POST request to /vmturbo/rest/scenarios. Each inheriting class must assemble this for the appropriate plan type.
         * @scenario_create_request Plan#scenario_create_request
         * @type {object}
         */
        Plan.prototype.scenario_create_request = {};

        /**
         * The response from a post to /vmturbo/rest/scenarios
         * @scenario_create_response Plan#scenario_create_response
         * @type {object}
         */
        Plan.prototype.scenario_create_response = {};

        /**
         * The response from a post to /vmturbo/rest/markets/{market_Uuid}/scenarios/{scenario_Uuid}
         * @scenario_run_response Plan#scenario_run_response
         * @type {object}
         */
        Plan.prototype.scenario_run_response = {};

        /**
         * Set at construct time. A name for the resulting plan market. This is *not* the name of the plan, which is in the scenario_create_request, but instead a name for the market that gets created when this plan is run. This should be unique. I.E. <PLAN_TYPE>-${Date.now()}
         * @plan_market_name Plan#plan_market_name
         * @type {string}
         */
        Plan.prototype.plan_market_name = "";

        /**
         * Initializes a new instance of Plan
         * @constructs Plan
         * @param {object} scenario_create_request - The payload of a POST request to /vmturbo/rest/scenarios. Each inheriting class must assemble this for the appropriate plan type.
         * @param {string} plan_market_name - A name for the resulting plan market. This is *not* the name of the plan, which is in the scenario_create_request, but instead a name for the market that gets created when this plan is run. This should be unique. I.E. <PLAN_TYPE>-${Date.now()}
         */
        function Plan(scenario_create_request, plan_market_name) {
            this.scenario_create_request = scenario_create_request;
            this.plan_market_name = plan_market_name;
        }

        /**
         * Creates the scenario defined in Plan#scenario_create_request, and executes the plan against the realtime market.
         * @name Plan#run
         * @function
         */
        Plan.prototype.run = function () {
            this.scenario_create_response = client.createScenario(this.scenario_create_request);
            this.scenario_run_response = client.applyAndRunScenario(
                "Market",
                parseInt(this.scenario_create_response.uuid, 10),
                {
                    disable_hateoas: true,
                    ignore_constraints: true,
                    plan_market_name: this.plan_market_name
                }
            );
        };

        Plan.prototype.wait = function () {
            // Loop getting the created market until it is in "SUCCEDED" .state
            var state = "";
            do {
                this.scenario_run_response = client.getMarketByUuid(this.scenario_run_response.uuid);
                state = this.scenario_run_response.state;
                // TODO: A sleep? https://stackoverflow.com/questions/951021/what-is-the-javascript-version-of-sleep
            } while (state !== "SUCCEEDED");
        };

        Plan.prototype.get_actions = function () {
            return client.getActionsByMarketUuid(
                this.scenario_run_response.uuid,
                {},
                {}
            );
        };

        return Plan;
    }());

function CloudMigrationPlan(from, to, name, options) {
    "use strict";

    this.scenario_create_request = {
        "configChanges": {
            "addPolicyList": [],
            "automationSettingList": [],
            "removeConstraintList": [],
            "removePolicyList": [],
            "riSettingList": [],
            "osMigrationSettingList": []
        },
        "displayName": name,
        "loadChanges": {
            "utilizationList": [],
            "maxUtilizationList": []
        },
        "projectionDays": [0],
        "scope": [],
        "topologyChanges": {
            "addList": [],
            "migrateList": [],
            "removeList": [],
            "replaceList": [],
            "relievePressureList": []
        },
        "type": "CLOUD_MIGRATION"
    };

    this.byol_osMigrationSettingsList = [
        { "uuid": "matchToSource", "value": "false" },
        { "uuid": "linuxTargetOs", "value": "LINUX" },
        { "uuid": "linuxByol", "value": "true" },
        { "uuid": "windowsTargetOs", "value": "WINDOWS" },
        { "uuid": "windowsByol", "value": "true" },
        { "uuid": "rhelTargetOs", "value": "RHEL" },
        { "uuid": "rhelByol", "value": "true" },
        { "uuid": "slesTargetOs", "value": "SUSE" },
        { "uuid": "slesByol", "value": "true" }
    ];

    this.from = from;
    this.to = to;
    this.name = name;
    this.options = options;

    this.scenario_create_request.scope = [this.from, this.to];
    this.scenario_create_request.topologyChanges.migrateList = [{source: this.from, destination: this.to}];

    var exclude_group = {},
        vm,
        to_supplychain = {},
        exclude_group_body = {
            "groupType": "VirtualMachine",
            "temporary": true,
            "isStatic": true,
            "displayName": "All VMs in " + this.to.displayName,
            "memberUuidList": []
        };

    // Of an exclude group was provided, use it, otherwise look up VMs to exclude
    // based on the target PMs group.
    if (!this.options.hasOwnProperty("exclude")) {
        to_supplychain = client.getSupplyChainByEntityUuid(this.to.uuid, {types: ["VirtualMachine"], detail_type: "entity"});
        // It's possible that this group has no VMs, in which case the supplychain would be blank.
        if (to_supplychain.hasOwnProperty("seMap") && to_supplychain.seMap.hasOwnProperty("VirtualMachine")) {
            for (vm in to_supplychain.seMap.VirtualMachine.instances) {
                if (to_supplychain.seMap.VirtualMachine.instances.hasOwnProperty(vm)) {
                    exclude_group_body.memberUuidList.push(vm);
                }
            }
        }

        // Always create the group. even if it's empty
        // TODO: Check for errors from this request?
        exclude_group = client.createGroup(exclude_group_body);
    } else {
        exclude_group = this.options.exclude;
    }

    if (this.options.hasOwnProperty("byol") && this.options.byol) {
        this.scenario_create_request.configChanges.osMigrationSettingList = this.byol_osMigrationSettingsList;
    }
    this.scenario_create_request.topologyChanges.removeList = [{target: exclude_group}];
    this.plan_market_name = "CLOUD_MIGRATION_" + this.from.uuid + "_" + this.to.uuid + "_" + Date.now();
}

CloudMigrationPlan.prototype = Object.create(Plan.prototype);

CloudMigrationPlan.prototype.generate_vm_template_mapping = function () {
    "use strict";
    if (Object.getOwnPropertyNames(this.scenario_run_response).length === 0) {
        throw "Plan has not been run yet. Please call the 'run()' function first";
    }

    this.wait();

    var getActionsBody = {"actionTypeList": ["MOVE"], "relatedEntityTypes": ["VirtualMachine"]},
        idx,
        sidx,
        fidx,
        uuid,
        with_action,
        without_action,
        matched_actions = {},
        rows = [],
        ri_to_buy = false,
        cost_with_ri = 0,
        current_location,
        vm_name;
    // Get MOVE actions for VMs from the
    this.turbo_actions = client.getActionsByMarketUuid(
        this.scenario_run_response.uuid,
        {},
        getActionsBody
    );

    // Get MOVE actions for VMs from the "before" market
    this.lift_and_shift_actions = client.getActionsByMarketUuid(
        this.scenario_run_response.relatedPlanMarkets[0].uuid,
        {},
        getActionsBody
    );

    // Loop through all of the plan actions in the "optimized" scenario. We can
    // safely add all of them to the matched actions now, and filter them later.
    for (idx = 0; idx < this.turbo_actions.length; idx++) {
        with_action = this.turbo_actions[idx];
        if (with_action.target.className === "VirtualMachine") {
            matched_actions[with_action.target.realtimeMarketReference.uuid] = {
                "with": with_action,
                "without": {}
            };
        }
    }

    // Loop through all of the plan actions in the "no resize" scenario, checking
    // for a matching "with" action.
    for (idx = 0; idx < this.lift_and_shift_actions.length; idx++) {
        without_action = this.lift_and_shift_actions[idx];
        if (without_action.target.className === "VirtualMachine") {
            if (matched_actions.hasOwnProperty(without_action.target.realtimeMarketReference.uuid)) {
                matched_actions[without_action.target.realtimeMarketReference.uuid].without = without_action;
            } else {
                matched_actions[without_action.target.realtimeMarketReference.uuid] = {
                    "with": {},
                    "without": without_action
                };
            }
        }
    }

    // Loop over all matched actions, creating output rows, mindful of missing
    // actions for with, or without.
    for (uuid in matched_actions) {
        if (matched_actions.hasOwnProperty(uuid)) {
            ri_to_buy = false;
            cost_with_ri = 0;
            current_location = "Unknown";
            with_action = matched_actions[uuid]["with"];
            without_action = matched_actions[uuid].without;
            vm_name = "";


            if (without_action.hasOwnProperty("uuid")) {
                vm_name = without_action.target.displayName;
            }

            if (with_action.hasOwnProperty("uuid")) {
                vm_name = without_action.target.displayName;

                if (!with_action.hasOwnProperty('reservedInstance')) { // 6.2 RI logic
                    for (sidx = 0; sidx < with_action.stats.length; sidx++) {
                        if (with_action.stats[sidx].name === "costPrice") {
                            for (fidx = 0; fidx < with_action.stats[sidx].filters.length; fidx++) {
                                if (with_action.stats[sidx].filters[fidx].type === "savingsType" && with_action.stats[sidx].filters[fidx].value === "superSavings") {
                                    ri_to_buy = true;
                                    // TODO: This calculates the same as the dashboard, but it is consistently wrong (higher)
                                    // than the actual 3yr RI. -- Fixed in 6.3.x?
                                    cost_with_ri = with_action.stats[sidx].value * -1;
                                }
                            }
                        }
                    }
                } else if (with_action.reservedInstance.toBuy) { // 6.3 RI logic
                    ri_to_buy = true;
                    cost_with_ri = with_action.reservedInstance.effectiveHourlyCost;
                }

                if (with_action.hasOwnProperty("currentLocation")) {
                    current_location = with_action.currentLocation.displayName;
                }
            }

            rows.push([
                vm_name,
                (without_action.hasOwnProperty("uuid") ? without_action.target.aspects.virtualMachineAspect.os : ""),
                current_location,
                (without_action.hasOwnProperty("uuid") ? without_action.template.displayName : ""),
                (without_action.hasOwnProperty("uuid") ? without_action.newLocation.displayName : ""),
                (without_action.hasOwnProperty("uuid") ? without_action.target.costPrice : ""),
                (with_action.hasOwnProperty("uuid") ? with_action.template.displayName : ""),
                (with_action.hasOwnProperty("uuid") ? with_action.newEntity.aspects.virtualMachineAspect.os : ""),
                (with_action.hasOwnProperty("uuid") ? with_action.newLocation.displayName : ""),
                (with_action.hasOwnProperty("uuid") ? with_action.target.costPrice : ""),
                cost_with_ri,
                ri_to_buy
            ]);
        }
    }

    return rows;
};

CloudMigrationPlan.prototype.save_vm_template_mapping_csv = function (filepath) {
    "use strict";
    var ridx,
        headers = [],
        rows = this.generate_vm_template_mapping();
    for (ridx = 0; ridx < rows.length; ridx++) {
        if (rows[ridx][11]) {
            rows[ridx][11] = "Yes";
        } else {
            rows[ridx][11] = "-";
        }

        if (rows[ridx][10] === 0) {
            rows[ridx][10] = "-";
        } else {
            if (this.options.hasOwnProperty("hours_per_month")) {
                rows[ridx][10] = rows[ridx][10] * this.options.hours_per_month;
            } else {
                rows[ridx][10] = rows[ridx][10] * 730;
            }
        }

        if (this.options.hasOwnProperty("hours_per_month")) {
            rows[ridx][9] = rows[ridx][9] * this.options.hours_per_month;
        } else {
            rows[ridx][9] = rows[ridx][9] * 730;
        }

        if (this.options.hasOwnProperty("hours_per_month")) {
            rows[ridx][5] = rows[ridx][5] * this.options.hours_per_month;
        } else {
            rows[ridx][5] = rows[ridx][5] * 730;
        }
    }
    rows.unshift([
        "VM NAME",
        "Platform",
        "Location",
        "Template",
        "Placement",
        "ON-DEMAND COST",
        "Template",
        "Platform",
        "Placement",
        "ON-DEMAND COST",
        "COST WITH RI DISCOUNT",
        "RI TO BUY"
    ]);

    headers = [
        "Current",
        " ",
        " ",
        "ALLOCATION PLAN : On-Demand Pricing",
        " ",
        " ",
        "CONSUMPTION PLAN : On-Demand Pricing",
        " ",
        " ",
        " ",
        " ",
        " "
    ];


    writeTable(filepath, headers, rows);
};

CloudMigrationPlan.prototype.generate_volume_mapping = function () {
    "use strict";
    if (Object.getOwnPropertyNames(this.scenario_run_response).length === 0) {
        throw "Plan has not been run yet. Please call the 'run()' function first";
    }

    this.wait();

    var getActionsBody = {"actionTypeList": ["CHANGE"], "relatedEntityTypes": ["Storage"]},
        widx,
        woidx,
        wvdidx,
        wovdidx,
        wvdsidx,
        wovdsidx,
        w_size_in_mb,
        wo_size_in_mb,
        w_price_per_hour,
        wo_price_per_hour,
        with_action,
        without_action,
        rows = [];
    // Get MOVE actions for VMs from the
    this.turbo_actions = client.getActionsByMarketUuid(
        this.scenario_run_response.uuid,
        {},
        getActionsBody
    );
    this.lift_and_shift_actions = client.getActionsByMarketUuid(
        this.scenario_run_response.relatedPlanMarkets[0].uuid,
        {},
        getActionsBody
    );

    for (widx = 0; widx < this.turbo_actions.length; widx++) {
        with_action = this.turbo_actions[widx];
        for (woidx = 0; woidx < this.lift_and_shift_actions.length; woidx++) {
            without_action = this.lift_and_shift_actions[woidx];
            if (with_action.target.realtimeMarketReference.uuid === without_action.target.realtimeMarketReference.uuid) {
                for (wvdidx = 0; wvdidx < with_action.virtualDisks.length; wvdidx++) {
                    for (wovdidx = 0; wovdidx < without_action.virtualDisks.length; wovdidx++) {
                        if (with_action.virtualDisks[wvdidx].displayName === without_action.virtualDisks[wovdidx].displayName) {
                            for (wvdsidx = 0; wvdsidx < with_action.virtualDisks[wvdidx].stats.length; wvdsidx++) {
                                if (with_action.virtualDisks[wvdidx].stats[wvdsidx].name === "StorageAmount") {
                                    w_size_in_mb = with_action.virtualDisks[wvdidx].stats[wvdsidx].capacity.total;
                                }
                                if (with_action.virtualDisks[wvdidx].stats[wvdsidx].name === "costPrice") {
                                    w_price_per_hour = with_action.virtualDisks[wvdidx].stats[wvdsidx].value;
                                }
                            }

                            for (wovdsidx = 0; wovdsidx < without_action.virtualDisks[wovdidx].stats.length; wovdsidx++) {
                                if (without_action.virtualDisks[wovdidx].stats[wovdsidx].name === "StorageAmount") {
                                    wo_size_in_mb = without_action.virtualDisks[wovdidx].stats[wovdsidx].capacity.total;
                                }
                                if (without_action.virtualDisks[wovdidx].stats[wovdsidx].name === "costPrice") {
                                    wo_price_per_hour = without_action.virtualDisks[wovdidx].stats[wovdsidx].value;
                                }
                            }
                            rows.push([
                                without_action.virtualDisks[wovdidx].displayName,
                                without_action.currentEntity.displayName,
                                wo_size_in_mb, // I am skeptical of this. The UI only gets actions, but this is not necessarily the size of the original volume, it's the size decided for the target volume. Get stats for the "original" onprem volume?
                                without_action.target.displayName,
                                without_action.virtualDisks[wovdidx].tier,
                                wo_size_in_mb,
                                without_action.newEntity.aspects.cloudAspect.region.displayName,
                                wo_price_per_hour,
                                with_action.virtualDisks[wvdidx].tier,
                                w_size_in_mb,
                                with_action.newEntity.aspects.cloudAspect.region.displayName,
                                w_price_per_hour
                            ]);
                        }
                    }
                }
            }
        }
    }

    return rows;
};

CloudMigrationPlan.prototype.save_volume_mapping_csv = function (filepath) {
    "use strict";
    var ridx,
        headers = [],
        rows = this.generate_volume_mapping();
    for (ridx = 0; ridx < rows.length; ridx++) {
        if (this.options.hasOwnProperty("hours_per_month")) {
            rows[ridx][7] = rows[ridx][7] * this.options.hours_per_month;
        } else {
            rows[ridx][7] = rows[ridx][7] * 730;
        }

        if (this.options.hasOwnProperty("hours_per_month")) {
            rows[ridx][11] = rows[ridx][11] * this.options.hours_per_month;
        } else {
            rows[ridx][11] = rows[ridx][11] * 730;
        }
    }
    rows.unshift([
        "Disk Id",
        "Storage",
        "Size",
        "Linked VM",
        "Tier",
        "Size",
        "Location",
        "Cost",
        "Tier",
        "Size",
        "Location",
        "Cost"
    ]);

    headers = [
        "Current",
        " ",
        " ",
        " ",
        "ALLOCATION PLAN : On-Demand Pricing",
        " ",
        " ",
        " ",
        "CONSUMPTION PLAN : On-Demand Pricing",
        " ",
        " ",
        " "
    ];


    writeTable(filepath, headers, rows);
};

function CloudOptimizePlan(scope, name, options) {
    "use strict";

    this.scenario_create_request = {
        "configChanges": {
            "addPolicyList": [],
            "automationSettingList": [
                {
                    "uuid": "resize",
                    "displayName": "resize for VMS enabled",
                    "value": "true",
                    "entityType": "VirtualMachine"
                }
            ],
            "removeConstraintList": [],
            "removePolicyList": [],
            "riSettingList": [
                {
                    "uuid": "preferredOfferingClass",
                    "displayName": "Type",
                    "value": "STANDARD",
                    "entityType": "STANDARD"
                },
                {
                    "uuid": "preferredTerm",
                    "displayName": "Term",
                    "value": "YEARS_3",
                    "entityType": "YEARS_3"
                },
                {
                    "uuid": "preferredPaymentOption",
                    "displayName": "Payment",
                    "value": "ALL_UPFRONT",
                    "entityType": "ALL_UPFRONT"
                },
                {
                    "uuid": "preferredCoverage",
                    "displayName": "Coverage",
                    "value": "80",
                    "entityType": "80"
                },
                {
                    "uuid": "riCoverageOverride",
                    "displayName": "RI Coverage Override",
                    "value": "false",
                    "entityType": "false"
                }
            ],
            "osMigrationSettingList": [],
            "subscription": {}
        },
        "displayName": name,
        "loadChanges": {
            "utilizationList": [],
            "maxUtilizationList": []
        },
        "projectionDays": [0],
        "scope": [scope],
        "topologyChanges": {
            "addList": [],
            "migrateList": [],
            "removeList": [],
            "replaceList": [],
            "relievePressureList": []
        },
        "type": "OPTIMIZE_CLOUD"
    };

    this.scope = scope;
    this.name = name;
    this.options = options;
    this.plan_market_name = "CLOUD_OPTIMIZATION_" + this.scope.uuid + "_" + Date.now();
}

CloudOptimizePlan.prototype = Object.create(Plan.prototype);

exports.Plan = Plan;
exports.CloudMigrationPlan = CloudMigrationPlan;
exports.CloudOptimizePlan = CloudOptimizePlan;
