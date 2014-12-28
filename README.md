# task - a sweetjs macro for CSP in Javascript

The [task] macro, in conjunction with [Channel] objects lets you write [CSP]-ish
code in Javascript that can interop with [Node.js]'s callback mechanism. This
came out of a need for a better way to deal with async activities than offered
by [Promises/A+][] or even generators.

Apart from tasks and channels, cspjs attempts at a saner and more expressive
error handling mechanism than the traditional try-catch-finally model.  See
[blog post][errman] describing the error management scheme in detail.

[CSP]: https://en.wikipedia.org/wiki/Communicating_sequential_processes

## How do I install it?

1. You need to have [sweetjs][] installed with `npm install -g sweet.js`
2. Install cspjs using npm like this - `npm install cspjs` to get it into your `node_modules` directory.
3. To compile a `.sjs` file that uses the `task` macro, do -

        sjs -m cspjs my-task-source.sjs > my-task-source.js
        
4. To use the `Channel` module, require it like this -

        var Channel = require('cspjs/channel');

5. Or if you want to use channels with nodejs stream support, like this -

        // WARNING: EXPERIMENTAL. Interface may change.
        var Channel = require('cspjs/stream');

For complete documentation, see the docco generated docs in `docs/*.html`.

## How do I use it?

`cspjs` provides a single macro called `task` that is similar to `function` in
form, but interprets certain statements as asynchronous operations. Different
tasks may communicate with each other via `Channel` objects provided by
`cspjs/channel`.  

Any NodeJS style async operation with a `function (err, result) {..}` callback
as its last argument can be conveniently used within `task`, which itself
compiles into a function of that form. 

Below is a simple hello world -

```js
task greet(name) {
    console.log("Hello", name);
    return 42;
}
```

The above task is equivalent to the following and compiles into a function with
exactly the same signature as the below function -

```js
function greet(name, callback) {
    console.log("Hello", name);
    callback(null, 42);
}
```

.. except that upon calling, `greet` will execute on the next IO turn instead
of immediately. If `greet` did a `throw 42;` instead of `return 42;`, then the
callback's first "error" argument will be the one set to `42`.

### Guarantees provided by tasks

1. A `task`, after compilation by cspjs, becomes an ordinary function which
   accepts an extra final argument that is expected to be a callback following
   the NodeJS convention of `function (err, result) {...}`.

2. A task will communicate normal or error return only via the `callback`
   argument.  In particular, it is guaranteed to never throw .. in the normal
   Javascript sense. 

3. When a task function is called, it will begin executing only on the next IO
   turn.

4. A task will always call the passed callback once and once only.

### Sample code illustrating various features

```js
task sampleTask(x, y, z) {
    // "sampleTask" will compile into a function with the signature -
    //    function sampleTask(x, y, z, callback) { ... }

    var dist = Math.sqrt(x * x + y * y + z * z);
    // Regular state variable declarations. Note that uninitialized var statements
    // are illegal.

    handle <- fs.open("some_file.txt", {encoding: 'utf8'});
    // `handle` is automatically declared to be a state variable and will be bound
    // to the result of the asynchronous file open call. All following statements will 
    // execute only after this async open succeeds. You can use all of NodeJS's
    // async APIs with cspjs, without any wrapper code.
    //
    // If fs.open failed for some reason, the error will "bubble up" and the
    // following statements won't be executed at all. Read on to find out
    // more about error handling.

    err, json <<- readJSON(handle);
    // You can use <<- instead of <- to explicitly get at the error value
    // instead of "bubbling up" errors.

    if (!err && json) {
        // "if" statements work as usual. Bodies can themselves
        // contain async statements.
    } else {
        // ... and so does `else`. Note that as of this writing,
        // the if-then-else-if cascade isn't supported.
    }

    switch (json.type) {
        // Switch also just works, except that there is no fall through
        // and the braces after the case parts are mandatory .. and you
        // don't need break statements (which don't exist in cspjs).
        case "number": {
            // Async statements permitted here too.
        }
        case "string", "object": {
            // You can match against multiple values.
        }
    }

    // (If none of the switch cases match, that's treated as an error.)

    while (someCondition(x,y)) {
        // While loops are also supported, with async statements
        // permitted in the block. 
        //
        // TODO: No "break;" statement as of this version.
    }

    var arr = ["one", "two", "three"];
    for (var i = 0; i < arr.length; ++i) {
        // For loops are also supported and they expand
        // into the `while` form.

        content <- fs.readFile(arr[i] + '.txt', {encoding: 'utf8'});
        // .. so yes you can write loops with async code too.
    }

    chan ch, in, out; 
    // Declares and initializes channel objects.
    // This is equivalent to -
    //     var ch = new Channel(), in = new Channel(), out = new Channel();
    // where 
    //      var Channel = require("cspjs/channel");

    chval <- ch.take();
    // This is an explicit way to wait for and take the next value coming
    // on the channel.

    chval <- chan ch;
    // This is syntactic sugar for the previous explicit take().

    await out.put(42);
    // Puts the given value on to the channel and waits until it is
    // processed by some reader. You can omit `await`, in which case
    // this task won't wait for the put value to be processed.

    ch := readJSON(handle);
    in := someAsyncOp(x, y);
    // This is a "data flow variable bind", which sends the result of the
    // readJSON operation to the channel. Once the operation completes, 
    // the channel will perpetually yield the result value no matter how
    // many times you `.take()` values from it.
    //
    // The above binding statement is non-blocking and will result in the
    // async tasks being "spawned".

    await ch in;
    // Prior to this "await", `ch` and `in` are channels. After this
    // await, they become bound to the actual value received on those
    // channels. This works no matter which tasks these "channel variables"
    // occur in and in which tasks the fulfillment of the channels
    // occurs. In effect, this facility mimics promises. (TODO: also
    // interop with promise APIs using this mechanism).
    //
    // In particular, you can spawn a task passing in these channels
    // as arguments. If the task binds the channels using `:=`, then
    // such an await in this task will receive the fulfilled values.
    //
    // If some error occurs, then it is bubbled up from this await point
    // and not from the original bind point. This is because if you don't
    // need the value on the channel, there is no reason for you to 
    // bother with errors in that process as well (as far as I can think 
    // of it).

    throw new Error("harumph!");
    // throwing an error that isnt caught within the task will result in
    // the error propagating asynchronously to the task initiator via the
    // provided callback function. The throw ends up being a no-op if the
    // thrown value is null or undefined, since the convention with the
    // callback signature is that err === null means no error.

    catch (e) {
        // You can handle all errors thrown by statements following this
        // catch block here. If you do nothing, the error gets automatically
        // rethrown. If you handle it successfully, you either `return` a
        // value from here, or `retry;`, which results in the statements
        // immediately following this catch block.

        // As always, all blocks, including catch blocks, support async statements.
        // A catch block is scoped to the block that contains it.
    }

    finally {
        // Finally blocks perform cleanup operations on error or normal returns.
        // A finally block (as is its statement forms) is scoped to the 
        // block that contains it.
        //
        // WARNING: Though you can return or throw here, you really shouldn't.
        // If your cleanup code raises errors, then you cannot reason about
        // error behaviour.
        handle.close();
    }

    finally handle.close(); // This statement form of finally is also supported.

    return x * x, y * y, z * z;
    // Return statements can return multiple values, unlike throw.
    // If no return statement is included in a task, it is equivalent to
    // placing a `return true;` at the end.
}
```

### Error tracing

If an error is raised deep within an async sequence of operations and the error
is allowed to bubble up to one of the originating tasks, then the error object
will contain a `.cspjsStack` property which will contain a trace of all the
async steps that led to the error ... much like a stack trace.

Note that this tracing is always turned ON in the system and isn't optional,
since there is no penalty for normal operation when such an error doesn't
occur.


## How does it perform?

The macro and libraries are not feature complete and, especially I'd like to
add more tracing. However, it mostly works and seems to marginally beat
bluebird in performance while having the same degree of brevity as the
generator based code. The caveat is that the code is evolving and performance
may fluctuate a bit as some features are added. (I'll try my best to not
compromise.)

Here are some sample results (as of 7 Feb 2014, on my MacBook Air 1.7GHz Core
i5, 4GB RAM, node v0.11.10) -

### doxbee-sequential

Using [doxbee-sequential.sjs](https://github.com/srikumarks/cspjs/blob/master/benchmark/doxbee-sequential.sjs).

```
results for 10000 parallel executions, 1 ms per I/O op

file                                 time(ms)  memory(MB)
callbacks-baseline.js                     385       38.61
sweetjs-task.js                           672       46.71
promises-bluebird-generator.js            734       38.81
promises-bluebird.js                      744       51.07
callbacks-caolan-async-waterfall.js      1211       75.30
promises-obvious-kew.js                  1547      115.41
promises-tildeio-rsvp.js                 2280      111.19
promises-medikoo-deferred.js             4084      311.98
promises-dfilatov-vow.js                 4655      243.75
promises-cujojs-when.js                  7899      263.96
promises-calvinmetcalf-liar.js           9655      237.90
promises-kriskowal-q.js                 47652      700.61
```

### doxbee-sequential-errors

Using [doxbee-sequential-errors.sjs](https://github.com/srikumarks/cspjs/blob/master/benchmark/doxbee-sequential-errors.sjs).

```
results for 10000 parallel executions, 1 ms per I/O op
Likelihood of rejection: 0.1

file                                 time(ms)  memory(MB)
callbacks-baseline.js                     490       39.61
sweetjs-task.js                           690       57.55
promises-bluebird-generator.js            861       41.52
promises-bluebird.js                      985       66.33
callbacks-caolan-async-waterfall.js      1278       76.50
promises-obvious-kew.js                  1690      138.42
promises-tildeio-rsvp.js                 2579      179.89
promises-dfilatov-vow.js                 5249      345.24
promises-cujojs-when.js                  8938      421.38
promises-calvinmetcalf-liar.js           9228      299.89
promises-kriskowal-q.js                 48887      705.21
promises-medikoo-deferred.js              OOM         OOM
```

### madeup-parallel

Using [madeup-parallel.sjs](https://github.com/srikumarks/cspjs/blob/master/benchmark/madeup-parallel.sjs).

Some libraries were disabled for this benchmark because I didn't have the
patience to wait for them to complete ;P

```
file                                time(ms)  memory(MB)
callbacks-baseline.js                    641       46.52
sweetjs-task.js                         1930      140.13
promises-bluebird.js                    2207      167.87
promises-bluebird-generator.js          2301      170.73
callbacks-caolan-async-parallel.js      4214      216.52
promises-obvious-kew.js                 5611      739.51
promises-tildeio-rsvp.js                8857      872.50
```

# History 

**Note:** I'd placed this part at the top initially because I first wrote
cspjs out of a desperate need to find a way to work with async code that was
compatible with my brain. Now that cspjs has had some time in my projects, this
can take a back seat. 

My brain doesn't think well with promises. Despite that, [bluebird] is a
fantastic implementation of the [Promises/A+] spec and then some, that many in
the community are switching to promises wholesale.

So what *does* my brain think well with? The kind of "communicating sequential
processes" model used in [Haskell], [Erlang] and [Go] works very well with my
brain. Also [clojure]'s [core.async] module uses this approach. Given this
prominence of the CSP model, I'm quite sure there are many like me who want to
use the CSP model with Javascript without having to switch to another language
entirely.


[Haskell]: http://www.haskell.org
[Erlang]: http://erlang.org
[Go]: http://golang.org
[clojure]: http://clojure.org
[core.async]: https://github.com/clojure/core.async
[Promises/A+]: http://promises-aplus.github.io/promises-spec/
[bluebird]: https://github.com/petkaantonov/bluebird
[task]: https://github.com/srikumarks/cspjs/blob/master/src/task.js
[Channel]: https://github.com/srikumarks/cspjs/blob/master/src/channel.js
[errman]: http://sriku.org/blog/2014/02/11/bye-bye-js-promises/
[Node.js]: http://nodejs.org


So, what did I do? I wrote a [sweetjs] macro named [task] and a support library
for channels that provides this facility using as close to JS syntax as
possible.  It compiles CSP-style code into a pure-JS (ES5) state machine. The
code looks similar to generators and when generator support is ubiquitous the
macro can easily be implemented to write code using them.  However, for the
moment, generators are not ubiquitous on the browser side and it helps to have
good async facilities there too. 

No additional wrappers are needed to work with NodeJS-style callbacks since a
"task" compiles down to a pure-JS function which takes a NodeJS-style callback
as the final argument.

[sweetjs]: http://sweetjs.org/

## Show me the code already!

1. Compare [task/doxbee-sequential] and [bluebird/doxbee-sequential] for the
   `doxbee-sequential` benchmark. 
2. Compare [task/doxbee-sequential-errors] and
   [bluebird/doxbee-sequential-errors] for the `doxbee-sequential-errors`
   benchmark.
3. Compare [task/madeup-parallel] and [bluebird/madeup-parallel] for the
   `madeup-parallel` benchmark.

[task/doxbee-sequential]: https://github.com/srikumarks/cspjs/blob/master/benchmark/doxbee-sequential.sjs
[bluebird/doxbee-sequential]: https://github.com/petkaantonov/bluebird/blob/master/benchmark/doxbee-sequential/promises-bluebird-generator.js
[task/doxbee-sequential-errors]: https://github.com/srikumarks/cspjs/blob/master/benchmark/doxbee-sequential-errors.sjs
[bluebird/doxbee-sequential-errors]: https://github.com/petkaantonov/bluebird/blob/master/benchmark/doxbee-sequential-errors/promises-bluebird-generator.js
[task/madeup-parallel]: https://github.com/srikumarks/cspjs/blob/master/benchmark/madeup-parallel.sjs
[bluebird/madeup-parallel]: https://github.com/petkaantonov/bluebird/blob/master/benchmark/madeup-parallel/promises-bluebird-generator.js

## So what's different from ES6 generators?

There are a lot of similarities with generators, but some significant
differences exist too.

In two words, the difference is "error management". I think the traditional
`try {} catch (e) {} finally {}` blocks promote sloppy thinking about error
conditions. I want to place function-scoped `catch` and `finally` clauses up
front or anywhere I want, near the code where I should be thinking about error
conditions. Also "throw-ing" an error should not mean "dropping" it to
catch/finally clauses below, should it? ;)

