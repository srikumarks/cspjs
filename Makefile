
test : test/*.js
	-rm -f test/node_modules
	-cd test && ln -fs ../src node_modules
	-mocha --reporter progress
	-rm -f test/node_modules

test/%.js : test/%.sjs
	# Compile test code using sweetjs first before running.
	sjs -c -o $@ --module ./src/task.js $<

.PHONY : test
.SILENT : test
