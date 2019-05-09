/*jslint plusplus: true*/

/**
 * A helper class with some static methods
 */
var Utilities = (function () {
    "use strict";

    Utilities.maskObject = function (obj, mask) {
        var return_obj = {},
            propIdx,
            propName,
            has_properties = Object.getOwnPropertyNames(obj);
        for (propIdx = 0; propIdx < has_properties.length; propIdx++) {
            propName = has_properties[propIdx];
            if (mask.indexOf(propName) !== -1) {
                return_obj[propName] = obj[propName];
            }
        }
        return return_obj;
    };

    Utilities.tbutil_date_string_to_date_obj = function (date_str) {
        var yr, mo, dy, hr, mi, se;
        yr = parseInt(date_str.substring(0, 4), 10);
        mo = parseInt(date_str.substring(5, 7), 10);
        dy = parseInt(date_str.substring(8, 10), 10);
        hr = parseInt(date_str.substring(11, 13), 10);
        mi = parseInt(date_str.substring(14, 16), 10);
        se = parseInt(date_str.substring(17, 19), 10);

        return new Date(yr, mo, dy, hr, mi, se);
    };

    function Utilities() {}

    return Utilities;
}());
