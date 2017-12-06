import express = require('express');
import bodyParser = require('body-parser');
import errors = require('./errors');
import auth = require('./auth');

/**
 * The hcapi is a separate express app to completely separate anything going on in our main website
 */
const hcapi = express();

hcapi.options(auth.middleware.cors);
hcapi.use(auth.middleware.cors);
hcapi.use(auth.middleware.bearer);
hcapi.use(bodyParser.json());

// API endpoints
hcapi.use('/tokens', require('./tokens'));
hcapi.use('/admins', require('./admins'));
hcapi.use('/applications', require('./applications'));
hcapi.use('/stats', require('./stats'));
hcapi.use('/criteria', require('./criteria'));
hcapi.use('/tickets', require('./tickets'));

// Errors
hcapi.use(errors.middleware.notFound);
hcapi.use(errors.middleware.error);

module.exports = hcapi;
