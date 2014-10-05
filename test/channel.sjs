var assert = require('assert');
var Channel = require('cspjs/channel');

describe('Channel', function () {
    describe('#put()', function () {

        it('should not call the callback immediately', function (done) {
            var ch = new Channel();
            var cond = false;
            ch.put(5, function () {
                cond = true;
            });
            ch.take(function (err, value) {
                cond = true;
                done();
            });
            assert.equal(cond, false);            
        });

        it('should pass values in the sequence they are received', task {
            var ch = new Channel(),
                seq = [4, 5, 6, 3, 5, 23, 24, 1000, 73, 42],
                taken = [],
                i = 0;
            for (i = 0; i < seq.length; ++i) {
                ch.put(seq[i]);
            }
            for (i = 0; i < seq.length; ++i) {
                v <- chan ch;
                taken.push(v);
            }
            assert.deepEqual(taken, seq);
        });

    });

    describe('#group()', function () {
        it('should collect N objects at a time', task {
            var ch = new Channel(), chg = ch.group(3);
            for (var i = 0; i < 10; ++i) {
                ch.put(i);
            }
            x <- chan chg;
            assert.deepEqual(x, [0,1,2]);
            x <- chan chg;
            assert.deepEqual(x, [3,4,5]);
            x <- chan chg;
            assert.deepEqual(x, [6,7,8]);
        });
    });

    describe('#takeN()', function () {
        it('should take N values', task {
            var ch = new Channel(), seq = [2,3,4,5,6,7,8,9];
            for (var i = 0; i < seq.length; ++i) {
                ch.put(seq[i]);
            }
            x <- ch.takeN(5);
            assert.deepEqual(x, [2,3,4,5,6]);
        });
    });

    describe('#fill()', function () {
        it('should repeatedly give the same value', task {
            var ch = new Channel();
            ch.fill(42);
            x <- ch.takeN(5);
            assert.deepEqual(x, [42,42,42,42,42]);
        });
    });

    describe('#timeout()', function () {
        it('should wait a while to yield a value', task {
            var ch = Channel.timeout(100);
            var start = Date.now();
            <- chan ch;
            var end = Date.now();
            assert.ok(end - start > 90);
        });
    });

    describe('#stream()', function () {
        it('should have a fixed backlog', task {
            var ch = new Channel();
            ch.stream([1,2,3,4,5,6,7,8,9]);
            assert.equal(ch.backlog(), 1);
            x <- ch.takeN(3);
            assert.deepEqual(x, [1,2,3]);
            assert.equal(ch.backlog(), 1);
        });
    });

    describe('#merge()', function () {
        it('should pass values from any channel', task {
            var chs = [100, 50, 200].map(Channel.timeout);
            var chm = Channel.merge(chs);
            x <- chan chm;
            assert.equal(x.chan, chs[1]);
            x <- chan chm;
            assert.equal(x.chan, chs[0]);
            x <- chan chm;
            assert.equal(x.chan, chs[2]);
        });
    });

    describe('#debounce()', function () {
        it('should not pass events too close in time', task {
            var ch = (new Channel()).debounce(100);
            ch.put(100);
            <- chan Channel.timeout(50);
            ch.put(200);
            <- chan Channel.timeout(200);
            ch.put(300);
            x <- chan ch;
            assert.equal(x, 200);
            x <- chan ch;
            assert.equal(x, 300);
        });
    });

    describe('#buffer()', function () {
        it('should not wait if the channel backlog is smaller than the buffer length', task {
            var ch = (new Channel()).buffer(5);
            await ch.put(1);
            await ch.put(2);
            await ch.put(3);
            await ch.put(4);
            await ch.put(5); // None of these puts should result in a wait.
            assert.equal(ch.backlog(), 5);
            task { <- chan Channel.timeout(100); <- chan ch; }();
            var start = Date.now();
            await ch.put(6); // .. but this put should wait for a read.
            var end = Date.now();
            assert.ok(end - start > 90);
        });
    });

    describe('#droppingBuffer()', function () {
        it('should drop puts after N if no taking is happening', task {
            var ch = (new Channel()).droppingBuffer(4);
            await ch.put(1);
            await ch.put(2);
            await ch.put(3);
            await ch.put(4);
            await ch.put(5);
            await ch.put(6); // None of these puts should result in a wait.
            x <- ch.takeN(4);
            await ch.put(7);
            await ch.put(8);
            assert.deepEqual(x, [1,2,3,4]);
            x <- ch.takeN(2);
            assert.deepEqual(x, [7,8]);
        });
    });

    describe('#expiringBuffer()', function () {
        it('should drop puts after N if no taking is happening', task {
            var ch = (new Channel()).expiringBuffer(4);
            await ch.put(1);
            await ch.put(2);
            await ch.put(3);
            await ch.put(4);
            await ch.put(5);
            await ch.put(6); // None of these puts should result in a wait.
            x <- ch.takeN(4);
            await ch.put(7);
            await ch.put(8);
            assert.deepEqual(x, [3,4,5,6]);
        });
    });

    describe('#map()', function () {
        it('should apply given transformation to values on the channel', task {
            var ch = new Channel(), ch2 = ch.map(function (x) { return x * x; });
            ch.put(1);
            ch.put(2);
            ch.put(3);
            ch.put(4);
            squares <- ch2.takeN(4);
            assert.deepEqual(squares, [1,4,9,16]);
        });
    });

    describe('#reduce()', function () {
        it('should apply given reduction to values on the channel', task {
            var ch = new Channel(), ch2 = ch.reduce(0, function (sum, x) { return sum + x; });
            ch.put(1);
            ch.put(2);
            ch.put(3);
            ch.put(4);
            sum <- ch2.takeN(4);
            assert.deepEqual(sum, [1,3,6,10]);
        });
    });
    
    describe('#filter()', function () {
        it('should only pass on values that satisfy the filter', task {
            var ch = new Channel(), ch2 = ch.filter(function (x) { return x % 2 === 1; });
            ch.put(1);
            ch.put(2);
            ch.put(3);
            ch.put(4);
            ch.put(5);
            ch.put(6);
            values <- ch2.takeN(3);
            assert.deepEqual(values, [1,3,5]);
        });
    });

    describe('#group()', function () {
        it('should group values', task {
            var ch = new Channel(), ch2 = ch.group(3);
            ch.put(1);
            ch.put(2);
            ch.put(3);
            ch.put(4);
            ch.put(5);
            ch.put(6);
            values <- ch2.takeN(2);
            assert.deepEqual(values, [[1,2,3],[4,5,6]]);
        });
    });
});
