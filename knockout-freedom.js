// Freed bindings plugin for Knockout http://knockoutjs.com/
// (c) Michael Best
// License: MIT (http://www.opensource.org/licenses/mit-license.php)
// Version 0.1.0

(function(window, ko, undefined) {

/*
 * Includes an optimized parseObjectLiteral and new preProcessBindings
 */
var javaScriptAssignmentTarget = /^[\_$a-z][\_$a-z0-9]*(\[.*?\])*(\.[\_$a-z][\_$a-z0-9]*(\[.*?\])*)*$/i;
var javaScriptReservedWords = ["true", "false", "null"];

function isWriteableValue(expression) {
    if (ko.utils.arrayIndexOf(javaScriptReservedWords, expression) >= 0)
        return false;
    return expression.match(javaScriptAssignmentTarget) !== null;
}

function isFunctionLiteral(expression) {
    // match function literal, which must start with function end with }
    return expression.match(/^[\(\s]*function\s*\(.*}[\)\s]*$/) !== null;
}

function isPossiblyUnwrappedObservable(expression) {
    // match parentheses in the expression, but ignore initial parentheses
    return expression.match(/[^(]+\(/) !== null;
}

function ensureQuoted(key) {
    return "'" + key + "'";
}

var stringDouble = '(?:"(?:[^"\\\\]|\\\\.)*")';
var stringSingle = "(?:'(?:[^'\\\\]|\\\\.)*')";
var stringRegexp = '(?:/(?:[^/\\\\]|\\\\.)*/)';
var specials = ',"\'{}()/:[\\]';
var everyThingElse = '(?:[^\\s:,][^' + specials + ']*[^\\s' + specials + '])';
var oneNotSpace = '[^\\s]';

var bindingToken = RegExp(
    '(?:' + stringDouble
    + '|' + stringSingle
    + '|' + stringRegexp
    + '|' + everyThingElse
    + '|' + oneNotSpace
    + ')', 'g');

var nativeTrim = String.prototype.trim;
function trim(str) {
    return str == null ? ""
        : nativeTrim
            ? nativeTrim.call(str)
            : str.toString().replace(/^\s+/, '').replace(/\s+$/, '');
}

function parseObjectLiteral(objectLiteralString) {
    // Trim leading and trailing spaces from the string
    var str = trim(objectLiteralString);

    // Trim braces '{' surrounding the whole object literal
    if (str.charCodeAt(0) === 123)
        str = str.slice(1, -1);

    // Split into tokens
    var result = [],
        toks = str.match(bindingToken),
        key, values, depth = 0;

    if (toks) {
        // Append a comma so that we don't need a separate code block to deal with the last item
        toks.push(',');

        for (var i = 0, n = toks.length; i < n; ++i) {
            var tok = toks[i], c = tok.charCodeAt(0);
            // A comma signals the end of a key/value pair if depth is zero
            if (c === 44) { // ","
                if (depth <= 0) {
                    if (key)
                        result.push({key: key, value: values ? values.join('') : undefined});
                    key = values = depth = 0;
                    continue;
                }
            // Simply skip the colon that separates the name and value
            } else if (c === 58) { // ":"
                if (!values)
                    continue;
            // Increment depth for parentheses, braces, and brackets so that interior commas are ignored
            } else if (c === 40 || c === 123 || c === 91) { // '(', '{', '['
                ++depth;
            } else if (c === 41 || c === 125 || c === 93) { // ')', '}', ']'
                --depth;
            // The key must be a single token; if it's a string, trim the quotes
            } else if (!key) {
                key = (c === 34 || c === 39) // '"', "'"
                    ? tok.slice(1, -1)
                    : tok;
                continue;
            }
            if (values)
                values.push(tok);
            else
                values = [tok];
        }
    }
    return result;
}

function preProcessBindings(bindingsStringOrKeyValueArray) {
    function processKeyValue(key, val) {
        if (!excludedBindings[key] && !isFunctionLiteral(val)) {
            if (twoWayBindings[key] && isWriteableValue(val)) {
                // for two-way bindings, provide a write method in case the value
                // isn't a writable observable
                val = 'ko.bindingValueWrap(function(){return ' + val + '},function(_z){' + val + '=_z;})';
            } else if (isPossiblyUnwrappedObservable(val)) {
                // Try to prevent observables from being accessed when parsing a binding;
                // Instead they will be "unwrapped" within the context of the specific binding handler
                val = 'ko.bindingValueWrap(function(){return ' + val + '})';
            }
        }
        resultStrings.push(ensureQuoted(key) + ":" + val);
    }

    var resultStrings = [],
        keyValueArray = typeof bindingsStringOrKeyValueArray === "string" ?
            parseObjectLiteral(bindingsStringOrKeyValueArray) : bindingsStringOrKeyValueArray;

    ko.utils.arrayForEach(keyValueArray, function(keyValue) {
        processKeyValue(keyValue.key, keyValue.value);
    });

    return resultStrings.join(",");
}

function findNameMethodSignatureContaining(obj, match) {
    for (var a in obj)
        if (obj.hasOwnProperty(a) && obj[a].toString().indexOf(match) >= 0)
            return a;
}

function findPropertyName(obj, equals) {
    for (var a in obj)
        if (obj.hasOwnProperty(a) && obj[a] === equals)
            return a;
}

function findSubObjectWithProperty(obj, prop) {
    for (var a in obj)
        if (obj.hasOwnProperty(a) && obj[a] && obj[a][prop])
            return obj[a];
}

/*
 * Replace preProcessBindings/insertPropertyAccessorsIntoJson with new version
 */
var rewritingObj = ko.jsonExpressionRewriting,
    preprocssName = findPropertyName(rewritingObj, rewritingObj.insertPropertyAccessorsIntoJson);
rewritingObj[preprocssName] = rewritingObj.preProcessBindings = rewritingObj.insertPropertyAccessorsIntoJson = preProcessBindings;

/*
 * ko.bindingValueWrap is used by preProcessBindings to return a function that
 * will look like an observable and will unwrap the value accessor and the value.
 */
var koProtoName = findPropertyName(ko.observable.fn, ko.observable);
ko.bindingValueWrap = function(valueAccessor, valueWriter) {
    function valueFunction(valueToWrite) {
        var value = valueAccessor();
        if (!arguments.length) {
            return ko.utils.unwrapObservable(value);
        } else if (ko.isObservable(value)) {
            return value(valueToWrite);
        } else if (valueWriter) {
            valueWriter(valueToWrite);
        }
    }
    valueFunction[koProtoName] = ko.observable;
    if (valueWriter) {
        // For basic observableArray support (for checked binding)
        ko.utils.arrayForEach(["push", "splice"], function (methodName) {
            valueFunction[methodName] = function () {
                var value = valueAccessor();
                return value[methodName].apply(value, arguments);
            };
        });
    }
    return valueFunction;
};

if (!ko.ignoreDependencies) {
    var depDet = findSubObjectWithProperty(ko, 'end'),
        depDetBeginName = findNameMethodSignatureContaining(depDet, '.push({');
    ko.ignoreDependencies = function(callback, object, args) {
        try {
            depDet[depDetBeginName](function() {});
            return callback.apply(object, args || []);
        } finally {
            depDet.end();
        }
    }
}

/*
 * ko.computed.possiblyWrap calls the read function and returns the computed only
 * if it has any dependencies (the function accessed an observable). Otherwise dispose
 * the computd so that memory is freed.
 */
if (!ko.computed.possiblyWrap) ko.computed.possiblyWrap = function(readFunction, disposeWhenNodeIsRemoved) {
    var computed = ko.computed(readFunction, null, {
        disposeWhenNodeIsRemoved: disposeWhenNodeIsRemoved
    });
    if (computed.getDependenciesCount())
        return computed;
    computed.dispose();
};


/*
 * Modify a binding so that the update function is called within its init
 * function, wrapped by computed. Keep the old update function available, but
 * only if called like ko.bindingHandlers.handler.update(...).
 */
function setUpFreedBindingHandler(handler) {
    var oldInit = handler.init, oldUpdate = handler.update;
    if (oldUpdate) {
        handler.init = function(element) {
            var self = this, args = arguments, ret;
            if (oldInit)
                ret = ko.ignoreDependencies(oldInit, self, args);
            ko.computed.possiblyWrap(function() {
                oldUpdate.apply(self, args);
            }, element);
            return ret;
        };
        handler.update = function() {
            if (this !== window)
                oldUpdate.apply(this, arguments);
        };
    } else if (oldInit) {
        handler.init = function() {
            return ko.ignoreDependencies(oldInit, this, arguments);
        };
    }
}

/*
 * Modify a template wrapper binding so that it only calls the template init
 * function. Remove the update function.
 */
var templateValueAccessorName = findNameMethodSignatureContaining(ko.bindingHandlers.ifnot, 'templateEngine');
function setUpFreedTemplateWrappingHandler(handler) {
    handler.init = function(element, valueAccessor) {
        var args = Array.prototype.slice.call(arguments, 0);
        args[1] = handler[templateValueAccessorName](valueAccessor);
        return ko.bindingHandlers.template.init.apply(this, args);
    };
    delete handler.update;
}

/*
 * Set up the given bindings so that they are freed from updates from sibling
 * bindings.
 */
ko.freeBindings = function(bindingsToFree, honorExclude) {
    ko.utils.arrayForEach([].concat(bindingsToFree), function(bindingKey) {
        if (!honorExclude || !excludedBindings[bindingKey]) {
            var handler = ko.bindingHandlers[bindingKey];
            if (handler && !handler.freed) {
                if (templateWrappingBindings[bindingKey])
                    setUpFreedTemplateWrappingHandler(handler);
                else
                    setUpFreedBindingHandler(handler);
                handler.freed = 1;
            }
            delete excludedBindings[bindingKey];
        }
    });
};

ko.dontFreeBindings = function(bindingsToExclude) {
    ko.utils.arrayForEach([].concat(bindingsToExclude), function(bindingKey) {
        excludedBindings[bindingKey] = 1;
    });
};

// Based on code by Craig Constable from http://tokenposts.blogspot.com.au/2012/04/javascript-objectkeys-browser.html
if (!Object.keys) Object.keys = function(o) {
    if (o !== Object(o))
        throw new TypeError('Object.keys called on a non-object');
    var k = [], p;
    for (p in o) {
        if (o.hasOwnProperty(o, p))
            k.push(p);
    }
    return k;
}

ko.freeAllBindings = function() {
    ko.freeBindings(Object.keys(ko.bindingHandlers), true);
};


var excludedBindings = {
        event:1, click:1, submit:1, valueUpdate:1, optionsIncludeDestroyed:1, optionsValue:1, optionsText:1, uniqueName:1
    },
    twoWayBindings = {
        value:1, selectedOptions:1, checked:1, hasfocus:1
    },
    templateWrappingBindings = {
        'with':1, 'if':1, ifnot:1, foreach:1
    };

if (ko.version <= '2.1.0') {
    excludedBindings.optionsCaption = 1;
}

/*
 * Register all active bindings when ko.applyBindings is called
 */
var oldApplyBindings = ko.applyBindings;
ko.applyBindings = function() {
    // "Free" all bindings
    ko.freeAllBindings();

    oldApplyBindings.apply(this, arguments);
}

})(window, ko);
