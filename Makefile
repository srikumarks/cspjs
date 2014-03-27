
test : $(patsubst %.sjs, %.js, $(wildcard test/*.sjs))
	-rm -f test/node_modules
	-cd test && ln -fs ../src node_modules
	-mocha --reporter progress
	-rm -f test/node_modules

test/channel.js: test/channel.sjs src/task.js
	sjs --module ./src/task.js -c -o ./test/channel.js ./test/channel.sjs

test/control.js: test/control.sjs src/task.js
	sjs --module ./src/task.js -c -o ./test/control.js ./test/control.sjs

.PHONY : test
.SILENT : test
