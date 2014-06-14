
test : $(patsubst %.sjs, %.js, $(wildcard test/*.sjs))
	-rm -f test/node_modules
	-cd test && ln -fs ../src node_modules
	-mocha --reporter progress
	-rm -f test/node_modules

%.js : %.sjs
	sjs --module ./src/task.js -c -r $< -o $@

.PHONY : test
.SILENT : test
