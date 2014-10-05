var Channel = require('cspjs/channel');
var assert = require('assert');

describe('dataflow_variables', function () {
    describe('var', function () {
        it('must declare a data flow variable if no initializers are given', task {
            var x;
            // x won't be awaited automatically in the statement below.
            // To do that we need an explicit "await x;" statement here.
            assert.deepEqual(Object.keys(x), ["promise", "resolve", "reject"]);
        });
        it('must declare data flow variables if no initializers are given', task {
            var x, y;
            assert.deepEqual(Object.keys(x), ["promise", "resolve", "reject"]);
            assert.deepEqual(Object.keys(y), ["promise", "resolve", "reject"]);
        });
    });
    describe(':=', function () {
        it('must bind all connected variables even in async tasks', task {
            var b = task (x) { x := 5; };
            var y;
            b(y); // spawn b. 
            assert.ok(y !== 5);
            await y;
            assert.equal(y, 5);
        });
    });
});
