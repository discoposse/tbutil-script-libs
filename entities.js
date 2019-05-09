/*global exports*/
/*jslint plusplus: true*/

/**
 * A class representing an array of entities. Mostly adds filtering
 * capabilities.
 *
 * @class
 * @implements {Array} *
 */
var EntityList = (function () {
    "use strict";

    EntityList.prototype = Object.create(Array.prototype);

    /**
     * Initializes a new EntityList. Can be initialized either with an array of
     * entities returned by the tbutil client, or with any "falsy" value (null will do fine).
     *
     * @constructs EntityList
     *
     * @param {object[]} [entities] - An array of entity object returned by the tbutil client.
     *
     * @example
     * var entities = new EntityList(client.getEntitiesByMarketUuid('Market'));
     */
    function EntityList(entities) {
        var i = 0;
        if (entities && entities.hasOwnProperty("length")) {
            for (i = 0; i < entities.length; i++) {
                this.push(entities[i]);
            }
        }
    }

    /**
     * Filters this EntityList to only entities of the specified entity type.
     *
     * @name EntityList#ByEntityType
     * @function
     * @param {string} entity_type - The name of the desired entity type. Case insensitive. Example "VirtualMachine"
     * @returns EntityList
     */
    EntityList.prototype.ByEntityType = function (entity_type) {
        var i = 0,
            return_list = new EntityList();

        for (i = 0; i < this.length; i++) {
            if (this[i].hasOwnProperty("className") && this[i].className.toLowerCase() === entity_type.toLowerCase()) {
                return_list.push(this[i]);
            }
        }

        return return_list;
    };

    /**
     * Filters this EntityList to only entities in one of the specified states.
     *
     * @name EntityList#ByEntityType
     * @function
     * @param {string[]} states - The names of the desired entity states. Case insensitive. Example ["SUSPENDED","inactive"]
     * @returns EntityList
     */
    EntityList.prototype.ByStates = function (states) {
        var i = 0,
            return_list = new EntityList();

        states = states.map(function (state) { return state.toLowerCase(); });

        for (i = 0; i < this.length; i++) {
            if (this[i].hasOwnProperty("state") && states.indexOf(this[i].state.toLowerCase()) > -1) {
                return_list.push(this[i]);
            }
        }

        return return_list;
    };

    /**
     * Filters this EntityList to only entities in the specified state.
     *
     * @name EntityList#ByEntityType
     * @function
     * @param {string} state - The names of the desired entity state. Case insensitive. Example "ACTIVE"
     * @returns EntityList
     */
    EntityList.prototype.ByState = function (state) {
        var i = 0,
            return_list = new EntityList();

        for (i = 0; i < this.length; i++) {
            if (this[i].hasOwnProperty("state") && this[i].state.toLowerCase() === state.toLowerCase()) {
                return_list.push(this[i]);
            }
        }

        return return_list;
    };

    /**
     * Filters this EntityList to only entities which are not in the specified state.
     *
     * @name EntityList#ByEntityType
     * @function
     * @param {string} state - The names of the undesired entity state. Case insensitive. Example "SUSPENDED"
     * @returns EntityList
     */
    EntityList.prototype.ByStateNot = function (state) {
        var i = 0,
            return_list = new EntityList();

        for (i = 0; i < this.length; i++) {
            if (this[i].hasOwnProperty("state") && this[i].state.toLowerCase() !== state.toLowerCase()) {
                return_list.push(this[i]);
            }
        }

        return return_list;
    };

    return EntityList;
}());
