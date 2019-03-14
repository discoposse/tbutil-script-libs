/*global client,exports,writeTable*/
/*jslint plusplus: true*/
function CloudMigrationPlan(from, to, name, options) {
    "use strict";
    this.scenario_create_response = {};
    this.scenario_run_response = {};
    this.plan_market = {};

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
}

CloudMigrationPlan.prototype.run = function () {
    "use strict";
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

    this.scenario_create_response = client.createScenario(this.scenario_create_request);
    this.scenario_run_response = client.applyAndRunScenario(
        "Market",
        parseInt(this.scenario_create_response.uuid, 10),
        {
            disable_hateoas: true,
            ignore_constraints: true,
            plan_market_name: "CLOUD_MIGRATION_" + this.from.uuid + "_" + this.to.uuid + "_" + Date.now()
        }
    );
};

CloudMigrationPlan.prototype.wait = function () {
    "use strict";
    // Loop getting the created market until it is in "SUCCEDED" .state
    var state = "";
    do {
        this.scenario_run_response = client.getMarketByUuid(this.scenario_run_response.uuid);
        state = this.scenario_run_response.state;
        // TODO: A sleep? https://stackoverflow.com/questions/951021/what-is-the-javascript-version-of-sleep
    } while (state !== "SUCCEEDED");
};

CloudMigrationPlan.prototype.generate_vm_template_mapping = function () {
    "use strict";
    if (Object.getOwnPropertyNames(this.scenario_run_response).length === 0) {
        throw "Plan has not been run yet. Please call the 'run()' function first";
    }

    this.wait();

    var getActionsBody = {"actionTypeList": ["MOVE"], "relatedEntityTypes": ["VirtualMachine"]},
        widx,
        woidx,
        sidx,
        fidx,
        with_action,
        without_action,
        rows = [],
        ri_to_buy = false,
        cost_with_ri = 0;
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
        ri_to_buy = false;
        cost_with_ri = 0;
        with_action = this.turbo_actions[widx];
        for (woidx = 0; woidx < this.lift_and_shift_actions.length; woidx++) {
            without_action = this.lift_and_shift_actions[woidx];
            if (with_action.target.realtimeMarketReference.uuid === without_action.target.realtimeMarketReference.uuid) {
                if (!with_action.hasOwnProperty('reservedInstance')) {
                    for (sidx = 0; sidx < with_action.stats.length; sidx++) {
                        if (with_action.stats[sidx].name === "costPrice") {
                            for (fidx = 0; fidx < with_action.stats[sidx].filters.length; fidx++) {
                                if (with_action.stats[sidx].filters[fidx].type === "savingsType" && with_action.stats[sidx].filters[fidx].value === "superSavings") {
                                    ri_to_buy = true;
                                    // TODO: This calculates the same as the dashboard, but it is consistently wrong (higher)
                                    // than the actual 3yr RI.
                                    cost_with_ri = with_action.stats[sidx].value * -1 * 730;
                                }
                            }
                        }
                    }
                }
                rows.push([
                    with_action.target.displayName,
                    without_action.target.aspects.virtualMachineAspect.os,
                    with_action.currentLocation.displayName,
                    without_action.template.displayName,
                    without_action.newLocation.displayName,
                    without_action.target.costPrice * 730,
                    with_action.template.displayName,
                    with_action.newEntity.aspects.virtualMachineAspect.os,
                    with_action.newLocation.displayName,
                    with_action.target.costPrice * 730,
                    cost_with_ri,
                    ri_to_buy
                ]);
            }
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

exports.CloudMigrationPlan = CloudMigrationPlan;
