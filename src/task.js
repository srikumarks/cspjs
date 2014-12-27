// # Macro `task`
//
// `task` is a macro that takes a body that describes a sequence of asynchronous
// operations and expands it to a state machine with very little runtime overhead.
// It is designed so that it can be used with functions that obey the NodeJS style
// callback convention where a callback function of the form `function (err, result) { ... }` 
// is passed as the last argument of async calls. A "task" is itself such a function.
//
// In general, a compiled task looks like a function of the form -
//    
//     function (arg1, arg2, ... , callback) {
//         ... state machine code ...
//     }
//
// The macro supports the following four forms to provide easy expression of
// pure no-argument scripts and named tasks.

macro task {

   
    // 1. `task { body ... }` produces a `function (callback) { ... }` expression
    // 2. `task name { body ... }` produces a `function name(callback) { ... }` declaration.
    // 3. `task (arg1, arg2) { body ... }` produces a `function (arg1, arg2, callback) { ... }` expression.
    // 4. `task name(arg1, arg2) { body ... }` produces a `function name(arg1, arg2, callback) { ... }` declaration.
    //
    // The `task` macro goes hand-in-hand with the `Channel` and `StateMachine` modules.
    // While the `StateMachine` module is internal and the macro user doesn't need to 
    // bother about it, the `Channel` module offers a simple way to coordinate multi-tasking
    // in JS - in the CSP style of the `Haskell`, `Erlang` and `Go` languages.

    case { $_ { $body ... } } => {
        letstx $callback = [makeIdent("callback", #{$_})];
        return #{ 
            (function ($callback) {
                setup_state_machine $_ $callback ($callback) { $body ... }
            })
        };
    }

    case { $_ $taskname:ident { $body ... } } => {
        letstx $callback = [makeIdent("callback", #{$_})];
        return #{ 
            function $taskname($callback) {
                setup_state_machine $_ $callback ($callback) { $body ... }
            }
        };
    }

    case { $_ () { $body ... } } => {
        letstx $callback = [makeIdent("callback", #{$_})];
        return #{
            (function ($callback) {
                setup_state_machine $_ $callback ($callback) { $body ... }
            })
        };
    }

    case { $_ ($x:ident (,) ...) { $body ... } } => {
        letstx $callback = [makeIdent("callback", #{$_})];
        return #{
            (function ($x (,) ... , $callback) {
                setup_state_machine $_ $callback ($x (,) ... , $callback) { $body ... }
            })
        };
    }

    case { $_ $taskname:ident() { $body ... } } => {
        letstx $callback = [makeIdent("callback", #{$_})];
        return #{
            function $taskname($callback) {
                setup_state_machine $_ $callback ($callback) { $body ... }
            }
        };
    }   

    case { $_ $taskname:ident($x:ident (,) ...) { $body ... } } => {
        letstx $callback = [makeIdent("callback", #{$_})];
        return #{
            function $taskname($x (,) ... , $callback) {
                setup_state_machine $_ $callback ($x (,) ... , $callback) { $body ... }
            }
        };
    }                  
}

// A "task" consists of a sequence of "statements" separated by ";".  Each
// statement may be a synchronous action or an asynchronous one, but all
// statements are treated the same by `task`, by inserting an async step
// between them. The following control structures are also supported -
//
// 1. `if { ... }` and `if { ... } else { ... }`
// 2. `while (...) { ... }`
// 3. `for (...;...;...) { ... }`
// 4. `catch (ErrorClass e) { ... }`
// 5. `catch (e) { ... }`
// 6. `finally { ... }`
// 7. `finally func(args ...);`
// 8. `switch (val) { case v1: { } case v2,v3,v4: { } case v5: { } ... }`
// 9. `throw expr;`
// 10. `return expr1 , expr2 , ... ;`
// 
// There is no separate `try` statement supported since in my experience
// code that requires a local try-catch within a function almost always
// has a bad design decision in it regarding error management, and/or
// could easily be refactored to make the error concerns clearer. Also,
// syntactically, placing the error handling code encourages postponing
// thinking about error conditions whereas putting catch clauses up front
// forces thinking about them early on .. and close to the code that is
// actually relevant. For example, it is much clearer to state 
// "begin a transaction now, if there is any error later on, rollback
// the transaction." which is expressed with this approach as -
//
//      var tx = db.begin();
//      catch (e) {
//          tx.rollback();
//      }
//      ...256 lines of code that can fail...
//
// as opposed to the traditional -
//
//      var tx = db.begin();
//      try {
//          ...256 lines of code that can fail...
//      } catch (e) {
//          tx.rollback();
//          throw e;
//      }
//
// Note: While there is a `throw e` in the traditional code above,
// there is none in the `catch` clause within a `task`. This is because
// if a catch clause doesn't "handle" the error, it automatically gets 
// rethrown. "Handling" an error amounts to `return`ing without an error
// from within a `catch` clause.
//
// The following statement forms are supported within the task body as
// well as within the bodies of the above control structures -
//
// 1. `var x = expr1, y = expr2, ... ;` This is interpreted as declaration
//    and initialization of state variables. The initialization part is not
//    optional.
//
// 2. `x, y, z <- blah[42].bling().asyncMethod(arg1, arg2);` will insert an
//    additional `callback` argument to the method (or function) invocation,
//    collect the results passed to the callback of the form 
//    `function (err, x, y, z) { ... }` and assign them to the state variables
//    `x`, `y` and `z`.
//
// 3. `<- blah[42].bling().asyncMethod(arg1, arg2);` will insert a callback
//    function of the form `function (err) { ... }` - i.e. no result value
//    is expected of the callback. To make this form clearer, you can also
//    use `await` instead of the leading `<-`.
//
// 4. `x <- chan EXPR;` expects the expression `EXPR` to evaluate to a
//    `Channel` object (see `channel.js`). `x` will be assigned to the 
//    value produced by the channel when `.take()` is called on it.
//    This is a simpler syntax for `var ch = EXPR; x <- ch.take();`
//
// All other statements separated by ";" are treated as synchronous and
// passed through the macro as is.
//
// If you want to work with concurrently executing tasks, use channels
// to coordinate them. Notable, `Channel.merge([ch1, ch2, ...])` 
// will make a channel into which all the given channels will be setup
// to pipe their results. The merged channel will yield `{chan: ch, val: value}`
// objects so that you can do different things based on the channel that
// produced the value.
//
// Sometimes, you want to be able to handle an error in a recoverable way
// after the async operation completes. You can use the `<<-` operator for
// that. It works in the same way as the `<-` operator, except that the
// first variable is bound to the error. No async exception is raised with this
// operator. For example -
//
//     err, result <<- fs.readFile("somewhere/file.txt", 'utf8');
//     if (err) {
//          result = "Default value";
//     }
//

// ## Setting up the state machine
// 
// To setup a state machine, we scan the body to find the machine's state
// variables and declare them up front. This simplifies the need for 
// local var declarations in the generated JS ... which are not really
// local anyway.

macro setup_state_machine {
    rule { $task $callback $formals { $body ... } } => {
        var StateMachine = arguments.callee.StateMachine || (arguments.callee.StateMachine = require('cspjs/src/state_machine'));
        declare_state_arguments $formals ;
        var state_machine = new StateMachine(this, $callback, state_machine_fn, arguments.callee);
        declare_state_variables $task state_machine 0 ($callback) { $body ... } 
        function state_machine_fn(err) {
            if (err && !state_machine.state.isUnwinding) { return state_machine.callback(err); }
            try {
                switch (state_machine.state.id) {
                    case 1:
                        // `step_state` is the real work horse, which
                        // walks through each statement in the task
                        // body and compiles it to a single step in
                        // the state machine.
                        step_state $task state_machine 1 { $body ... }
                }
            } catch (e) {
                state_machine.callback(e);
            }
        }
        state_machine.start();
        return state_machine.controlAPIMaker;
    }
}

// ## Declaring state variables
//
// To do this, we scan the code and collect all the state variable identifiers
// into a pseudo list syntax that looks like `(x y z ...)`. The `$vars` argument
// to the `declare_state_variables` macro is expected to match this.

macro declare_state_variables {
    rule { $task $state_machine $fin $vars { if ($x ...) { $then ... } else { $else ... } $rest ... } } => {
        declare_state_variables $task $state_machine $fin $vars { $then ... $else ... $rest ... }
    }
    rule { $task $state_machine $fin $vars { if ($x ...) { $then ... }  $rest ... } } => {
        declare_state_variables $task $state_machine $fin $vars { $then ... $rest ... }
    }
    // Rewrite for loops using while.
    rule { $task $state_machine $fin $vars { for ($init ... ; $cond ... ; $next ...) { $body ... }  $rest ... } } => {
        declare_state_variables $task $state_machine $fin $vars { $init ... ; while ($cond ...) { $body ... $next ... ; } $rest ... }
    }
    rule { $task $state_machine $fin $vars { while ($x ...) { $body ... }  $rest ... } } => {
        declare_state_variables $task $state_machine $fin $vars { $body ... $rest ... }
    }
    // If a finally block is encountered somewhere in the body, then we
    // need to be able to save and restore state variables. So keep track of that.
    rule { $task $state_machine $fin $vars { finally { $cleanup ... } $rest ... } } => {
        declare_state_variables $task $state_machine 1 $vars { $cleanup ... $rest ... }
    }
    rule { $task $state_machine $fin $vars { finally $cleanup ... ($args:expr (,) ...) ; $rest ... } } => {
        declare_state_variables $task $state_machine $fin $vars { $rest ... }
    }
    rule { $task $state_machine $fin $vars { catch ($eclass:ident $e:ident) { $handler ... } $rest ... } } => {
        declare_state_variables $task $state_machine $fin $vars { var $e = null ; $handler ... $rest ... }
    }
    rule { $task $state_machine $fin $vars { catch ($e:ident) { $handler ... } $rest ... } } => {
        declare_state_variables $task $state_machine $fin $vars { var $e = null ; $handler ... $rest ... }
    }
    rule { $task $state_machine $fin $vars { switch ($x ...) { $(case $ix:lit (,) ... : { $body ... }) ... } $rest ... } } => {
        declare_state_variables $task $state_machine $fin $vars { $($body ...) ... $rest ... }
    }
    rule { $task $state_machine $fin $vars { $step ... ; $rest ... } } => {
        declare_state_variables_step $task $state_machine $fin $vars { $step ... ; } { $rest ... }
    }
    rule { $task $state_machine $fin $vars { } } => { 
        declare_unique_varset $task $state_machine $fin $vars ;
    }
    rule { $task $state_machine $fin () { } } => { 
    }
}

// After scanning the entire body, we uniquify the variable set because
// the body may contain multiple declarations of the same variable and
// we don't want to pollute the generated code with repeated var declarations
// as much as we can.

macro declare_unique_varset {
	case { _ $task $state_machine $fin ($v ...) } => {
		var vars = #{$v ...};
		var varnames = vars.map(unwrapSyntax);
		var uniqvarnames = {};
		varnames.forEach(function (v) { uniqvarnames['%' + v] = true; });
		letstx $uvars ... = Object.keys(uniqvarnames).map(function (v) { return makeIdent(v.substring(1), #{$task}); });
		return #{ declare_varset $task $state_machine $fin ($uvars ...) ; };
	}
}

macro declare_varset {
    rule { $task $state_machine 0 ($v ...) ; } => {
        var $v (,) ... ;
    }
    rule { $task $state_machine 1 ($v ...) ; } => {
        var $v (,) ... ;
        $state_machine.captureStateVars = function () { 
            return [$v (,) ...]; 
        };
        $state_machine.restoreStateVars = function (state) {
            var i = 0;
            $($v = state[i++];) ...
        };
    }
}

macro declare_state_variables_step {
	rule { $task $state_machine $fin ($v ...) { $x:ident := $y ... ; } { $rest ... } } => {
		declare_state_variables $task $state_machine $fin ($x $v ...) { $rest ... }
	}
	rule { $task $state_machine $fin ($v ...) { $x:ident <- $y ... ; } { $rest ... } } => {
		declare_state_variables $task $state_machine $fin ($x $v ...) { $rest ... }
	}
	rule { $task $state_machine $fin ($v ...) { $x:ident <<- $y ... ; } { $rest ... } } => {
		declare_state_variables $task $state_machine $fin ($x $v ...) { $rest ... }
	}
	rule { $task $state_machine $fin ($v ...) { $x:ident (,) ... <- $y ... ; } { $rest ... } } => {
		declare_state_variables $task $state_machine $fin ($x ... $v ...) { $rest ... }
	}
	rule { $task $state_machine $fin ($v ...) { $x:ident (,) ... <<- $y ... ; } { $rest ... } } => {
		declare_state_variables $task $state_machine $fin ($x ... $v ...) { $rest ... }
	}
	rule { $task $state_machine $fin ($v ...) { var $($x:ident = $y:expr) (,) ... ; } { $rest ... } } => {
		declare_state_variables $task $state_machine $fin ($x ... $v ...) { $rest ... }
	}
	rule { $task $state_machine $fin ($v ...) { chan $x:ident (,) ... ; } { $rest ... } } => {
		declare_state_variables $task $state_machine $fin ($x ... $v ...) { $rest ... }
	}
	rule { $task $state_machine $fin $vs { $x ... ; } { $rest ... } } => {
		declare_state_variables $task $state_machine $fin $vs { $rest ... }
	}
}

macro declare_state_arguments {
	rule { ($x:ident (,) ...) } => {
		var argi = 0, $($x = arguments[argi++]) (,) ...;
	}
}


// ## Compiling the steps of the state machine
//
// The `step_state` macro extracts the relevant bit of code to be compiled into
// a "step" and passes it over to the `step_state_line` macro. This extra layer
// is useful since not all of the syntax in the body of a task are separated by
// ";" markers. The control structures `if`, `while`, `finally` and `catch` do
// not use ";" as separators to keep the code body of a task looking as close
// to traditional javascript as possible.

macro step_state {
    rule { $task $state_machine $id { if ($x ...) { $then ... } else { $else ... } $rest ... } } => {
        step_state_line_if_else $task $state_machine $id { if ($x ...) { $then ... } else { $else ... } } { $rest ... }
    }
    rule { $task $state_machine $id { if ($x ...) { $then ... }  $rest ... } } => {
        step_state_line_if $task $state_machine $id { if ($x ...) { $then ... } } { $rest ... }
    }
    // Rewrite for loops using while.
    rule { $task $state_machine $id { for ($init ... ; $cond ... ; $next ...) { $body ... }  $rest ... } } => {
        step_state $task $state_machine $id { $init ... ; while ($cond ...) { $body ... $next ... ; } $rest ... }
    }
    rule { $task $state_machine $id { while ($x ...) { $body ... }  $rest ... } } => {
        step_state_line_while $task $state_machine $id { while ($x ...) { $body ... } } { $rest ... }
    }
    rule { $task $state_machine $id { finally { $cleanup ... }  $rest ... } } => {
        step_state_line_finally_block $task $state_machine $id { finally { $cleanup ... } } { $rest ... }
    }
    rule { $task $state_machine $id { finally $cleanup ... ($args:expr (,) ...) ;  $rest ... } } => {
        step_state_line_finally_expr $task $state_machine $id { finally $cleanup ... ($args (,) ...) ; } { $rest ... }
    }
    rule { $task $state_machine $id { catch ($x ...) { $handler ... }  $rest ... } } => {
        step_state_line_catch $task $state_machine $id { catch ($x ...) { $handler ... } } { $rest ... }
    }
    rule { $task $state_machine $id { switch ($x:expr) { $b ... } $rest ... } } => {
        step_state_line_switch $task $state_machine $id { switch ($x) { $b ... } } { $rest ... }
    }
    rule { $task $state_machine $id { $step ... ; $rest ... } } => {
        step_state_line $task $state_machine $id { $step ... ; } { $rest ... }
    }
    rule { $task $state_machine $id { } } => {
        $state_machine.callback(null, true);
        break;
    }
}

// ## Counting states
//
// For the control structures that perform branching to different parts of the code,
// we need to be able to determine the state ids of the branch and merge statements.
// `count_states` will count the number of states added by a given block of statements,
// including control structures, so that the jump ahead positions can be determined
// during compilation.
//
// The second argument to `count_states` is a pseudo list of the form `(m n ...)` 
// where `m`, `n` are plain integers. The list is summed up at the end by `sumpup_counts` 
// to produce the final count.

macro count_states {
    rule { $task ($n ...) { if ($x ...) { $then ... } else { $else ... } $rest ... } } => {
        count_states $task (3 $n ...) { $then ... $else ... $rest ... }
    }
    rule { $task ($n ...) { if ($x ...) { $then ... } $rest ... } } => {
        count_states $task (2 $n ...) { $then ... $rest ... }
    }
    // Rewrite for loops using while.
    rule { $task $n { for ($init ... ; $cond ... ; $next ...) { $body ... } $rest ... } } => {
        count_states $task $n { $init ... ; while ($cond ...) { $body ... $next ... ; } $rest ... }
    }
    rule { $task ($n ...) { while ($x ...) { $body ... } $rest ... } } => {
        count_states $task (2 $n ...) { $body ... $rest ... }
    }
    rule { $task ($n ...) { finally { $cleanup ... } $rest ... } } => {
        count_states $task (2 $n ...) { $cleanup ... $rest ... }
    }
    rule { $task ($n ...) { finally $cleanup ... ($args:expr (,) ...) ; $rest ... } } => {
        count_states $task (1 $n ...) { $rest ... }
    }
    rule { $task ($n ...) { catch ($e ...) { $handler ... } $rest ... } } => {
        count_states $task (2 $n ...) { $handler ... $rest ... }
    }
    rule { $task ($n ...)  { switch ($x ...) { $(case $ix:lit (,) ... : { $body ... }) ... } $rest ... } } => {
        count_states $task (1 $n ...) { $($body ... phi $state_machine ;) ... $rest ... }
    }
    rule { $task $n { $step ... ; $rest ... } } => {
        count_states_line $task $n { $step ... ; } { $rest ... }
    }
    rule { $task ($n ...) { } } => { 
        sumup_counts ($n ...)
    }
}

// BUG in sweetjs? Theoretically, it should be possible to merge these into the above
// count_states macro itself, but only this separation works correctly!
macro count_states_line {
    rule { $task ($n ...) { $x:ident (,) ... <- chan $y ... ; } { $rest ... } } => {
        count_states $task (2 $n ...) { $rest ... }
    }
    rule { $task ($n ...) { $x:ident (,) ... <- $y ... (); } { $rest ... } } => {
        count_states $task (2 $n ...) { $rest ... }
    }
    rule { $task ($n ...) { $x:ident (,) ... <<- $y ... (); } { $rest ... } } => {
        count_states $task (2 $n ...) { $rest ... }
    }
    rule { $task ($n ...) { $x:ident (,) ... <- $y ... ($args:expr (,) ...); } { $rest ... } } => {
        count_states $task (2 $n ...) { $rest ... }
    }
    rule { $task ($n ...) { $x:ident (,) ... <<- $y ... ($args:expr (,) ...); } { $rest ... } } => {
        count_states $task (2 $n ...) { $rest ... }
    }
    rule { $task ($n ...) { $x:ident := $y ... (); } { $rest ... } } => {
        count_states $task (1 $n ...) { $rest ... }
    }
    rule { $task ($n ...) { $x:ident := $y ... ($args:expr (,) ...); } { $rest ... } } => {
        count_states $task (1 $n ...) { $rest ... }
    }
    rule { $task ($n ...) { $step ... ; } { $rest ... } } => {
        count_states $task (1 $n ...) { $rest ... }
    }
}

macro sumup_counts {
    case { $_ ($n ...) } => {
        var sum = #{$n ...}.map(unwrapSyntax).reduce(function (a,b) { return a + b; });
        letstx $sum = [makeValue(sum, #{$_})];
        return #{$sum};
    }
}

// ### Branching on conditions
//
// `if { ... } else { ... }` blocks work as expected in normal javascript, except that
// async statements can also be used within them.

macro step_state_line_if_else {
    case { $me $task $state_machine $id { if ($x:expr) { $then ... } else { $else ... } } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            var jumpThen = 1 + (count_states $task (0) { $then ... });
            var jumpElse = 1 + (count_states $task (0) { $else ... });
            $state_machine.pushPhi($id2 + jumpThen + jumpElse);
            if (!($x)) {
                $state_machine.goTo($id2 + jumpThen);
                break;
            }
            case $id2:
            step_state $task $state_machine $id2 { $then ... phi $state_machine ; $else ... phi $state_machine ; $rest ... }
        };
    }
}

macro step_state_line_if {
    case { $me $task $state_machine $id { if ($x:expr) { $then ... } } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            var jump = 1 + (count_states $task (0) { $then ... });
            if ($x) {
                $state_machine.pushPhi($id2 + jump);
            } else {
                $state_machine.goTo($id2 + jump);
                break;
            }
            case $id2:
            step_state $task $state_machine $id2 { $then ... phi $state_machine; $rest ... }
        };
    }
}

macro step_state_line_switch {
    // ### Multi-tasking
    //
    // `switch (expr) { case 0: { ... } case 1: { ... }}` can be used to manage
    // coordination of multiple tasks. The `expr` is an expression whose value
    // is matched with the case literals to decide where to branch.  The value 
    // coming in on such a "merged channel" has a `chan` property that gives
    // the channel itself that produced the value and a `val` property containing
    // the value. You can attach identifiers to your channels and switch based
    // on them, or you can using `===` tests on the channels themselves.
    //
    // There MUST be one `case` clause for each channel in the merge list, or
    // an error will be raised at runtime.
    //
    // You'd use `switch` like this -
    //      
    //      function addIndex(chan, ix) {
    //          chan.ix = ix;
    //          return chan;
    //      }
    //      mch = Channel.merge([ch1, ch2, ... chN].map(addIndex));
    //      while (true) {
    //          x <- chan mch;
    //          switch (x.chan.ix) {
    //              case 0: { ... x.val ... }
    //              case 1: { ... x.val ... }
    //          }
    //      }
    // 
    // i.e., for the most part `switch` works like normal in Javascript, except
    // that `break;` statements are not needed, and an exception is raised if
    // an unhandled case occurs at runtime.

    case { $me $task $state_machine $id { switch ($c:expr) { $(case $ix:lit (,) ... : { $body ... }) ... } } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            var tmp1;
            if (!(tmp1 = $state_machine.jumpTable($id))) {
                tmp1 = $state_machine.jumpTable($id, [$([$ix (,) ...]) (,) ...], [$((count_states $task (0) { $body ... })) (,) ...]);
            }
            tmp1.jumpToCase($state_machine, $c);
            break;
            case $id2:
            step_state $task $state_machine $id2 {
                $($body ... phi $state_machine ;) ...
                    $rest ...
            }
        };
    }
}

// ### Looping using `while`
//
// The usual `while (cond) { body... }` is supported as well, except that there is no
// `break;' statement support.

macro step_state_line_while {
    case { $me $task $state_machine $id { while ($x:expr) { $body ... } } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            var jumpBody = count_states $task (0) { $body ... };
            if ($x) {
                $state_machine.pushPhi($id);
            } else {
                $state_machine.goTo($id2 + 1 + jumpBody);
                break;
            }
            case $id2:
            step_state $task $state_machine $id2 { $body ... phi $state_machine ; $rest ... }
        };
    }                                                    
}

// ### Exception mechanism
//
// Error handling inside tasks uses a different and more expressive form of
// exceptions. There is no `try` clause since any statement may throw an
// exception that will be forwarded to the callback provided to the task.
//
// `finally` statements/blocks can be placed anywhere and will register actions
// to be executed before a) reaching the catch clause immediately above or b)
// exiting the block in which they occur. These statements/blocks execute in
// the order opposite to the order in which they were encountered during
// running.  If these occur within a loop, then the statements/blocks will
// execute as many times as the loop did, once for every loop iteration. (So be
// aware of what you want to be cleaned up.)

// `finally funcExpr(args...);` statement causes the `funcExpr` and `args...` to be evaluated
// at the time the statement is encountered, but defers the call itself to be made at unwinding
// time.
//
// `finally obj.method(args...);` is also a supported form. The `obj` and `args` are evaluated
// when the `finally` statement is encountered, but the call itself is performed at cleanup time
// (obviously).

macro step_state_line_finally_expr {
    case { $me $task $state_machine $id { finally $cleanup ... . $methId:ident ($arg:expr (,) ...) ; } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        /* Evaluate the arguments right now, but call the cleanup function later. */
        return #{
            var tmp1 = $cleanup ... ;
            $state_machine.pushCleanupAction(tmp1, tmp1.$methId, [$arg (,) ...]);
            case $id2:
            step_state $task $state_machine $id2 { $rest ... }
        };
    }
    case { $me $task $state_machine $id { finally $cleanup ... [ $methExpr:expr ] ($arg:expr (,) ...) ; } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        /* Evaluate the arguments right now, but call the cleanup function later. */
        return #{
            var tmp1 = $cleanup ... ;
            $state_machine.pushCleanupAction(tmp1, tmp1[$methExpr], [$arg (,) ...]);
            case $id2:
            step_state $task $state_machine $id2 { $rest ... }
        };
    }
    case { $me $task $state_machine $id { finally $cleanup ... ($arg:expr (,) ...) ; } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        /* Evaluate the arguments right now, but call the cleanup function later. */
        return #{
            $state_machine.pushCleanupAction(this, $cleanup ... , [$arg (,) ...]);
            case $id2:
            step_state $task $state_machine $id2 { $rest ... }
        };
    }
}

// `finally { ... }` mark blocks of steps to be run at unwinding time.

macro step_state_line_finally_block {
    case { $me $task $state_machine $id { finally { $cleanup ... } } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            var jumpHandler = count_states $task (0) { $cleanup ... };
            $state_machine.pushCleanupStep($id2, $id2 + 1 + jumpHandler);
            break;
            case $id2:
            step_state $task $state_machine $id2 { $cleanup ... phi $state_machine ; $rest ... }
        };
    }
}

// `catch (e) { ... }` blocks will catch all exceptions thrown by statements
// that follow the block up to the end of the block's scope, bind the error
// to `e` and run the sequence of statements within the `{...}`.
//
// `catch (ErrorClass e) {...}` will catch and handle only those errors `e`
// that satisfy `e instanceof ErrorClass`. Other errors propagate up to catch
// clauses above.

macro step_state_line_catch {
    case { $me $task $state_machine $id { catch ($eclass:ident $e:ident) { $handler ... } } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            var jumpHandler = count_states $task (0) { $handler ... };
            $state_machine.pushErrorStep($id2, $id2 + 1 + jumpHandler);
            break;
            case $id2:
            $e = $state_machine.state.err;
            if (!($e && $e instanceof $eclass)) {
                $state_machine.phi();
                break;
            }
            step_state $task $state_machine $id2 { $handler ... phi $state_machine ; $rest ... }
        };
    }

    case { $me $task $state_machine $id { catch ($e:ident) { $handler ... } } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            var jumpHandler = count_states $task (0) { $handler ... };
            $state_machine.pushErrorStep($id2, $id2 + 1 + jumpHandler);
            break;
            case $id2:
            $e = $state_machine.state.err;
            step_state $task $state_machine $id2 { $handler ... phi $state_machine ; $rest ... }
        };
    }
}

// ## step_state_line
//
// This is the real work horse which walks through each statement and compiles
// it into an asynchronous step in the state machine.

macro step_state_line {
    // ### await
    //
    // The `await func(args...);` clause is a synonym for `<- func(args...);`.
    case { $me $task $state_machine $id { await $y ... (); } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            $y ... ($state_machine.thenTo($id2));
            break;
            case $id2:
            step_state $task $state_machine $id2 { $rest ... }
        };
    }

    case { $me $task $state_machine $id { await $y ... ($args:expr (,) ...); } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            $y ... ($args (,) ... , $state_machine.thenTo($id2));
            break;
            case $id2:
            step_state $task $state_machine $id2 { $rest ... }
        };
    }

    case { $me $task $state_machine $id { await $x:ident ... ; } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            $state_machine.resolve([$x (,) ...], false, $state_machine.thenTo($id2));
            break;
            case $id2:
                var chans = arguments[1], i = 0;
                $($x = chans[i++].resolve();)...
                step_state $task $state_machine $id2 { $rest ... }
        };
    }        

    // ### Taking values from channels
    //
    // If you have functions that return channels on which they will produce their results,
    // then you can use this expression as syntax sugar to get the value out of the returned
    // channel.
    //
    //      val <- chan someProcess(arg1, arg1);

    case { $me $task $state_machine $id { $x:ident (,) ... <- chan $y ... ; } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})], $id3 = [makeValue(id + 2, #{$id})];
        // In this form (ex: z <- chan blah[32].bling(); ), the expression is expected to
        // produce a channel, from which a value will be taken. 
        //
        // Type detection is done by looking for a `take` method, so any object that
        // has the same `take` protocol as a channel can be used.
        return #{
            var tmp1 = $y ...;
            if (tmp1 && tmp1.take) {
                tmp1.take($state_machine.thenTo($id2));
            } else {
                throw new Error('Expected a channel in step ' + $id);
            }
            break;
            case $id2:
            var i = 1;
            $($x = arguments[i++];) ...
            case $id3:
                step_state $task $state_machine $id3 { $rest ... }
        };
    }

    // ### Retrieving values
    //
    // Values are retrieved from async steps using the `<-` clause of the form -
    //
    //      x, y, z <- coll[42].thing.asyncMethod(arg1, arg2);
    //
    // This block and the following are basically the same. The problem is that I don't know
    // how to insert the additional callback argument with a preceding comma in one
    // case and without one in the other.
    //
    // If you use ':=' instead of '<-', the operation is started off in parallel and
    // the variable on the LHS (only one allowed in this case) will be bound to a new channel
    // on which the result can be received. You can subsequently do "await x;" to cause
    // x to be bound to the value received on the new channel, and further statements
    // can use the value directly. If you have multiple such channels bound to variables
    // x, y, z, you can await for a single value from each of them using "await x y z;".
    // If any errors occur, an exception will be raised. 
    case { $me $task $state_machine $id { $x:ident (,) ... <- $y ... (); } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})], $id3 = [makeValue(id + 2, #{$id})];
        return #{
            $y ... ($state_machine.thenTo($id2));
            break;
            case $id2:
            var i = 1;
            $($x = arguments[i++];) ...
            case $id3:
                step_state $task $state_machine $id3 { $rest ... }
        };
    }

    case { $me $task $state_machine $id { $x:ident (,) ... <<- $y ... (); } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})], $id3 = [makeValue(id + 2, #{$id})];
        return #{
            $y ... ($state_machine.thenToWithErr($id2));
            break;
            case $id2:
            var i = 1;
            $($x = arguments[i++];) ...
            case $id3:
                step_state $task $state_machine $id3 { $rest ... }
        };
    }


    case { $me $task $state_machine $id { $x:ident (,) ... <- $y ... ($args:expr (,) ...); } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})], $id3 = [makeValue(id + 2, #{$id})];
        return #{
            $y ... ($args (,) ... , $state_machine.thenTo($id2));
            break;
            case $id2:
            var i = 1;
            $($x = arguments[i++];) ...
            case $id3:
                step_state $task $state_machine $id3 { $rest ... }
        };
    }

    case { $me $task $state_machine $id { $x:ident (,) ... <<- $y ... ($args:expr (,) ...); } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})], $id3 = [makeValue(id + 2, #{$id})];
        return #{
            $y ... ($args (,) ... , $state_machine.thenToWithErr($id2));
            break;
            case $id2:
            var i = 1;
            $($x = arguments[i++];) ...
            case $id3:
                step_state $task $state_machine $id3 { $rest ... }
        };
    }

    case { $me $task $state_machine $id { $x:ident := $y ... (); } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            $x = $x || $state_machine.channel();
            $y ... ($x.resolver());
            case $id2:
                step_state $task $state_machine $id2 { $rest ... }
        };
    }

    case { $me $task $state_machine $id { $x:ident := $y ... ($args:expr (,) ...); } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            $x = $x || $state_machine.channel();
            $y ... ($args (,) ... , $x.resolver());
            case $id2:
                step_state $task $state_machine $id2 { $rest ... }
        };
    }

    // ### State variable declaration
    //
    // State variables are shared with expressions in the entire task and can be
    // declared anywhere using var statements. Initializers are compulsory.

    case { $me $task $state_machine $id { var $($x:ident = $y:expr) (,) ... ; } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            $($x = $y;) ...
            case $id2:
            step_state $task $state_machine $id2 { $rest ... }			
        };
    }	

    // Bad idea to use uninitialized vars for channels.
    // Now you use "chan x, y, z;" to declare and initialize channels.
    case { $me $task $state_machine $id { chan $x:ident (,) ... ; } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            $($x = $x || $state_machine.channel();) ...
            case $id2:
            step_state $task $state_machine $id2 { $rest ... }			
        };
    }	

    // ### Returning values from a task
    //
    // `return x, y, ...;` will result in the task winding back up any
    // `finally` actions and then providing the given values to the next task
    // by calling the last callback argument to the task. Such a statement
    // will, obviously, return from within any block within control structures.
    //
    // Though you can return from anywhere in this implementation, don't return
    // from within finally clauses.

    case { $me $task $state_machine $id { return $x:expr (,) ... ; } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            $state_machine.callback(null, $x (,) ...);
            break;
            case $id2:
            step_state $task $state_machine $id2 { $rest ... }			
        };
    }

    // ### Raising errors
    //
    // The usual `throw err;` form will cause the error to first bubble up
    // the `finally` actions and the installed `catch` sequence and if the
    // error survives them all, will be passed on to the task's callback.
    //
    // Hack: "throw object.err;" can be used as a short hand for
    // "if (object.err) { throw object.err; }". i.e. the error is thrown
    // only if it is not null or undefined or false. This fits with Node.js's
    // callback convention where `err === null` tests whether there is an
    // error or not. So throwing a `null` doesn't make sense.

    case { $me $task $state_machine $id { throw $e:expr ; } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            var tmp1 = $e;
            if (tmp1) { $state_machine.callback(tmp1); break; }
            case $id2:
            step_state $task $state_machine $id2 { $rest ... }			
        };
    }

    // ### Retrying a failed operation.
    //
    // Within a catch block, you can use the retry statement 
    //
    //      retry;
    // 
    // to jump control again to the beginning of the code that
    // the catch block traps errors for ... which is immediately
    // after the ending brace of the catch block.

    case { $me $task $state_machine $id { retry ; } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            $state_machine.retry();
            break;
            case $id2:
            step_state $task $state_machine $id2 { $rest ... }	
        };
    }


    // ## Internals
    //
    // ### `phi`
    //
    // Used to merge states when branching using `if`, `while` and `switch`.

    case { $me $task $state_machine $id { phi $state_machine ; } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            $state_machine.phi();
            break;
            case $id2:
            step_state $task $state_machine $id2 { $rest ... }			
        };
    }

    // ### Synchronous statements
    //
    // Any statement that doesn't match the above structures are considered
    // to be executed synchronously. While each sync step is given its own id,
    // there isn't an async separation between these steps. The plus side of that
    // is that one more event-loop cycle is avoided, but the minus is that we
    // lose the otherwise more fine grained multi-tasking we get.
    //
    // I may change my mind about whether or not to introduce an additional
    // async step, but that decision won't impact the meaning of the code.

    case { $me $task $state_machine $id { $x ... ; } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            $x ... ;
            case $id2:
            step_state $task $state_machine $id2 { $rest ... }
        };
    }
}

export task



