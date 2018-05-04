ISTANBUL = `which istanbul`
MOCHA = `which _mocha`
MOCHA_REPORTER = spec
MOCHA_RUN = $(MOCHA) -r should -R $(MOCHA_REPORTER)
MOCHA_WATCH = $(MOCHA) -r should -R $(MOCHA_REPORTER) -w
MOCHA_COV = $(ISTANBUL) cover $(MOCHA) -- -r should -u exports -R spec
JSHINT = $(which jshint)

check:
	@jshint ./lib

test-units:
	@NODE_ENV=test $(MOCHA) test/units -r should -R $(MOCHA_REPORTER) --exit

test-models:
	@NODE_ENV=test $(MOCHA) test/models -r should -R $(MOCHA_REPORTER) --exit

test-watch:
	@NODE_ENV=test $(MOCHA_WATCH)

test-cov: clear
	@NODE_ENV=test $(MOCHA_COV)

test-mysql:
	@CAMINTE_DRIVER=mysql $(MOCHA) --timeout 3000 -r should -R $(MOCHA_REPORTER) --exit

test-sqlite:
	@CAMINTE_DRIVER=sqlite $(MOCHA) --timeout 3000 -r should -R $(MOCHA_REPORTER) --exit

test-postgres:
	@CAMINTE_DRIVER=postgres $(MOCHA) --timeout 3000 -r should -R $(MOCHA_REPORTER) --exit

test-redis:
	@CAMINTE_DRIVER=redis $(MOCHA) --timeout 3000 -r should -R $(MOCHA_REPORTER) --exit

test-mongo:
	@CAMINTE_DRIVER=mongo $(MOCHA) --timeout 3000 -r should -R $(MOCHA_REPORTER) --exit

test-tingo:
	@CAMINTE_DRIVER=tingo $(MOCHA) --timeout 5000 -r should -R $(MOCHA_REPORTER) --exit

test-rethinkdb:
	@CAMINTE_DRIVER=rethinkdb $(MOCHA) --timeout 5000 -r should -R $(MOCHA_REPORTER) --exit

test-arango:
	@CAMINTE_DRIVER=arango $(MOCHA) --timeout 5000 -r should -R $(MOCHA_REPORTER) --exit

test-neo4j:
	@CAMINTE_DRIVER=neo4j $(MOCHA) --timeout 5000 -r should -R $(MOCHA_REPORTER) --exit

test: test-sqlite test-mysql test-mongo test-redis

clear:
	@rm -rf coverage

.PHONY: test
.PHONY: doc
