'use strict';

// A simple reporting service for aggregated usage.

const _ = require('underscore');
const proxyquire = require('proxyquire');
const request = require('cf-abacus-request');
const db = require('cf-abacus-aggregation-db');

const clone = _.clone;
const extend = _.extend;

/* eslint quotes: 1 */

// Configure test db URL prefix
process.env.COUCHDB = process.env.COUCHDB || 'test';

// Mock the cluster module
const webapp = proxyquire('cf-abacus-webapp', { 'cf-abacus-cluster': (app) => app });

const report = proxyquire('..', { 'cf-abacus-webapp': webapp });

describe('cf-abacus-usage-report', () => {
    it('retrieves aggregated usage for an organization', function(done) {
        this.timeout(60000);

        // Create a test report app
        const app = report();

        // Listen on an ephemeral port
        const server = app.listen(0);

        // Store the aggregated usage we're expecting in our test db
        const aggregated = {
            id: 'k-org_123-t-0001420502400000', organization_guid: 'org_123', usage_id: '222',
            start: 1420502400000, end: 1420588799999,
            services: [
                { id: '1234', aggregated_usage: [{ unit: 'calls', quantity: 12 }]}
            ],
            spaces: [
                { id: 'space_567', services: [ { id: '1234', aggregated_usage: [{ unit: 'calls', quantity: 12 }]} ],
                    consumers: [ { id: '123', services: [ { id: '1234', aggregated_usage: [{ unit: 'calls', quantity: 12 }]} ] } ]}
            ]
        };
        const aggrdb = db('test', 'abacus-aggregated-usage');
        aggrdb.put(extend(clone(aggregated), { _id: aggregated.id }), (err, val) => {
            expect(err).to.equal(null);

            // Get the aggregated usage
            request.get('http://localhost::p/v1/organizations/:organization_guid/usage/:day', { p: server.address().port, organization_guid: 'org_123', day: '2015-01-06' }, (err, val) => {
                expect(err).to.equal(undefined);

                // Expect our test aggregated usage
                expect(val.statusCode).to.equal(200);
                expect(val.body).to.deep.equal(aggregated);
                done();
            });
        });
    });
    it('queries aggregated usage for an organization', function(done) {
        this.timeout(60000);

        // Create a test report app
        const app = report();

        // Listen on an ephemeral port
        const server = app.listen(0);

        // Store the test aggregated usage in our test db
        const aggregated = {
            id: 'k-org_456-t-0001420502400000', organization_guid: 'org_456', usage_id: '222',
            start: 1420502400000, end: 1420588799999,
            services: [
                { id: '1234', aggregated_usage: [{ unit: 'calls', quantity: 12 }]}
            ],
            spaces: [
                { id: 'space_567', services: [ { id: '1234', aggregated_usage: [{ unit: 'calls', quantity: 12 }]} ],
                    consumers: [ { id: '123', services: [ { id: '1234', aggregated_usage: [{ unit: 'calls', quantity: 12 }]} ] } ]}
            ]
        };

        const aggrdb = db('test', 'abacus-aggregated-usage');
        aggrdb.put(extend(clone(aggregated), { _id: aggregated.id }), (err, val) => {
            expect(err).to.equal(null);

            // Define the graphql query and the corresponding expected result
            const query = '{ organization(organization_guid: "org_456", date: "2015-01-06") { id, organization_guid, services { id, aggregated_usage { unit, quantity}}}}';
            const expected = { organization: {
                id: 'k-org_456-t-0001420502400000', organization_guid: 'org_456',
                services: [
                    { id: '1234', aggregated_usage: [{ unit: 'calls', quantity: 12 }]}
                ]
            }};

            // Get the aggregated usage
            request.get('http://localhost::p/v1/metering/aggregated/usage/graph/:query', { p: server.address().port, query: query }, (err, val) => {
                expect(err).to.equal(undefined);

                // Expect our test aggregated usage
                expect(val.statusCode).to.equal(200);
                expect(val.body).to.deep.equal(expected);
                done();
            });
        });
    });
    it('queries aggregated usage for a list of organizations', function(done) {
        this.timeout(60000);

        // Create a test report app
        const app = report();

        // Listen on an ephemeral port
        const server = app.listen(0);

        // Store the test aggregated usage in our test db
        const aggregated = {
            id: 'k-org_789-t-0001420502400000', organization_guid: 'org_789', usage_id: '222',
            start: 1420502400000, end: 1420588799999,
            services: [
                { id: '1234', aggregated_usage: [{ unit: 'calls', quantity: 12 }]}
            ],
            spaces: [
                { id: 'space_567', services: [ { id: '1234', aggregated_usage: [{ unit: 'calls', quantity: 12 }]} ],
                    consumers: [ { id: '123', services: [ { id: '1234', aggregated_usage: [{ unit: 'calls', quantity: 12 }]} ] } ]}
            ]
        };

        const aggrdb = db('test', 'abacus-aggregated-usage');
        aggrdb.put(extend(clone(aggregated), { _id: aggregated.id }), (err, val) => {
            expect(err).to.equal(null);

            // Define the graphql query and the corresponding expected result
            const query = '{ organizations(organization_guids: ["org_789"], date: "2015-01-06") { id, organization_guid, services { id, aggregated_usage { unit, quantity}}}}';
            const expected = { organizations: [{
                id: 'k-org_789-t-0001420502400000', organization_guid: 'org_789',
                services: [
                    { id: '1234', aggregated_usage: [{ unit: 'calls', quantity: 12 }]}
                ]
            }]};

            // Get the aggregated usage
            request.get('http://localhost::p/v1/metering/aggregated/usage/graph/:query', { p: server.address().port, query: query }, (err, val) => {
                expect(err).to.equal(undefined);

                // Expect our test aggregated usage
                expect(val.statusCode).to.equal(200);
                expect(val.body).to.deep.equal(expected);
                done();
            });
        });
    });
});

