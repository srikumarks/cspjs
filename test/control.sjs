var Channel = require('cspjs/channel');
var assert = require('assert');

describe('errors', function () {
    describe('catch', function () {
        it('must reject errors that are not of the declared class', task {
            catch (e) {
                return true;
            }

            catch (Error e) {
                assert.fail();
            }

            throw "boom!";
        });

        it('must accept errors of the declared class', task {
            catch (e) {
                assert.fail();
            }

            catch (Error e) {
                return true;
            }

            throw new Error("boom!");
        });

        it('must bubble up an error if a catch has no return in it', task {
            catch (e) {
                assert.equal(e, "boom!");
                return true;
            }

            catch (e) {
                assert.equal(e, "boom!");
                e = "poof!";
            }

            throw "boom!";
        });

        it('must bubble up unhandled errors in reverse order', task {
            var arr = [];
            catch (e) {
                assert.deepEqual(arr, [3,2,1]);
                return true;
            }

            catch (e) { arr.push(1); }
            catch (e) { arr.push(2); }
            catch (e) { arr.push(3); }

            throw "boom!";
        });

        it('must be limited to if block', task {
            var reached = false;
            catch (e) {
                assert.equal(reached, false);
                return true;
            }

            if (true) {
                catch (e) {
                    reached = true;
                }
            }

            throw "boom!";
        });

        it('must be limited to else block', task {
            var reached = false;
            catch (e) {
                assert.equal(reached, false);
                return true;
            }

            if (false) {
            } else {
                catch (e) {
                    reached = true;
                }
            }

            throw "boom!";

        });
        
        it('must be limited to while loop scope', task {
            var reached = false;
            catch (e) {
                assert.equal(reached, false);
                return true;
            }

            var n = 4;
            while (n-- > 0) {
                catch (e) {
                    reached = true;
                }
            }

            throw "boom!";
        });
        
        it('must be limited to for loop scope', task {
            var reached = false;
            catch (e) {
                assert.equal(reached, false);
                return true;
            }

            for (var n = 4; n > 0; n--) {
                catch (e) {
                    reached = true;
                }
            }

            throw "boom!";
        });
                
        it('must be limited to switch block scope', task {
            var reached = false;
            catch (e) {
                assert.equal(reached, false);
                return true;
            }

            switch (1) {
                case 1: {
                    catch (e) {
                        reached = true;
                    }
                }
                case 2: {
                    catch (e) {
                        reached = true;
                    }
                }
            }

            throw "boom!";
        });

        it('must permit retries', task {
            var tries = 1;
            var arr = [];
            catch (e) {
                ++tries;
                if (tries < 5) {
                    retry;
                }
                assert.deepEqual(arr, [1,2,3,4]);
                return true;
            }

            arr.push(tries);
            throw "bomb!";
        });
    });

    describe('finally_block', function () {
        it('must unwind in reverse order on normal return', task {
            var subtask = task {
                var arr = [];
                finally { arr.push(1); }
                finally { arr.push(2); }
                finally { arr.push(3); }
                return arr;
            };

            arr <- subtask();
            assert.deepEqual(arr, [3,2,1]);
        });

        it('must unwind in reverse order', task {
            var arr = [];
            catch (e) {
                assert.deepEqual(arr, [3, 2, 1]);
                return true;
            }
            finally { arr.push(1); }
            finally { arr.push(2); }
            finally { arr.push(3); }
            throw "error";
        });

        it('must keep state variables intact during unwinding', task {
            var arr = [];
            catch (e) {
                assert.deepEqual(arr, [1,2,3]);
                return true;
            }
            for (var i = 1; i <= 3; ++i) {
                finally { arr.push(i); }
            }
            throw "error";
        });
    });

    describe('finally_statement', function () {
        it('must unwind in reverse order on normal return', task {
            var subtask = task {
                var arr = [];
                finally arr.push(1);
                finally arr.push(2);
                finally arr.push(3);
                return arr;
            };

            arr <- subtask();
            assert.deepEqual(arr, [3,2,1]);
        });

        it('must unwind in reverse order', task {
            var arr = [];
            catch (e) {
                assert.deepEqual(arr, [3, 2, 1]);
                return true;
            }
            finally arr.push(1);
            finally arr.push(2);
            finally arr.push(3);
            throw "error";
        });

        it('must keep state variables intact during unwinding', task {
            var arr = [];
            catch (e) {
                assert.deepEqual(arr, [1, 2, 3]);
                return true;
            }
            for (var i = 1; i <= 3; ++i) {
                finally arr.push(i);
            }
            throw "error";
        });
    });

    describe('catch_finally', function () {
        it('finally and catch must execute in reverse order', task {
            var arr = [];
            catch (e) {
                assert.deepEqual(arr, [3,2,1]);
                return true;
            }       

            finally { arr.push(1); }
            catch (e) { arr.push(2); }
            finally { arr.push(3); }

            throw "boom!";
        });
        it('finally must execute even when catch returns', task {
            var subtask = task {
                var arr = [];
                finally { arr.push(1); }
                catch (e) { arr.push(2); return arr; }
                finally { arr.push(3); }
                throw "boom!";
            };

            arr <- subtask();
            assert.deepEqual(arr, [3,2,1]);
        });
    });
});

describe('if_then_else', function () {
    describe('if_then', function () {
        it('must branch on the condition being truthy', task {
            var branched = false;
            if (2 + 3 === 5) {
                branched = true;
            }
            assert.ok(branched);
        });
        it('must branch on the condition being truthy', task {
            var branched = false;
            if (2 + 3 < 5) {
                branched = true;
                throw "boom!";
            }
            assert.ok(branched === false);
        });

        function mockAsync(callback) {
            process.nextTick(function () {
                callback(null, 42);
            });
        }

        it('must not touch variables if a branch is not taken', task {
            var value = 24;
            if (value > 30) {
                value <- mockAsync();
            }
            assert.equal(value, 24);
        });

        it('must modify a variable if a branch with an async assignment is taken', task {
            var value = 24;
            if (value < 30) {
                value <- mockAsync();
            }
            assert.equal(value, 42);
        });

        it('must not modify the way return works', task {
            var subtask = task {
                var branched = false;
                if (2 + 3 < 6) {
                    branched = true;
                    return branched;
                }
                console.log('You should not see this message!');
                return false;
            };
            result <- subtask();
            assert.equal(result, true);
        });
    });
    describe('else', function () {
        it('must branch on the condition being truthy', task {
            var branched = null;
            if (2 + 3 === 5) {
                branched = "then";
            } else {
                branched = "else";
            }
            assert.equal(branched, "then");
        });
        it('must branch on the condition being truthy', task {
            var branched = null;
            if (2 + 3 < 5) {
                branched = "then";
                throw "boom!";
            } else {
                branched = "else";
            }
            assert.equal(branched, "else");
        });
        it('must not modify the way return works', task {
            var subtask = task {
                var branched = false;
                if (2 + 3 < 5) {
                    console.log('dummy');
                } else {
                    branched = true;
                    return branched;
                }
                console.log('You should not see this message!');
                return false;
            };
            result <- subtask();
            assert.equal(result, true);
        });
    });
});

describe('switch', function () {
    it('must switch correctly on numeric index', task {
        var choice = {1: "one", 2: "two", 3: "three"};
        for (var key = 0, value; key < 3; ++key) {
            switch (key) {
                case 0: { value = "one"; }
                case 1: { value = "two"; }
                case 2: { value = "three"; }
            }
            assert.equal(value, choice[key+1]);
        }
    });
    it('must switch correctly on string index', task {
        var choice = {"ek": "one", "do": "two", "teen": "three"};
        var keys = Object.keys(choice);
        for (var key = 0, value; key < 3; ++key) {
            switch (keys[key]) {
                case "do": { value = "two"; }
                case "ek": { value = "one"; }
                case "teen": { value = "three"; }
            }
            assert.equal(value, choice[keys[key]]);
        }
    });
    it('must throw an error on unhandled integer case', task {
        catch (Error e) {
           return true; 
        }

        switch (3) {
            case 1, 2: { return true; }
        }

        assert.fail();
    });
    it('must throw an error on unhandled string case', task {
        catch (Error e) {
           return true; 
        }

        switch ("three") {
            case "one", "two": { return true; }
        }

        assert.fail();
    });
});

describe('dfvars', function () {
    function greet(msg, callback) {
        setTimeout(callback, 10, null, msg);
    }

    describe('<=', function () {
        it('must declare and initialize a channel variable', task {
            x <= greet('hello');
            assert.ok(x instanceof Channel);
        });

        it('must run in parallel', task {
            x <= greet('one');
            y <= greet('two');
            assert.ok(x instanceof Channel);
            assert.ok(y instanceof Channel);
            await x y;
            assert.equal(x, 'one');
            assert.equal(y, 'two');
        });

        it('must also work across tasks', task {
            var t1 = task (ch1, ch2) {
                ch1 <= greet('hello');
                await ch1;
                assert.equal(ch1, 'hello');
                ch2 <= greet('world');
                await ch2;
                assert.equal(ch2, 'world');
            };

            var x = new Channel(), y = new Channel();
            t1(x, y);
            await x y;
            assert.equal(x, 'hello');
            assert.equal(y, 'world');
        });

    });

    describe('var', function () {
        it('must declare uninitialied variables as channels', task {
            var t1 = task (ch1, ch2) {
                ch1 <= greet('hello');
                await ch1;
                assert.equal(ch1, 'hello');
                ch2 <= greet('world');
                await ch2;
                assert.equal(ch2, 'world');
            };

            var x, y;
            t1(x, y);
            await x y;
            assert.equal(x, 'hello');
            assert.equal(y, 'world');
        });
    });
});
