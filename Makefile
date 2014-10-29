
test : $(patsubst %.sjs, %.js, $(wildcard test/*.sjs))
	-./node_modules/mocha/bin/mocha --reporter progress

%.js : %.sjs src/task.js
	sjs --module ./src/task.js -c -r $< -o $@

.PHONY : test
.SILENT : test
