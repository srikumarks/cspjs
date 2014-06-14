# task - a sweetjs macro for CSP in Javascript

My brain doesn't think well with promises. Despite that, [bluebird] is a
fantastic implementation of the [Promises/A+] spec and then some, that many in
the community are switching to promises wholesale.

So what *does* my brain think well with? The kind of "communicating sequential
processes" model used in [Haskell], [Erlang] and [Go] works very well with my
brain. Also [clojure]'s [core.async] module uses this approach. Given this
prominence of the CSP model, I'm quite sure there are many like me who want to
use the CSP model with Javascript without having to switch to another language
entirely.

**UPDATE:** See [blog post](http://sriku.org/blog/2014/02/11/bye-bye-js-promises/) 
describing error management scheme in detail.

[Haskell]: http://www.haskell.org
[Erlang]: http://erlang.org
[Go]: http://golang.org
[clojure]: http://clojure.org
[core.async]: https://github.com/clojure/core.async
[Promises/A+]: http://promises-aplus.github.io/promises-spec/
[bluebird]: https://github.com/petkaantonov/bluebird

So, what did I do? I wrote a [sweetjs] macro named
[task](https://github.com/srikumarks/cspjs/blob/master/src/task.js) and a
support library for channels that provides this facility using as close to JS
syntax as possible.  It compiles CSP-style code into a pure-JS (ES5) state
machine. The code looks similar to generators and when generator support is
ubiquitous the macro can easily be implemented to write code using them.
However, for the moment, generators are not ubiquitous on the browser side and
it helps to have good async facilities there too. 

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

## How do I use it?

1. You need to have [sweetjs] installed with `npm install -g sweet.js`
2. You need to have the `state_machine.js` and `channel.js` modules in your npm
   path .. somewhere is your project local `node_modules`.
3. To compile a `.sjs` file that uses the `task` macro, do -

        sjs --module ./path/to/src/task.js my-task-source.sjs > my-task-source.js

For complete documentation, see the docco generated docs in `docs/*.html`.

**Quick note**: I don't consider cspjs production ready yet .. at least not
until I upload my suite of test cases for syntax transformation and the runtime
modules.

## How does it perform?

The macro and libraries are not feature complete and, especially I'd like to
add some form of tracing. However, it mostly works and seems to marginally beat
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

