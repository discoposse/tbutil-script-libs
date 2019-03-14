/*jslint plusplus: true*/

exports.maskObject = function (obj, mask) {
    "use strict";
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
