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

    case { $_ ($x:ident (,) ...) { $body ... } } => {
        letstx $callback = [makeIdent("callback", #{$_})];
        return #{
            (function ($x (,) ... , $callback) {
                setup_state_machine $_ $callback ($x (,) ... , $callback) { $body ... }
            })
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

macro post_declare {
    rule { $task $state_machine $state_machine_fn $dfvars { $body ... } } => {
        function $state_machine_fn(err) {
            if (err && !$state_machine.state.isUnwinding) { return $state_machine.callback(err); }
            try {
                switch ($state_machine.state.id) {
                    case 1:
                        // `step_state` is the real work horse, which
                        // walks through each statement in the task
                        // body and compiles it to a single step in
                        // the state machine.
                        step_state $task $state_machine 1 $dfvars { $body ... }
                }
            } catch (e) {
                $state_machine.callback(e);
            }
        }
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

// ## Setting up the state machine
// 
// To setup a state machine, we scan the body to find the machine's state
// variables and declare them up front. This simplifies the need for 
// local var declarations in the generated JS ... which are not really
// local anyway.

macro setup_state_machine {
    case { $me $task $callback $formals { $body ... } } => {
        letstx $state_machine_fn = [makeIdent("state_machine_fn", #{$task})];
        return #{
            var StateMachine = arguments.callee.StateMachine || (arguments.callee.StateMachine = require('cspjs/src/state_machine'));
            declare_state_arguments $formals
            var state_machine = new StateMachine(this, $callback, $state_machine_fn, arguments.callee);
            declare_state_variables $task state_machine 0 ($callback) () { $body ... } { $body ... } 
            state_machine.start();
            return state_machine.controlAPIMaker;
        };
    }
}

// ## Declaring state variables
//
// To do this, we scan the code and collect all the state variable identifiers
// into a pseudo list syntax that looks like `(x y z ...)`. The `$vars` argument
// to the `declare_state_variables` macro is expected to match this.

macro declare_state_variables {
    rule { $task $state_machine $fin $vars $dfvars { $body ... } { if ($x ...) { $then ... } else { $else ... } $rest ... } } => {
        declare_state_variables $task $state_machine $fin $vars $dfvars { $body ... } { $then ... $else ... $rest ... }
    }
    rule { $task $state_machine $fin $vars $dfvars { $body ... } { if ($x ...) { $then ... }  $rest ... } } => {
        declare_state_variables $task $state_machine $fin $vars $dfvars { $body ... } { $then ... $rest ... }
    }
    // Rewrite for loops using while.
    rule { $task $state_machine $fin $vars $dfvars { $body ... } { for ($init ... ; $cond ... ; $next ...) { $body ... }  $rest ... } } => {
        declare_state_variables $task $state_machine $fin $vars $dfvars { $body ... } { $init ... ; while ($cond ...) { $body ... $next ... ; } $rest ... }
    }
    rule { $task $state_machine $fin $vars $dfvars { $body ... } { while ($x ...) { $body ... }  $rest ... } } => {
        declare_state_variables $task $state_machine $fin $vars $dfvars { $body ... } { $body ... $rest ... }
    }
    // If a finally block is encountered somewhere in the body, then we
    // need to be able to save and restore state variables. So keep track of that.
    rule { $task $state_machine $fin $vars $dfvars { $body ... } { finally { $cleanup ... } $rest ... } } => {
        declare_state_variables $task $state_machine 1 $vars $dfvars { $body ... } { $cleanup ... $rest ... }
    }
    rule { $task $state_machine $fin $vars $dfvars { $body ... } { finally $cleanup ... ($args:expr (,) ...) ; $rest ... } } => {
        declare_state_variables $task $state_machine $fin $vars $dfvars { $body ... } { $rest ... }
    }
    rule { $task $state_machine $fin $vars $dfvars { $body ... } { catch ($eclass:ident $e:ident) { $handler ... } $rest ... } } => {
        declare_state_variables $task $state_machine $fin $vars $dfvars { $body ... } { var $e = null ; $handler ... $rest ... }
    }
    rule { $task $state_machine $fin $vars $dfvars { $body ... } { catch ($e:ident) { $handler ... } $rest ... } } => {
        declare_state_variables $task $state_machine $fin $vars $dfvars { $body ... } { var $e = null ; $handler ... $rest ... }
    }
    rule { $task $state_machine $fin $vars $dfvars { $bodypass ... } { switch ($x ...) { $(case $ix:lit (,) ... : { $body ... }) ... } $rest ... } } => {
        declare_state_variables $task $state_machine $fin $vars $dfvars { $bodypass ... } { $($body ...) ... $rest ... }
    }
    rule { $task $state_machine $fin $vars $dfvars { $body ... } { $step ... ; $rest ... } } => {
        declare_state_variables_step $task $state_machine $fin $vars $dfvars { $body ... } { $step ... ; } { $rest ... }
    }
    rule { $task $state_machine $fin $vars $dfvars { $body ... } { } } => { 
        declare_unique_varset $task $state_machine $fin $vars $dfvars { $body ... } 
    }
    rule { $task $state_machine $fin () () { $body ... } { } } => { 
    }
}

// After scanning the entire body, we uniquify the variable set because
// the body may contain multiple declarations of the same variable and
// we don't want to pollute the generated code with repeated var declarations
// as much as we can.

macro declare_unique_varset {
	case { _ $task $state_machine $fin ($v ...) ($u ...) { $body ... } } => {
		var vars = #{$v ... $u ...};
		var varnames = vars.map(unwrapSyntax), pvarnames = (#{$u ...}).map(unwrapSyntax);
		var uniqvarnames = {}, uniqpvarnames = {};
		varnames.forEach(function (v) { uniqvarnames['%' + v] = true; });
		pvarnames.forEach(function (v) { uniqpvarnames['%' + v] = true; });
		letstx $uvars ... = Object.keys(uniqvarnames).map(function (v) { return makeIdent(v.substring(1), #{$task}); });
		letstx $upvars ... = Object.keys(uniqpvarnames).map(function (v) { return makeIdent(v.substring(1), #{$task}); });
        letstx $state_machine_fn = [makeIdent("state_machine_fn", #{$task})];
		return #{ 
            declare_varset $task $state_machine $fin ($uvars ...) ;
            declare_pvarset $task $state_machine ($upvars ...) ;
            post_declare $task $state_machine $state_machine_fn ($upvars ...) { $body ... }
        };
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

macro declare_pvarset {
    case { _ $task $state_machine () ; } => {
        return #{};
    }
    case { _ $task $state_machine ($u ...) ; } => {
        return #{
            $($u = $state_machine.dfvar($u, function (v) { $u = v; });) ...
        };
    }
}

macro declare_state_variables_step {
	rule { $task $state_machine $fin ($v ...) ($u ...) { $body ... } { $x:ident <- $y ... ; } { $rest ... } } => {
		declare_state_variables $task $state_machine $fin ($x $v ...) ($u ...) { $body ... } { $rest ... }
	}
	rule { $task $state_machine $fin ($v ...) $us { $body ... } { $x:ident (,) ... <- $y ... ; } { $rest ... } } => {
		declare_state_variables $task $state_machine $fin ($x ... $v ...) $us { $body ... } { $rest ... }
	}
	rule { $task $state_machine $fin $vs ($u ...) { $body ... } { $x:ident := $y ... ; } { $rest ... } } => {
		declare_state_variables $task $state_machine $fin $vs ($x $u ...) { $body ... } { $rest ... }
	}
	rule { $task $state_machine $fin ($v ...) $us { $body ... } { var $($x:ident = $y:expr) (,) ... ; } { $rest ... } } => {
		declare_state_variables $task $state_machine $fin ($x ... $v ...) $us { $body ... } { $rest ... }
	}
	rule { $task $state_machine $fin $vs ($u ...) { $body ... } { var $x:ident (,) ... ; } { $rest ... } } => {
		declare_state_variables $task $state_machine $fin $vs ($x ... $u ...) { $body ... } { $rest ... }
	}
	rule { $task $state_machine $fin $vs $us { $body ... } { $x ... ; } { $rest ... } } => {
		declare_state_variables $task $state_machine $fin $vs $us { $body ... } { $rest ... }
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
    rule { $task $state_machine $id $dfvars { if ($x ...) { $then ... } else { $else ... } $rest ... } } => {
        step_state_line_if_else_with_ensure_dfv $task $state_machine $id $dfvars { if ($x ...) { $then ... } else { $else ... } } { $rest ... }
    }
    rule { $task $state_machine $id $dfvars { if ($x ...) { $then ... }  $rest ... } } => {
        step_state_line_if_with_ensure_dfv $task $state_machine $id $dfvars { if ($x ...) { $then ... } } { $rest ... }
    }
    // Rewrite for loops using while.
    rule { $task $state_machine $id $dfvars { for ($init ... ; $cond ... ; $next ...) { $body ... }  $rest ... } } => {
        step_state $task $state_machine $id $dfvars { $init ... ; while ($cond ...) { $body ... $next ... ; } $rest ... }
    }
    rule { $task $state_machine $id $dfvars { while ($x ...) { $body ... }  $rest ... } } => {
        step_state_line_while_with_ensure_dfv $task $state_machine $id $dfvars { while ($x ...) { $body ... } } { $rest ... }
    }
    rule { $task $state_machine $id $dfvars { finally { $cleanup ... }  $rest ... } } => {
        step_state_line_finally_block $task $state_machine $id $dfvars { finally { $cleanup ... } } { $rest ... }
    }
    rule { $task $state_machine $id $dfvars { finally $cleanup ... ($args:expr (,) ...) ;  $rest ... } } => {
        step_state_line_finally_expr_with_ensure_dfv $task $state_machine $id $dfvars { finally $cleanup ... ($args (,) ...) ; } { $rest ... }
    }
    rule { $task $state_machine $id $dfvars { catch ($x ...) { $handler ... }  $rest ... } } => {
        step_state_line_catch $task $state_machine $id $dfvars { catch ($x ...) { $handler ... } } { $rest ... }
    }
    rule { $task $state_machine $id $dfvars { switch ($x:expr) { $b ... } $rest ... } } => {
        step_state_line_switch_with_ensure_dfv $task $state_machine $id $dfvars { switch ($x) { $b ... } } { $rest ... }
    }
    rule { $task $state_machine $id $dfvars { $step ... ; $rest ... } } => {
        step_state_line_with_ensure_dfv $task $state_machine $id $dfvars { $step ... ; } { $rest ... }
    }
    rule { $task $state_machine $id $dfvars { } } => {
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
    rule { $task $n  { switch ($x ...) { $(case $ix:lit (,) ... : { $body ... }) ... } $rest ... } } => {
        count_states $task $n { $($body ... phi $state_machine ;) ... $rest ... }
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
    rule { $task ($n ...) { $x:ident (,) ... <- $y ... ($args:expr (,) ...); } { $rest ... } } => {
        count_states $task (2 $n ...) { $rest ... }
    }
    rule { $task ($n ...) { $x:ident := $y:expr ; } { $rest ... } } => {
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
    case { $me $task $state_machine $id $dfvars { if ($x:expr) { $then ... } else { $else ... } } { $rest ... } } => {
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
            step_state $task $state_machine $id2 $dfvars { $then ... phi $state_machine ; $else ... phi $state_machine ; $rest ... }
        };
    }
}

macro step_state_line_if_else_with_ensure_dfv {
    rule { $task $state_machine $id $dfvars { if ($x ...) { $then ... } else { $else ... } } { $rest ... } } => {
        ensure_dfv $state_machine $id $dfvars { $x ... } ;
        step_state_line_if_else $task $state_machine $id $dfvars { if ($x ...) { $then ... } else { $else ... } } { $rest ... }
    }
}


macro step_state_line_if {
    case { $me $task $state_machine $id $dfvars { if ($x:expr) { $then ... } } { $rest ... } } => {
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
            step_state $task $state_machine $id2 $dfvars { $then ... phi $state_machine; $rest ... }
        };
    }
}

macro step_state_line_if_with_ensure_dfv {
    rule { $task $state_machine $id $dfvars { if ($x:expr) { $then ... } } { $rest ... } } => {
        ensure_dfv $state_machine $id $dfvars { $x } ;
        step_state_line_if $task $state_machine $id $dfvars { if ($x) { $then ... } } { $rest ... }
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

    case { $me $task $state_machine $id $dfvars { switch ($c:expr) { $(case $ix:lit (,) ... : { $body ... }) ... } } { $rest ... } } => {
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
            step_state $task $state_machine $id2 $dfvars {
                $($body ... phi $state_machine ;) ...
                    $rest ...
            }
        };
    }
}

macro step_state_line_switch_with_ensure_dfv {
    rule { $task $state_machine $id $dfvars { switch ($c:expr) { $(case $ix:lit (,) ... : { $body ... }) ... } } { $rest ... } } => {
        ensure_dfv $state_machine $id $dfvars { $c } ;
        step_state_line_switch $task $state_machine $id $dfvars { switch ($c) { $(case $ix (,) ... : { $body ... }) ... } } { $rest ... }
    }
}


// ### Looping using `while`
//
// The usual `while (cond) { body... }` is supported as well, except that there is no
// `break;' statement support.

macro step_state_line_while {
    case { $me $task $state_machine $id $dfvars { while ($x:expr) { $body ... } } { $rest ... } } => {
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


macro step_state_line_while_with_ensure_dfv {
    rule { $task $state_machine $id $dfvars { while ($x:expr) { $body ... } } { $rest ... } } => {
        ensure_dfv $state_machine $id $dfvars {$x} ;
        step_state_line_while $task $state_machine $id $dfvars { while ($x) { $body ... } } { $rest ... }
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
    case { $me $task $state_machine $id $dfvars { finally $cleanup ... . $methId:ident ($arg:expr (,) ...) ; } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        /* Evaluate the arguments right now, but call the cleanup function later. */
        return #{
            var tmp1 = $cleanup ... ;
            $state_machine.pushCleanupAction(tmp1, tmp1.$methId, [$arg (,) ...]);
            case $id2:
            step_state $task $state_machine $id2 $dfvars { $rest ... }
        };
    }
    case { $me $task $state_machine $id $dfvars { finally $cleanup ... [ $methExpr:expr ] ($arg:expr (,) ...) ; } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        /* Evaluate the arguments right now, but call the cleanup function later. */
        return #{
            var tmp1 = $cleanup ... ;
            $state_machine.pushCleanupAction(tmp1, tmp1[$methExpr], [$arg (,) ...]);
            case $id2:
            step_state $task $state_machine $id2 $dfvars { $rest ... }
        };
    }
    case { $me $task $state_machine $id $dfvars { finally $cleanup ... ($arg:expr (,) ...) ; } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        /* Evaluate the arguments right now, but call the cleanup function later. */
        return #{
            $state_machine.pushCleanupAction(this, $cleanup ... , [$arg (,) ...]);
            case $id2:
            step_state $task $state_machine $id2 $dfvars { $rest ... }
        };
    }
}


macro step_state_line_finally_expr_with_ensure_dfv {
    rule { $task $state_machine $id $dfvars { finally $cleanup ... . $methId:ident ($arg:expr (,) ...) ; } { $rest ... } } => {
        ensure_dfv $state_machine $id $dfvars { ($cleanup ..., $arg (,) ...) } ;
        step_state_line_finally_expr $task $state_machine $id $dfvars { finally $cleanup ... . $methId ($arg (,) ...) ; } { $rest ... }
    }
    rule { $task $state_machine $id $dfvars { finally $cleanup ... [ $methExpr:expr ] ($arg:expr (,) ...) ; } { $rest ... } } => {
        ensure_dfv $state_machine $id $dfvars { ($cleanup ..., $methExpr, $arg (,) ...) } ;
        step_state_line_finally_expr $task $state_machine $id $dfvars { finally $cleanup ... [ $methExpr ] ($arg (,) ...) ; } { $rest ... }
    }
    rule { $task $state_machine $id $dfvars { finally $cleanup ... ($arg:expr (,) ...) ; } { $rest ... } } => {
        ensure_dfv $state_machine $id $dfvars { ($cleanup ..., $arg (,) ...) } ;
        step_state_line_finally_expr $task $state_machine $id $dfvars { finally $cleanup ... ($arg (,) ...) ; } { $rest ... }
    }    
}


// `finally { ... }` mark blocks of steps to be run at unwinding time.

macro step_state_line_finally_block {
    case { $me $task $state_machine $id $dfvars { finally { $cleanup ... } } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            var jumpHandler = count_states $task (0) { $cleanup ... };
            $state_machine.pushCleanupStep($id2, $id2 + 1 + jumpHandler);
            break;
            case $id2:
            step_state $task $state_machine $id2 $dfvars { $cleanup ... phi $state_machine ; $rest ... }
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
    case { $me $task $state_machine $id $dfvars { catch ($eclass:ident $e:ident) { $handler ... } } { $rest ... } } => {
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
            step_state $task $state_machine $id2 $dfvars { $handler ... phi $state_machine ; $rest ... }
        };
    }

    case { $me $task $state_machine $id $dfvars { catch ($e:ident) { $handler ... } } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            var jumpHandler = count_states $task (0) { $handler ... };
            $state_machine.pushErrorStep($id2, $id2 + 1 + jumpHandler);
            break;
            case $id2:
            $e = $state_machine.state.err;
            step_state $task $state_machine $id2 $dfvars { $handler ... phi $state_machine ; $rest ... }
        };
    }
}

// ## Data Flow Variable support
//
// For every statement that requires the values of variables known to be
// data flow variables, we insert an "ensure" statement that makes sure that
// the values are all available before proceeding.


// ### ensure_dfv
//
// Ensures that the data flow variables found in the given $x expression
// are all bound before proceeding. 
//
// WARNING: The current algorithm is alpha quality only. It is overzealous
// and will ensure that any symbol encountered in the expression whose form
// matches a declared data flow variable will be ensured bound before proceeding.
//
// WORKAROUND: Do not use inline function expressions - i.e. function (x,y) { ... }.
// .. and if you do, make sure that the variable names in it don't clash with outside
// names if that's not your intent.
macro ensure_dfv {
    case { $me $state_machine $id $dfvars { $x ... } ; } => {
        function dfvars(stx, test) {
            var result = {};
            var enabled = [];
            function scan(stx) {
                if (stx && stx.token) {
                    if (stx.token.value === '.') {
                        /* Disable identifier matching after periods in a sequence. */
                        enabled[enabled.length - 1] = false;
                        return result;
                    }
                    if (stx.token.type === 3 && test['%'+stx.token.value]) {
                        if (enabled[enabled.length - 1]) {
                            result['%'+stx.token.value] = true;
                        } else {
                            /* Restore. */
                            enabled[enabled.length - 1] = true;
                        }
                    } else if (stx.token.inner) {
                        enabled.push(true);
                        stx.token.inner.forEach(scan);
                        enabled.pop();
                    }
                } else if (stx) {
                    enabled.push(true);
                    stx.forEach(scan);
                    enabled.pop();
                }
                return result;
            }
            return Object.keys(scan(stx)).map(function (v) { return test[v]; });
        }
        function dftester(stx) {
            var result = {};
            stx[0].token.inner.forEach(function (v) {
                result['%'+v.token.value] = v;
            });
            return result;
        }
        var dfvarnames = dftester(#{$dfvars});
        var dfvs = dfvars(#{$x ...}, dfvarnames);
        if (dfvs.length > 0) {
            letstx $pvars ... = dfvs ;
            return #{
                if (!$state_machine.ensure($id, $pvars (,) ...)) { break; }
            };
        }

        return #{};
    }
}
macro step_state_line_with_ensure_dfv {
    rule { $task $state_machine $id $dfvars { await $y ... (); } { $rest ... } } => {
        ensure_dfv $state_machine $id $dfvars { $y ... } ;
        step_state_line $task $state_machine $id $dfvars { await $y ... (); } { $rest ... }
    }

    rule { $task $state_machine $id $dfvars { await $y ... ($args:expr (,) ...); } { $rest ... } } => {
        ensure_dfv $state_machine $id $dfvars { $y ... } ;
        ensure_dfv $state_machine $id $dfvars { ($args (,) ...) } ;
        step_state_line $task $state_machine $id $dfvars { await $y ... ($args (,) ...); } { $rest ... }
    }

    rule { $task $state_machine $id $dfvars { $x:ident (,) ... <- chan $y ... ; } { $rest ... } } => {
        ensure_dfv $state_machine $id $dfvars { $y ... } ;
        step_state_line $task $state_machine $id $dfvars { $x (,) ... <- chan $y ... ; } { $rest ... }
    }

    rule { $task $state_machine $id $dfvars { $x:ident (,) ... <- $y ... (); } { $rest ... } } => {
        ensure_dfv $state_machine $id $dfvars { $y ... } ;
        step_state_line $task $state_machine $id $dfvars { $x (,) ... <- $y ... (); } { $rest ... }
    }

    rule { $task $state_machine $id $dfvars { $x:ident (,) ... <- $y ... ($args:expr (,) ...); } { $rest ... } } => {
        ensure_dfv $state_machine $id $dfvars { $y ... } ;
        ensure_dfv $state_machine $id $dfvars { ($args (,) ...) } ;
        step_state_line $task $state_machine $id $dfvars { $x (,) ... <- $y ... ($args (,) ...); } { $rest ... }
    }

    rule { $task $state_machine $id $dfvars { $x:ident := $y:expr; } { $rest ... } } => {
        ensure_dfv $state_machine $id $dfvars { $y } ;
        step_state_line $task $state_machine $id $dfvars { $x := $y; } { $rest ... }
    }

    rule { $task $state_machine $id $dfvars { var $($x:ident = $y:expr) (,) ... ; } { $rest ... } } => {
        ensure_dfv $state_machine $id $dfvars { ($y (,) ...) };
        step_state_line $task $state_machine $id $dfvars { var $($x = $y) (,) ... ; } { $rest ... }
    }	

    rule { $task $state_machine $id $dfvars { var $x:ident (,) ... ; } { $rest ... } } => {
        step_state $task $state_machine $id $dfvars { $rest ... }
    }	

    rule { $task $state_machine $id $dfvars { return $x:expr (,) ... ; } { $rest ... } } => {
        ensure_dfv $state_machine $id $dfvars { ($x (,) ...) } ;
        step_state_line $task $state_machine $id $dfvars { return $x (,) ... ; } { $rest ... }
    }

    rule { $task $state_machine $id $dfvars { throw $e:expr ; } { $rest ... } } => {
        ensure_dfv $state_machine $id $dfvars { $e } ;
        step_state_line $task $state_machine $id $dfvars { throw $e ; } { $rest ... }
    }

    rule { $task $state_machine $id $dfvars { retry ; } { $rest ... } } => {
        step_state_line $task $state_machine $id $dfvars { retry ; } { $rest ... }
    }

    rule { $task $state_machine $id $dfvars { $x ... ; } { $rest ... } } => {
        step_state_line $task $state_machine $id $dfvars { $x ... ; } { $rest ... }
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
    case { $me $task $state_machine $id $dfvars { await $y ... (); } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            $y ... ($state_machine.thenTo($id2));
            break;
            case $id2:
            step_state $task $state_machine $id2 $dfvars { $rest ... }
        };
    }

    case { $me $task $state_machine $id $dfvars { await $y ... ($args:expr (,) ...); } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            $y ... ($args (,) ... , $state_machine.thenTo($id2));
            break;
            case $id2:
            step_state $task $state_machine $id2 $dfvars { $rest ... }
        };
    }

    // ### Taking values from channels
    //
    // If you have functions that return channels on which they will produce their results,
    // then you can use this expression as syntax sugar to get the value out of the returned
    // channel.
    //
    //      val <- chan someProcess(arg1, arg1);

    case { $me $task $state_machine $id $dfvars { $x:ident (,) ... <- chan $y ... ; } { $rest ... } } => {
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
                step_state $task $state_machine $id3 $dfvars { $rest ... }
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
    case { $me $task $state_machine $id $dfvars { $x:ident (,) ... <- $y ... (); } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})], $id3 = [makeValue(id + 2, #{$id})];
        return #{
            $y ... ($state_machine.thenTo($id2));
            break;
            case $id2:
            var i = 1;
            $($x = arguments[i++];) ...
            case $id3:
                step_state $task $state_machine $id3 $dfvars { $rest ... }
        };
    }

    case { $me $task $state_machine $id $dfvars { $x:ident (,) ... <- $y ... ($args:expr (,) ...); } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})], $id3 = [makeValue(id + 2, #{$id})];
        return #{
            $y ... ($args (,) ... , $state_machine.thenTo($id2));
            break;
            case $id2:
            var i = 1;
            $($x = arguments[i++];) ...
            case $id3:
                step_state $task $state_machine $id3 $dfvars { $rest ... }
        };
    }

    // ### Data flow binding
    //
    // Statements of the form "X := y;", where "X" is an identifier and "y" is an expression,
    // cause "X" to be interpreted as a "data flow variable" - i.e. a "promise" - that will
    // be resolved to the value computed by the "y" expression.
 
    case { $me $task $state_machine $id $dfvars { $x:ident := $y:expr; } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            var tmp = $y;
            $x = $state_machine.dfbind($x, tmp);
            case $id2:
            step_state $task $state_machine $id2 $dfvars { $rest ... }
        };
    }

    // ### State variable declaration
    //
    // State variables are shared with expressions in the entire task and can be
    // declared anywhere using var statements. Initializers are compulsory.

    case { $me $task $state_machine $id $dfvars { var $($x:ident = $y:expr) (,) ... ; } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            $($x = $y;) ...
            case $id2:
            step_state $task $state_machine $id2 $dfvars { $rest ... }			
        };
    }	

    // ### Data Flow Variable declaration
    //
    // While state variables must always be initialized, data flow variables may
    // be uninitialized (i.e. "unresolved") at declaration. We interpret a var
    // statement with uninitialized variables, therefore, as a dfvar declaration.
    // Such dfvars must be bound using ":=".
    case { $me $task $state_machine $id $dfvars { var $x:ident (,) ... ; } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        // Step the state number by 1 so we don't have to special case the state counter.
        return #{
            case $id2:
            step_state $task $state_machine $id2 $dfvars { $rest ... }			
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

    case { $me $task $state_machine $id $dfvars { return $x:expr (,) ... ; } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            $state_machine.callback(null, $x (,) ...);
            break;
            case $id2:
            step_state $task $state_machine $id2 $dfvars { $rest ... }			
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

    case { $me $task $state_machine $id $dfvars { throw $e:expr ; } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            var tmp1 = $e;
            if (tmp1) { $state_machine.callback(tmp1); break; }
            case $id2:
            step_state $task $state_machine $id2 $dfvars { $rest ... }			
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

    case { $me $task $state_machine $id $dfvars { retry ; } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            $state_machine.retry();
            break;
            case $id2:
            step_state $task $state_machine $id2 $dfvars { $rest ... }	
        };
    }

    // ## Internals
    //
    // ### `phi`
    //
    // Used to merge states when branching using `if`, `while` and `switch`.

    case { $me $task $state_machine $id $dfvars { phi $state_machine ; } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            $state_machine.phi();
            break;
            case $id2:
            step_state $task $state_machine $id2 $dfvars { $rest ... }			
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

    case { $me $task $state_machine $id $dfvars { $x ... ; } { $rest ... } } => {
        var id = unwrapSyntax(#{$id});
        letstx $id2 = [makeValue(id + 1, #{$id})];
        return #{
            $x ... ;
            case $id2:
            step_state $task $state_machine $id2 $dfvars { $rest ... }
        };
    }
}

export task



