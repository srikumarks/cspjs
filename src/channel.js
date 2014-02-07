// A channel is a queue with a read-end and a write-end.
// Values are written and read asynchronously via callbacks.
// The basic channel is such that the callback associated
// with a value put into it will be called when the value
// is consumed from the read end.

function Channel() {
    this._queue = [];
    this._pending = [];
    return this;
}

function sendValue(value, callback) {
    callback && process.nextTick(function () { callback(null, value); });
}

function sendError(err, callback) {
    callback && process.nextTick(function () { callback(err, null); });
}


// Read a value from the channel, passing the value to the given callback.
Channel.prototype.take = function (callback) {
    if (this._queue.length > 0) {
        var q = this._queue.shift();
        sendValue(q.value, q.callback);
        sendValue(q.value, callback);
    } else {
        callback && this._pending.push(callback);
    }
};

// Places a value into the channel. The callback will be called when the value is
// consumed from the read-end.
Channel.prototype.put = function (value, callback) {
    if (this._pending.length > 0) {
        var p = this._pending.shift();
        sendValue(value, callback);
        sendValue(value, p);
    } else {
        this._queue.push({callback: callback, value: value});
    }
};

function ReceivedChannelValue(id, err, value) {
    this.id = id;
    this.err = err;
    this.val = value;
    return this;
}

// Makes a callback that will receive the value produced by
// some process and place the result into the channel. The
// "id" exists to identify the one producing the value.
// The "id", "err" and "val" are all available on the
// channel.
Channel.prototype.receive = function (id) {
    var self = this;
    return function (err, value) {
        self.put(new ReceivedChannelValue(id, err, value));
    };
};

// Answers "will read succeed immediately?"
Object.defineProperty(Channel.prototype, 'canRead', {
    get: function () { 
        return this._queue.length > 0 && this._pending.length === 0;
    }
});

// Answers "will write succeed immediately?"
Object.defineProperty(Channel.prototype, 'canWrite', {
    get: function () {
        return this._pending.length > 0 || this._queue.length === 0;
    }
});

// Answers "how many values have been placed into the channel?"
// Positive values give the number of values available right away.
// Negative values give the number of pending take operations.
Object.defineProperty(Channel.prototype, 'backlog', {
    get: function () {
        return this._queue.length - this._pending.length;
    }
});

// Makes a new channel whose values are transformed by the given
// function "f". `cond(value)` is a function that specifies a 
// condition until which the mapping will continue.
Channel.prototype.map = function (cond, f) {
    var ch2 = new Channel();
    var self = this;
    function receive(err, value) {
        if (cond === true || cond(value)) {
            ch2.put(f(value), loop);
        } else {
            ch2.put(null);
        }
    }
    function loop() {
        self.take(receive);
    }
    process.nextTick(loop);
    return ch2;
};

// Makes a new channel and pipes the values in this
// channel to it. Only the values that satisfy the
// predicate function 'f' are piped and others
// are dropped. 'cond(value)' gives the condition
// until which the piping will continue to run.
Channel.prototype.filter = function (cond, f) {
    var ch2 = new Channel();
    var self = this;
    function receive(err, value) {
        if (cond === true || cond(value)) {
            if (f(value)) {
                ch2.put(value, loop);
            } else {
                loop();
            }
        } else {
            ch2.put(null);
        }
    }
    function loop() {
        self.take(receive);
    }
    process.nextTick(loop);
    return ch2;
};

// Makes a new channel, reduces the values produced
// by this channel using the function "f" as long
// as "cond()" is satisfied and once all folding is done,
// sends the result to the new channel.
Channel.prototype.reduce = function (initial, cond, f) {
    var ch2 = new Channel();
    var self = this;
    var result = initial;
    function receive(err, value) {
        result = f(result, value);
        process.nextTick(loop);
    }
    function loop() {
        if (cond()) {
            self.take(receive);
        } else {
            ch2.put(result);
        }
    }
    process.nextTick(loop);
    return ch2;
};

// Makes a new channel and pipes the values put into this
// channel in groups of N. 
Channel.prototype.group = function (N) {
    var gch = new Channel();
    var group = [];
    var self = this;

    function receive(err, value) {
        group.push(value);
        if (group.length < N) {
            process.nextTick(loop);
        } else {
            var g = group;
            group = [];
            gch.put(g, receive);
        }
    }

    function loop() {
        self.take(receive);
    }

    process.nextTick(loop);
    return gch;
};

// Temporarily switches the channel to a mode where it will
// collect the next N items into a group and pass it on to
// the callback.
//
// Use within task like this -
//      var ch = new Channel();
//      ...
//      x <- ch.takeN(10);
Channel.prototype.takeN = function (N, callback) {
    var group = [];
    var self = this;
    function receive(err, value) {
        if (err) {
            return sendError(err, callback);
        }
        group.push(value);
        if (group.length < N) {
            self.take(receive);
        } else {
            sendValue(group, callback);
        }
    }
    self.take(receive);
};

function MergedChannelValue(i, ch, err, value) {
    this.ix = i;
    this.chan = ch;
    this.err = err;
    this.val = value;
    return this;
}

// Makes a new channel that receives the values put into
// all the given channels (which is an array of channels).
// The value produced by a merged channel is a wrapper object
// that has three fields - "chan" giving the channel that 
// produced the value, "val" giving the value and "ix" 
// giving the index of the channel in the array that produced
// the value. If any of the source channels callback with
// an err (which is never supposed to happen) or "null" value 
// (which can happen), the channel will cease to send its output
// to the merged channel.
Channel.merge = function (channels) {
    var channel = new Channel();

    function piper(ch, i) {
        function writer(err, value) {
            channel.put(new MergedChannelValue(i, ch, err, value), reader);
        }
        function reader(err, value) {
            ch.take(writer);
        }
        reader(null, null);
    }

    channels.forEach(piper);

    return channel;
};

// Makes a "timeout" channel, where every time someone pulls
// a value from it, it is delivered after "ms" milliseconds.
// This channel is not writeable.
Channel.timeout = function (ms) {
    var channel = new Channel();
    channel._timeInterval_ms = ms;
    channel.take = timeoutTake;
    return channel;
};

function timeoutTick(channel) {
    channel.put(true);
}

function timeoutTake(callback) {
    setTimeout(timeoutTick, this._timeInterval_ms, this);
    Channel.prototype.take.call(this, callback);
}

// Makes a "clock" channel which, once started, will produce
// values counting upwards from `startCounter`, until the
// `stop()` method is called on the channel. Calling `start()`
// will have an effect only when the clock is stopped.
Channel.clock = function (ms) {
    var channel = new Channel();
    channel._timer = null;
    channel._timeInterval_ms = ms;
    channel._counter = 0;
    channel.start = clockStart;
    channel.stop = clockStop;
    return channel;
};

function clockTick(clock) {
    clock.put(clock._counter++);
}

function clockStart(startCounter) {
    if (!this._timer) {
        startCounter = arguments.length < 1 ? 1 : startCounter;
        this._counter = startCounter;
        this._timer = setInterval(clockTick, this._timeInterval_ms, this);
    }
}

function clockStop() {
    if (this._timer) {
        clearInterval(this._timer);
        this._timer = null;
    }
}


// Returns a wrapped interface to channel which will
// debounce the values placed on it - i.e. it will
// reject put() operations that occur within a time
// of "ms" milliseconds between each other.
Channel.debounce = function (ms, channel) {
    var ch = Object.create(channel);
    ch._channel = channel;
    ch._debounceInterval_ms = ms;
    ch._lastPutTime = 0;
    ch.put = debouncingPut;
    return ch;
};

function debouncingPut(value, callback) {
    var now = Date.now();
    if (now - this._lastPutTime >= this._debounceInterval_ms) {
        this._lastPutTime = now;
        this._channel.put(value, callback);
    } else {
        sendValue(null, callback);
    }
}


// Wraps the given channel with an interface such
// that put() operations will immediately succeed
// as long as fewer than N values have been placed
// on the channel.
Channel.buffered = function (N, channel) {
    var ch = Object.create(channel);
    ch._channel = channel;
    ch._bufferLength = N;
    ch.put = bufferedPut;
    ch.take = bufferedTake;
    return ch;
};

function bufferedPut(value, callback) {
    if (this.backlog < this._bufferLength) {
        this._channel.put(value);
        sendValue(value, callback);
    } else {
        this._channel.put(value, callback);
    }
}

function bufferedTake(callback) {
    this._channel.take(callback);
    if (this._queue.length >= this._bufferLength - 1) {
        var q = this._queue[N-2];
        sendValue(q.value, q.callback);
        q.callback = null;
    }
}


// If more than N values have been placed into a channel
// and a writer tries to place one more value, sometimes
// we want the new value to be dropped in order that
// processing requirements don't accumulate. This is
// the purpose of `droppingAfter` which wraps the 
// parent channel's `put` to do this dropping.

Channel.prototype.droppingAfter = function (N) {
    var ch = Object.create(this);
    ch._channel = this;
    ch._bufferLength = N;
    ch.put = droppingPut;
    return ch;
};

function droppingPut(value, callback) {
    if (this.backlog < this._bufferLength) {
        this._channel.put(value, callback);
    } else {
        sendValue(null, callback);
    }
}

// In the same situation as with `droppingAfter`,
// at other times, we want the more recent values
// to take precedence over the values already in 
// the queue. In this case, we want to expire the
// old values and replace them with new values.
// That is what `expiringAfter` does.

Channel.prototype.expiringAfter = function (N) {
    var ch = Object.create(this);
    ch._channel = this;
    ch._bufferLength = N;
    ch.put = expiringPut;
    return ch;
};

function expiringPut(value, callback) {
    while (this.backlog > this._bufferLength) {
        this.take();
    }
    this._channel.put(value, callback);
    return this;
}

module.exports = Channel;
