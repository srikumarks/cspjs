// A channel is a queue with a read-end and a write-end.
// Values are written and read asynchronously via callbacks.
// The basic channel is such that the callback associated
// with a value put into it will be called when the value
// is consumed from the read end.

var nextTick = (function () {
    return this.setImmediate || process.nextTick;
}());

function Channel() {
    this._queue = new Array;
    this._pending = new Array;
    return this;
}

function sendValue(value, callback) {
    callback && nextTick(function () { callback(null, value); });
}

function sendError(err, callback) {
    callback && nextTick(function () { callback(err, null); });
}

function sendValueS(value, callback) {
    callback && callback(null, value);
}

function sendErrorS(err, callback) {
    callback && callback(err, null);
}

function CBV(callback, value) {
    this._callback = callback;
    this._value = value;
    return this;
}

// Read a value from the channel, passing the value to the given callback.
Channel.prototype.take = function (callback) {
    if (this._queue.length > 0) {
        var q = this._queue.shift();
        sendValue(q._value, q._callback);
        sendValue(q._value, callback);
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
        this._queue.push(new CBV(callback, value));
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
Channel.prototype.canRead = function () {
    return this._queue.length > 0 && this._pending.length === 0;
};

// Answers "will write succeed immediately?"
Channel.prototype.canWrite = function () {
    return this._pending.length > 0 || this._queue.length === 0;
};

// Answers "how many values have been placed into the channel?"
// Positive values give the number of values available right away.
// Negative values give the number of pending take operations.
Channel.prototype.backlog = function () {
    return this._queue.length - this._pending.length;
};

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
    loop();
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
    loop();
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
        loop();
    }
    function loop() {
        if (cond()) {
            self.take(receive);
        } else {
            ch2.put(result);
        }
    }
    loop();
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
            loop();
        } else {
            var g = group;
            group = [];
            gch.put(g, loop);
        }
    }

    function loop() {
        self.take(receive);
    }

    loop();
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

function noop() {}

// Switches the channel to a state where every time some
// reader takes a value from the channel, they'll get
// `value` delivered immediately. This makes a channel
// behave somewhat like a promise, where until `fill`
// is called, asking for a value will cause a wait, but
// once `fill` is called somewhere, `take` will always
// succeed with a single value.
Channel.prototype.fill = function (value) {
    this.take = function (callback) {
        sendValue(value, callback);
    };
    this.put = function (ignoredValue, callback) {
        // no-op
        sendValue(value, callback);
    };
    this.fill = noop;
};

// Sends the elements of the given array one by one
// to the channel as readers request values. The
// callback will be called when the last value is
// accepted.
Channel.prototype.stream = function (array, callback) {
    var i = 0, self = this;
    function next() {
        if (i < array.length) {
            self.put(array[i++], next);
        } else {
            sendValue(array, callback);
        }
    }
    next();
};

// Sets up the channel to receive events of the given type
// from the given domElement. (Works only in the browser.)
// `domElement` can either be a string which is taken to be
// a querySelector specifier, an array of DOM nodes, or
// a single DOM node. `eventName` is a string like 'click'
// which gives an event category to bind to.
//
// Note: If you want a channel to not receive events
// too frequently, you can first debounce the channel
// before listening for events, like this -
//
//      ch = new Channel();
//      ch.debounce(100).listen('.textarea', 'change');
//
// The above code will make sure that consecutive change 
// events are separated by at least 100ms. The debounce()
// method call produces a wrapper channel object that
// acts as a gatekeeper to the original channel object
// 'ch'. So, while the above way will result in debounced
// actions, you can subsequently call `ch.listen()` to
// bypass debouncing on the same channel. Readers reading
// `ch` will receive events from the debounced elements
// as well from the elements bound directly.
Channel.prototype.listen = function (domElement, eventName) {
    var self = this;
    var elements = null;
    if (typeof domElement === 'string') {
        elements = document.querySelectorAll(domElement);
    } else if (domElement.length) {
        elements = domElement;
    } else {
        elements = [domElement];
    }

    function listener(event) {
        self.put(event);
        event.stopPropagation();
    }

    for (var i = 0, N = elements.length; i < N; ++i) {
        elements[i].addEventListener(eventName, listener);
    }
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

// It is sometimes useful to also have a value sent to
// an existing channel after a timeout expires. If some
// other process is supposed to write a value to the
// channel and it is taking too long, the value passed
// to the .timeout() call can be tested against to decide
// whether a timeout occurred before the process could
// do its thing.
Channel.prototype.timeout = function (ms, value) {
    setTimeout(timeoutTick, ms, this, value);
    return this;
};

// Makes a "timeout" channel, which'll deliver a value
// a given interval after the channel is created.
Channel.timeout = function (ms, value) {
    return (new Channel()).timeout(ms, value);
};

function timeoutTick(channel, value) {
    channel.put(value);
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
Channel.prototype.debounce = function (ms) {
    var ch = Object.create(this);
    ch._channel = this;
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
Channel.prototype.buffer = function (N) {
    var ch = Object.create(this);
    ch._channel = this;
    ch._bufferLength = N;
    ch.put = bufferedPut;
    ch.take = bufferedTake;
    return ch;
};

function bufferedPut(value, callback) {
    if (this.backlog() < this._bufferLength) {
        this._channel.put(value);
        sendValue(value, callback);
    } else {
        this._channel.put(value, callback);
    }
}

function bufferedTake(callback) {
    this._channel.take(callback);
    if (this.backlog() >= this._bufferLength) {
        var q = this._queue[this._bufferLength - 1];
        sendValue(q._value, q._callback);
    }
}


// If more than N values have been placed into a channel
// and a writer tries to place one more value, sometimes
// we want the new value to be dropped in order that
// processing requirements don't accumulate. This is
// the purpose of `droppingBuffer` which wraps the 
// parent channel's `put` to do this dropping.
//
// A channel with a droppingBuffer will never block a put
// operation.

Channel.prototype.droppingBuffer = function (N) {
    var ch = Object.create(this);
    ch._channel = this;
    ch._bufferLength = N;
    ch.put = droppingPut;
    return ch;
};

function droppingPut(value, callback) {
    if (this.backlog() < this._bufferLength) {
        this._channel.put(value);
        sendValue(value, callback);
    } else {
        // Drop the value.
        sendValue(null, callback);
    }
}

// In the same situation as with `droppingBuffer`,
// at other times, we want the more recent values
// to take precedence over the values already in 
// the queue. In this case, we want to expire the
// old values and replace them with new values.
// That is what `expiringBuffer` does.
//
// A channel with an expiringBuffer will never block a 
// put operation.

Channel.prototype.expiringBuffer = function (N) {
    var ch = Object.create(this);
    ch._channel = this;
    ch._bufferLength = N;
    ch.put = expiringPut;
    return ch;
};

function expiringPut(value, callback) {
    while (this.backlog() >= this._bufferLength) {
        this.take();
    }
    this._channel.put(value);
    sendValue(value, callback);
    return this;
}

// Makes a "fanout" channel that can be "connect()"ed to
// other channels to whom the values that come on this channel
// will be copied. Do not call a fanout channel's "take" method
// explicitly. Instead connect other channels to it to receive
// values. Since it may take time to setup connections, you have
// to call ch.start() explicitly to begin piping values to the
// connections, lest some values get missed out.

Channel.prototype.fanout = function () {
    var ch = Object.create(this);
    ch.connect      = fanoutConnect;
    ch.disconnect   = fanoutDisconnect;
    ch.start        = fanoutStart;
    ch._channel     = this;
    ch._connections = [];
    ch._started     = false;
    return ch;
};

function fanoutConnect() {
    for (var i = 0, N = arguments.length; i < N; ++i) {
        this.disconnect(arguments[i]);
        this._connections.push(arguments[i]);
    }
    return this;
}

function fanoutDisconnect() {
    var N, i, chan, pos;
    for (i = 0, N = arguments.length; i < N; ++i) {
        chan = arguments[i];
        pos = this._connections.indexOf(chan);
        if (pos >= 0) {
            this._connections.splice(pos, 1);
        }
    }
    return this;
}

function fanoutStart() {
    var self = this;
    if (!self._started) {
        self._started = true;
        self.take(function receive(err, value) {
            if (value !== null) {
                for (var i = 0, N = self._connections.length; i < N; ++i) {
                    self._connections[i].put(value);
                }
                self.take(receive);
            }
        });
    }
}

module.exports = Channel;
