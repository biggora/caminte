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
	@NODE_ENV=test $(MOCHA) test/units -r should -R $(MOCHA_REPORTER)

test-models:
	@NODE_ENV=test $(MOCHA) test/models -r should -R $(MOCHA_REPORTER)

test-watch:
	@NODE_ENV=test $(MOCHA_WATCH)

test-cov: clear
	@NODE_ENV=test $(MOCHA_COV)

test-mysql:
	@CAMINTE_DRIVER=mysql $(MOCHA) -r should -R $(MOCHA_REPORTER)

test-sqlite:
	@CAMINTE_DRIVER=sqlite $(MOCHA) -r should -R $(MOCHA_REPORTER)

test-postgres:
	@CAMINTE_DRIVER=postgres $(MOCHA) -r should -R $(MOCHA_REPORTER)

test-redis:
	@CAMINTE_DRIVER=redis $(MOCHA) -r should -R $(MOCHA_REPORTER)

test-mongo:
	@CAMINTE_DRIVER=mongo $(MOCHA) -r should -R $(MOCHA_REPORTER)

test-tingo:
	@CAMINTE_DRIVER=tingo $(MOCHA) -r should -R $(MOCHA_REPORTER)

test-rethinkdb:
	@CAMINTE_DRIVER=rethinkdb $(MOCHA) -r should -R $(MOCHA_REPORTER)

test: test-sqlite test-mysql test-postgres test-redis test-mongo

clear:
	@rm -rf coverage

update:


.PHONY: test
.PHONY: doc
