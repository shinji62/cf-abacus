'use strict';

// Small utility that throttles a Node function with callback to a maximum
// number of concurrent executions.

const _ = require('underscore');

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
const debug = require('cf-abacus-debug')('cf-abacus-throttle');

// Throttle the execution of an application function with callback
const throttlefn = function(fn, max) {
    let running = 0;
    let queue = [];

    const run = (callargs) => {
        // Queue calls to the application function if we have reached the
        // max allowed concurrent calls
        if(running === max) {
            debug('Queuing function call, reached max concurrent calls %d, queue size %d', max, queue.length + 1);
            return queue.push(callargs);
        }

        // Call the application function
        running = running + 1;
        const cb = last(callargs);
        return fn.apply(null, initial(callargs).concat([function(err, val) {

            // Call the application callback
            cb(err, val);

            // Schedule the execution of any queued call
            running = running - 1;
            if(queue.length) {
                debug('Scheduling execution of queued function call, queue size %d', queue.length - 1);
                const next = queue.shift();
                process.nextTick(() => run(next));
            }
        }]));
    };

    return function() { return run(arguments); };
};


// Bind a function to an object while retaining the function name
const nbind = (o, k) => extend(bind(o[k], o), { fname: (o.name || o.fname ? (o.name || o.fname) + '.' : '') + (o[k].name || o[k].fname || k) });

// Convert an application function to a throttled function, if the given
// function is a module then convert all the module's exported functions as
// well.
const throttle = (fn, max) => extend(
    isFunction(fn) ? throttlefn(fn, max) : {},
    object(pairs(fn)),
    object(map(functions(fn), (k) => [k, throttlefn(nbind(fn, k), max)])));

// Export our public functions
module.exports = throttle;

