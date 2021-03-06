'use strict';

// Small Express router that runs request handlers written as ES6 generators
// using Node co. On top of that the router does a few useful things, including
// some logging and error handling using a Node domain.

const _ = require('underscore');
const express = require('express');
const domain = require('domain');
const yieldable = require('cf-abacus-yieldable');

const toArray = _.toArray;
const map = _.map;

// Setup debug log
const debug = require('cf-abacus-debug')('cf-abacus-router');

// Convert a middleware function which can be a regular Express middleware or a
// generator to a regular Express middleware function.
const callbackify = (m, trusted) => {

    // If the callback is a regular function just use it as-is, otherwise it's
    // a generator and we need to wrap it using the co module
    const mfunc = yieldable.functioncb(m);

    // Return a middleware function. Middleware functions can be of the form
    // function(req, res, next) or function(err, req, res, next) so we need to
    // support both forms
    return function() {
        const next = arguments[arguments.length - 1];
        const res = arguments[1];
        const params = toArray(arguments).slice(0, arguments.length - 1);

        // Pass errors down the middleware stack, if the middleware is
        // un-trusted then we mark the error with bailout flag to trigger our
        // server bailout logic
        const error = (err, type) => {
            debug('Route error - %s - %o', type, err);
            if(!trusted && !err.status && !err.statusCode)
                err.bailout = true;
            next(err);
        };

        // Call the middleware function
        try {
            mfunc.apply(undefined, params.concat([(err, value) => {
                if(err) error(err, 'generator error');

                else if(value) {
                    // Store the returned value in the response, it'll be sent
                    // by one of our Express middleware later down the
                    // middleware stack
                    res.value = value;
                    next();
                }
            }]));
        }
        catch(exc) {
            error(exc, 'exception');
        }
    };
};

// Return an implementation of the router.use(path, middleware) function that supports
// middleware implemented as generators in addition to regular callbacks
const use = (original, trusted) => {
    return function(path, m) {
        return typeof path === 'function' ? original.call(this, callbackify(path, trusted)) : original.call(this, path, callbackify(m, trusted));
    };
};

// Return an implementation of the router.route() function that supports middleware implemented
// as generators in addition to regular callbacks
const route = (original, trusted) => {
    return function() {
        // Get the route
        const r = original.apply(this, arguments);

        // Monkey patch its HTTP methods
        map(['get', 'head', 'post', 'put', 'patch', 'delete', 'options', 'all', 'use'], (method) => {
            const f = r[method];
            r[method] = function() {
                const middleware = map(toArray(arguments), function(m) {
                    return callbackify(m, trusted);
                });
                return f.apply(this, middleware);
            };
        });
        return r;
    };
};

// Return an Express middleware that uses a Node domain to run the middleware stack and
// handle any errors not caught in async callbacks
const catchall = (trusted) => {
    return (req, res, next) => {
        const d = domain.create();
        d.on('error', (err) => {
            debug('Route domain error %o', err);

            // Pass the error down the middleware stack, if the router runs
            // un-trusted middleware then mark it with a bailout flag to
            // trigger our server bailout logic
            // Warning: mutating variable err
            if(!trusted && !err.status && !err.statusCode)
                err.bailout = true;
            next(err);
        });

        // Because req and res were created before this domain existed,
        // we need to explicitly add them.  See the explanation of implicit
        // vs explicit binding in the Node domain docs.
        d.add(req);
        d.add(res);

        // Run the middleware stack in our new domain
        d.run(next);
    };
};

// Return an Express router middleware that works with generators
const router = (trusted) => {
    const r = express.Router();

    // Catch all errors down the middleware stack using a Node domain
    r.use(catchall(trusted));

    // Monkey patch the router function with our implementation of the use
    // and route functions
    r.use = use(r.use, trusted);
    r.route = route(r.route, trusted);

    return r;
};

// Export our public functions
module.exports = router;

