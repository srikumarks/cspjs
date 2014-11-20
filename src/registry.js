var crypto = require('crypto');

var registry = {};

// register(task_fn) -> task_fn
//
// task_fn._cspjs_registry_key contains sha1
//
// Registration is simply creating a hash of the tasks's source code
// and storing it away under the hash. The hash is used to identify the
// source code bit. Resumable tasks are expected to not close over their
// environment and are to be defined entirely by their source code alone,
// so this is ok.
exports.register = register;

// lookup(sha1) -> task_fn
//
// Looks up an already registered task, or returns undefined if no such
// task was registered.
exports.lookup = lookup;

// resurrect(suspension) -> continuation callback
//
// Calling the callback with callback.call(this, err, value1, value2, ...) will
// result in the suspension resuming from that point with value1, value2, etc.
// being assigned to the values requested at the suspend point.
//
// The registry owns the sha1->task_fn mappings required for the resurrection
// of the suspension.
exports.resurrect = resurrect;

function register(task_fn) {
    var hash = crypto.createHash('sha1');
    hash.update(task_fn.toString(), 'utf8');
    var key = hash.digest('hex');

    // Bind the key both ways.
    registry[key] = task_fn;
    task_fn._cspjs_registry_key = key;

    return task_fn;
}

function lookup(sha1) {
    return registry[sha1];
}

function resurrect(suspension) {
    var taskfn = suspension.fn && lookup(suspension.fn);
    if (!taskfn) {
        throw new Error('Cannot resurrect unregistered tasks');
    }
    function callback() {
        suspension.context = this;
        suspension.argv = Array.prototype.slice.call(arguments);
        taskfn.call(suspension);
    }
    callback.suspension = function () {
        return suspension;
    };
    return callback;
}
