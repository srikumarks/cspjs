
// Extends the Channel class with support
// for Node.js streams.

var Channel = require('./channel');
var stream = require('stream');

// Non-deterministic behaviour if you create multiple
// writable streams on a single channel.
Channel.prototype.asWritableStream = function () {
    var writable = new stream.Writable();
    var chan = this;
    writable._write = function (chunk, encoding, done) {
        chan.put(chunk, done);
    };
    return writable;
};

// Non-deterministic behaviour if you make multiple readable streams
// on the same channel. If you want to fan out a channel to multiple
// readable streams, then use Channel.prototype.tap() to tap a channel
// without disrupting its dataflow.
Channel.prototype.asReadableStream = function () {
    var readable = new stream.Readable();

    var chan = this;

    readable._read = function () {
        chan.take(receiver);
    };

    function receiver(err, value) {
        readable.push(value);
    }

    return readable;
};

// Simple piping function for continuously reading from
// a readable stream.
Channel.prototype.read = function (readable) {
    readable.pipe(this.asWritableStream());
    return this;
};

// Simple piping function for continuously writing to
// a writable stream.
Channel.prototype.write = function (writable) {
    this.asReadableStream().pipe(writable);
    return this;
};

module.exports = Channel;
