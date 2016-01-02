import assert from 'assert';
import _ from 'lodash';
import feathers from 'feathers';
import io from 'socket.io-client';
import { Service as todoService, verify } from 'feathers-commons/lib/test-fixture';

import socketio from '../src';

describe('feathers-socketio', () => {
  var server, socket, app,
    socketParams = {
      user: { name: 'David' },
      provider: 'socketio'
    };

  before(done => {
    app = feathers()
      .configure(socketio(function(io) {
        io.use(function (socket, next) {
          socket.feathers = socketParams;
          next();
        });
      }))
      .use('/todo', todoService);

    server = app.listen(7886, function(){
      app.use('/tasks', todoService);
      done();
    });

    socket = io.connect('http://localhost:7886');
  });

  after(done => {
    socket.disconnect();
    server.close(done);
  });

  it('is CommonJS compatible', () => assert.equal(typeof require('../lib'), 'function'));

  it('runs io before setup (#131)', function(done) {
    let counter = 0;
    let app = feathers()
      .configure(socketio(function() {
        assert.equal(counter, 0);
        counter++;
      }))
      .use('/todos', {
        find(params, callback) {
          callback(null, []);
        },
        setup(app) {
          assert.ok(app.io);
          assert.equal(counter, 1, 'SocketIO configuration ran first');
        }
      });

    let srv = app.listen(8887).on('listening', () => srv.close(done));
  });

  it('passes handshake as service parameters', function(done) {
    var service = app.service('todo');
    var old = {
      find: service.find,
      create: service.create,
      update: service.update,
      remove: service.remove
    };

    service.find = function(params) {
      assert.deepEqual(_.omit(params, 'query'), socketParams, 'Handshake parameters passed on proper position');
      old.find.apply(this, arguments);
    };

    service.create = function(data, params) {
      assert.deepEqual(_.omit(params, 'query'), socketParams, 'Passed handshake parameters');
      old.create.apply(this, arguments);
    };

    service.update = function(id, data, params) {
      assert.deepEqual(params, _.extend({
        query: {
          test: 'param'
        }
      }, socketParams), 'Passed handshake parameters as query');
      old.update.apply(this, arguments);
    };

    socket.emit('todo::create', {}, {}, function () {
      socket.emit('todo::update', 1, {}, { test: 'param' }, function() {
        _.extend(service, old);
        done();
      });
    });
  });

  it('missing parameters in socket call works (#88)', function(done) {
    var service = app.service('todo');
    var old = {
      find: service.find
    };

    service.find = function(params) {
      assert.deepEqual(_.omit(params, 'query'), socketParams, 'Handshake parameters passed on proper position');
      old.find.apply(this, arguments);
    };

    socket.emit('todo::find', function () {
      _.extend(service, old);
      done();
    });
  });

  describe('Services', function() {
    it('invalid arguments cause an error', function (done) {
      socket.emit('todo::find', 1, {}, function(error) {
        assert.equal(error.message, 'Too many arguments for \'find\' service method');
        done();
      });
    });

    describe('CRUD', function () {
      it('::find', function (done) {
        socket.emit('todo::find', {}, function (error, data) {
          verify.find(data);

          done(error);
        });
      });

      it('::get', function (done) {
        socket.emit('todo::get', 'laundry', {}, function (error, data) {
          verify.get('laundry', data);

          done(error);
        });
      });

      it('::create', function (done) {
        var original = {
          name: 'creating'
        };

        socket.emit('todo::create', original, {}, function (error, data) {
          verify.create(original, data);

          done(error);
        });
      });

      it('::create without parameters and callback', function (done) {
        var original = {
          name: 'creating'
        };

        socket.emit('todo::create', original);

        socket.once('todo created', function(data) {
          verify.create(original, data);

          done();
        });
      });

      it('::update', function (done) {
        var original = {
          name: 'updating'
        };

        socket.emit('todo::update', 23, original, {}, function (error, data) {
          verify.update(23, original, data);

          done(error);
        });
      });

      it('::update many', function (done) {
        var original = {
          name: 'updating',
          many: true
        };

        socket.emit('todo::update', null, original, {}, function (error, data) {
          verify.update(null, original, data);

          done(error);
        });
      });

      it('::patch', function (done) {
        var original = {
          name: 'patching'
        };

        socket.emit('todo::patch', 25, original, {}, function (error, data) {
          verify.patch(25, original, data);

          done(error);
        });
      });

      it('::patch many', function (done) {
        var original = {
          name: 'patching',
          many: true
        };

        socket.emit('todo::patch', null, original, {}, function (error, data) {
          verify.patch(null, original, data);

          done(error);
        });
      });

      it('::remove', function (done) {
        socket.emit('todo::remove', 11, {}, function (error, data) {
          verify.remove(11, data);

          done(error);
        });
      });

      it('::remove many', function (done) {
        socket.emit('todo::remove', null, {}, function (error, data) {
          verify.remove(null, data);

          done(error);
        });
      });
    });

    describe('Events', function () {
      it('created', function (done) {
        var original = {
          name: 'created event'
        };

        socket.once('todo created', function (data) {
          verify.create(original, data);
          done();
        });

        socket.emit('todo::create', original, {}, function () {});
      });

      it('updated', function (done) {
        var original = {
          name: 'updated event'
        };

        socket.once('todo updated', function (data) {
          verify.update(10, original, data);
          done();
        });

        socket.emit('todo::update', 10, original, {}, function () {});
      });

      it('patched', function(done) {
        var original = {
          name: 'patched event'
        };

        socket.once('todo patched', function (data) {
          verify.patch(12, original, data);
          done();
        });

        socket.emit('todo::patch', 12, original, {}, function () {});
      });

      it('removed', function (done) {
        socket.once('todo removed', function (data) {
          verify.remove(333, data);
          done();
        });

        socket.emit('todo::remove', 333, {}, function () {});
      });

      it('custom events', function(done) {
        var service = app.service('todo');
        var original = {
          name: 'created event'
        };
        var old = service.create;

        service.create = function(data) {
          this.emit('log', { message: 'Custom log event', data: data });
          service.create = old;
          return old.apply(this, arguments);
        };

        socket.once('todo log', function(data) {
          assert.deepEqual(data, { message: 'Custom log event', data: original });
          done();
        });

        socket.emit('todo::create', original, {}, function () {});
      });
    });

    describe('Event filtering', function() {
      it('.created', function (done) {
        var service = app.service('todo');
        var original = { description: 'created event test' };
        var oldCreated = service.created;

        service.created = function(data, params, callback) {
          assert.deepEqual(params, socketParams);
          verify.create(original, data);

          callback(null, _.extend({ processed: true }, data));
        };

        socket.emit('todo::create', original, {}, function() {});

        socket.once('todo created', function (data) {
          service.created = oldCreated;
          // Make sure Todo got processed
          verify.create(_.extend({ processed: true }, original), data);
          done();
        });
      });

      it('.updated', function (done) {
        var original = {
          name: 'updated event'
        };

        socket.once('todo updated', function (data) {
          verify.update(10, original, data);
          done();
        });

        socket.emit('todo::update', 10, original, {}, function () {});
      });

      it('.removed', function (done) {
        var service = app.service('todo');
        var oldRemoved = service.removed;

        service.removed = function(data, params, callback) {
          assert.deepEqual(params, socketParams);

          if(data.id === 23) {
            // Only dispatch with given id
            return callback(null, data);
          }

          callback(null, false);
        };

        socket.emit('todo::remove', 1, {}, function() {});
        socket.emit('todo::remove', 23, {}, function() {});

        socket.on('todo removed', function (data) {
          service.removed = oldRemoved;
          assert.equal(data.id, 23);
          done();
        });
      });
    });
  });

  describe('Dynamic Services', function() {
    describe('CRUD', function () {
      it('::find', function (done) {
        socket.emit('tasks::find', {}, function (error, data) {
          verify.find(data);

          done(error);
        });
      });

      it('::get', function (done) {
        socket.emit('tasks::get', 'laundry', {}, function (error, data) {
          verify.get('laundry', data);

          done(error);
        });
      });

      it('::create', function (done) {
        var original = {
          name: 'creating'
        };

        socket.emit('tasks::create', original, {}, function (error, data) {
          verify.create(original, data);

          done(error);
        });
      });

      it('::update', function (done) {
        var original = {
          name: 'updating'
        };

        socket.emit('tasks::update', 23, original, {}, function (error, data) {
          verify.update(23, original, data);

          done(error);
        });
      });

      it('::patch', function (done) {
        var original = {
          name: 'patching'
        };

        socket.emit('tasks::patch', 25, original, {}, function (error, data) {
          verify.patch(25, original, data);

          done(error);
        });
      });

      it('::remove', function (done) {
        socket.emit('tasks::remove', 11, {}, function (error, data) {
          verify.remove(11, data);

          done(error);
        });
      });
    });

    describe('Events', function () {
      it('created', function (done) {
        var original = {
          name: 'created event'
        };

        socket.once('tasks created', function (data) {
          verify.create(original, data);
          done();
        });

        socket.emit('tasks::create', original, {}, function () {});
      });

      it('updated', function (done) {
        var original = {
          name: 'updated event'
        };

        socket.once('tasks updated', function (data) {
          verify.update(10, original, data);
          done();
        });

        socket.emit('tasks::update', 10, original, {}, function () {});
      });

      it('patched', function(done) {
        var original = {
          name: 'patched event'
        };

        socket.once('tasks patched', function (data) {
          verify.patch(12, original, data);
          done();
        });

        socket.emit('tasks::patch', 12, original, {}, function () {});
      });

      it('removed', function (done) {
        socket.once('tasks removed', function (data) {
          verify.remove(333, data);
          done();
        });

        socket.emit('tasks::remove', 333, {}, function () {});
      });
    });

    describe('Event Filtering', function() {
      it('.created', function (done) {
        var service = app.service('tasks');
        var original = { description: 'created event test' };
        var oldCreated = service.created;

        service.created = function(data, params, callback) {
          assert.ok(service === this);
          assert.deepEqual(params, socketParams);
          verify.create(original, data);

          callback(null, _.extend({ processed: true }, data));
        };

        socket.emit('tasks::create', original, {}, function() {});

        socket.once('tasks created', function (data) {
          service.created = oldCreated;
          // Make sure Todo got processed
          verify.create(_.extend({ processed: true }, original), data);
          done();
        });
      });

      it('.updated', function (done) {
        // TODO this is not testing the right thing
        // but we will get better event filtering in v2 anyway
        var original = {
          name: 'updated event'
        };

        socket.once('tasks updated', function (data) {
          verify.update(10, original, data);
          done();
        });

        socket.emit('tasks::update', 10, original, {}, function () {});
      });

      it('.removed', function (done) {
        var service = app.service('tasks');
        var oldRemoved = service.removed;

        service.removed = function(data, params, callback) {
          assert.ok(service === this);
          assert.deepEqual(params, socketParams);

          if(data.id === 23) {
            // Only dispatch with given id
            return callback(null, data);
          }

          callback(null, false);
        };

        socket.emit('tasks::remove', 1, {}, function() {});
        socket.emit('tasks::remove', 23, {}, function() {});

        socket.on('tasks removed', function (data) {
          service.removed = oldRemoved;
          assert.equal(data.id, 23);
          done();
        });
      });
    });
  });
});
