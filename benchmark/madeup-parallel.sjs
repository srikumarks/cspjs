// This file is a port of the benchmark written for bluebird
// https://github.com/petkaantonov/bluebird/tree/master/benchmark/madeup-parallel
// It requires 'state_machine.js' and 'channel.js' to be in ../node_modules

require('../lib/fakes');
var Channel = require('channel');

module.exports = task upload(stream, idOrPath, tag) {
    var queries = new Array(global.parallelQueries),
        tx = db.begin();

    catch (e) {
        tx.rollback();
    }

    var ch = new Channel();

    for (var i = 0, len = queries.length; i < len; ++i) {
        FileVersion.insert({index: i}).execWithin(tx, ch.receive(i));
    }

    // Note that the error handling in this case isn't the same
    // as the others, where one error occuring results in the whole
    // upload operation aborting with that error. With channels,
    // the error is passed on to you via an object that you can
    // examine and, depending on the channel that failed, decide
    // whether you want to abort or not. I keep the code below
    // simple just for benchmarking purposes .. since the other
    // benchmarks are not setup to fail in this case.
    //
    // The following would do as a strategy for handling specific
    // errors that crop up in the parallel operations.
    //
    //  for (i = 0; i < len; ++i) {
    //      result <- chan ch;
    //      if (result.err) {
    //          throw err;
    //      }
    //  }
    //
    //
    result <- ch.takeN(queries.length);

    tx.commit();
};

