'use strict';

// Usage collector service.

const _ = require('underscore');
const omit = _.omit;

const proxyquire = require('proxyquire');
const request = require('cf-abacus-request');

// Configure test db URL prefix and splitter and provisioning service URLs
process.env.COUCHDB = process.env.COUCHDB || 'test';
process.env.METER = 'http://localhost:9081';
process.env.PROVISIONING = 'http://localhost:9380';

// Mock the cluster and request modules
const clustmock = (app) => app;
const webapp = proxyquire('cf-abacus-webapp', { 'cf-abacus-cluster': clustmock });
const reqmock = {
    get: spy((uri, req, cb) => cb(undefined, { statusCode: 200 })),
    norespost: spy((uri, req, cb) => cb())
};

const collector = proxyquire('..', { 'cf-abacus-webapp': webapp, 'cf-abacus-request': reqmock });

describe('cf-abacus-usage-collector', () => {
    it('stores and retrieves batches of service usage data', function(done) {
        this.timeout(60000);

        // Create a test collector app
        const app = collector();

        // Listen on an ephemeral port
        const server = app.listen(0);

        // Post usage for a service, expecting a 201 response
        var batch = { service_instances: [{ service_instance_id: '123', usage:[{ start: 1420243200000, end: 1420245000000, plan_id: 'plan_123', region: 'us',
            organization_guid: 'org_456', space_guid: 'space_567', consumer: { type: 'external', value: '123' }, resources: [{ unit: 'calls', quantity: 12 }]}]}]};

        request.post('http://localhost::p/v1/metering/services/:service_id/usage',
            { p: server.address().port, service_id: 1234, body: batch }, (err, val) => {
                expect(err).to.equal(undefined);
                expect(val.statusCode).to.equal(201);

                // Get usage, expecting what we posted
                request.get(val.headers.location, {}, (err, val) => {
                    expect(err).to.equal(undefined);
                    expect(val.statusCode).to.equal(200);
                    expect(omit(val.body, 'id')).to.deep.equal(batch);

                    // Expect a call to the provisioning service
                    expect(reqmock.get.args.length).to.equal(1);
                    expect(reqmock.get.args[0][0]).to.equal('http://localhost:9380/v1/provisioning/regions/:region/orgs/:organization_guid/spaces/:space_guid/consumers/:consumer_id/services/:service_id/plans/:plan_id/instances/:service_instance_id');

                    // Expect usage to be posted to the splitter service too
                    expect(reqmock.norespost.args.length).to.equal(1);
                    expect(reqmock.norespost.args[0][0]).to.equal('http://localhost:9081/v1/metering/usage');
                    done();
                });
            });
    });

    it('stores and retrieves batches of service instance usage data', function(done) {
        this.timeout(60000);

        // Create a test collector app
        const app = collector();

        // Listen on an ephemeral port
        const server = app.listen(0);

        // Post usage for a service instance, expecting a 201 response
        var batch = { service_id: '123', usage: [{ start: 1420243200000, end: 1420245000000, plan_id: 'plan_123', region: 'us',
            organization_guid: 'org_456', space_guid: 'space_567', consumer: { type: 'external', value: '123' }, resources: [{ unit: 'calls', quantity: 12 }]}]};

        request.post('http://localhost::p/v1/metering/service_instances/:service_instance_id/usage',
            { p: server.address().port, service_instance_id: 5678, body: batch }, (err, val) => {
                expect(err).to.equal(undefined);
                expect(val.statusCode).to.equal(201);

                // Get usage, expecting what we posted
                request.get(val.headers.location, {}, (err, val) => {
                    expect(err).to.equal(undefined);
                    expect(val.statusCode).to.equal(200);
                    expect(omit(val.body, 'id')).to.deep.equal(batch);

                    // Expect a call to the provisioning service
                    expect(reqmock.get.args.length).to.equal(2);
                    expect(reqmock.get.args[1][0]).to.equal('http://localhost:9380/v1/provisioning/regions/:region/orgs/:organization_guid/spaces/:space_guid/consumers/:consumer_id/services/:service_id/plans/:plan_id/instances/:service_instance_id');

                    // Expect usage to be posted to the splitter service too
                    expect(reqmock.norespost.args.length).to.equal(2);
                    expect(reqmock.norespost.args[1][0]).to.equal('http://localhost:9081/v1/metering/usage');
                    done();
                });
            });
    });
});

