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
        it('must bind all connected variables including closure capture', task {
            var b = task { y := 5; };
            var y;
            b(); // spawn b. 
            assert.ok(y !== 5);
            await y;
            assert.equal(y, 5);
        });
        it('must permit dfvars to be realized within arrays', task {
            var b = task (x, v) { x := v; };
            var y, z;
            b(y, 5); // spawn b. 
            b(z, 6);
            assert.ok(y !== 5);
            assert.ok(z !== 6);
            var xs = [y, z]; // Doesn't need an await.
            assert.deepEqual(xs, [5,6]);
        });
        it('must permit dfvars to be created within arrays lazily', task {
            var b = task (x, v) { x := v; };
            var y, z;
            b(y, 5); // spawn b. 
            b(z, 6);

            var xs = [];
            xs[0] := y;
            xs[1] := z;
            assert.ok(y !== 5);
            assert.ok(z !== 6);
            await xs;
            assert.deepEqual(xs, [5,6]);
        });
        it('must permit dfvars to be realized within objects', task {
            var b = task (x, v) { x := v; };
            var y, z;
            b(y, 5); // spawn b. 
            b(z, 6);
            assert.ok(y !== 5);
            assert.ok(z !== 6);
            var xs = {hello: y, world: z}; // Doesn't need an await.
            assert.deepEqual(xs, {hello: 5, world: 6});
        });        
        it('must permit dfvars to be created within objects lazily', task {
            var b = task (x, v) { x := v; };
            var y, z;
            b(y, 5); // spawn b. 
            b(z, 6);

            var xs = {};
            xs['hello'] := y;
            xs['world'] := z;
            assert.ok(y !== 5);
            assert.ok(z !== 6);
            await xs;
            assert.deepEqual(xs, {hello: 5, world: 6});
        });
    });
});
