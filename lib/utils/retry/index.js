'use strict';

// Tiny wrapper around the Node retry module providing call retries with
// exponential backoff, with a more natural interface than the original
// retry module.

const _ = require('underscore');
const _retry = require('retry');

const initial = _.initial;
const last = _.last;
const extend = _.extend;
const isFunction = _.isFunction;
const map = _.map;
const object = _.object;
const pairs = _.pairs;
const functions = _.functions;
const bind = _.bind;

// Setup debug log
const debug = require('cf-abacus-debug')('cf-abacus-retry');

// Return retry configuration options with some reasonable defaults
const options = (retries, min, max, factor, random) => {
    const def = function(v, d) { return v === undefined ? d : v; };
    return { retries: def(retries, 5), minTimeout: def(min, 50), maxTimeout: def(max, 500), factor: def(factor, 2), randomize: def(random, true) };
};

// Convert an application function to a retry wrapper function that attempts
// to call it then automatically retries after a failure using an exponential
// backoff. The retries, min, max, factor and random parameters are optional.
const retryfn = (fn, retries, min, max, factor, random) => {

    // Process configuration options
    const opt = options(retries, min, max, factor, random);

    // Determine the application function name
    const name = fn.fname || fn.name;

    // Create a wrapper around the application function
    const wrapper = function() {

        // Assume the usal function signature with a callback
        const args = initial(arguments);
        const cb = last(arguments);

        // Create a retry operation
        const op = _retry.operation(opt);

        // Attempt the operation
        debug('Calling function %s', name);
        op.attempt((attempt) => {

            // Call the application function with our own callback to intercept
            // the call results
            fn.apply(undefined, args.concat([(err, val) => {

                // Retry on error until the configured number of retries has
                // been reached
                if(op.retry(err)) {
                    debug('Retrying failed call to function %s', name);
                    return;
                }

                // Call back with the first error or the success result
                debug('Function %s calling back with %s', name, err ? 'error' : 'success');
                cb(err ? op.errors()[0] : undefined, val);
            }]));
        });
    };

    // Store the application function name in the wrapper function
    wrapper.fname = name;

    return wrapper;
};

// Bind a function to an object while retaining the function name
const nbind = (o, k) => extend(bind(o[k], o), { fname: (o.name || o.fname ? (o.name || o.fname) + '.' : '') + (o[k].name || o[k].fname || k) });

// Convert an application function to a retry function, if the given function
// is a module then convert all the module's exported functions as well.
const retry = (fn, retries, min, max, factor, random) => extend(
    isFunction(fn) ? retryfn(fn, retries, min, max, factor, random) : {},
    object(pairs(fn)),
    object(map(functions(fn), (k) => [k, retryfn(nbind(fn, k), retries, min, max, factor, random)])));

// Export our public functions
module.exports = retry;

