var Channel = require('channel');
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

        it('must run only once even if placed within a loop', task {
            var arr = [];
            catch (e) {
                assert.deepEqual(arr, [1]);
                return true;
            }

            for (var i = 0; i < 5; ++i) {
                catch (e) { arr.push(1); }
            }

            throw "boom!";
        });
    });

    describe('finally_block', function () {
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
                assert.deepEqual(arr, [3, 2, 1]);
                return true;
            }
            for (var i = 1; i <= 3; ++i) {
                finally { arr.push(i); }
            }
            throw "error";
        });
    });

    describe('finally_statement', function () {
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
                assert.deepEqual(arr, [3, 2, 1]);
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

